
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from '@/components/ui/alert-dialog';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { X, CheckCircle, Edit } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { logAction } from '@/utils/actionLogger';

interface AppointmentActionsProps {
  appointmentId: string;
  status: string;
  onCancel?: () => void;
  onConfirm?: () => void;
  onEdit?: () => void;
  isAdminOverride?: boolean;
  currentDate?: Date;
  currentTime?: string;
  currentExtraFee?: number;
  currentNotes?: string;
  petName?: string;
  clientName?: string;
}

const AppointmentActions = ({ 
  appointmentId, 
  status, 
  onCancel, 
  onConfirm, 
  onEdit,
  isAdminOverride,
  currentDate,
  currentTime,
  currentExtraFee,
  currentNotes,
  petName,
  clientName,
}: AppointmentActionsProps) => {
  const { user, isAdmin } = useAuth();
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleCancelAppointment = async () => {
    setIsLoading(true);
    try {
      console.log(`[CANCELLATION] Starting atomic cancellation for appointment ${appointmentId}`);
      
      // First get complete appointment details including all staff assignments
      const { data: appointment, error: fetchError } = await supabase
        .from('appointments')
        .select(`
          id,
          date,
          time,
          service_id,
          status,
          duration,
          services!inner (
            name,
            default_duration
          ),
          appointment_staff (
            staff_profile_id,
            staff_profiles (
              name
            )
          )
        `)
        .eq('id', appointmentId)
        .maybeSingle();

      if (fetchError) {
        console.error(`[CANCELLATION] Failed to fetch appointment details:`, fetchError);
        throw new Error(`Failed to fetch appointment: ${fetchError.message}`);
      }

      if (!appointment) {
        throw new Error('Agendamento não encontrado');
      }

      console.log(`[CANCELLATION] Appointment details:`, {
        id: appointment.id,
        date: appointment.date,
        time: appointment.time,
        service: (appointment.services as any)?.name,
        stored_duration: appointment.duration,
        service_default_duration: (appointment.services as any)?.default_duration,
        actual_duration_used: appointment.duration || (appointment.services as any)?.default_duration || 60,
        staffCount: appointment.appointment_staff.length,
        currentStatus: appointment.status
      });

      // Validate appointment can be cancelled
      if (appointment.status === 'cancelled') {
        toast.error('Este agendamento já foi cancelado');
        return;
      }

      // Admin can cancel any appointment, non-admin users have restrictions
      if (!isAdmin) {
        // Allow cancellation for pending appointments or admin override appointments
        if (appointment.status !== 'pending' && !isAdminOverride) {
          toast.error('Apenas agendamentos pendentes podem ser cancelados');
          return;
        }
      }

      const serviceDuration = appointment.duration || (appointment.services as any)?.default_duration || 60;
      const appointmentDate = appointment.date;
      const appointmentTime = appointment.time;

      // Parse start time safely
      const timeMatch = appointmentTime.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (!timeMatch) {
        throw new Error(`Invalid time format: ${appointmentTime}`);
      }

      const startHours = parseInt(timeMatch[1], 10);
      const startMinutes = parseInt(timeMatch[2], 10);
      console.log(`[CANCELLATION] Parsed start time: ${startHours}:${startMinutes}`);

      // Calculate all 10-minute slots that need to be reverted
      const slotsToRevert: string[] = [];
      let checkMinutes = 0;
      
      while (checkMinutes < serviceDuration) {
        const totalMinutes = startHours * 60 + startMinutes + checkMinutes;
        const slotHours = Math.floor(totalMinutes / 60);
        const slotMinutes = totalMinutes % 60;
        
        const timeSlotString = `${slotHours.toString().padStart(2, '0')}:${slotMinutes.toString().padStart(2, '0')}:00`;
        slotsToRevert.push(timeSlotString);
        checkMinutes += 10; // 10-minute increments
      }

      console.log(`[CANCELLATION] Calculated ${slotsToRevert.length} slots to revert:`, slotsToRevert);

      // Use admin-specific cancellation for override bookings, otherwise use standard cancellation
      if (isAdminOverride) {
        console.log(`[CANCELLATION] Using admin cancellation for override booking ${appointmentId}`);
        await supabase.rpc('admin_cancel_appointment', {
          p_appointment_id: appointmentId
        });
      } else {
        console.log(`[CANCELLATION] Using standard atomic cancellation for regular booking ${appointmentId}`);
        await supabase.rpc('atomic_cancel_appointment', {
          p_appointment_id: appointmentId,
          p_appointment_date: appointmentDate,
          p_slots_to_revert: slotsToRevert,
          p_staff_ids: appointment.appointment_staff.map(s => s.staff_profile_id)
        });
      }

      console.log(`[CANCELLATION] Successfully completed atomic cancellation for appointment ${appointmentId}`);

      if (isAdmin) {
        const subject = petName
          ? clientName ? `${petName} — ${clientName}` : petName
          : appointmentId;
        void logAction({
          action_type: 'booking_cancelled',
          category: 'booking',
          description: `Agendamento cancelado — ${subject}`,
          link_type: 'booking',
          link_id: appointmentId,
          metadata: { isAdminOverride: !!isAdminOverride },
        });
      }
      
      toast.success('Agendamento cancelado com sucesso');
      setShowCancelDialog(false);
      if (onCancel) onCancel();

    } catch (error: any) {
      console.error('[CANCELLATION] Error during cancellation:', error);
      toast.error(`Erro ao cancelar agendamento: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmAppointment = async () => {
    setIsLoading(true);
    try {
      console.log(`[CONFIRMATION] Starting confirmation for appointment ${appointmentId}`);
      
      // Update appointment status to confirmed
      const { error: updateError } = await supabase
        .from('appointments')
        .update({ 
          status: 'confirmed',
          updated_at: new Date().toISOString()
        })
        .eq('id', appointmentId);

      if (updateError) {
        console.error(`[CONFIRMATION] Failed to confirm appointment:`, updateError);
        throw new Error(`Failed to confirm appointment: ${updateError.message}`);
      }

      console.log(`[CONFIRMATION] Successfully confirmed appointment ${appointmentId}`);

      if (isAdmin) {
        const subject = petName
          ? clientName ? `${petName} — ${clientName}` : petName
          : appointmentId;
        void logAction({
          action_type: 'booking_approved',
          category: 'booking',
          description: `Agendamento confirmado — ${subject}`,
          link_type: 'booking',
          link_id: appointmentId,
        });
      }
      
      toast.success('Agendamento confirmado com sucesso');
      setShowConfirmDialog(false);
      if (onConfirm) onConfirm();

    } catch (error: any) {
      console.error('[CONFIRMATION] Error during confirmation:', error);
      toast.error(`Erro ao confirmar agendamento: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Show buttons for pending appointments, confirmed appointments, or admin override appointments
  // Admin can see actions for all appointments except cancelled ones
  if (!isAdmin && status !== 'pending' && status !== 'confirmed' && !isAdminOverride) {
    return null;
  }

  // Don't show actions for cancelled appointments
  if (status === 'cancelled') {
    return null;
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {/* Show Confirm button only for pending appointments - ADMIN ONLY */}
        {status === 'pending' && isAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowConfirmDialog(true)}
            className="text-green-600 border-green-200 hover:bg-green-50 flex-shrink-0"
          >
            <CheckCircle className="h-4 w-4 mr-1" />
            Confirmar
          </Button>
        )}
        
        {/* Show Edit button for confirmed appointments or admin can edit any non-cancelled appointment */}
        {(status === 'confirmed' || isAdmin) && status !== 'cancelled' && (
          <Link to={`/admin/edit-booking/${appointmentId}`}>
            <Button
              variant="outline"
              size="sm"
              className="text-blue-600 border-blue-200 hover:bg-blue-50 flex-shrink-0"
            >
              <Edit className="h-4 w-4 mr-1" />
              Editar
            </Button>
          </Link>
        )}
        
        {/* Show Cancel button: 
            - Non-admin: only for pending appointments
            - Admin: for any appointment (pending, confirmed, completed, override) */}
        {((!isAdmin && status === 'pending') || isAdmin || isAdminOverride) && status !== 'cancelled' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCancelDialog(true)}
            className="text-red-600 border-red-200 hover:bg-red-50 flex-shrink-0"
          >
            <X className="h-4 w-4 mr-1" />
            Cancelar
          </Button>
        )}
      </div>

      {/* Confirm Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Agendamento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja confirmar este agendamento? O cliente será notificado e o agendamento será marcado como confirmado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAppointment}
              disabled={isLoading}
              className="bg-green-600 hover:bg-green-700"
            >
              {isLoading ? 'Confirmando...' : 'Sim, Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Agendamento</AlertDialogTitle>
            <AlertDialogDescription>
              {isAdminOverride 
                ? 'Tem certeza que deseja cancelar este agendamento de override? Esta ação não pode ser desfeita. Apenas os slots originalmente disponíveis serão revertidos.'
                : isAdmin && status !== 'pending'
                ? 'Tem certeza que deseja cancelar este agendamento confirmado? Esta ação não pode ser desfeita. Os profissionais selecionados ficarão disponíveis.'
                : 'Tem certeza que deseja cancelar este agendamento? Esta ação não pode ser desfeita. Os profissionais selecionados ficarão disponíveis e você pode não conseguir reagendar no mesmo horário.'
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter Agendamento</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelAppointment}
              disabled={isLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {isLoading ? 'Cancelando...' : 'Sim, Cancelar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default AppointmentActions;
