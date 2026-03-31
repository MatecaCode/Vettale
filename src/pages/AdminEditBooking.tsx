import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AdminLayout from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logAction } from '@/utils/actionLogger';
import { CalendarIcon, Edit, DollarSign, FileText, ArrowLeft, Loader2, AlertCircle, X, AlertTriangle, Plus, Users } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAdminAvailability } from '@/hooks/useAdminAvailability';
import { toHHMM } from '@/utils/time';

interface AppointmentDetails {
  id: string;
  date: string;
  time: string;
  extra_fee?: number;
  notes?: string;
  duration?: number;
  service_name?: string;
  pet_name?: string;
  client_name?: string;
  status?: string;
  total_price?: number;
  service_id?: string;
  is_admin_override?: boolean;
  booked_by_admin?: boolean;
  is_double_booking?: boolean;
  override_conflicts?: any;
}

interface TimeSlot {
  id: string;
  time: string;
  available: boolean;
  hasConflict: boolean;
  conflictDetails?: string;
  status: 'available' | 'occupied' | 'unavailable';
  tooltipMessage: string;
}

interface AvailabilityData {
  total_slots: number;
  available_slots: string[];
  unavailable_slots: string[];
  current_booking_slots: string[];
  other_booking_slots: string[];
  unavailable_count: number;
  current_booking_count: number;
  other_booking_count: number;
  is_fully_available: boolean;
  is_primary_available?: boolean;
  is_secondary_available?: boolean;
  overall_status?: string;
  is_same_booking: boolean;
  service_duration: number;
  primary_service_duration?: number;
  secondary_service_duration?: number;
  primary_start_time?: string;
  secondary_start_time?: string;
  start_time: string;
  end_time: string;
  staff_availability?: any[]; // Added for dual-service availability
}

interface ServiceAddon {
  id: string;
  name: string;
  description: string;
  price: number;
  applies_to_service_id?: string;
}

interface ServiceStaffAssignment {
  service_id: string;
  service_name: string;
  service_order: number;
  staff_profile_id: string | null;
  staff_name: string | null;
  role: string | null;
}

interface StaffMember {
  id: string;
  name: string;
  can_bathe: boolean;
  can_groom: boolean;
  can_vet: boolean;
}

