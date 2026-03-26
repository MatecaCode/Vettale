import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, startOfWeek, endOfWeek, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarIcon, Clock, User, Dog } from 'lucide-react';
import { generateClientTimeSlots, getRequiredBackendSlots, formatTimeSlot, isClientSlotAvailable } from '@/utils/timeSlotHelpers';

interface Appointment {
  id: string;
  time: string;
  date: string;
  service_name: string;
  service_type: string;
  pet_name: string;
  client_name: string;
  duration: number;
  status: string;
}

type AvailabilityStatus = 'available' | 'unavailable';

interface TimeSlot {
  time: string;
  status: AvailabilityStatus;
}

type ViewMode = 'day' | 'week';

const StaffCalendar: React.FC = () => {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [staffProfile, setStaffProfile] = useState<any>(null);
  
  // Availability management state
  const [availabilityDate, setAvailabilityDate] = useState<Date | undefined>(new Date());
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  useEffect(() => {
    if (user) {
      loadStaffProfile();
    }
  }, [user]);

  useEffect(() => {
    if (staffProfile) {
      fetchAppointments();
    }
  }, [selectedDate, viewMode, staffProfile]);

  useEffect(() => {
    if (availabilityDate && staffProfile) {
      fetchAvailability();
    }
  }, [availabilityDate, staffProfile]);

  const loadStaffProfile = async () => {
    if (!user) return;

    try {
      const { data: profile, error } = await supabase
        .from('staff_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error || !profile) {
        toast.error('Perfil de funcionário não encontrado');
        return;
      }

      setStaffProfile(profile);
    } catch (error) {
      console.error('Error loading staff profile:', error);
      toast.error('Erro ao carregar perfil');
    }
  };

  const fetchAppointments = async () => {
    if (!staffProfile) return;

    try {
      setLoading(true);
      
      let startDate, endDate;
      
      if (viewMode === 'day') {
        startDate = format(selectedDate, 'yyyy-MM-dd');
        endDate = startDate;
      } else {
        startDate = format(startOfWeek(selectedDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        endDate = format(endOfWeek(selectedDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      }

      const { data: appointmentData, error } = await supabase
        .from('appointments')
        .select(`
          id,
          date,
          time,
          duration,
          status,
          services (
            name,
            service_type
          ),
          pets (
            name
          ),
          clients (
            name
          )
        `)
        .gte('date', startDate)
        .lte('date', endDate)
        .in('status', ['confirmed', 'pending', 'in_progress'])
        .order('date')
        .order('time');

      if (error) throw error;

      // Filter appointments that are assigned to this staff member
      const { data: staffAppointments, error: staffError } = await supabase
        .from('appointment_staff')
        .select('appointment_id')
        .eq('staff_profile_id', staffProfile.id);

      if (staffError) throw staffError;

      const staffAppointmentIds = staffAppointments?.map(sa => sa.appointment_id) || [];

      const formattedAppointments: Appointment[] = appointmentData
        ?.filter(apt => staffAppointmentIds.includes(apt.id))
        .map(apt => ({
          id: apt.id,
          date: apt.date,
          time: apt.time,
          service_name: (apt.services as any)?.name || 'Serviço',
          service_type: (apt.services as any)?.service_type || 'general',
          pet_name: (apt.pets as any)?.name || 'Pet',
          client_name: (apt.clients as any)?.name || 'Cliente',
          duration: apt.duration || 60,
          status: apt.status
        })) || [];

      setAppointments(formattedAppointments);
    } catch (error) {
      console.error('Error fetching appointments:', error);
      toast.error('Erro ao carregar agendamentos');
    } finally {
      setLoading(false);
    }
  };

  const getServiceIcon = (serviceType: string) => {
    switch (serviceType.toLowerCase()) {
      case 'grooming':
        return '✂️';
      case 'bath':
        return '💧';
      case 'veterinary':
        return '🩺';
      default:
        return '🐕';
    }
  };

  const getServiceColor = (serviceType: string) => {
    switch (serviceType.toLowerCase()) {
      case 'grooming':
        return 'bg-blue-100 border-blue-300 text-blue-800';
      case 'bath':
        return 'bg-cyan-100 border-cyan-300 text-cyan-800';
      case 'veterinary':
        return 'bg-red-100 border-red-300 text-red-800';
      default:
        return 'bg-gray-100 border-gray-300 text-gray-800';
    }
  };

  const generateTimeSlots = () => {
    const slots = [];
    for (let hour = 9; hour < 17; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        slots.push(timeString);
      }
    }
    return slots;
  };

  const getAppointmentsForSlot = (date: Date, timeSlot: string) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return appointments.filter(apt => 
      apt.date === dateStr && 
      apt.time === `${timeSlot}:00`
    );
  };

  // Availability management functions
  const callFn = async (action: string, params: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('staff-manage-availability', {
      body: { action, ...params },
    });
    if (error || !data?.ok) throw new Error(data?.error ?? error?.message ?? 'Unknown error');
    return data;
  };

  const generateClientFacingSlots = () => {
    const isSaturday = availabilityDate ? availabilityDate.getDay() === 6 : false; // 6 = Saturday
    return generateClientTimeSlots(isSaturday).map(slot => formatTimeSlot(slot));
  };

  const fetchAvailability = async () => {
    if (!availabilityDate || !staffProfile) return;

    try {
      setAvailabilityLoading(true);
      const dateStr = format(availabilityDate, 'yyyy-MM-dd');

      const result = await callFn('get_availability', { date: dateStr });
      const availability = result.data;

      const clientSlots = generateClientFacingSlots();
      
      const formattedSlots: TimeSlot[] = clientSlots.map(clientSlot => {
        const serviceDuration = 30;
        const isSaturday = availabilityDate ? availabilityDate.getDay() === 6 : false; // 6 = Saturday
        const isAvailable = isClientSlotAvailable(
          `${clientSlot}:00`, 
          serviceDuration, 
          availability || [],
          isSaturday
        );

        return {
          time: clientSlot,
          status: isAvailable ? 'available' : 'unavailable'
        };
      });

      setTimeSlots(formattedSlots);
    } catch (error) {
      console.error('Error fetching availability:', error);
      toast.error('Erro ao carregar disponibilidade');
    } finally {
      setAvailabilityLoading(false);
    }
  };

  const updateAvailability = async (timeSlot: string, newStatus: AvailabilityStatus) => {
    if (!availabilityDate || !staffProfile) return;

    try {
      const dateStr = format(availabilityDate, 'yyyy-MM-dd');
      const isAvailable = newStatus === 'available';

      const isSaturday = availabilityDate ? availabilityDate.getDay() === 6 : false; // 6 = Saturday
      const backendSlots = getRequiredBackendSlots(`${timeSlot}:00`, 30, isSaturday);

      await callFn('update_slots', {
        date: dateStr,
        slots: backendSlots.map(s => ({ time_slot: s, available: isAvailable })),
      });

      setTimeSlots(prevSlots =>
        prevSlots.map(slot =>
          slot.time === timeSlot ? { ...slot, status: newStatus } : slot
        )
      );

      toast.success(`Horário ${timeSlot} ${isAvailable ? 'liberado' : 'bloqueado'}`);
    } catch (error) {
      console.error('Error updating availability:', error);
      toast.error('Erro ao atualizar disponibilidade');
    }
  };

  const toggleAvailability = (timeSlot: string, currentStatus: AvailabilityStatus) => {
    const newStatus = currentStatus === 'available' ? 'unavailable' : 'available';
    updateAvailability(timeSlot, newStatus);
  };

  const markAllUnavailable = async () => {
    if (!availabilityDate || !staffProfile) return;

    try {
      const dateStr = format(availabilityDate, 'yyyy-MM-dd');
      const isSaturday = availabilityDate ? availabilityDate.getDay() === 6 : false; // 6 = Saturday
      
      const allBackendSlots: string[] = [];
      timeSlots.forEach(clientSlot => {
        const backendSlots = getRequiredBackendSlots(`${clientSlot.time}:00`, 30, isSaturday);
        allBackendSlots.push(...backendSlots);
      });

      await callFn('update_slots', {
        date: dateStr,
        slots: allBackendSlots.map(s => ({ time_slot: s, available: false })),
      });

      setTimeSlots(prevSlots =>
        prevSlots.map(slot => ({ ...slot, status: 'unavailable' as AvailabilityStatus }))
      );

      toast.success('Todos os horários foram marcados como indisponíveis');
    } catch (error) {
      console.error('Error marking all unavailable:', error);
      toast.error('Erro ao marcar horários como indisponíveis');
    }
  };

  const markAllAvailable = async () => {
    if (!availabilityDate || !staffProfile) return;

    try {
      const dateStr = format(availabilityDate, 'yyyy-MM-dd');
      const isSaturday = availabilityDate ? availabilityDate.getDay() === 6 : false; // 6 = Saturday
      
      const allBackendSlots: string[] = [];
      timeSlots.forEach(clientSlot => {
        const backendSlots = getRequiredBackendSlots(`${clientSlot.time}:00`, 30, isSaturday);
        allBackendSlots.push(...backendSlots);
      });

      await callFn('update_slots', {
        date: dateStr,
        slots: allBackendSlots.map(s => ({ time_slot: s, available: true })),
      });

      setTimeSlots(prevSlots =>
        prevSlots.map(slot => ({ ...slot, status: 'available' as AvailabilityStatus }))
      );

      toast.success('Todos os horários foram marcados como disponíveis');
    } catch (error) {
      console.error('Error marking all available:', error);
      toast.error('Erro ao marcar horários como disponíveis');
    }
  };

  const renderDayView = () => {
    const timeSlots = generateTimeSlots();
    
    return (
      <div className="space-y-1">
        {timeSlots.map(timeSlot => {
          const slotAppointments = getAppointmentsForSlot(selectedDate, timeSlot);
          
          return (
            <div key={timeSlot} className="flex items-start gap-4 py-2 border-b border-border/50">
              <div className="w-16 text-sm font-medium text-muted-foreground flex-shrink-0">
                {timeSlot}
              </div>
              <div className="flex-1">
                {slotAppointments.length > 0 ? (
                  <div className="space-y-2">
                    {slotAppointments.map(apt => (
                      <div
                        key={apt.id}
                        className={`p-3 rounded-lg border ${getServiceColor(apt.service_type)} cursor-pointer hover:shadow-sm transition-shadow`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">{getServiceIcon(apt.service_type)}</span>
                          <span className="font-medium">{apt.service_name}</span>
                          <Badge variant="outline">
                            {apt.duration}min
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <div className="flex items-center gap-1">
                            <Dog className="w-3 h-3" />
                            <span>{apt.pet_name}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            <span>{apt.client_name}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground italic">
                    Livre
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderWeekView = () => {
    const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    
    return (
      <div className="space-y-6">
        {weekDays.map(day => {
          const dayAppointments = appointments.filter(apt => 
            apt.date === format(day, 'yyyy-MM-dd')
          );
          
          return (
            <Card key={day.toISOString()} className="overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4" />
                  {format(day, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                  <Badge variant="outline">
                    {dayAppointments.length} agendamento{dayAppointments.length !== 1 ? 's' : ''}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {dayAppointments.length > 0 ? (
                  <div className="space-y-2">
                    {dayAppointments
                      .sort((a, b) => a.time.localeCompare(b.time))
                      .map(apt => (
                        <div
                          key={apt.id}
                          className={`p-3 rounded-lg border ${getServiceColor(apt.service_type)} cursor-pointer hover:shadow-sm transition-shadow`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{getServiceIcon(apt.service_type)}</span>
                              <span className="font-medium">{apt.service_name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="w-3 h-3" />
                              <span className="text-sm">{apt.time.slice(0, 5)}</span>
                              <Badge variant="outline">
                                {apt.duration}min
                              </Badge>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <div className="flex items-center gap-1">
                              <Dog className="w-3 h-3" />
                              <span>{apt.pet_name}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              <span>{apt.client_name}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground italic text-center py-4">
                    Nenhum agendamento para este dia
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Calendário</h1>
          <p className="text-muted-foreground">
            Visualize seus agendamentos e gerencie sua disponibilidade
          </p>
        </div>

        <Tabs defaultValue="appointments" className="w-full">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-8">
            <TabsTrigger value="appointments" className="flex items-center gap-2">
              <CalendarIcon className="w-4 h-4" />
              Ver Agendamentos
            </TabsTrigger>
            <TabsTrigger value="availability" className="flex items-center gap-2">
              🛠️ Gerenciar Disponibilidade
            </TabsTrigger>
          </TabsList>

          <TabsContent value="appointments" className="space-y-6">
            {/* View Toggle */}
            <div className="flex items-center gap-4 mb-6">
              <div className="flex items-center gap-2">
                <Button
                  variant={viewMode === 'day' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('day')}
                >
                  Dia
                </Button>
                <Button
                  variant={viewMode === 'week' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('week')}
                >
                  Semana
                </Button>
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedDate(new Date(selectedDate.getTime() - (viewMode === 'day' ? 86400000 : 604800000)))}
                >
                  ←
                </Button>
                <span className="font-medium min-w-48 text-center">
                  {viewMode === 'day' 
                    ? format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                    : `${format(startOfWeek(selectedDate, { weekStartsOn: 1 }), 'dd MMM', { locale: ptBR })} - ${format(endOfWeek(selectedDate, { weekStartsOn: 1 }), 'dd MMM yyyy', { locale: ptBR })}`
                  }
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedDate(new Date(selectedDate.getTime() + (viewMode === 'day' ? 86400000 : 604800000)))}
                >
                  →
                </Button>
              </div>
            </div>

            {/* Calendar Content */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5" />
                  {viewMode === 'day' ? 'Agenda do Dia' : 'Agenda da Semana'}
                </CardTitle>
                <CardDescription>
                  Seus agendamentos organizados por horário
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-4">
                    {[...Array(8)].map((_, i) => (
                      <div key={i} className="h-16 bg-muted rounded-lg animate-pulse"></div>
                    ))}
                  </div>
                ) : (
                  <>
                    {viewMode === 'day' ? renderDayView() : renderWeekView()}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="availability" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Calendar */}
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle>Selecionar Data</CardTitle>
                  <CardDescription>
                    Escolha o dia para gerenciar sua disponibilidade
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Calendar
                    mode="single"
                    selected={availabilityDate}
                    onSelect={setAvailabilityDate}
                    disabled={(date) => date < new Date() || date.getDay() === 0}
                    locale={ptBR}
                    className="rounded-md border"
                  />
                </CardContent>
              </Card>

              {/* Time Slots */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>
                    Horários - {availabilityDate ? format(availabilityDate, "dd 'de' MMMM", { locale: ptBR }) : ''}
                  </CardTitle>
                  <CardDescription>
                    Clique nos blocos para alternar disponibilidade
                  </CardDescription>
                   <div className="flex gap-2 mt-4">
                     <Button 
                       variant="destructive" 
                       size="sm"
                       onClick={markAllUnavailable}
                       disabled={availabilityLoading}
                     >
                       Marcar Tudo Indisponível
                     </Button>
                     <Button 
                       variant="default" 
                       size="sm"
                       onClick={markAllAvailable}
                       disabled={availabilityLoading}
                       className="bg-green-600 hover:bg-green-700"
                     >
                       Marcar Tudo Disponível
                     </Button>
                   </div>
                </CardHeader>
                <CardContent>
                 {availabilityLoading ? (
                    <div className="space-y-2">
                      {[...Array(16)].map((_, i) => (
                        <div key={i} className="h-14 bg-muted rounded-lg animate-pulse"></div>
                      ))}
                    </div>
                    ) : (
                     <div className="space-y-2">
                       {timeSlots.map((slot) => (
                         <div
                           key={slot.time}
                           className={`flex items-center justify-between p-4 rounded-lg border transition-all duration-200 ${
                             slot.status === 'available' 
                               ? 'border-green-200 bg-green-50' 
                               : 'border-red-200 bg-red-50'
                           }`}
                         >
                           <div className="flex items-center gap-3">
                             <div className="text-lg font-medium">
                               {slot.time} - {format(new Date(`2000-01-01 ${slot.time}:00`), 'HH:mm', { locale: ptBR })}
                             </div>
                             <div className="text-sm text-muted-foreground">
                               (30 minutos)
                             </div>
                           </div>
                           <div className="flex items-center gap-2">
                             <Badge 
                               variant={slot.status === 'available' ? 'default' : 'destructive'}
                               className={`${slot.status === 'available' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'} transition-colors`}
                             >
                               {slot.status === 'available' ? '✓ Disponível' : '✗ Indisponível'}
                             </Badge>
                             <Button
                               size="sm"
                               variant="outline"
                               className={`ml-2 text-xs ${
                                 slot.status === 'available' 
                                   ? 'border-red-300 text-red-700 hover:bg-red-50' 
                                   : 'border-green-300 text-green-700 hover:bg-green-50'
                               }`}
                               onClick={() => toggleAvailability(slot.time, slot.status)}
                             >
                               {slot.status === 'available' ? 'Tornar Indisponível' : 'Tornar Disponível'}
                             </Button>
                           </div>
                         </div>
                       ))}
                     </div>
                   )}
                  
                  <div className="flex gap-4 mt-6 justify-center">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-green-500"></div>
                      <span className="text-sm">Disponível</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500"></div>
                      <span className="text-sm">Indisponível</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default StaffCalendar;