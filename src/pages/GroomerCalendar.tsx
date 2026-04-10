
import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Appointment {
  id: string;
  pet_name: string;
  service: string;
  time: string;
  owner_name: string;
  status: string;
  notes?: string;
}

const GroomerCalendar = () => {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (selectedDate && user) {
      fetchAppointments();
    }
  }, [selectedDate, user]);

  const fetchAppointments = async () => {
    if (!selectedDate || !user) return;
    
    setIsLoading(true);
    try {
      // First get the staff profile for this user
      const { data: staffProfile, error: profileError } = await supabase
        .from('staff_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (profileError || !staffProfile) {
        console.error('Staff profile not found:', profileError);
        setAppointments([]);
        return;
      }

      const dateStr = selectedDate.toISOString().split('T')[0];
      
      // Get appointments with per-service data for dual-service support
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          *,
          pets(name),
          services(name),
          clients(name),
          appointment_services(service_id, service_order, duration, services(name)),
          appointment_staff!inner(staff_profile_id, service_id)
        `)
        .eq('appointment_staff.staff_profile_id', staffProfile.id)
        .eq('date', dateStr)
        .order('time');

      if (error) throw error;

      // Build per-service entries so dual-service shows only this staff's portion
      const displayData: Appointment[] = [];
      for (const apt of (data ?? [])) {
        const apptServices = (apt.appointment_services || [])
          .sort((a: any, b: any) => (a.service_order || 1) - (b.service_order || 1));
        const staffRows = (apt.appointment_staff || [])
          .filter((s: any) => s.staff_profile_id === staffProfile.id);

        if (apptServices.length <= 1) {
          displayData.push({
            id: apt.id,
            pet_name: apt.pets?.name || 'Pet',
            service: apptServices[0]?.services?.name || apt.services?.name || 'Serviço',
            time: apt.time,
            owner_name: apt.clients?.name || 'Cliente',
            status: apt.status,
            notes: apt.notes,
          });
        } else {
          const baseTime = apt.time.slice(0, 5);
          const [baseH, baseM] = baseTime.split(':').map(Number);
          let offsetMinutes = 0;

          for (const svc of apptServices) {
            const svcDuration = svc.duration || 60;
            const isAssigned = staffRows.some((s: any) => s.service_id === svc.service_id);

            if (isAssigned) {
              const startTotalMin = baseH * 60 + baseM + offsetMinutes;
              const startHH = Math.floor(startTotalMin / 60).toString().padStart(2, '0');
              const startMM = (startTotalMin % 60).toString().padStart(2, '0');

              displayData.push({
                id: apt.id,
                pet_name: apt.pets?.name || 'Pet',
                service: svc.services?.name || 'Serviço',
                time: `${startHH}:${startMM}:00`,
                owner_name: apt.clients?.name || 'Cliente',
                status: apt.status,
                notes: apt.notes,
              });
            }

            offsetMinutes += svcDuration;
          }
        }
      }

      setAppointments(displayData);
    } catch (error: any) {
      console.error('Error fetching appointments:', error);
      toast.error('Erro ao carregar agendamentos');
    } finally {
      setIsLoading(false);
    }
  };

  const updateAppointmentStatus = async (appointmentId: string, newStatus: string) => {
    try {
      // Keep lifecycle status writes as-is for booking lifecycle statuses only
      if (newStatus === 'cancelled' || newStatus === 'confirmed' || newStatus === 'pending' || newStatus === 'completed') {
        const { error } = await supabase
          .from('appointments')
          .update({ status: newStatus })
          .eq('id', appointmentId);

        if (error) throw error;
      } else {
        // For service flow, route via RPC (not_started/in_progress/completed)
        const { error } = await supabase.rpc('appointment_set_service_status', {
          p_appointment_id: appointmentId,
          p_new_status: newStatus,
          p_note: null
        });
        if (error) throw error;
      }

      setAppointments(prev => 
        prev.map(apt => 
          apt.id === appointmentId 
            ? { ...apt, status: newStatus }
            : apt
        )
      );
      
      toast.success('Status atualizado com sucesso');
    } catch (error: any) {
      console.error('Error updating appointment:', error);
      toast.error('Erro ao atualizar status');
    }
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold mb-8">Calendário de Agendamentos</h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card>
            <CardHeader>
              <CardTitle>Selecionar Data</CardTitle>
              <CardDescription>
                Escolha uma data para ver os agendamentos
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                className="rounded-md border"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                Agendamentos para {selectedDate?.toLocaleDateString('pt-BR')}
              </CardTitle>
              <CardDescription>
                {appointments.length} agendamento(s) encontrado(s)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p>Carregando...</p>
              ) : appointments.length === 0 ? (
                <p className="text-muted-foreground">Nenhum agendamento para esta data.</p>
              ) : (
                <div className="space-y-4">
                  {appointments.map((appointment) => (
                    <div key={appointment.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-semibold">{appointment.time}</h3>
                          <p className="text-sm text-muted-foreground">
                            {appointment.pet_name} - {appointment.owner_name}
                          </p>
                        </div>
                        <Badge variant={
                          appointment.status === 'completed' ? 'default' :
                          appointment.status === 'cancelled' ? 'destructive' :
                          'secondary'
                        }>
                          {appointment.status === 'pending' ? 'Agendado' :
                           appointment.status === 'completed' ? 'Concluído' :
                           'Cancelado'}
                        </Badge>
                      </div>
                      
                      <p className="text-sm mb-2"><strong>Serviço:</strong> {appointment.service}</p>
                      {appointment.notes && (
                        <p className="text-sm mb-2"><strong>Observações:</strong> {appointment.notes}</p>
                      )}
                      
                      {appointment.status === 'pending' && (
                        <div className="flex gap-2 mt-3">
                          <Button
                            size="sm"
                            onClick={() => updateAppointmentStatus(appointment.id, 'completed')}
                          >
                            Marcar como Concluído
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateAppointmentStatus(appointment.id, 'cancelled')}
                          >
                            Cancelar
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default GroomerCalendar;