const AdminEditBooking = () => {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const navigate = useNavigate();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [appointmentDetails, setAppointmentDetails] = useState<AppointmentDetails | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [selectedDuration, setSelectedDuration] = useState<number>(0);
  const [availableTimeSlots, setAvailableTimeSlots] = useState<string[]>([]);
  const [isLoadingTimeSlots, setIsLoadingTimeSlots] = useState(false);
  const [extraFee, setExtraFee] = useState<string>('');
  const [adminNotes, setAdminNotes] = useState<string>('');
  const [editReason, setEditReason] = useState<string>('');
  const [availabilityData, setAvailabilityData] = useState<AvailabilityData | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Service addons state
  const [serviceAddons, setServiceAddons] = useState<ServiceAddon[]>([]);
  const [selectedAddon, setSelectedAddon] = useState<string>('none');
  const [isLoadingAddons, setIsLoadingAddons] = useState(false);
  
  // Service-specific staff state
  const [serviceStaffAssignments, setServiceStaffAssignments] = useState<ServiceStaffAssignment[]>([]);
  const [availableStaff, setAvailableStaff] = useState<StaffMember[]>([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);
  
  // Pending staff changes (not applied until save)
  const [pendingStaffChanges, setPendingStaffChanges] = useState<Record<string, string | null>>({});
  
  // Single source of truth for selected staff IDs (current + pending changes)
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  
  // Modal state
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [pendingEditData, setPendingEditData] = useState<any>(null);
  
  // Dual-service detection
  const [isDualService, setIsDualService] = useState(false);
  
  // Time slot grid state
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<TimeSlot | null>(null);
  
  // Admin availability hook
  const { 
    timeSlots: adminTimeSlots, 
    services, 
    providers, 
    loading: availabilityLoading, 
    fetchAdminServices, 
    fetchAdminProviders, 
    fetchAdminTimeSlots 
  } = useAdminAvailability();

  // Load appointment details
  useEffect(() => {
    const loadAppointmentDetails = async () => {
      if (!appointmentId) {
        setError('ID do agendamento não fornecido');
        setIsLoading(false);
        return;
      }

      try {
        console.log('🔍 [ADMIN_EDIT_BOOKING] Loading appointment details for:', appointmentId);
        
        const { data, error } = await supabase
          .from('appointments')
          .select(`
            *,
            pets!inner(name),
            clients!inner(name)
          `)
          .eq('id', appointmentId)
          .single();

        if (error) {
          console.error('❌ [ADMIN_EDIT_BOOKING] Error loading appointment:', error);
          setError('Erro ao carregar detalhes do agendamento');
          setIsLoading(false);
          return;
        }

        if (!data) {
          setError('Agendamento não encontrado');
          setIsLoading(false);
          return;
        }

        console.log('✅ [ADMIN_EDIT_BOOKING] Appointment loaded:', data);

        const appointmentDetails: AppointmentDetails = {
          id: data.id,
          date: data.date,
          time: data.time,
          extra_fee: data.extra_fee,
          notes: data.notes,
          duration: data.duration,
          service_name: data.service_name || 'Serviço não especificado',
          pet_name: data.pets?.name || 'Pet não encontrado',
          client_name: data.clients?.name || 'Cliente não encontrado',
          status: data.status,
          total_price: data.total_price,
          service_id: data.service_id
        };

        setAppointmentDetails(appointmentDetails);
        // Don't set selectedDate initially - let user choose if they want to change it
        setSelectedTime(data.time);
        setSelectedDuration(0);
        setExtraFee(data.extra_fee?.toString() || '');
        setAdminNotes(data.notes || '');

        // Load service-specific staff assignments
        await loadServiceStaffAssignments(data.id);
        
        // Load available staff
        await loadAvailableStaff();

      } catch (error) {
        console.error('❌ [ADMIN_EDIT_BOOKING] Unexpected error:', error);
        setError('Erro inesperado ao carregar detalhes do agendamento');
      } finally {
        setIsLoading(false);
      }
    };

    loadAppointmentDetails();
  }, [appointmentId]);

  // Load service-specific staff assignments
  const loadServiceStaffAssignments = async (appointmentId: string) => {
    try {
      console.log('🔍 [ADMIN_EDIT_BOOKING] Loading service staff assignments for:', appointmentId);
      
      const { data, error } = await supabase
        .rpc('get_appointment_service_staff', { _appointment_id: appointmentId });

      if (error) {
        console.error('❌ [ADMIN_EDIT_BOOKING] Error loading service staff:', error);
        return;
      }

      console.log('✅ [ADMIN_EDIT_BOOKING] Service staff assignments loaded:', data);
      
      const assignments: ServiceStaffAssignment[] = data.map((item: any) => ({
        service_id: item.service_id,
        service_name: item.service_name,
        service_order: item.service_order,
        staff_profile_id: item.staff_profile_id,
        staff_name: item.staff_name,
        role: item.role
      }));

      setServiceStaffAssignments(assignments);
      
      // Initialize selectedStaffIds from current assignments
      const currentStaffIds = assignments
        .filter(assignment => assignment.staff_profile_id)
        .map(assignment => assignment.staff_profile_id!);
      setSelectedStaffIds(currentStaffIds);
      console.log('🔍 [ADMIN_EDIT_BOOKING] Initialized staff IDs:', currentStaffIds);
      
      // Detect if this is a dual-service appointment (has service_order = 2)
      const hasDualService = assignments.some(assignment => assignment.service_order === 2);
      setIsDualService(hasDualService);
      console.log('🔍 [ADMIN_EDIT_BOOKING] Dual-service detected:', hasDualService);

    } catch (error) {
      console.error('❌ [ADMIN_EDIT_BOOKING] Error loading service staff assignments:', error);
    }
  };

  // Load available staff
  const loadAvailableStaff = async () => {
    try {
      setIsLoadingStaff(true);
      console.log('🔍 [ADMIN_EDIT_BOOKING] Loading available staff');
      
      const { data, error } = await supabase
        .from('staff_profiles')
        .select('id, name, can_bathe, can_groom, can_vet')
        .eq('active', true)
        .order('name');

      if (error) {
        console.error('❌ [ADMIN_EDIT_BOOKING] Error loading staff:', error);
        return;
      }

      console.log('✅ [ADMIN_EDIT_BOOKING] Available staff loaded:', data);
      setAvailableStaff(data);

    } catch (error) {
      console.error('❌ [ADMIN_EDIT_BOOKING] Error loading available staff:', error);
    } finally {
      setIsLoadingStaff(false);
    }
  };

  // Handle service staff change (local only - not applied until save)
  const handleServiceStaffChange = (serviceId: string, newStaffId: string | null) => {
    console.log('🔍 [ADMIN_EDIT_BOOKING] Pending staff change for service:', serviceId, 'to:', newStaffId);
    
    // Store the change locally
    setPendingStaffChanges(prev => ({
      ...prev,
      [serviceId]: newStaffId
    }));
    
    // Update selectedStaffIds to reflect current + pending changes
    const updatedStaffIds = serviceStaffAssignments.map(assignment => {
      if (assignment.service_id === serviceId) {
        return newStaffId; // Use new staff ID for this service
      }
      // Check if there's a pending change for this assignment
      const pendingChange = pendingStaffChanges[assignment.service_id];
      return pendingChange !== undefined ? pendingChange : assignment.staff_profile_id;
    }).filter(Boolean) as string[]; // Remove null values
    
    setSelectedStaffIds(updatedStaffIds);
    console.log('🔍 [ADMIN_EDIT_BOOKING] Updated selected staff IDs:', updatedStaffIds);
    console.log('🔍 [ADMIN_EDIT_BOOKING] This should trigger time slot reload for new staff availability');
  };

  // Apply all pending staff changes when form is submitted
  const applyPendingStaffChanges = async () => {
    const changes = Object.entries(pendingStaffChanges);
    if (changes.length === 0) return;

    console.log('🔧 [ADMIN_EDIT_BOOKING] Applying pending staff changes:', changes);

    for (const [serviceId, newStaffId] of changes) {
      try {
        const { data, error } = await supabase
          .rpc('update_service_staff_assignment', {
            _appointment_id: appointmentId!,
            _service_id: serviceId,
            _new_staff_profile_id: newStaffId,
            _updated_by: (await supabase.auth.getUser()).data.user?.id
          });

        if (error) {
          console.error('❌ [ADMIN_EDIT_BOOKING] Error updating service staff:', error);
          toast.error(`Erro ao atualizar staff do serviço ${serviceId}`);
          return false;
        }

        console.log('✅ [ADMIN_EDIT_BOOKING] Service staff updated successfully for service:', serviceId);
      } catch (error) {
        console.error('❌ [ADMIN_EDIT_BOOKING] Error updating service staff:', error);
        toast.error(`Erro ao atualizar staff do serviço ${serviceId}`);
        return false;
      }
    }

    // Clear pending changes
    setPendingStaffChanges({});
    toast.success('Staff assignments atualizados com sucesso');
    return true;
  };

  // Get the effective staff assignment (current + pending changes)
  const getEffectiveStaffAssignment = (assignment: ServiceStaffAssignment) => {
    const pendingChange = pendingStaffChanges[assignment.service_id];
    if (pendingChange !== undefined) {
      return {
        ...assignment,
        staff_profile_id: pendingChange,
        staff_name: pendingChange ? availableStaff.find(s => s.id === pendingChange)?.name || null : null
      };
    }
    return assignment;
  };

  // Load service addons
  useEffect(() => {
    const loadServiceAddons = async () => {
      if (!appointmentDetails?.service_id) return;
      
      setIsLoadingAddons(true);
      try {
        const { data, error } = await supabase
          .from('service_addons')
          .select('*')
          .or(`applies_to_service_id.eq.${appointmentDetails.service_id},applies_to_service_id.is.null`)
          .eq('active', true)
          .order('name');

        if (error) {
          console.error('Error loading service addons:', error);
          return;
        }

        setServiceAddons(data || []);
      } catch (error) {
        console.error('Error loading service addons:', error);
      } finally {
        setIsLoadingAddons(false);
      }
    };

    loadServiceAddons();
  }, [appointmentDetails?.service_id]);

  // Load available time slots when date changes
  useEffect(() => {
    const loadTimeSlots = async () => {
      if (!selectedDate) return;
      
      setIsLoadingTimeSlots(true);
      try {
        // Generate time slots from 9:00 to 16:30 in 30-minute intervals
        const slots = [];
        for (let hour = 9; hour <= 16; hour++) {
          for (let minute = 0; minute < 60; minute += 30) {
            // Include 16:30 but not 17:00
            if (hour === 16 && minute > 30) break;
            const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            slots.push(timeString);
          }
        }
        setAvailableTimeSlots(slots);
      } catch (error) {
        console.error('Error loading time slots:', error);
      } finally {
        setIsLoadingTimeSlots(false);
      }
    };

    loadTimeSlots();
  }, [selectedDate]);

  // Load time slots when date or staff assignments change
  useEffect(() => {
    const loadTimeSlots = async () => {
      if (!selectedDate || serviceStaffAssignments.length === 0) {
        setTimeSlots([]);
        return;
      }

      console.log('🔧 [ADMIN_EDIT_BOOKING] Loading time slots for date:', selectedDate);
      console.log('🔧 [ADMIN_EDIT_BOOKING] Service staff assignments:', serviceStaffAssignments);

      // Use selectedStaffIds (current + pending changes) for time slot loading
      const staffIds = selectedStaffIds;

      if (staffIds.length === 0) {
        console.log('⚠️ [ADMIN_EDIT_BOOKING] No staff assigned');
        setTimeSlots([]);
        return;
      }

      // Get services from assignments
      const primaryService = serviceStaffAssignments.find(a => a.service_order === 1);
      const secondaryService = serviceStaffAssignments.find(a => a.service_order === 2);

      if (!primaryService) {
        console.log('⚠️ [ADMIN_EDIT_BOOKING] No primary service found');
        setTimeSlots([]);
        return;
      }

      // Find service details from services array
      const primaryServiceDetails = services.find(s => s.id === primaryService.service_id);
      const secondaryServiceDetails = secondaryService ? services.find(s => s.id === secondaryService.service_id) : null;

      console.log('🔧 [ADMIN_EDIT_BOOKING] Services for time slot loading:', {
        primary: primaryServiceDetails?.name,
        secondary: secondaryServiceDetails?.name || 'None'
      });

      // Use admin availability hook to fetch time slots
      await fetchAdminTimeSlots(
        selectedDate,
        staffIds,
        primaryServiceDetails || null,
        secondaryServiceDetails || null
      );
    };

    loadTimeSlots();
  }, [selectedDate, serviceStaffAssignments, services, fetchAdminTimeSlots, selectedStaffIds]);

  // Convert admin time slots to TimeSlot format with status and tooltips
  useEffect(() => {
    const convertedSlots: TimeSlot[] = adminTimeSlots.map(slot => {
      const status: 'available' | 'occupied' | 'unavailable' = slot.available ? 'available' : 'occupied';
      
      return {
        id: slot.id,
        time: slot.time,
        available: slot.available,
        hasConflict: !slot.available,
        conflictDetails: slot.available ? undefined : 'Horário ocupado',
        status,
        tooltipMessage: slot.available 
          ? `Disponível às ${slot.time}`
          : `Ocupado às ${slot.time}`
      };
    });

    setTimeSlots(convertedSlots);
    console.log('🔧 [ADMIN_EDIT_BOOKING] Converted time slots:', convertedSlots.length);
  }, [adminTimeSlots]);

  // Initialize services on component mount
  useEffect(() => {
    fetchAdminServices();
  }, [fetchAdminServices]);

  // Handle time slot selection
  const handleTimeSlotSelect = (slot: TimeSlot) => {
    console.log('🔧 [ADMIN_EDIT_BOOKING] Time slot selected:', slot);
    setSelectedTimeSlot(slot);
    setSelectedTime(slot.time);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedDate) {
      toast.error('Por favor, selecione uma data');
      return;
    }

    if (!selectedTime) {
      toast.error('Por favor, selecione um horário');
      return;
    }

    const timeToUse = selectedTime;
    
    // Debug: Log the time format being validated
    console.log('🔍 [ADMIN_EDIT_BOOKING] Time to validate:', timeToUse);

    // Validate time format - accept both HH:MM and HH:MM:SS formats
    if (timeToUse && !/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/.test(timeToUse)) {
      console.error('❌ [ADMIN_EDIT_BOOKING] Invalid time format:', timeToUse);
      toast.error('Formato de horário inválido');
      return;
    }

    // Calculate total duration: current duration + selected duration to add
    const currentDuration = appointmentDetails?.duration || 0;
    const durationToAdd = selectedDuration || 0;
    const totalDuration = currentDuration + durationToAdd;

    // Check if the selected time slot has conflicts
    if (selectedTimeSlot && selectedTimeSlot.status === 'occupied') {
      // Store the edit data and show custom modal instead of window.confirm
      setPendingEditData({
        appointmentId,
        newDate: format(selectedDate, 'yyyy-MM-dd'),
        newTime: timeToUse,
        newDuration: totalDuration,
        extraFee: parseFloat(extraFee) || 0,
        selectedAddon,
        adminNotes: adminNotes || null,
        editReason: editReason || null,
        forceOverride: true
      });
      setShowOverrideModal(true);
      return;
    }

    // No conflicts, proceed directly
    await performEdit({
      appointmentId,
      newDate: format(selectedDate, 'yyyy-MM-dd'),
      newTime: timeToUse,
      newDuration: totalDuration,
      extraFee: parseFloat(extraFee) || 0,
      selectedAddon,
      adminNotes: adminNotes || null,
      editReason: editReason || null,
      forceOverride: false
    });
  };

  const performEdit = async (editData: any) => {
    setIsSaving(true);
    try {
      console.log('🔧 [ADMIN_EDIT_BOOKING] Submitting edit:', editData);
      console.log('🔧 [ADMIN_EDIT_BOOKING] Is dual-service:', isDualService);

      // Use appropriate RPC function based on service type
      const rpcFunction = isDualService ? 'edit_admin_booking_with_dual_services' : 'edit_booking_admin';
      console.log('🔧 [ADMIN_EDIT_BOOKING] Using RPC function:', rpcFunction);

      // Prepare RPC parameters
      const rpcParams: any = {
        _appointment_id: editData.appointmentId,
        _new_date: editData.newDate,
        _new_time: editData.newTime,
        _new_duration: editData.newDuration,
        _extra_fee: editData.extraFee,
        _admin_notes: editData.adminNotes,
        _edit_reason: editData.editReason,
        _edited_by: (await supabase.auth.getUser()).data.user?.id,
        _force_override: editData.forceOverride
      };

      // Add staff IDs for dual-service function
      if (rpcFunction === 'edit_admin_booking_with_dual_services') {
        rpcParams._new_staff_ids = selectedStaffIds;
        console.log('🔧 [ADMIN_EDIT_BOOKING] Including staff IDs:', selectedStaffIds);
      }

      const { error } = await supabase.rpc(rpcFunction, rpcParams);

      if (error) {
        console.error('❌ [ADMIN_EDIT_BOOKING] Error:', error);
        throw error;
      }

      // Add service addon if selected
      if (editData.selectedAddon !== 'none') {
        const selectedAddonData = serviceAddons.find(addon => addon.id === editData.selectedAddon);
        if (selectedAddonData) {
          const { error: addonError } = await supabase
            .from('appointment_addons')
            .insert({
              appointment_id: editData.appointmentId,
              addon_id: editData.selectedAddon,
              price: selectedAddonData.price,
              added_by: (await supabase.auth.getUser()).data.user?.id
            });

          if (addonError) {
            console.error('❌ [ADMIN_EDIT_BOOKING] Error adding addon:', addonError);
            // Don't throw here, as the main edit was successful
            toast.error('Agendamento editado, mas erro ao adicionar serviço extra');
          }
        }
      }

      // Staff changes are now handled directly by the RPC
      // Clear pending changes since they've been applied
      setPendingStaffChanges({});

      // Refresh staff assignments and availability data
      await loadServiceStaffAssignments(editData.appointmentId);
      
      console.log('✅ [ADMIN_EDIT_BOOKING] Successfully edited booking');

      const apptSubject = appointmentDetails?.pet_name
        ? appointmentDetails.client_name
          ? `${appointmentDetails.pet_name} — ${appointmentDetails.client_name}`
          : appointmentDetails.pet_name
        : editData.appointmentId;
      void logAction({
        action_type: editData.forceOverride ? 'booking_overridden' : 'booking_edited',
        category: 'booking',
        description: `Agendamento editado — ${apptSubject}${editData.forceOverride ? ' (override aplicado)' : ''}`,
        link_type: 'booking',
        link_id: editData.appointmentId,
        metadata: {
          newDate: editData.newDate,
          newTime: editData.newTime,
          forceOverride: editData.forceOverride,
          editReason: editData.editReason,
          hasAddon: editData.selectedAddon !== 'none',
        },
      });
      
      // Show appropriate success message
      if (editData.forceOverride) {
        toast.success('Agendamento editado com sucesso (override aplicado)', {
          description: 'Alguns horários já estavam ocupados, mas o agendamento foi editado mesmo assim.'
        });
      } else {
        toast.success('Agendamento editado com sucesso');
      }
      
      // Navigate back to appointments list
      navigate('/admin/appointments');
      
    } catch (error: any) {
      console.error('❌ [ADMIN_EDIT_BOOKING] Error editing booking:', error);
      toast.error(`Erro ao editar agendamento: ${error.message}`);
    } finally {
      setIsSaving(false);
      setShowOverrideModal(false);
      setPendingEditData(null);
    }
  };

  const handleOverrideConfirm = () => {
    if (pendingEditData) {
      performEdit(pendingEditData);
    }
  };

  const handleOverrideCancel = () => {
    setShowOverrideModal(false);
    setPendingEditData(null);
    setIsSaving(false);
  };

  const hasChanges = () => {
    if (!appointmentDetails) return false;
    
    const timeToUse = selectedTime || appointmentDetails.time;
    
    return (
      (selectedDate && selectedDate.getTime() !== new Date(appointmentDetails.date + 'T12:00:00').getTime()) ||
      timeToUse !== appointmentDetails.time ||
      selectedDuration !== 0 || // Check if any duration is being added
      parseFloat(extraFee) !== (appointmentDetails.extra_fee || 0) ||
      selectedAddon !== 'none' || // Check if addon is selected
      adminNotes !== (appointmentDetails.notes || '') ||
      editReason !== '' ||
      Object.keys(pendingStaffChanges).length > 0 // Check if there are pending staff changes
    );
  };

  const getSelectedAddonPrice = () => {
    if (selectedAddon === 'none') return 0;
    const addon = serviceAddons.find(a => a.id === selectedAddon);
    return addon?.price || 0;
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="flex items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>Carregando detalhes do agendamento...</span>
            </div>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (error || !appointmentDetails) {
    return (
      <AdminLayout>
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center gap-4 mb-6">
            <Button variant="outline" onClick={() => navigate('/admin/appointments')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
          </div>
          
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {error || 'Agendamento não encontrado'}
            </AlertDescription>
          </Alert>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="outline" onClick={() => navigate('/admin/appointments')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Editar Agendamento</h1>
            <p className="text-gray-600">Modifique os detalhes do agendamento</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Appointment Info Card */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Edit className="h-5 w-5" />
                  Detalhes do Agendamento
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm font-medium text-gray-700">Serviço{serviceStaffAssignments.length > 1 ? 's' : ''}</Label>
                  <div className="text-sm text-gray-900">
                    {serviceStaffAssignments.length > 0 ? (
                      serviceStaffAssignments
                        .sort((a, b) => a.service_order - b.service_order)
                        .map((assignment, index) => (
                          <span key={assignment.service_id}>
                            {assignment.service_name}
                            {index < serviceStaffAssignments.length - 1 && ' + '}
                          </span>
                        ))
                    ) : (
                      appointmentDetails.service_name || 'Serviço não especificado'
                    )}
                  </div>
                </div>
                
                <div>
                  <Label className="text-sm font-medium text-gray-700">Pet</Label>
                  <p className="text-sm text-gray-900">{appointmentDetails.pet_name}</p>
                </div>
                
                <div>
                  <Label className="text-sm font-medium text-gray-700">Cliente</Label>
                  <p className="text-sm text-gray-900">{appointmentDetails.client_name}</p>
                </div>
                
                <div>
                  <Label className="text-sm font-medium text-gray-700">Duração</Label>
                  <p className="text-sm text-gray-900">{appointmentDetails.duration} min</p>
                </div>
                
                <div>
                  <Label className="text-sm font-medium text-gray-700">Status</Label>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-gray-900 capitalize">{appointmentDetails.status}</p>
                    {appointmentDetails.is_admin_override && (
                      <span className="px-2 py-1 text-xs font-medium bg-orange-100 text-orange-800 rounded-full">
                        Admin Override
                      </span>
                    )}
                    {appointmentDetails.booked_by_admin && !appointmentDetails.is_admin_override && (
                      <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                        Admin Booking
                      </span>
                    )}
                    {appointmentDetails.is_double_booking && (
                      <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">
                        Double Booking
                      </span>
                    )}
                  </div>
                </div>
                
                <div>
                  <Label className="text-sm font-medium text-gray-700">Preço Total</Label>
                  <p className="text-sm font-medium text-gray-900">
                    R$ {(appointmentDetails.total_price || 0).toFixed(2)}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Edit Form */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Modificar Agendamento</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Date Selection */}
                  <div className="space-y-2">
                    <Label htmlFor="date">Nova Data</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !selectedDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {selectedDate ? format(selectedDate, 'PPP', { locale: ptBR }) : "🗓 Nenhuma mudança de data selecionada"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={selectedDate}
                          onSelect={setSelectedDate}
                          disabled={(date) => {
                            // Disable Sundays and past dates
                            const day = date.getDay();
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            return day === 0 || date < today;
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    {selectedDate && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <span>Data atual:</span>
                        <span className="font-medium text-gray-900">
                          {format(new Date(appointmentDetails.date + 'T12:00:00'), 'PPP', { locale: ptBR })}
                        </span>
                        <span className="text-blue-600">
                          → {format(selectedDate, 'PPP', { locale: ptBR })}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Time Slot Grid */}
                  {selectedDate && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Horário</Label>
                        
                        <div className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 max-h-60 overflow-y-auto">
                          {availabilityLoading ? (
                            <div className="col-span-full flex items-center justify-center py-8">
                              <div className="flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span className="text-sm text-gray-600">Carregando horários...</span>
                              </div>
                            </div>
                          ) : timeSlots.length > 0 ? (
                            <TooltipProvider>
                              {timeSlots.map((slot) => {
                                let buttonVariant: "default" | "outline" | "secondary" = "outline";
                                let buttonClassName = "h-auto py-2";
                                
                                if (selectedTime === slot.time) {
                                  buttonVariant = "default";
                                } else {
                                  switch (slot.status) {
                                    case 'available':
                                      buttonClassName += " border-green-500 text-green-700 hover:bg-green-50 hover:border-green-600";
                                      break;
                                    case 'occupied':
                                      buttonClassName += " border-red-500 text-red-700 bg-red-50 hover:bg-red-100 hover:border-red-600";
                                      break;
                                    default:
                                      buttonClassName += " border-gray-300 text-gray-400 bg-gray-50 cursor-not-allowed";
                                      break;
                                  }
                                }

                                return (
                                  <Tooltip key={slot.id}>
                                    <TooltipTrigger asChild>
                                      <Button
                                        type="button"
                                        variant={buttonVariant}
                                        className={buttonClassName}
                                        onClick={() => handleTimeSlotSelect(slot)}
                                        disabled={slot.status === 'unavailable'}
                                      >
                                        <div className="flex flex-col items-center">
                                          <span>{slot.time}</span>
                                        </div>
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>{slot.tooltipMessage}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                );
                              })}
                            </TooltipProvider>
                          ) : (
                            <div className="col-span-full text-center py-8 text-gray-500">
                              <p>Nenhum horário disponível para esta data</p>
                              <p className="text-sm">Verifique se há staff atribuído aos serviços</p>
                            </div>
                          )}
                        </div>
                        
                        {/* Selected time display */}
                        {selectedTimeSlot && (
                          <div className="mt-3 p-3 rounded-lg border bg-blue-50 border-blue-200">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-sm font-medium">Horário Selecionado:</span>
                              <span className="text-sm text-blue-600 font-medium">
                                {selectedTimeSlot.time}
                              </span>
                              <span className={`text-xs px-2 py-1 rounded ${
                                selectedTimeSlot.status === 'available' 
                                  ? 'bg-green-100 text-green-700' 
                                  : 'bg-red-100 text-red-700'
                              }`}>
                                {selectedTimeSlot.status === 'available' ? '✅ Disponível' : '❌ Ocupado'}
                              </span>
                            </div>
                            
                            {appointmentDetails && (
                              <div className="text-xs text-gray-600 space-y-1">
                                <p>
                                  Horário atual: {appointmentDetails.time} → 
                                  <span className="text-blue-600 font-medium"> {selectedTimeSlot.time}</span>
                                </p>
                                <p>
                                  Duração: {appointmentDetails.duration || 0} min
                                  {selectedDuration > 0 && (
                                    <span className="text-blue-600 font-medium">
                                      {' → '}{(appointmentDetails.duration || 0) + selectedDuration} min 
                                      <span className="text-green-600"> (+{selectedDuration} min)</span>
                                    </span>
                                  )}
                                </p>
                                {selectedDuration > 0 && isDualService && (
                                  <div className="mt-2 p-2 bg-green-50 rounded border border-green-200">
                                    <p className="text-green-700 font-medium text-xs">
                                      🔄 Extensão: +{selectedDuration} min será adicionado ao último segmento
                                    </p>
                                    <p className="text-green-600 text-xs mt-1">
                                      {isDualService ? 'Serviço secundário será estendido' : 'Serviço primário será estendido'}
                                    </p>
                                  </div>
                                )}
                                {selectedDuration > 0 && !isDualService && (
                                  <div className="mt-2 p-2 bg-blue-50 rounded border border-blue-200">
                                    <p className="text-blue-700 font-medium text-xs">
                                      ⏱️ Extensão: +{selectedDuration} min será adicionado ao serviço
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Duration Selection */}
                  <div className="space-y-2">
                    <Label htmlFor="duration">Adicionar Tempo ao Agendamento</Label>
                    <Select value={selectedDuration.toString()} onValueChange={(value) => setSelectedDuration(parseInt(value, 10))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione quantos minutos adicionar" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">
                          Manter duração atual ({appointmentDetails?.duration} min)
                        </SelectItem>
                        <SelectItem value="10">
                          Adicionar 10 minutos
                        </SelectItem>
                        <SelectItem value="20">
                          Adicionar 20 minutos
                        </SelectItem>
                        <SelectItem value="30">
                          Adicionar 30 minutos
                        </SelectItem>
                        <SelectItem value="40">
                          Adicionar 40 minutos
                        </SelectItem>
                        <SelectItem value="50">
                          Adicionar 50 minutos
                        </SelectItem>
                        <SelectItem value="60">
                          Adicionar 60 minutos
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {appointmentDetails?.duration && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <span>Duração atual:</span>
                        <span className="font-medium text-gray-900">{appointmentDetails.duration} min</span>
                        {selectedDuration > 0 && (
                          <span className="text-blue-600">
                            → {appointmentDetails.duration + selectedDuration} min (+{selectedDuration} min)
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Service Addon Selection */}
                  <div className="space-y-2">
                    <Label htmlFor="addon" className="flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      Serviço Extra
                    </Label>
                    <Select value={selectedAddon} onValueChange={setSelectedAddon}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um serviço extra (opcional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          Nenhum serviço extra
                        </SelectItem>
                        {isLoadingAddons ? (
                          <SelectItem value="loading" disabled>Carregando...</SelectItem>
                        ) : (
                          serviceAddons.map((addon) => (
                            <SelectItem key={addon.id} value={addon.id}>
                              {addon.name} - R$ {addon.price.toFixed(2)}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    {selectedAddon !== 'none' && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <span>Serviço selecionado:</span>
                        <span className="font-medium text-gray-900">
                          {serviceAddons.find(a => a.id === selectedAddon)?.name} 
                          (R$ {getSelectedAddonPrice().toFixed(2)})
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Service-Specific Staff Assignment */}
                  {serviceStaffAssignments.length > 0 && (
                    <div className="space-y-4">
                      <Label className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Atribuição de Staff por Serviço
                      </Label>
                      
                      <div className="space-y-3">
                        {serviceStaffAssignments.map((assignment) => {
                          const effectiveAssignment = getEffectiveStaffAssignment(assignment);
                          const hasPendingChange = pendingStaffChanges[assignment.service_id] !== undefined;
                          
                          return (
                            <div key={assignment.service_id} className={`p-4 border rounded-lg ${hasPendingChange ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50'}`}>
                              <div className="flex items-center justify-between mb-3">
                                <div>
                                  <h4 className="font-medium text-gray-900">
                                    {assignment.service_name}
                                  </h4>
                                  <p className="text-sm text-gray-600">
                                    Serviço #{assignment.service_order}
                                  </p>
                                  {hasPendingChange && (
                                    <p className="text-xs text-yellow-700 font-medium mt-1">
                                      ⚠️ Alteração pendente
                                    </p>
                                  )}
                                </div>
                                {effectiveAssignment.role && (
                                  <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                                    {effectiveAssignment.role}
                                  </span>
                                )}
                              </div>
                              
                              <div className="space-y-2">
                                <Label className="text-sm font-medium text-gray-700">
                                  Staff Atual: {assignment.staff_name || 'Não atribuído'}
                                </Label>
                                
                                <Select 
                                  value={effectiveAssignment.staff_profile_id || 'none'} 
                                  onValueChange={(value) => handleServiceStaffChange(
                                    assignment.service_id, 
                                    value === 'none' ? null : value
                                  )}
                                  disabled={isLoadingStaff}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Selecione um staff" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">
                                      Remover atribuição
                                    </SelectItem>
                                    {isLoadingStaff ? (
                                      <SelectItem value="loading" disabled>
                                        Carregando staff...
                                      </SelectItem>
                                    ) : (
                                      availableStaff.map((staff) => (
                                        <SelectItem key={staff.id} value={staff.id}>
                                          {staff.name}
                                          {assignment.service_name?.toLowerCase().includes('banho') && !staff.can_bathe && (
                                            <span className="text-red-500 ml-2">(não pode banhar)</span>
                                          )}
                                          {assignment.service_name?.toLowerCase().includes('tosa') && !staff.can_groom && (
                                            <span className="text-red-500 ml-2">(não pode tosar)</span>
                                          )}
                                        </SelectItem>
                                      ))
                                    )}
                                  </SelectContent>
                                </Select>
                                
                                {effectiveAssignment.staff_profile_id && (
                                  <div className="flex items-center gap-2 text-sm text-gray-600">
                                    <span>Staff selecionado:</span>
                                    <span className="font-medium text-gray-900">
                                      {effectiveAssignment.staff_name}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      
                      <div className="text-xs text-gray-500 bg-blue-50 p-3 rounded border border-blue-200">
                        <p className="font-medium text-blue-800 mb-1">ℹ️ Informações sobre atribuição de staff:</p>
                        <ul className="text-blue-700 space-y-1">
                          <li>• Cada serviço pode ter um staff diferente</li>
                          <li>• Staff são filtrados por capacidade (banhista, tosador, etc.)</li>
                          <li>• Mudanças são aplicadas apenas ao salvar</li>
                          <li>• Staff anterior é liberado automaticamente</li>
                        </ul>
                      </div>
                    </div>
                  )}

                  {/* Extra Fee */}
                  <div className="space-y-2">
                    <Label htmlFor="extraFee" className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Taxa Extra (R$)
                    </Label>
                    <Input
                      id="extraFee"
                      type="number"
                      step="0.01"
                      min="0"
                      value={extraFee}
                      onChange={(e) => setExtraFee(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>

                  {/* Admin Notes */}
                  <div className="space-y-2">
                    <Label htmlFor="adminNotes" className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Observações Administrativas
                    </Label>
                    <Textarea
                      id="adminNotes"
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      placeholder="Adicione observações sobre a edição..."
                      rows={3}
                    />
                  </div>

                  {/* Edit Reason */}
                  <div className="space-y-2">
                    <Label htmlFor="editReason">Motivo da Edição</Label>
                    <Input
                      id="editReason"
                      value={editReason}
                      onChange={(e) => setEditReason(e.target.value)}
                      placeholder="Ex: Cliente solicitou mudança de horário"
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-4 pt-4">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => navigate('/admin/appointments')}
                    >
                      Cancelar
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={isSaving || !hasChanges()}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Salvando...
                        </>
                      ) : (
                        'Salvar Alterações'
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Override Confirmation Modal */}
      {showOverrideModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                Confirmação de Override
              </h3>
              <button 
                onClick={handleOverrideCancel} 
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800 font-medium mb-2">
                  ⚠️ Atenção: {availabilityData?.unavailable_count || 0} slot(s) já estão ocupados para este horário.
                </p>
                
                {availabilityData && (
                  <div className="text-xs text-red-700 space-y-1">
                    <p><strong>Duração do serviço:</strong> {availabilityData.service_duration} min</p>
                    <p><strong>Horário:</strong> {availabilityData.start_time} - {availabilityData.end_time}</p>
                    <p><strong>Disponíveis:</strong> {availabilityData.available_slots.length}/{availabilityData.total_slots}</p>
                  </div>
                )}
              </div>
              
              <p className="text-sm text-gray-600">
                Deseja prosseguir com a edição mesmo assim? O agendamento será criado como override.
              </p>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleOverrideCancel}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 text-sm font-medium rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleOverrideConfirm}
                disabled={isSaving}
                className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Salvando...
                  </div>
                ) : (
                  'Sim, criar override'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default AdminEditBooking; 