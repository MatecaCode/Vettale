
import React, { useState, useEffect, useMemo } from 'react';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dog, Clock, CheckCircle, XCircle, Play, AlertCircle, Calendar, User, CalendarDays, Sparkles, Loader2, PawPrint, Heart, Star } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import AppointmentActions from '@/components/appointment/AppointmentActions';

interface AppointmentWithDetails {
  id: string;
  pet_name: string;
  service_name: string;
  date: Date;
  time: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  service_status?: 'not_started' | 'in_progress' | 'completed';
  notes?: string;
  staff_name?: string;
  staff_names?: string[];
  duration?: number;
  total_price?: number;
}

type ReviewableItem = {
  appointment_id: string;
  appointment_date: string | Date;
  appointment_time: string;
  service_id: string;
  service_name: string;
  staff_profile_id: string;
  staff_name: string;
  role: string;
};

const Appointments = () => {
  const { user, loading: authLoading } = useAuth();
  const [appointments, setAppointments] = useState<AppointmentWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // Reviews state
  const [reviewables, setReviewables] = useState<ReviewableItem[]>([]);
  const reviewablesByAppointment = useMemo(() => {
    const map = new Map<string, ReviewableItem[]>();
    for (const r of reviewables) {
      const arr = map.get(r.appointment_id) || [];
      arr.push(r);
      map.set(r.appointment_id, arr);
    }
    return map;
  }, [reviewables]);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedReview, setSelectedReview] = useState<ReviewableItem | null>(null);
  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState<string>('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewSuccess, setReviewSuccess] = useState(false);
  
  // Load user's appointments from the database with detailed information
  useEffect(() => {
    const fetchAppointments = async () => {
      if (!user) return;
      
      setIsLoading(true);
      try {
        console.log('🔍 [APPOINTMENTS] Fetching appointments for user:', user.id);
        
        // First get client_id from user
        const { data: clientData, error: clientError } = await supabase
          .from('clients')
          .select('id')
          .eq('user_id', user.id)
          .single();

        if (clientError || !clientData) {
          console.log('❌ [APPOINTMENTS] No client record found for user:', user.id);
          setAppointments([]);
          return;
        }

        // Get appointments with related data including staff from appointment_staff
        const { data, error } = await supabase
          .from('appointments')
          .select(`
            id,
            date,
            time,
            status,
            service_status,
            notes,
            duration,
            total_price,
            client_id,
            pets:pet_id (name),
            services:service_id (name),
            appointment_staff (
              staff_profiles (name)
            ),
            appointment_services (
              service_order,
              duration,
              price,
              services (name)
            )
          `)
          .eq('client_id', clientData.id)
          .order('date', { ascending: true });

        if (error) {
          console.error('❌ [APPOINTMENTS] Supabase error:', error);
          throw error;
        }

        console.log('📊 [APPOINTMENTS] Raw appointments data:', data);

        if (data) {
          const formattedData = data.map((apt) => {
            // Get all staff names from appointment_staff relationship
            const staffNames = apt.appointment_staff?.map((as: any) => as.staff_profiles?.name).filter(Boolean) || [];

            // Get all service names from appointment_services
            const serviceNames = apt.appointment_services?.map((aps: any) =>
              (aps.services as any)?.name
            ).filter(Boolean) || [];

            // If no appointment_services, fall back to primary service
            const allServiceNames = serviceNames.length > 0 ? serviceNames : [(apt.services as any)?.name || 'Serviço'];
            const serviceName = allServiceNames.join(', ');

            // Compute total duration from per-service records when available (resilient to DB aggregate bugs)
            const servicesDuration = apt.appointment_services?.reduce((sum: number, s: any) => sum + (s.duration || 0), 0) || 0;
            const totalDuration = servicesDuration > 0 ? servicesDuration : (apt.duration || 60);

            // Compute total price from per-service records when available
            const servicesPrice = apt.appointment_services?.reduce((sum: number, s: any) => sum + (s.price || 0), 0) || 0;
            const totalPrice = servicesPrice > 0 ? servicesPrice : (apt.total_price || 0);

            return {
              id: apt.id,
              pet_name: (apt.pets as any)?.name || 'Pet',
              service_name: serviceName,
              date: new Date(apt.date + 'T12:00:00'),
              time: apt.time,
              status: apt.status as 'pending' | 'confirmed' | 'completed' | 'cancelled',
              service_status: apt.service_status as 'not_started' | 'in_progress' | 'completed' | undefined,
              notes: apt.notes || undefined,
              staff_names: staffNames,
              staff_name: staffNames.length > 0 ? staffNames.join(', ') : undefined,
              duration: totalDuration,
              total_price: totalPrice
            };
          });
          
          console.log('✅ [APPOINTMENTS] Formatted appointments:', formattedData);
          setAppointments(formattedData);
        }
      } catch (error: any) {
        console.error('❌ [APPOINTMENTS] Error fetching appointments:', error.message);
        toast.error('Erro ao carregar os agendamentos');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchAppointments();
    // Also fetch reviewable items on page load
    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_reviewable_service_assignments_for_client');
        if (error) throw error;
        setReviewables((data || []) as ReviewableItem[]);
      } catch (e) {
        // non-blocking
      }
    })();
    // Optional realtime subscription: refetch on service status changes
    const channel = supabase
      .channel('client-appointments-service-status')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'appointment_events',
        filter: "event_type=eq.service_status_changed"
      }, () => {
        if (user) {
          // Reuse effect body by calling fetchAppointments-like logic
          // Simpler: trigger a refresh by toggling setIsLoading and reusing the same fetch
          (async () => {
            try {
              // Minimal refetch using existing refresh function
              await refreshAppointments();
              // Refresh reviewables as well
              try {
                const { data, error } = await supabase.rpc('get_reviewable_service_assignments_for_client');
                if (!error) setReviewables((data || []) as ReviewableItem[]);
              } catch {}
            } catch {}
          })();
        }
      })
      .subscribe();

    return () => {
      try { supabase.removeChannel(channel); } catch {}
    };
  }, [user]);
  
  const refreshAppointments = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      console.log('🔄 [APPOINTMENTS] Refreshing appointments after cancellation');
      
      // First get client_id from user
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (clientError || !clientData) {
        console.log('❌ [APPOINTMENTS] No client record found for user:', user.id);
        setAppointments([]);
        return;
      }

      // Get appointments with related data including staff from appointment_staff
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id,
          date,
          time,
          status,
          service_status,
          notes,
          duration,
          total_price,
          client_id,
          pets:pet_id (name),
          services:service_id (name),
          appointment_staff (
            staff_profiles (name)
          ),
          appointment_services (
            service_order,
            duration,
            price,
            services (name)
          )
        `)
        .eq('client_id', clientData.id)
        .order('date', { ascending: true });

      if (error) {
        console.error('❌ [APPOINTMENTS] Supabase error:', error);
        throw error;
      }

      if (data) {
        const formattedData = data.map((apt) => {
          // Get all staff names from appointment_staff relationship
          const staffNames = apt.appointment_staff?.map((as: any) => as.staff_profiles?.name).filter(Boolean) || [];

          // Get all service names from appointment_services
          const serviceNames = apt.appointment_services?.map((aps: any) =>
            (aps.services as any)?.name
          ).filter(Boolean) || [];

          // If no appointment_services, fall back to primary service
          const allServiceNames = serviceNames.length > 0 ? serviceNames : [(apt.services as any)?.name || 'Serviço'];
          const serviceName = allServiceNames.join(', ');

          // Compute totals from per-service records (resilient to DB aggregate bugs)
          const servicesDuration = apt.appointment_services?.reduce((sum: number, s: any) => sum + (s.duration || 0), 0) || 0;
          const totalDuration = servicesDuration > 0 ? servicesDuration : (apt.duration || 60);
          const servicesPrice = apt.appointment_services?.reduce((sum: number, s: any) => sum + (s.price || 0), 0) || 0;
          const totalPrice = servicesPrice > 0 ? servicesPrice : (apt.total_price || 0);

          return {
            id: apt.id,
            pet_name: (apt.pets as any)?.name || 'Pet',
            service_name: serviceName,
            date: new Date(apt.date + 'T12:00:00'),
            time: apt.time,
            status: apt.status as 'pending' | 'confirmed' | 'completed' | 'cancelled',
            service_status: apt.service_status as 'not_started' | 'in_progress' | 'completed' | undefined,
            notes: apt.notes || undefined,
            staff_names: staffNames,
            staff_name: staffNames.length > 0 ? staffNames.join(', ') : undefined,
            duration: totalDuration,
            total_price: totalPrice
          };
        });

        console.log('✅ [APPOINTMENTS] Refreshed appointments:', formattedData);
        setAppointments(formattedData);
      }
    } catch (error: any) {
      console.error('❌ [APPOINTMENTS] Error refreshing appointments:', error.message);
      toast.error('Erro ao atualizar os agendamentos');
    } finally {
      setIsLoading(false);
    }
  };

  const openReviewModal = (item: ReviewableItem) => {
    setSelectedReview(item);
    setRating(5);
    setComment('');
    setReviewModalOpen(true);
  };

  const submitReview = async () => {
    if (!selectedReview) return;
    setSubmittingReview(true);
    try {
      const { error } = await supabase.rpc('create_staff_review', {
        _appointment_id: selectedReview.appointment_id,
        _service_id: selectedReview.service_id,
        _staff_profile_id: selectedReview.staff_profile_id,
        _rating: rating,
        _comment: comment || null
      });
      if (error) throw error;
      toast.success('Avaliação enviada com sucesso!');
      // Premium feedback and smooth transition
      setReviewSuccess(true);
      setTimeout(() => {
        setReviewModalOpen(false);
        setSelectedReview(null);
        setReviewSuccess(false);
      }, 900);
      // Refetch reviewables so the CTA disappears
      const { data, error: rerr } = await supabase.rpc('get_reviewable_service_assignments_for_client');
      if (!rerr) setReviewables((data || []) as ReviewableItem[]);
    } catch (e: any) {
      const msg = e?.message || '';
      if (msg.includes('already_reviewed')) toast.error('Você já avaliou este serviço.');
      else if (msg.includes('service_not_completed')) toast.error('Este serviço ainda não está concluído.');
      else if (msg.includes('staff_not_assigned')) toast.error('Profissional não associado a este serviço.');
      else if (msg.includes('not_owner')) toast.error('Somente o dono do agendamento pode avaliar.');
      else if (msg.includes('comment_too_long')) toast.error('Comentário excede 1000 caracteres.');
      else toast.error('Falha ao enviar avaliação.');
    } finally {
      setSubmittingReview(false);
    }
  };

  useEffect(() => {
    // Animate in the content
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const getStatusBadge = (status: string, serviceStatus?: string) => {
    switch (status) {
      case 'pending':
        return (
          <Badge className="bg-gradient-to-r from-[#F59E0B] to-[#FBBF24] text-white border-0 text-xs px-2 py-1 whitespace-nowrap">
            <AlertCircle className="w-3 h-3 mr-1" />
            Aguardando
          </Badge>
        );
      case 'confirmed':
        // Show service status for confirmed appointments
        if (serviceStatus) {
          switch (serviceStatus) {
            case 'not_started':
              return (
                <Badge className="bg-gradient-to-r from-[#2B70B2] to-[#6BAEDB] text-white border-0 text-xs px-2 py-1 whitespace-nowrap">
                  <Clock className="w-3 h-3 mr-1" />
                  Confirmado
                </Badge>
              );
            case 'in_progress':
              return (
                <Badge className="bg-gradient-to-r from-[#8FBF9F] to-[#6BAEDB] text-white border-0 text-xs px-2 py-1 whitespace-nowrap">
                  <Play className="w-3 h-3 mr-1" />
                  Em Andamento
                </Badge>
              );
            case 'completed':
              return (
                <Badge className="bg-gradient-to-r from-[#10B981] to-[#34D399] text-white border-0 text-xs px-2 py-1 whitespace-nowrap">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Concluído
                </Badge>
              );
          }
        }
        return (
          <Badge className="bg-gradient-to-r from-[#2B70B2] to-[#6BAEDB] text-white border-0 text-xs px-2 py-1 whitespace-nowrap">
            <CheckCircle className="w-3 h-3 mr-1" />
            Confirmado
          </Badge>
        );
      case 'completed':
        return (
          <Badge className="bg-gradient-to-r from-[#10B981] to-[#34D399] text-white border-0 text-xs px-2 py-1 whitespace-nowrap">
            <CheckCircle className="w-3 h-3 mr-1" />
            Concluído
          </Badge>
        );
      case 'cancelled':
        return (
          <Badge className="bg-gradient-to-r from-[#DC2626] to-[#EF4444] text-white border-0 text-xs px-2 py-1 whitespace-nowrap">
            <XCircle className="w-3 h-3 mr-1" />
            Cancelado
          </Badge>
        );
      default:
        return null;
    }
  };

  const AppointmentDetailCard = ({ appointment, index }: { appointment: AppointmentWithDetails; index: number }) => (
    <Dialog>
      <DialogTrigger asChild>
                 <Card 
          className={`group hover:shadow-xl transition-all duration-300 border-0 bg-white/80 backdrop-blur-sm shadow-lg transform hover:scale-105 cursor-pointer h-[460px] w-full ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
           style={{ transitionDelay: `${500 + index * 100}ms` }}
         >
                     <CardHeader className="pb-4 h-24">
             <div className="flex items-start justify-between h-full">
               <div className="flex items-start space-x-3 flex-1 min-h-0">
                 <div className="w-12 h-12 bg-gradient-to-br from-[#8FBF9F] to-[#6BAEDB] rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300 flex-shrink-0">
                   <Dog className="w-6 h-6 text-white" />
                 </div>
                 <div className="min-w-0 flex-1 flex flex-col justify-center">
                   <CardTitle className="text-xl font-bold text-[#1A4670] truncate mb-1">{appointment.pet_name}</CardTitle>
                   <CardDescription className="text-[#334155] text-sm leading-tight line-clamp-2">{appointment.service_name}</CardDescription>
                 </div>
               </div>
              <div className="flex-shrink-0 ml-3 flex items-center gap-2">
                {getStatusBadge(appointment.status, appointment.service_status)}
              </div>
             </div>
           </CardHeader>
          
                     <CardContent className="space-y-5 flex-1 flex flex-col overflow-hidden px-6">
             <div className="space-y-5 flex-1 overflow-hidden">
               <div className="flex items-start space-x-3 h-12">
                 <Calendar className="h-5 w-5 text-[#2B70B2] mt-0.5 flex-shrink-0" />
                 <div className="min-w-0 flex-1 overflow-hidden">
                   <div className="text-xs font-semibold text-[#2B70B2] uppercase tracking-wide mb-1">Data</div>
                   <div className="text-sm text-[#1A4670] font-medium leading-tight break-words">{format(appointment.date, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}</div>
                 </div>
               </div>
               
               <div className="flex items-start space-x-3 h-12">
                 <Clock className="h-5 w-5 text-[#8FBF9F] mt-0.5 flex-shrink-0" />
                 <div className="min-w-0 flex-1 overflow-hidden">
                   <div className="text-xs font-semibold text-[#8FBF9F] uppercase tracking-wide mb-1">Horário</div>
                   <div className="text-sm text-[#1A4670] font-medium break-words">{appointment.time} ({appointment.duration}min)</div>
                 </div>
               </div>
               
               {appointment.staff_names && appointment.staff_names.length > 0 && (
                 <div className="flex items-start space-x-3 h-12">
                   <User className="h-5 w-5 text-[#6BAEDB] mt-0.5 flex-shrink-0" />
                   <div className="min-w-0 flex-1 overflow-hidden">
                     <div className="text-xs font-semibold text-[#6BAEDB] uppercase tracking-wide mb-1">Profissional</div>
                     <div className="text-sm text-[#1A4670] font-medium leading-tight break-words">{appointment.staff_names.join(', ')}</div>
                   </div>
                 </div>
               )}
               
              {appointment.total_price && appointment.total_price > 0 && (
                 <div className="flex items-start space-x-3 h-12">
                   <div className="h-5 w-5 flex items-center justify-center mt-0.5 flex-shrink-0">
                     <span className="text-[#10B981] font-bold text-lg">R$</span>
                   </div>
                   <div className="min-w-0 flex-1 overflow-hidden">
                     <div className="text-xs font-semibold text-[#10B981] uppercase tracking-wide mb-1">Valor</div>
                     <div className="text-lg text-[#10B981] font-bold break-words">R$ {appointment.total_price.toFixed(2)}</div>
                   </div>
                 </div>
               )}

              {/* Review prompt strip inside card (contained, premium) */}
              {reviewablesByAppointment.get(appointment.id) && reviewablesByAppointment.get(appointment.id)!.length > 0 && (
                <div className="mt-4 border-t pt-3 bg-white/70 rounded-b-md">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[#1A4670]">Avalie nossos profissionais</div>
                      <div className="text-xs text-[#475569]">
                        {reviewablesByAppointment.get(appointment.id)!.length > 1
                          ? `${reviewablesByAppointment.get(appointment.id)!.length} profissionais para avaliar`
                          : 'Sua opinião ajuda a melhorar cada atendimento.'}
                      </div>
                    </div>
                    <Button size="sm" variant="secondary" className="shrink-0">
                      Avaliar
                    </Button>
                  </div>
                </div>
              )}
             </div>

                         {appointment.status === 'pending' && (
               <div className="bg-gradient-to-r from-[#FEF3C7] to-[#FDE68A] border border-[#F59E0B] rounded-lg p-3 mt-auto h-16 flex items-center">
                 <p className="text-sm text-[#92400E]">
                   <AlertCircle className="w-4 h-4 inline mr-1" />
                   Seu agendamento está pendente de aprovação pela clínica.
                 </p>
               </div>
             )}
          </CardContent>
        </Card>
      </DialogTrigger>
      
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Dog className="h-5 w-5 text-[#2B70B2]" />
            {appointment.pet_name}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Status:</span>
            {getStatusBadge(appointment.status, appointment.service_status)}
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm font-medium">Serviço:</span>
              <span className="text-sm">{appointment.service_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-medium">Data:</span>
              <span className="text-sm">{format(appointment.date, "dd/MM/yyyy", { locale: ptBR })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-medium">Horário:</span>
              <span className="text-sm">{appointment.time}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-medium">Duração:</span>
              <span className="text-sm">{appointment.duration} minutos</span>
            </div>
            {appointment.staff_names && appointment.staff_names.length > 0 && (
              <div className="flex justify-between">
                <span className="text-sm font-medium">Profissionais:</span>
                <span className="text-sm">{appointment.staff_names.join(', ')}</span>
              </div>
            )}
            {appointment.total_price && appointment.total_price > 0 && (
              <div className="flex justify-between">
                <span className="text-sm font-medium">Valor:</span>
                <span className="text-sm text-green-600 font-medium">R$ {appointment.total_price.toFixed(2)}</span>
              </div>
            )}

            {/* Review CTAs based only on RPC results */}
            {reviewablesByAppointment.get(appointment.id) && reviewablesByAppointment.get(appointment.id)!.length > 0 && (
              <div className="mt-3 space-y-2">
                <span className="text-sm font-semibold text-[#1A4670]">Avaliações pendentes:</span>
                <div className="flex flex-col gap-2">
                  {reviewablesByAppointment.get(appointment.id)!.map(r => (
                    <Button
                      key={`${r.appointment_id}-${r.service_id}-${r.staff_profile_id}`}
                      variant="secondary"
                      onClick={() => openReviewModal(r)}
                    >
                      Avaliar {r.service_name} — {r.staff_name} ({r.role})
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {appointment.notes && (
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">Observações:</span>
                <span className="text-sm text-muted-foreground">{appointment.notes}</span>
              </div>
            )}
            {/* General appointment reminder */}
            <div className="mt-4 p-3 rounded bg-gradient-to-r from-[#E7F0FF] to-[#F1F5F9] border border-[#6BAEDB]">
              <span className="block text-[#1A4670] text-sm font-semibold mb-1">Lembrete:</span>
              <ul className="list-disc pl-5 text-[#334155] text-sm">
                <li>Chegar 5 minutos de antecedência</li>
              </ul>
            </div>
          </div>

          <div className="flex justify-center">
            <AppointmentActions 
              appointmentId={appointment.id}
              status={appointment.status}
              onCancel={refreshAppointments}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
  
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Reset time to start of day for comparison

  const upcomingAppointments = appointments.filter(apt => {
    const appointmentDate = new Date(apt.date);
    appointmentDate.setHours(0, 0, 0, 0); // Reset time for comparison
    
    // Upcoming: future dates OR today with pending/confirmed status
    // Exclude if service was already completed regardless of date
    const isUpcomingByTimeAndLifecycle =
      (appointmentDate >= today && (apt.status === 'pending' || apt.status === 'confirmed')) ||
      (appointmentDate.getTime() === today.getTime() && (apt.status === 'pending' || apt.status === 'confirmed'));

    return isUpcomingByTimeAndLifecycle && apt.service_status !== 'completed';
  });
  
  const pastAppointments = appointments.filter(apt => {
    const appointmentDate = new Date(apt.date);
    appointmentDate.setHours(0, 0, 0, 0); // Reset time for comparison
    
    // Past: past dates OR completed/cancelled appointments
    // Include if service was completed, even if scheduled for the future
    return appointmentDate < today ||
           apt.status === 'completed' ||
           apt.status === 'cancelled' ||
           apt.service_status === 'completed';
  });

  if (authLoading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#E7F0FF] via-white to-[#F1F5F9]">
          <div className="text-center space-y-6">
            <div className="animate-spin rounded-full h-12 w-12 border-3 border-[#6BAEDB] border-t-[#2B70B2] mx-auto"></div>
            <p className="text-lg font-medium text-[#1A4670]">Verificando autenticação...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!user && !authLoading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#E7F0FF] via-white to-[#F1F5F9]">
          <div className="text-center space-y-4">
            <div className="w-24 h-24 bg-gradient-to-br from-[#2B70B2] to-[#6BAEDB] rounded-full flex items-center justify-center mx-auto mb-4">
              <CalendarDays className="w-12 h-12 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-[#1A4670]">Acesso Restrito</h2>
            <p className="text-[#334155]">Você precisa estar logado para visualizar seus agendamentos.</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-[#E7F0FF] via-white to-[#F1F5F9] py-8">
        {/* Animated Background Elements */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-[#6BAEDB] rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-[#2B70B2] rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse" style={{ animationDelay: '2s' }}></div>
          <div className="absolute top-40 left-40 w-60 h-60 bg-[#8FBF9F] rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse" style={{ animationDelay: '4s' }}></div>
        </div>

        <div className="relative max-w-6xl mx-auto px-6">
          {/* Header Section */}
          <div className={`transition-all duration-1000 delay-200 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <div className="text-center mb-12">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-[#2B70B2] to-[#6BAEDB] rounded-full mb-6 shadow-lg">
                <CalendarDays className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-[#2B70B2] to-[#6BAEDB] bg-clip-text text-transparent mb-3">
                Meus Agendamentos
              </h1>
              <p className="text-xl text-[#334155] max-w-2xl mx-auto">
                Visualize e gerencie todos os seus agendamentos de serviços
              </p>
              <div className="flex justify-center mt-4">
                <div className="flex items-center space-x-2 bg-white/80 backdrop-blur-sm rounded-full px-4 py-2 shadow-sm">
                  <Heart className="w-4 h-4 text-[#2B70B2]" />
                  <span className="text-sm text-[#334155]">
                    {isLoading ? 'Carregando...' : `${appointments.length} agendamento(s) encontrado(s)`}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Content Section */}
          <div className={`transition-all duration-1000 delay-400 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <Tabs defaultValue="upcoming" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-8 bg-white/80 backdrop-blur-sm shadow-lg border-0">
                <TabsTrigger value="upcoming" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#2B70B2] data-[state=active]:to-[#6BAEDB] data-[state=active]:text-white">
                  <CalendarDays className="w-4 h-4 mr-2" />
                  Próximos {upcomingAppointments.length > 0 && `(${upcomingAppointments.length})`}
                </TabsTrigger>
                <TabsTrigger value="past" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#2B70B2] data-[state=active]:to-[#6BAEDB] data-[state=active]:text-white">
                  <Clock className="w-4 h-4 mr-2" />
                  Passados {pastAppointments.length > 0 && `(${pastAppointments.length})`}
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="upcoming">
                {isLoading ? (
                  <div className="text-center py-16">
                    <div className="animate-spin rounded-full h-16 w-16 border-4 border-[#6BAEDB] border-t-[#2B70B2] mx-auto mb-6"></div>
                    <p className="text-lg font-medium text-[#1A4670]">Carregando agendamentos...</p>
                  </div>
                                 ) : upcomingAppointments.length > 0 ? (
                   <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 lg:gap-8">
                     {upcomingAppointments.map((appointment, index) => (
                       <AppointmentDetailCard 
                         key={appointment.id}
                         appointment={appointment}
                         index={index}
                       />
                     ))}
                   </div>
                ) : (
                  <Card className="group hover:shadow-xl transition-all duration-300 border-0 bg-white/80 backdrop-blur-sm shadow-lg">
                    <CardContent className="flex items-center justify-center py-20 text-center">
                      <div className="space-y-6">
                        <div className="w-24 h-24 bg-gradient-to-br from-[#8FBF9F] to-[#6BAEDB] rounded-full flex items-center justify-center mx-auto">
                          <Dog className="w-12 h-12 text-white" />
                        </div>
                        <div className="space-y-3">
                          <h3 className="text-2xl font-bold text-[#1A4670]">Nenhum Agendamento Próximo</h3>
                          <p className="text-[#334155] max-w-md mx-auto">
                            Você não tem nenhum agendamento próximo. Que tal agendar um serviço para seu pet?
                          </p>
                        </div>
                        <Button asChild className="bg-gradient-to-r from-[#2B70B2] to-[#6BAEDB] hover:from-[#1A4670] hover:to-[#2B70B2] text-white px-8 py-3 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105">
                          <Link to="/book">Agendar um Serviço</Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
              
              <TabsContent value="past">
                {isLoading ? (
                  <div className="text-center py-16">
                    <div className="animate-spin rounded-full h-16 w-16 border-4 border-[#6BAEDB] border-t-[#2B70B2] mx-auto mb-6"></div>
                    <p className="text-lg font-medium text-[#1A4670]">Carregando agendamentos...</p>
                  </div>
                                 ) : pastAppointments.length > 0 ? (
                   <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 lg:gap-8">
                     {pastAppointments.map((appointment, index) => (
                       <AppointmentDetailCard 
                         key={appointment.id}
                         appointment={appointment}
                         index={index}
                       />
                     ))}
                   </div>
                ) : (
                  <Card className="group hover:shadow-xl transition-all duration-300 border-0 bg-white/80 backdrop-blur-sm shadow-lg">
                    <CardContent className="flex items-center justify-center py-20 text-center">
                      <div className="space-y-6">
                        <div className="w-24 h-24 bg-gradient-to-br from-[#8FBF9F] to-[#6BAEDB] rounded-full flex items-center justify-center mx-auto">
                          <CalendarDays className="w-12 h-12 text-white" />
                        </div>
                        <div className="space-y-3">
                          <h3 className="text-2xl font-bold text-[#1A4670]">Nenhum Agendamento Passado</h3>
                          <p className="text-[#334155] max-w-md mx-auto">
                            Seu histórico de agendamentos aparecerá aqui depois que você tiver serviços conosco.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Bottom Spacing */}
          <div className="h-16"></div>
        </div>
      </div>

      {/* Review Modal */}
      <Dialog open={reviewModalOpen} onOpenChange={setReviewModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Avaliar serviço</DialogTitle>
          </DialogHeader>
          {selectedReview && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                {selectedReview.service_name} — {selectedReview.staff_name} ({selectedReview.role})
              </div>
              {/* Accessible star rating */}
              <div
                role="radiogroup"
                aria-label="Nota"
                className="flex items-center gap-2"
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    setRating((r) => Math.min(5, r + 1));
                  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    setRating((r) => Math.max(1, r - 1));
                  }
                }}
              >
                {[1,2,3,4,5].map((n) => {
                  const selected = rating >= n;
                  return (
                    <button
                      key={n}
                      role="radio"
                      aria-checked={selected}
                      aria-label={`${n} de 5`}
                      className={`h-9 w-9 rounded-full flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-[#2B70B2] ${selected ? 'bg-[#2B70B2] text-white' : 'bg-white border border-gray-300 text-[#2B70B2]'}`}
                      onClick={() => setRating(n)}
                    >
                      <Star className={`h-5 w-5 ${selected ? 'fill-current text-white' : 'text-[#2B70B2]'}`} />
                    </button>
                  );
                })}
                <span className="ml-2 text-sm text-muted-foreground">{rating}/5</span>
              </div>
              <div>
                <textarea
                  value={comment}
                  onChange={(e) => {
                    if (e.target.value.length <= 1000) setComment(e.target.value);
                  }}
                  className="w-full border rounded p-2 text-sm"
                  placeholder="Comentário (opcional, até 1000 caracteres)"
                  rows={4}
                />
                <div className="text-xs text-muted-foreground text-right">{comment.length}/1000</div>
              </div>
              {reviewSuccess ? (
                <div className="flex items-center gap-2 text-green-700 font-medium">
                  <CheckCircle className="h-5 w-5" /> Avaliação enviada. Obrigado!
                </div>
              ) : (
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setReviewModalOpen(false)} disabled={submittingReview}>Cancelar</Button>
                  <Button onClick={submitReview} disabled={submittingReview}>{submittingReview ? 'Enviando...' : 'Enviar avaliação'}</Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default Appointments;
