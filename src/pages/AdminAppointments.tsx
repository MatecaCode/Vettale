import React, { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import ServiceStatusDropdown from '@/components/appointments/ServiceStatusDropdown';
import { useCanEditServiceStatus } from '@/hooks/useCanEditServiceStatus';
import { Dog, Clock, CheckCircle, XCircle, Play, AlertCircle, Calendar, User, ArrowLeft, Search, Filter, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import AppointmentActions from '@/components/appointment/AppointmentActions';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
  staff_ids?: string[];
  duration?: number;
  total_price?: number;
  extra_fee?: number | null;
  edit_info?: string;
  client_name?: string;
  client_email?: string;
  booked_by_admin?: boolean;
  is_admin_override?: boolean;
  is_double_booking?: boolean;
  // ✅ ADD: Add-ons fields
  addons?: Array<{
    id: string;
    name: string;
    quantity: number;
    price: number;
    custom_description?: string;
  }>;
  // ✅ ADD: Include service-specific staff assignments
  service_staff?: Array<{
    service_id: string;
    service_name: string;
    staff_name: string;
    role: string;
  }>;
}

const AdminAppointments = () => {
  const { user, isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [appointments, setAppointments] = useState<AppointmentWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<string>(searchParams.get('tab') || 'pending');

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSearchParams((prev) => { prev.set('tab', value); return prev; }, { replace: true });
  };
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentWithDetails | null>(null);
  const [showAppointmentDetail, setShowAppointmentDetail] = useState(false);
  
  // Handle appointment parameter from URL
  useEffect(() => {
    const appointmentId = searchParams.get('appointment');
    if (appointmentId && appointments.length > 0) {
      const appointment = appointments.find(apt => apt.id === appointmentId);
      if (appointment) {
        setSelectedAppointment(appointment);
        setShowAppointmentDetail(true);
      }
    }
  }, [searchParams, appointments]);

  // Load all appointments from the database with detailed information
  useEffect(() => {
    const fetchAppointments = async () => {
      if (!user) return;
      
      setIsLoading(true);
      try {
        console.log('🔍 [ADMIN_APPOINTMENTS] Fetching all appointments');
        
                 // Get all appointments with related data including staff, client info, and add-ons
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
             booked_by_admin,
             is_admin_override,
             is_double_booking,
             extra_fee,
             edit_info,
             client_id,
             pets:pet_id (name),
             services:service_id (name),
             clients:client_id (name, email),
             appointment_staff (
               staff_profile_id,
               role,
               service_id,
               staff_profiles (name)
             ),
             appointment_services (
               service_id,
               service_order,
               services (name)
             ),
             appointment_addons (
               id,
               quantity,
               price,
               custom_description,
               service_addons (
                 id,
                 name
               )
             )
           `)
           .order('date', { ascending: true });
        
        if (error) {
          console.error('❌ [ADMIN_APPOINTMENTS] Supabase error:', error);
          throw error;
        }
        
        console.log('📊 [ADMIN_APPOINTMENTS] Raw appointments data:', data);
        
        if (data) {
          const formattedData = data.map((apt) => {
            // Get all staff names and IDs from appointment_staff relationship
            const staffData = apt.appointment_staff?.map((as: any) => ({
              name: as.staff_profiles?.name,
              id: as.staff_profile_id
            })).filter((staff: any) => staff.name) || [];
            const staffNames = staffData.map((staff: any) => staff.name);
            const staffIds = staffData.map((staff: any) => staff.id);

            // ✅ ADD: Process service-specific staff assignments
            const serviceStaffData = apt.appointment_staff?.map((as: any) => {
              const serviceInfo = apt.appointment_services?.find((aps: any) => aps.service_id === as.service_id);
              const serviceName = (serviceInfo?.services as any)?.name || 'Serviço';
              return {
                service_id: as.service_id,
                service_name: serviceName,
                staff_name: as.staff_profiles?.name || 'Não atribuído',
                role: as.role || 'primary'
              };
            }).filter((staff: any) => staff.staff_name !== 'Não atribuído') || [];

            // ✅ ADD: Process add-ons data
            const addonsData = apt.appointment_addons?.map((addon: any) => ({
              id: addon.id,
              name: addon.service_addons?.name || 'Add-on',
              quantity: addon.quantity,
              price: addon.price,
              custom_description: addon.custom_description
            })).filter((addon: any) => addon.name) || [];

            // ✅ ADD: Process all services from appointment_services
            const allServiceNames = apt.appointment_services?.map((aps: any) => 
              (aps.services as any)?.name
            ).filter(Boolean) || [];
            
            // If no appointment_services, fall back to primary service
            const serviceName = allServiceNames.length > 0 ? allServiceNames.join(', ') : ((apt.services as any)?.name || 'Serviço');

            return {
              id: apt.id,
              pet_name: (apt.pets as any)?.name || 'Pet',
              service_name: serviceName,
              date: new Date(apt.date + 'T12:00:00'),
              time: apt.time,
              status: apt.status as 'pending' | 'confirmed' | 'completed' | 'cancelled',
              service_status: apt.service_status as 'not_started' | 'in_progress' | 'completed' | undefined,
              notes: apt.notes,
              staff_names: staffNames,
              staff_ids: staffIds,
              duration: apt.duration,
              total_price: apt.total_price,
              extra_fee: apt.extra_fee !== null && apt.extra_fee !== undefined && apt.extra_fee !== 0 && apt.extra_fee !== "0" ? apt.extra_fee : null,
              edit_info: apt.edit_info,
              client_name: (apt.clients as any)?.name || 'Cliente',
              client_email: (apt.clients as any)?.email || '',
              booked_by_admin: apt.booked_by_admin || false,
              is_admin_override: apt.is_admin_override || false,
              is_double_booking: apt.is_double_booking || false,
              // ✅ ADD: Include add-ons in formatted data
              addons: addonsData,
              // ✅ ADD: Include service-specific staff assignments
              service_staff: serviceStaffData,
            };
          });
          
          console.log('✅ [ADMIN_APPOINTMENTS] Formatted appointments:', formattedData);
          setAppointments(formattedData);
        }
      } catch (error) {
        console.error('❌ [ADMIN_APPOINTMENTS] Error fetching appointments:', error);
        toast.error('Erro ao carregar agendamentos');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAppointments();
  }, [user]);

  const reloadAppointments = async () => {
    // Reuse the existing refreshAppointments logic but expose a single call for children
    await refreshAppointments();
  };

  const refreshAppointments = async () => {
    // Re-fetch appointments
    const fetchAppointments = async () => {
      if (!user) return;
      
      setIsLoading(true);
      try {
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
            booked_by_admin,
            is_admin_override,
            is_double_booking,
            extra_fee,
            edit_info,
            client_id,
            pets:pet_id (name),
            services:service_id (name),
            clients:client_id (name, email),
            appointment_staff (
              staff_profile_id,
              role,
              service_id,
              staff_profiles (name)
            ),
            appointment_services (
              service_id,
              service_order,
              services (name)
            ),
            appointment_addons (
              id,
              quantity,
              price,
              custom_description,
              service_addons (
                id,
                name
              )
            )
          `)
          .order('date', { ascending: true });
        
        if (error) throw error;
        
                  if (data) {
            const formattedData = data.map((apt) => {
              const staffData = apt.appointment_staff?.map((as: any) => ({
                name: as.staff_profiles?.name,
                id: as.staff_profile_id
              })).filter((staff: any) => staff.name) || [];
              const staffNames = staffData.map((staff: any) => staff.name);
              const staffIds = staffData.map((staff: any) => staff.id);

              // ✅ ADD: Process service-specific staff assignments (same as main fetch)
              const serviceStaffData = apt.appointment_staff?.map((as: any) => {
                const serviceInfo = apt.appointment_services?.find((aps: any) => aps.service_id === as.service_id);
                const serviceName = (serviceInfo?.services as any)?.name || 'Serviço';
                return {
                  service_id: as.service_id,
                  service_name: serviceName,
                  staff_name: as.staff_profiles?.name || 'Não atribuído',
                  role: as.role || 'primary'
                };
              }).filter((staff: any) => staff.staff_name !== 'Não atribuído') || [];

              // ✅ ADD: Process all services from appointment_services (same as main fetch)
              const allServiceNames = apt.appointment_services?.map((aps: any) => 
                (aps.services as any)?.name
              ).filter(Boolean) || [];
              
              // If no appointment_services, fall back to primary service
              const serviceName = allServiceNames.length > 0 ? allServiceNames.join(', ') : ((apt.services as any)?.name || 'Serviço');

              // ✅ ADD: Process add-ons data (same as main fetch)
              const addonsData = apt.appointment_addons?.map((addon: any) => ({
                id: addon.id,
                name: addon.service_addons?.name || 'Add-on',
                quantity: addon.quantity,
                price: addon.price,
                custom_description: addon.custom_description
              })).filter((addon: any) => addon.name) || [];

              return {
                id: apt.id,
                pet_name: (apt.pets as any)?.name || 'Pet',
                service_name: serviceName,
                date: new Date(apt.date + 'T12:00:00'),
                time: apt.time,
                status: apt.status as 'pending' | 'confirmed' | 'completed' | 'cancelled',
                service_status: apt.service_status as 'not_started' | 'in_progress' | 'completed' | undefined,
                notes: apt.notes,
                staff_names: staffNames,
                staff_ids: staffIds,
                duration: apt.duration,
                total_price: apt.total_price,
                extra_fee: apt.extra_fee !== null && apt.extra_fee !== undefined && apt.extra_fee !== 0 && apt.extra_fee !== "0" ? apt.extra_fee : null,
                edit_info: apt.edit_info,
                client_name: (apt.clients as any)?.name || 'Cliente',
                client_email: (apt.clients as any)?.email || '',
                booked_by_admin: apt.booked_by_admin || false,
                is_admin_override: apt.is_admin_override || false,
                is_double_booking: apt.is_double_booking || false,
                // ✅ ADD: Include add-ons in formatted data
                addons: addonsData,
                // ✅ ADD: Include service-specific staff assignments
                service_staff: serviceStaffData,
              };
            });
          
          setAppointments(formattedData);
        }
      } catch (error) {
        console.error('Error refreshing appointments:', error);
        toast.error('Erro ao atualizar agendamentos');
      } finally {
        setIsLoading(false);
      }
    };

    await fetchAppointments();
  };

  const getStatusBadge = (status: string, serviceStatus?: string, date?: Date) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Pendente</Badge>;
      case 'confirmed': {
        // If the appointment date has already passed, flag it for the admin to conclude.
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const isPast = date != null && date < today;
        return isPast
          ? <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300">Pendente conclusão</Badge>
          : <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Confirmado</Badge>;
      }
      case 'completed':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Concluído</Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Cancelado</Badge>;
      default:
        return <Badge variant="outline">Desconhecido</Badge>;
    }
  };

  // Service status now controlled by dropdown on cards; badge helper removed

    const AppointmentDetailCard = ({ appointment }: { appointment: AppointmentWithDetails }) => {
      // Determine card background based on status
      const getCardBackground = () => {
        switch (appointment.status) {
          case 'pending':
            return 'bg-yellow-50/30 border-yellow-200';
          case 'confirmed':
            return 'bg-blue-50/30 border-blue-200';
          case 'completed':
            return 'bg-green-50/30 border-green-200';
          case 'cancelled':
            return 'bg-red-50/30 border-red-200';
          default:
            return 'bg-white border-gray-200';
        }
      };

      // Add orange border for admin overrides
      const getOverrideBorder = () => {
        if (appointment.is_admin_override) {
          return 'border-orange-300';
        }
        return '';
      };

      const canEdit = useCanEditServiceStatus({ appointmentId: appointment.id, staffIds: appointment.staff_ids, isAdmin });

      return (
        <div className={`border rounded-xl p-6 pb-4 flex flex-col shadow-md hover:shadow-lg transition-shadow min-w-0 ${getCardBackground()} ${getOverrideBorder()}`}>
          {/* 1. Pet Name (bold) */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="flex-1 min-w-0">
              <h3 className="text-xl font-bold text-gray-900 mb-1 truncate">{appointment.pet_name}</h3>
              <p className="text-sm text-gray-500 break-words">{appointment.service_name}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {getStatusBadge(appointment.status, appointment.service_status, appointment.date)}
              <ServiceStatusDropdown
                appointmentId={appointment.id}
                value={(appointment.service_status as 'not_started' | 'in_progress' | 'completed')}
                canEdit={canEdit}
                refetchAppointments={reloadAppointments}
                isAdmin={isAdmin}
              />
            </div>
          </div>

          {/* 2. Date and Time */}
          <div className="flex items-center gap-4 text-sm mb-4">
            <div className="flex items-center gap-2">
              <span className="text-gray-500">🗓️</span>
              <span>{format(appointment.date, 'dd/MM/yyyy', { locale: ptBR })}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">🕒</span>
              <span>{appointment.time}</span>
            </div>
          </div>

          {/* 3. Client and Professional - on same line */}
          <div className="flex items-center gap-2 text-sm mb-4">
            <div className="flex items-center gap-1">
              <span className="text-gray-500">👤</span>
              <span className="text-xs font-medium text-gray-700">Cliente:</span>
              <span className="text-sm">{appointment.client_name}</span>
            </div>
            <span className="text-gray-300">|</span>
            <div className="flex items-center gap-1">
              <span className="text-gray-500">👨‍⚕️</span>
              <span className="text-xs font-medium text-gray-700">Profissional:</span>
              <span className="text-sm">{appointment.staff_names && appointment.staff_names.length > 0 ? appointment.staff_names.join(', ') : 'Não atribuído'}</span>
            </div>
          </div>

          {/* 4. Duration and Price - side by side */}
          <div className="flex flex-wrap items-center gap-2 text-sm mb-4">
            <div className="inline-flex items-center gap-1">
              <span className="text-gray-500">⏱</span>
              <span className="text-xs font-medium text-gray-700">Duração:</span>
              <span className="text-sm">{appointment.duration || 60} min</span>
            </div>
            <span className="text-gray-300">|</span>
            <div className="inline-flex items-center gap-1">
              <span className="text-gray-500">💰</span>
              <span className="text-xs font-medium text-gray-700">Preço:</span>
              {appointment.total_price == null ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                  Primeira visita
                </span>
              ) : (
                <>
                  <span className="text-sm font-medium">R$ {appointment.total_price.toFixed(2)}</span>
                  {appointment.extra_fee !== null && appointment.extra_fee !== undefined && appointment.extra_fee > 0 && (
                    <span className="text-xs text-orange-600 ml-2 font-medium">
                      💲 +R$ {appointment.extra_fee.toFixed(2)}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          {/* 5. Extra Fee - Show if exists and greater than 0 */}
          {appointment.extra_fee !== null && appointment.extra_fee !== undefined && appointment.extra_fee > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-orange-500">💲</span>
                <span className="text-xs font-medium text-orange-700">Taxa Extra:</span>
              </div>
              <div className="ml-6">
                <p className="text-xs text-orange-600 font-medium">R$ {appointment.extra_fee.toFixed(2)}</p>
              </div>
            </div>
          )}

          {/* 6. Observações - Always show */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-gray-500">📝</span>
              <span className="text-xs font-medium text-gray-700">Observações:</span>
            </div>
            <div className="ml-6">
              {appointment.notes && appointment.notes.trim() ? (
                <p className="text-xs text-gray-600">{appointment.notes}</p>
              ) : (
                <p className="text-xs text-gray-400 italic">Nenhuma observação</p>
              )}
            </div>
          </div>

          {/* 7. Add-ons - Show if exists */}
          {appointment.addons && appointment.addons.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-green-500">➕</span>
                <span className="text-xs font-medium text-green-700">Add-ons:</span>
              </div>
              <div className="ml-6 space-y-1">
                {appointment.addons.map((addon, index) => (
                  <div key={addon.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-600">
                        • {addon.name} (x{addon.quantity})
                      </span>
                      {addon.custom_description && (
                        <span className="text-xs text-gray-500 italic">
                          - {addon.custom_description}
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-medium text-green-600">
                      R$ {addon.price.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 8. Admin Action Badges */}
          {(appointment.booked_by_admin || appointment.is_admin_override || appointment.is_double_booking) && (
            <div className="flex flex-wrap gap-2 mb-4">
              {appointment.booked_by_admin && (
                <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                  Criado por Admin
                </Badge>
              )}
              {appointment.is_admin_override && (
                <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
                  Override
                </Badge>
              )}
              {appointment.is_double_booking && (
                <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
                  🚨 Duplo Agendamento
                </Badge>
              )}
            </div>
          )}

                  {/* 9. Edit Info */}
          {appointment.edit_info && (
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 mb-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-blue-500">✏️</span>
                <span className="text-xs font-medium text-blue-700">Edição</span>
              </div>
              <p className="text-xs text-blue-600 ml-6">{appointment.edit_info}</p>
            </div>
          )}
          
                    {/* 9. Edit History - Show if appointment was edited */}
          {appointment.is_double_booking && (
            <div className="p-3 bg-orange-50 rounded-lg border border-orange-200 mb-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-orange-500">🔁</span>
                <span className="text-xs font-medium text-orange-700">Override Aplicado</span>
              </div>
              <p className="text-xs text-orange-600 ml-6">
                Este agendamento foi editado com override - alguns horários já estavam ocupados
              </p>
            </div>
          )}

          {/* 10. Action Buttons - Always at bottom */}
        <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t min-w-0">
          <AppointmentActions 
            appointmentId={appointment.id} 
            status={appointment.status} 
            onCancel={refreshAppointments}
            onConfirm={refreshAppointments}
            onEdit={refreshAppointments}
            isAdminOverride={appointment.is_admin_override}
            currentDate={appointment.date}
            currentTime={appointment.time}
            currentExtraFee={appointment.extra_fee}
            currentNotes={appointment.notes}
            petName={appointment.pet_name}
            clientName={appointment.client_name}
          />
          
          {/* Debug Link - Only show in debug mode */}
          {(() => {
            const isDebug =
              (typeof window !== 'undefined' &&
               new URLSearchParams(window.location.search).get('debug') === '1') ||
              (typeof localStorage !== 'undefined' &&
               localStorage.getItem('debug') === '1');
            
            return isDebug ? (
              <Link 
                to={`/admin/debug/availability/${appointment.staff_ids?.[0] || 'unknown'}/${format(appointment.date, 'yyyy-MM-dd')}`}
                className="text-xs text-blue-600 hover:text-blue-800 font-mono"
              >
                🛠️ Debug
              </Link>
            ) : null;
          })()}
        </div>
      </div>
    );
  };

  // Filter appointments based on search and filters
  const filteredAppointments = appointments.filter(appointment => {
    try {
      const matchesSearch = searchTerm === '' || 
        appointment.pet_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        appointment.service_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        appointment.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        appointment.staff_names?.some(name => name.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesStatus = statusFilter === 'all' || appointment.status === statusFilter;
      
      let matchesDate = true;
      if (dateFilter !== 'all') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (dateFilter === 'today') {
          const appointmentDate = new Date(appointment.date);
          appointmentDate.setHours(0, 0, 0, 0);
          matchesDate = appointmentDate.getTime() === today.getTime();
        } else if (dateFilter === 'week') {
          const appointmentDate = new Date(appointment.date);
          const endOfWeek = new Date(today);
          endOfWeek.setDate(today.getDate() + 7);
          
          matchesDate = appointmentDate >= today && appointmentDate <= endOfWeek;
        }
      }
      
      return matchesSearch && matchesStatus && matchesDate;
    } catch (error) {
      console.error('Error filtering appointment:', error, appointment);
      return false; // Exclude problematic appointments
    }
  });

  const pendingAppointments = filteredAppointments.filter(apt => apt.status === 'pending');
  const confirmedAppointments = filteredAppointments.filter(apt => apt.status === 'confirmed');
  const completedAppointments = filteredAppointments.filter(apt => apt.status === 'completed');
  const cancelledAppointments = filteredAppointments.filter(apt => apt.status === 'cancelled');

  return (
    <AdminLayout>
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Link to="/admin/dashboard">
              <Button variant="outline" className="flex items-center gap-2">
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Button>
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">Gerenciar Agendamentos</h1>
          </div>
          <p className="text-gray-600">
            Visualize, edite e cancele agendamentos do sistema
          </p>
        </div>

        {/* Search and Filters */}
        <div className="mb-6 space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar por pet, serviço, cliente ou profissional..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filtrar por status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="pending">Pendentes</SelectItem>
                <SelectItem value="confirmed">Confirmados</SelectItem>
                <SelectItem value="completed">Concluídos</SelectItem>
                <SelectItem value="cancelled">Cancelados</SelectItem>
              </SelectContent>
            </Select>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filtrar por data" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as datas</SelectItem>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="week">Esta semana</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

                 {/* Appointments Tabs */}
         <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
           <TabsList className="grid w-full grid-cols-5">
             <TabsTrigger value="pending">Pendentes ({pendingAppointments.length})</TabsTrigger>
             <TabsTrigger value="confirmed">Confirmados ({confirmedAppointments.length})</TabsTrigger>
             <TabsTrigger value="completed">Concluídos ({completedAppointments.length})</TabsTrigger>
             <TabsTrigger value="cancelled">Cancelados ({cancelledAppointments.length})</TabsTrigger>
             <TabsTrigger value="all">Todos ({filteredAppointments.length})</TabsTrigger>
           </TabsList>

                     <TabsContent value="pending" className="space-y-4">
             {isLoading ? (
               <div className="flex items-center justify-center py-8">
                 <div className="flex items-center gap-2">
                   <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                   <span>Carregando agendamentos...</span>
                 </div>
               </div>
             ) : pendingAppointments.length === 0 ? (
               <div className="text-center py-8">
                 <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                 <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum agendamento pendente</h3>
                 <p className="text-gray-600">Não há agendamentos pendentes no momento.</p>
               </div>
             ) : (
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                 {pendingAppointments.map((appointment) => (
                   <AppointmentDetailCard key={appointment.id} appointment={appointment} />
                 ))}
               </div>
             )}
           </TabsContent>

           <TabsContent value="confirmed" className="space-y-4">
             {isLoading ? (
               <div className="flex items-center justify-center py-8">
                 <div className="flex items-center gap-2">
                   <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                   <span>Carregando agendamentos...</span>
                 </div>
               </div>
             ) : confirmedAppointments.length === 0 ? (
               <div className="text-center py-8">
                 <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                 <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum agendamento confirmado</h3>
                 <p className="text-gray-600">Não há agendamentos confirmados no momento.</p>
               </div>
             ) : (
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                 {confirmedAppointments.map((appointment) => (
                   <AppointmentDetailCard key={appointment.id} appointment={appointment} />
                 ))}
               </div>
             )}
           </TabsContent>

           <TabsContent value="completed" className="space-y-4">
             {isLoading ? (
               <div className="flex items-center justify-center py-8">
                 <div className="flex items-center gap-2">
                   <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                   <span>Carregando agendamentos...</span>
                 </div>
               </div>
             ) : completedAppointments.length === 0 ? (
               <div className="text-center py-8">
                 <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                 <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum agendamento concluído</h3>
                 <p className="text-gray-600">Não há agendamentos concluídos no momento.</p>
               </div>
             ) : (
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                 {completedAppointments.map((appointment) => (
                   <AppointmentDetailCard key={appointment.id} appointment={appointment} />
                 ))}
               </div>
             )}
           </TabsContent>

           <TabsContent value="cancelled" className="space-y-4">
             {isLoading ? (
               <div className="flex items-center justify-center py-8">
                 <div className="flex items-center gap-2">
                   <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                   <span>Carregando agendamentos...</span>
                 </div>
               </div>
             ) : cancelledAppointments.length === 0 ? (
               <div className="text-center py-8">
                 <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                 <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum agendamento cancelado</h3>
                 <p className="text-gray-600">Não há agendamentos cancelados no momento.</p>
               </div>
             ) : (
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                 {cancelledAppointments.map((appointment) => (
                   <AppointmentDetailCard key={appointment.id} appointment={appointment} />
                 ))}
               </div>
             )}
           </TabsContent>

           <TabsContent value="all" className="space-y-4">
             {isLoading ? (
               <div className="flex items-center justify-center py-8">
                 <div className="flex items-center gap-2">
                   <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                   <span>Carregando agendamentos...</span>
                 </div>
               </div>
             ) : filteredAppointments.length === 0 ? (
               <div className="text-center py-8">
                 <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                 <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum agendamento encontrado</h3>
                 <p className="text-gray-600">Não há agendamentos que correspondam aos filtros aplicados.</p>
               </div>
             ) : (
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                 {filteredAppointments.map((appointment) => (
                   <AppointmentDetailCard key={appointment.id} appointment={appointment} />
                 ))}
               </div>
             )}
           </TabsContent>
        </Tabs>
      </div>

      {/* Appointment Detail Modal */}
      {showAppointmentDetail && selectedAppointment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Detalhes do Agendamento</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowAppointmentDetail(false);
                    setSelectedAppointment(null);
                    setSearchParams({});
                  }}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <div className="space-y-6">
                {/* Pet and Service Info */}
                <div className="border-b pb-4">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">{selectedAppointment.pet_name}</h3>
                  <p className="text-lg text-gray-600">{selectedAppointment.service_name}</p>
                  <div className="flex items-center gap-4 mt-2">
                    {getStatusBadge(selectedAppointment.status, selectedAppointment.service_status)}
                    {/* Service status dropdown can be integrated here if desired */}
                  </div>
                </div>

                {/* Date and Time */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-gray-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-700">Data</p>
                      <p className="text-sm text-gray-600">{format(selectedAppointment.date, 'dd/MM/yyyy', { locale: ptBR })}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-gray-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-700">Horário</p>
                      <p className="text-sm text-gray-600">{selectedAppointment.time}</p>
                    </div>
                  </div>
                </div>

                {/* Client and Staff */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <User className="h-5 w-5 text-gray-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-700">Cliente</p>
                      <p className="text-sm text-gray-600">{selectedAppointment.client_name}</p>
                      {selectedAppointment.client_email && (
                        <p className="text-xs text-gray-500">{selectedAppointment.client_email}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Dog className="h-5 w-5 text-gray-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-700">Profissional</p>
                      <p className="text-sm text-gray-600">{selectedAppointment.staff_names && selectedAppointment.staff_names.length > 0 ? selectedAppointment.staff_names.join(', ') : 'Não atribuído'}</p>
                    </div>
                  </div>
                </div>

                {/* Duration and Price */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-gray-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-700">Duração</p>
                      <p className="text-sm text-gray-600">{selectedAppointment.duration || 60} minutos</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">💰</span>
                    <div>
                      <p className="text-sm font-medium text-gray-700">Preço</p>
                      {selectedAppointment.total_price == null ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                          Primeira visita
                        </span>
                      ) : (
                        <>
                          <p className="text-sm text-gray-600 font-medium">R$ {selectedAppointment.total_price.toFixed(2)}</p>
                          {selectedAppointment.extra_fee && selectedAppointment.extra_fee > 0 && (
                            <p className="text-xs text-orange-600">+ R$ {selectedAppointment.extra_fee.toFixed(2)} taxa extra</p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Notes */}
                {selectedAppointment.notes && (
                  <div className="border-t pt-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">Observações</p>
                    <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded">{selectedAppointment.notes}</p>
                  </div>
                )}

                {/* Edit Info */}
                {selectedAppointment.edit_info && (
                  <div className="border-t pt-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">Informações de Edição</p>
                    <p className="text-sm text-gray-600 bg-blue-50 p-3 rounded">{selectedAppointment.edit_info}</p>
                  </div>
                )}

                {/* Admin Override Info */}
                {selectedAppointment.is_admin_override && (
                  <div className="border-t pt-4">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-orange-500" />
                      <p className="text-sm font-medium text-orange-700">Agendamento com Override Administrativo</p>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="border-t pt-4">
                  <AppointmentActions 
                    appointmentId={selectedAppointment.id}
                    status={selectedAppointment.status}
                    onCancel={refreshAppointments}
                    onConfirm={refreshAppointments}
                    petName={selectedAppointment.pet_name}
                    clientName={selectedAppointment.client_name}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default AdminAppointments; 