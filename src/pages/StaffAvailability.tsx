import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { generateClientTimeSlots, getRequiredBackendSlots, formatTimeSlot, isClientSlotAvailable } from '@/utils/timeSlotHelpers';

type AvailabilityStatus = 'available' | 'unavailable';

interface TimeSlot {
  time: string;
  status: AvailabilityStatus;
}

const StaffAvailability = () => {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [staffProfile, setStaffProfile] = useState<any>(null);

  useEffect(() => {
    if (user) {
      loadStaffProfile();
    }
  }, [user]);

  useEffect(() => {
    if (selectedDate && staffProfile) {
      fetchAvailability();
    }
  }, [selectedDate, staffProfile]);

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

  const callFn = async (action: string, params: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('staff-manage-availability', {
      body: { action, ...params },
    });
    if (error || !data?.ok) throw new Error(data?.error ?? error?.message ?? 'Unknown error');
    return data;
  };

  const generateClientFacingSlots = () => {
    // Use the 30-minute slots from timeSlotHelpers
    const isSaturday = selectedDate ? selectedDate.getDay() === 6 : false; // 6 = Saturday
    return generateClientTimeSlots(isSaturday).map(slot => formatTimeSlot(slot));
  };

  const fetchAvailability = async () => {
    if (!selectedDate || !staffProfile) return;

    try {
      setLoading(true);
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      
      const result = await callFn('get_availability', { date: dateStr });
      const availability = result.data;

      // Generate 30-minute client-facing slots
      const clientSlots = generateClientFacingSlots();
      
      // Check availability for each 30-minute slot by checking all underlying 10-minute slots
      const formattedSlots: TimeSlot[] = clientSlots.map(clientSlot => {
        // For availability management, we assume 30-minute duration for each slot
        const serviceDuration = 30;
        const isSaturday = selectedDate ? selectedDate.getDay() === 6 : false; // 6 = Saturday
        
        // Check if this 30-minute slot is available
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
      setLoading(false);
    }
  };

  const updateAvailability = async (timeSlot: string, newStatus: AvailabilityStatus) => {
    if (!selectedDate || !staffProfile) return;

    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const isAvailable = newStatus === 'available';

      // Get all 10-minute backend slots for this 30-minute period
      const isSaturday = selectedDate ? selectedDate.getDay() === 6 : false; // 6 = Saturday
      const backendSlots = getRequiredBackendSlots(`${timeSlot}:00`, 30, isSaturday);

      await callFn('upsert_slots', {
        date: dateStr,
        slots: backendSlots.map(s => ({ time_slot: s, available: isAvailable })),
      });

      // Update local state
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

  const getStatusColor = (status: AvailabilityStatus) => {
    switch (status) {
      case 'available':
        return 'bg-green-500 hover:bg-green-600';
      case 'unavailable':
        return 'bg-red-500 hover:bg-red-600';
      default:
        return 'bg-gray-500 hover:bg-gray-600';
    }
  };

  const getStatusText = (status: AvailabilityStatus) => {
    switch (status) {
      case 'available':
        return 'Disponível';
      case 'unavailable':
        return 'Indisponível';
      default:
        return 'Pendente';
    }
  };

  const toggleAvailability = (timeSlot: string, currentStatus: AvailabilityStatus) => {
    const newStatus = currentStatus === 'available' ? 'unavailable' : 'available';
    updateAvailability(timeSlot, newStatus);
  };

  const markAllUnavailable = async () => {
    if (!selectedDate || !staffProfile) return;

    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      
      // Get all 10-minute backend slots for the entire day
      const allBackendSlots: string[] = [];
      timeSlots.forEach(clientSlot => {
        const backendSlots = getRequiredBackendSlots(`${clientSlot.time}:00`, 30);
        allBackendSlots.push(...backendSlots);
      });

      await callFn('upsert_slots', {
        date: dateStr,
        slots: allBackendSlots.map(s => ({ time_slot: s, available: false })),
      });

      // Update local state - mark all slots as unavailable
      setTimeSlots(prevSlots =>
        prevSlots.map(slot => ({ ...slot, status: 'unavailable' as AvailabilityStatus }))
      );

      toast.success('Todos os horários foram marcados como indisponíveis');
    } catch (error) {
      console.error('Error marking all unavailable:', error);
      toast.error('Erro ao marcar horários como indisponíveis');
    }
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Gerenciar Disponibilidade</h1>
          <p className="text-muted-foreground">
            Configure seus horários disponíveis
          </p>
        </div>

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
                selected={selectedDate}
                onSelect={setSelectedDate}
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
                Horários - {selectedDate ? format(selectedDate, "dd 'de' MMMM", { locale: ptBR }) : ''}
              </CardTitle>
              <CardDescription>
                Clique nos blocos para alternar disponibilidade
              </CardDescription>
              <div className="flex gap-2 mt-4">
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={markAllUnavailable}
                  disabled={loading}
                >
                  Marcar Tudo Indisponível
                </Button>
              </div>
            </CardHeader>
            <CardContent>
             {loading ? (
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
                      className={`flex items-center justify-between p-4 rounded-lg border transition-colors cursor-pointer hover:bg-muted/50 ${
                        slot.status === 'available' 
                          ? 'border-green-200 bg-green-50' 
                          : 'border-red-200 bg-red-50'
                      }`}
                      onClick={() => toggleAvailability(slot.time, slot.status)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-lg font-medium">
                          {slot.time} - {format(new Date(`2000-01-01 ${slot.time}:00`), 'HH:mm', { locale: ptBR })}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          (30 minutos)
                        </div>
                      </div>
                      <Badge 
                        variant={slot.status === 'available' ? 'default' : 'destructive'}
                        className={slot.status === 'available' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'}
                      >
                        {slot.status === 'available' ? '✓ Disponível' : '✗ Indisponível'}
                      </Badge>
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
      </div>
    </Layout>
  );
};

export default StaffAvailability;