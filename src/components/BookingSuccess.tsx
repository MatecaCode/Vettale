
import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Calendar, Clock, User, PawPrint, ArrowLeft, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Layout from './Layout';

interface ServiceStaffAssignment {
  service_name: string;
  staff_name: string;
  duration: number;
  price: number;
  service_order: number;
}

interface BookingDetails {
  id: string;
  date: string;
  time: string;
  status: string;
  service_status: string;
  notes?: string;
  duration: number;
  total_price: number;
  pet_name: string;
  service_assignments: ServiceStaffAssignment[];
  staff_names: string[];
}

const BookingSuccess: React.FC = () => {
  const [searchParams] = useSearchParams();
  const appointmentId = searchParams.get('id');
  const [booking, setBooking] = useState<BookingDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchBookingDetails = async () => {
      if (!appointmentId) return;

      try {
        const { data: appointment, error } = await supabase
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
            pets:pet_id (name),
            services:service_id (name),
            appointment_staff (
              staff_profile_id,
              role,
              service_id,
              staff_profiles (name)
            ),
            appointment_services (
              service_id,
              service_order,
              price,
              duration,
              services (name)
            )
          `)
          .eq('id', appointmentId)
          .single();

        if (error) throw error;

        if (appointment) {
          const staffNames = appointment.appointment_staff?.map((as: any) => 
            as.staff_profiles?.name
          ).filter(Boolean) || [];

          // Create service-staff assignments by order
          const serviceAssignments: ServiceStaffAssignment[] = [];
          
          if (appointment.appointment_services && appointment.appointment_staff) {
            // Sort services by order
            const sortedServices = [...appointment.appointment_services].sort((a, b) => 
              (a.service_order || 1) - (b.service_order || 1)
            );
            
            // Sort staff by service_id to match services
            const sortedStaff = [...appointment.appointment_staff].sort((a, b) => {
              // Find service orders for comparison
              const serviceA = appointment.appointment_services.find((s: any) => s.service_id === a.service_id);
              const serviceB = appointment.appointment_services.find((s: any) => s.service_id === b.service_id);
              return (serviceA?.service_order || 1) - (serviceB?.service_order || 1);
            });
            
            sortedServices.forEach((aps: any, index: number) => {
              const serviceName = (aps.services as any)?.name || 'Serviço';
              const serviceDuration = aps.duration || 60;
              const servicePrice = aps.price || 0;
              const serviceOrder = aps.service_order || 1;
              
              // Get staff by index (first staff for first service, second staff for second service)
              const assignedStaff = sortedStaff[index];
              const staffName = assignedStaff?.staff_profiles?.name?.trim() || 'Não atribuído';
              
              serviceAssignments.push({
                service_name: serviceName,
                staff_name: staffName,
                duration: serviceDuration,
                price: servicePrice,
                service_order: serviceOrder
              });
            });
          }
          
          // If no service assignments, create fallback
          if (serviceAssignments.length === 0) {
            const primaryServiceName = (appointment.services as any)?.name || 'Serviço';
            const primaryStaffName = (staffNames[0] || 'Não atribuído').trim();
            
            serviceAssignments.push({
              service_name: primaryServiceName,
              staff_name: primaryStaffName,
              duration: appointment.duration || 60,
              price: appointment.total_price || 0,
              service_order: 1
            });
          }

          setBooking({
            id: appointment.id,
            date: appointment.date,
            time: appointment.time,
            status: appointment.status,
            service_status: appointment.service_status,
            notes: appointment.notes,
            duration: appointment.duration || 60,
            total_price: appointment.total_price || 0,
            pet_name: (appointment.pets as any)?.name || 'Pet',
            service_assignments: serviceAssignments,
            staff_names: staffNames.map(name => name.trim())
          });
        }
      } catch (error) {
        console.error('Error fetching booking details:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBookingDetails();
  }, [appointmentId]);

  if (isLoading) {
    return (
      <Layout>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </Layout>
    );
  }

  if (!booking) {
    return (
      <Layout>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <Card className="max-w-md">
            <CardContent className="text-center py-8">
              <p className="text-muted-foreground">Agendamento não encontrado</p>
              <Button asChild className="mt-4">
                <Link to="/appointments">Ver Meus Agendamentos</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'pending':
        return {
          badge: (
            <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-amber-200">
              <AlertCircle className="w-3 h-3 mr-1" />
              Aguardando Aprovação
            </Badge>
          ),
          title: 'Agendamento Enviado com Sucesso!',
          subtitle: 'Seu agendamento está aguardando aprovação da clínica',
          color: 'text-amber-600'
        };
      case 'confirmed':
        return {
          badge: (
            <Badge variant="default" className="bg-blue-100 text-blue-800 border-blue-200">
              <CheckCircle className="w-3 h-3 mr-1" />
              Confirmado
            </Badge>
          ),
          title: 'Agendamento Confirmado!',
          subtitle: 'Seu agendamento foi aprovado pela clínica',
          color: 'text-green-600'
        };
      default:
        return {
          badge: null,
          title: 'Agendamento Criado!',
          subtitle: 'Detalhes do seu agendamento',
          color: 'text-green-600'
        };
    }
  };

  const statusInfo = getStatusInfo(booking.status);

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="container mx-auto px-4 max-w-2xl">
          {/* Success Animation */}
          <div className="text-center mb-8">
            <div className="animate-scale-in mb-4">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
            </div>
            <h1 className={`text-2xl font-bold ${statusInfo.color} mb-2`}>
              {statusInfo.title}
            </h1>
            <p className="text-muted-foreground">
              {statusInfo.subtitle}
            </p>
          </div>

          {/* Booking Details Card */}
          <Card className="animate-fade-in shadow-lg">
            <CardHeader className="pb-4">
              <div className="flex justify-between items-start">
                <CardTitle className="flex items-center gap-2">
                  <PawPrint className="w-5 h-5 text-primary" />
                  {booking.pet_name}
                </CardTitle>
                {statusInfo.badge}
              </div>
            </CardHeader>
            
            <CardContent className="space-y-6">
              {/* Service Info */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold mb-3">Detalhes do Serviço</h3>
                <div className="space-y-4">
                  {booking.service_assignments.map((assignment, index) => (
                    <div key={index} className="border-l-4 border-primary pl-3">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-muted-foreground">Serviço {assignment.service_order}:</span>
                        <span className="font-medium">{assignment.service_name}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Profissional:</span>
                        <span>{assignment.staff_name}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Duração:</span>
                        <span>{assignment.duration} minutos</span>
                      </div>
                      {assignment.price > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Valor:</span>
                          <span className="font-medium text-green-600">
                            R$ {assignment.price.toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {/* Total Duration & Price */}
                  <div className="pt-3 border-t border-gray-200 space-y-1">
                    <div className="flex justify-between font-semibold">
                      <span>Duração Total:</span>
                      <span>
                        {booking.service_assignments.length > 1
                          ? booking.service_assignments.reduce((sum, a) => sum + (a.duration || 0), 0)
                          : booking.duration} minutos
                      </span>
                    </div>
                    {booking.total_price > 0 && (
                      <div className="flex justify-between font-semibold text-green-600">
                        <span>Valor Total:</span>
                        <span>
                          R$ {booking.service_assignments.length > 1
                            ? booking.service_assignments.reduce((sum, a) => sum + (a.price || 0), 0).toFixed(2)
                            : booking.total_price.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Date & Time */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold mb-3">Data e Horário</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span>
                      {format(new Date(booking.date + 'T12:00:00'), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span>{booking.time}</span>
                  </div>
                </div>
              </div>

              {/* Staff */}
              {booking.staff_names.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-semibold mb-3">Profissionais</h3>
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span>{booking.staff_names.join(', ')}</span>
                  </div>
                </div>
              )}

              {/* Notes */}
              {booking.notes && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-semibold mb-3">Observações</h3>
                  <p className="text-muted-foreground">{booking.notes}</p>
                </div>
              )}

              {/* Status Info */}
              {booking.status === 'pending' && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <h3 className="font-semibold text-amber-800 mb-2">
                    O que acontece agora?
                  </h3>
                  <p className="text-amber-700 text-sm">
                    Seu agendamento foi enviado para aprovação. A clínica irá revisar 
                    e confirmar sua solicitação em breve. Você receberá uma notificação 
                    quando o status for atualizado.
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <Button asChild variant="outline" className="flex-1">
                  <Link to="/book">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Novo Agendamento
                  </Link>
                </Button>
                <Button asChild className="flex-1">
                  <Link to="/appointments">
                    Ver Todos os Agendamentos
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default BookingSuccess;
