import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import PhoneInputBR from '@/components/inputs/PhoneInputBR';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { 
  Users, 
  DollarSign, 
  Clock, 
  Building2,
  Settings,
  Plus,
  Edit,
  Trash2,
  Search,
  Filter,
  Scissors,
  Droplets,
  Stethoscope,
  UserCheck,
  UserX,
  Calendar,
  Clock as ClockIcon
} from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { sendStaffSetupEmail, adminDeleteAuthUser } from '@/lib/staffSetup';
import { logAction } from '@/utils/actionLogger';
import { FN_SEND_STAFF_INVITE } from '@/lib/functions';

// Interfaces
interface StaffProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  can_bathe: boolean;
  can_groom: boolean;
  can_vet: boolean;
  active: boolean;
  bio: string;
  hourly_rate: number;
  created_at: string;
  updated_at: string;
  assigned_services?: string[];
  location_id?: string;
  user_id?: string | null;
  claim_invited_at?: string | null;
  claimed_at?: string | null;
}

interface Location {
  id: string;
  name: string;
}

interface Service {
  id: string;
  name: string;
  service_type: 'grooming' | 'veterinary';
  base_price: number | null;
  default_duration: number | null;
  description: string | null;
  active: boolean;
}



const AdminSettings = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('staff');
  
  // State
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [isCreateStaffModalOpen, setIsCreateStaffModalOpen] = useState(false);
  const [isEditStaffModalOpen, setIsEditStaffModalOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffProfile | null>(null);
  const [isCreatingStaff, setIsCreatingStaff] = useState(false);
  const [resendingSetupFor, setResendingSetupFor] = useState<string | null>(null);
  const [staffFormData, setStaffFormData] = useState({
    name: '',
    email: '',
    phone: '',
    bio: '',
    hourly_rate: 0,
    can_bathe: false,
    can_groom: false,
    can_vet: false,
    role: 'staff' as 'staff' | 'admin',
    assignedServices: [] as string[],
    location_id: ''
  });

  // Service filter state
  const [serviceSearchTerm, setServiceSearchTerm] = useState('');
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>('all');

  // Filtered services
  const filteredServices = services.filter(service => {
    const matchesSearch = 
      service.name?.toLowerCase().includes(serviceSearchTerm.toLowerCase()) ||
      service.description?.toLowerCase().includes(serviceSearchTerm.toLowerCase());
    
    const matchesType = serviceTypeFilter === 'all' || service.service_type === serviceTypeFilter;
    
    return matchesSearch && matchesType;
  });
  
  // Load data on component mount
  useEffect(() => {
    if (user) {
      fetchStaff();
      fetchServices();
      fetchLocations();
    }
  }, [user]);

  // Debug: Monitor staff state changes
  useEffect(() => {
    console.log('🔄 [ADMIN_SETTINGS] Staff state updated:', staff.length, 'members');
  }, [staff]);

  const fetchStaff = async () => {
    setIsLoading(true);
    try {
      console.log('🔍 [ADMIN_SETTINGS] Fetching staff...');
      const { data, error } = await supabase
        .from('staff_profiles')
        .select(`
          id,
          name,
          email,
          phone,
          can_bathe,
          can_groom,
          can_vet,
          active,
          bio,
          hourly_rate,
          created_at,
          updated_at,
          location_id,
          user_id,
          claim_invited_at,
          claimed_at
        `)
        .eq('active', true)
        .order('name');

      if (error) {
        console.error('❌ [ADMIN_SETTINGS] Error fetching staff:', error);
        throw error;
      }

      console.log('✅ [ADMIN_SETTINGS] Staff data:', data);

      // Add empty assigned_services array for now
      const staffWithServices = data?.map(staffMember => ({
        ...staffMember,
        assigned_services: []
      })) || [];

      console.log('✅ [ADMIN_SETTINGS] Staff with services:', staffWithServices);
      console.log('📊 [ADMIN_SETTINGS] Setting staff state with', staffWithServices.length, 'members');
      setStaff(staffWithServices);
    } catch (error) {
      console.error('❌ [ADMIN_SETTINGS] Error fetching staff:', error);
      toast.error('Erro ao carregar staff');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchServices = async () => {
    try {
      const { data, error } = await supabase
        .from('services')
        .select('id, name, service_type, base_price, default_duration, description, active')
        .eq('active', true)
        .order('name');

      if (error) {
        console.error('❌ [ADMIN_SETTINGS] Error fetching services:', error);
        throw error;
      }

      setServices(data || []);
    } catch (error) {
      console.error('❌ [ADMIN_SETTINGS] Error fetching services:', error);
      toast.error('Erro ao carregar serviços');
    }
  };

  const fetchLocations = async () => {
    try {
      const { data, error } = await supabase
        .from('locations')
        .select('id, name')
        .eq('active', true)
        .order('name');

      if (error) {
        console.error('❌ [ADMIN_SETTINGS] Error fetching locations:', error);
        throw error;
      }

      setLocations(data || []);
    } catch (error) {
      console.error('❌ [ADMIN_SETTINGS] Error fetching locations:', error);
      toast.error('Erro ao carregar locais');
    }
  };

  // Helper function to get staff claim status
  const getStaffClaimStatus = (staffProfile: StaffProfile) => {
    if (staffProfile.user_id && staffProfile.claimed_at) {
      return { status: 'claimed', label: 'Conta Vinculada', variant: 'default' as const };
    }
    if (staffProfile.claim_invited_at && !staffProfile.user_id) {
      return { status: 'invited', label: 'Setup Enviado', variant: 'secondary' as const };
    }
    return { status: 'not_invited', label: 'Pendente', variant: 'outline' as const };
  };

  // Staff setup function - send invite email
  const sendStaffInvite = async (staffProfile: StaffProfile) => {
    const toastId = `send-setup-${staffProfile.id}`;
    try {
      setResendingSetupFor(staffProfile.id);

      // Use supabase.functions.invoke so the client auto-refreshes the JWT
      // before the call — raw fetch cannot handle token rotation.
      const { data: responseData, error: invokeError } = await supabase.functions.invoke(
        'send-staff-invite',
        {
          body: {
            email: staffProfile.email.trim().toLowerCase(),
            staff_profile_id: staffProfile.id,
          },
        }
      );

      if (invokeError) {
        console.error("[SEND_STAFF_SETUP] invoke error:", invokeError);
        throw new Error(invokeError.message ?? String(invokeError));
      }

      if (responseData?.error) {
        console.error("[SEND_STAFF_SETUP] Edge function returned error:", responseData);
        throw new Error(responseData.error);
      }

      console.log("[SEND_STAFF_SETUP] Success:", responseData);
      toast.success("Setup enviado 🎉", { id: toastId });
      fetchStaff(); // Refresh to show updated status
    } catch (e: any) {
      console.error("[SEND_STAFF_SETUP] error", e);
      toast.error(e?.message ?? "Falha ao enviar setup", { id: toastId });
    } finally {
      setResendingSetupFor(null);
    }
  };



  const handleCreateStaff = async () => {
    if (!staffFormData.name || !staffFormData.email) {
      toast.error('Nome e email são obrigatórios');
      return;
    }

    setIsCreatingStaff(true);
    console.log('🚀 [ADMIN_SETTINGS] Starting staff creation...');
    
    try {
      // Check if staff profile already exists with this email (case-insensitive)
      const { data: existingStaff, error: existingError } = await supabase
        .from('staff_profiles')
        .select('id, email')
        .ilike('email', staffFormData.email.trim())
        .single();

      if (existingError && existingError.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('❌ [ADMIN_SETTINGS] Existing staff check error:', existingError);
        toast.error('Erro ao verificar staff existente');
        setIsCreatingStaff(false);
        return;
      }

      if (existingStaff) {
        toast.error('Já existe um staff cadastrado com este email.');
        setIsCreatingStaff(false);
        return;
      }

      // Note: Removed client email validation - same email can be used for both client and staff roles

      // Create staff profile
      const { data: staffData, error: staffError } = await supabase
        .from('staff_profiles')
        .insert({
          name: staffFormData.name,
          email: staffFormData.email.trim().toLowerCase(),
          phone: staffFormData.phone,
          bio: staffFormData.bio,
          hourly_rate: staffFormData.hourly_rate,
          can_bathe: staffFormData.can_bathe,
          can_groom: staffFormData.can_groom,
          can_vet: staffFormData.can_vet,
          location_id: staffFormData.location_id || null,
          active: true
        })
        .select()
        .single();

      if (staffError) {
        console.error('❌ [ADMIN_SETTINGS] Staff creation error:', staffError);
        
        // Provide more specific error messages based on error details
        let errorMessage = 'Erro ao criar staff';
        if (staffError.message?.includes('duplicate key') || staffError.code === '23505') {
          errorMessage = 'Já existe um staff cadastrado com este email.';
        } else if (staffError.message?.includes('violates check constraint')) {
          errorMessage = 'Dados inválidos fornecidos. Verifique os campos obrigatórios.';
        } else if (staffError.message) {
          errorMessage = `Erro: ${staffError.message}`;
        }
        
        toast.error(errorMessage);
        setIsCreatingStaff(false);
        return;
      }

      // Staff created successfully
      console.log('✅ [ADMIN_SETTINGS] Staff created successfully:', staffData);

      void logAction({
        action_type: 'config_updated',
        category: 'config',
        description: `Funcionário criado: ${staffData.name}`,
        link_type: null,
        link_id: null,
        metadata: { staffId: staffData.id, email: staffData.email },
      });

      // Send invitation email using Edge Function (like client flow)
      // Use supabase.functions.invoke so the client auto-refreshes the JWT
      // before the call — raw fetch cannot handle token rotation.
      try {
        const { data: responseData, error: invokeError } = await supabase.functions.invoke(
          'send-staff-invite',
          {
            body: {
              email: staffData.email.trim().toLowerCase(),
              staff_profile_id: staffData.id,
            },
          }
        );

        if (invokeError) {
          console.error("❌ [ADMIN_SETTINGS] Invite invoke error:", invokeError);

          let inviteErrorMessage = invokeError.message ?? 'Erro desconhecido';
          if (inviteErrorMessage.includes('already registered') || inviteErrorMessage.includes('already exists')) {
            inviteErrorMessage = 'Este email já possui uma conta no sistema';
          } else if (inviteErrorMessage.includes('P0001')) {
            inviteErrorMessage = 'Este email já está associado a uma conta existente';
          }

          toast.success('Staff criado com sucesso!', {
            description: `Falha ao enviar convite: ${inviteErrorMessage}. Use o botão "Enviar Setup" para reenviar.`,
          });
        } else if (responseData?.error) {
          console.error("❌ [ADMIN_SETTINGS] Invite function error:", responseData);

          let inviteErrorMessage = responseData.error;
          if (responseData.error.includes('already registered') || responseData.error.includes('already exists')) {
            inviteErrorMessage = 'Este email já possui uma conta no sistema';
          } else if (responseData.error.includes('P0001')) {
            inviteErrorMessage = 'Este email já está associado a uma conta existente';
          }

          toast.success('Staff criado com sucesso!', {
            description: `Falha ao enviar convite: ${inviteErrorMessage}. Use o botão "Enviar Setup" para reenviar.`,
          });
        } else {
          console.log("✅ [ADMIN_SETTINGS] Invite sent successfully:", responseData);
          toast.success('Staff criado com sucesso! 🎉', {
            description: `Convite enviado para ${staffData.email}`,
          });
        }
      } catch (inviteErr: any) {
        console.error('❌ [ADMIN_SETTINGS] Invite exception:', inviteErr);
        toast.success('Staff criado com sucesso!', {
          description: 'Falha ao enviar convite automaticamente. Use o botão "Enviar Setup" para reenviar.',
        });
      }
      
      // Close modal and reset form - always do this on success
      setIsCreateStaffModalOpen(false);
      resetStaffForm();
      setIsCreatingStaff(false);
      fetchStaff(); // Refresh to show updated status
      
    } catch (error: any) {
      console.error('❌ [ADMIN_SETTINGS] Error creating staff:', error);
      
      // Provide more specific error messages
      let errorMessage = 'Erro ao criar staff';
      if (error?.message) {
        if (error.message.includes('duplicate key') || error.message.includes('already exists')) {
          errorMessage = 'Já existe um staff cadastrado com este email.';
        } else if (error.message.includes('P0001')) {
          errorMessage = 'Este email já está associado a uma conta existente no sistema.';
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
          errorMessage = 'Erro de conexão. Verifique sua internet e tente novamente.';
        } else {
          errorMessage = `Erro: ${error.message}`;
        }
      }
      
      toast.error(errorMessage);
      setIsCreatingStaff(false);
    }
  };

  const handleEditStaff = async () => {
    if (!selectedStaff || !staffFormData.name || !staffFormData.email) {
      toast.error('Nome e email são obrigatórios');
      return;
    }

    try {
      // Update staff profile
      const { error: staffError } = await supabase
        .from('staff_profiles')
        .update({
          name: staffFormData.name,
          email: staffFormData.email,
          phone: staffFormData.phone,
          bio: staffFormData.bio,
          hourly_rate: staffFormData.hourly_rate,
          can_bathe: staffFormData.can_bathe,
          can_groom: staffFormData.can_groom,
          can_vet: staffFormData.can_vet,
          location_id: staffFormData.location_id || null
        })
        .eq('id', selectedStaff.id);

      if (staffError) {
        console.error('❌ [ADMIN_SETTINGS] Staff update error:', staffError);
        toast.error('Erro ao atualizar staff');
        return;
      }

      

      void logAction({
        action_type: 'config_updated',
        category: 'config',
        description: `Funcionário editado: ${staffFormData.name}`,
        link_type: null,
        link_id: null,
        metadata: { staffId: selectedStaff.id, email: staffFormData.email },
      });
      toast.success('Staff atualizado com sucesso');
      setIsEditStaffModalOpen(false);
      setSelectedStaff(null);
      resetStaffForm();
      fetchStaff();
    } catch (error) {
      console.error('❌ [ADMIN_SETTINGS] Error updating staff:', error);
      toast.error('Erro ao atualizar staff');
    }
  };

  const handleRemoveStaff = async (staffId: string, currentStatus: boolean) => {
    try {
      if (currentStatus) {
        // First, get the staff profile to find the user_id and email
        const { data: staffProfile, error: fetchError } = await supabase
          .from('staff_profiles')
          .select('user_id, email, name')
          .eq('id', staffId)
          .single();

        if (fetchError) {
          console.error('❌ [ADMIN_SETTINGS] Error fetching staff for deletion:', fetchError);
          toast.error('Erro ao buscar dados do staff');
          return;
        }

        console.log('🗑️ [ADMIN_SETTINGS] Removing staff completely:', staffProfile);
        
        // Remove from app tables using database function
        const { error: rpcError } = await supabase.rpc('remove_staff_completely', {
          p_staff_id: staffId
        });

        if (rpcError) {
          console.error('❌ [ADMIN_SETTINGS] Error removing staff from app tables:', rpcError);
          toast.error('Erro ao remover staff do sistema');
          return;
        }

        console.log('✅ [ADMIN_SETTINGS] Staff removed from app tables');

        void logAction({
          action_type: 'config_updated',
          category: 'config',
          description: `Funcionário removido: ${staffProfile.name ?? staffId}`,
          link_type: null,
          link_id: null,
          metadata: { staffId, email: staffProfile.email, hadAuthUser: !!(staffProfile.user_id || staffProfile.email) },
        });

        // Delete auth user if it exists (either by user_id or by email)
        if (staffProfile.user_id || staffProfile.email) {
          console.log('🗑️ [ADMIN_SETTINGS] Deleting auth user via Edge Function:', { user_id: staffProfile.user_id, email: staffProfile.email });
          
          // Try to delete auth user in background (does not block UI)
          try {
            await adminDeleteAuthUser(supabase, { 
              user_id: staffProfile.user_id, 
              email: staffProfile.email 
            });
            console.log('✅ [ADMIN_SETTINGS] Auth user deleted successfully');
            toast.success('Staff e usuário de autenticação removidos completamente');
          } catch (e: any) {
            console.warn('[ADMIN_DELETE_AUTH] Edge Function failed:', e?.message);
            
            // Try fallback RPC to log the deletion request
            try {
              const { data: rpcResult, error: rpcError } = await supabase
                .rpc('admin_delete_auth_user', {
                  _user_id: staffProfile.user_id,
                  _email: staffProfile.email
                });
              
              if (rpcError) {
                console.error('[ADMIN_DELETE_AUTH] RPC fallback failed:', rpcError);
              } else {
                console.log('[ADMIN_DELETE_AUTH] Deletion request logged via RPC:', rpcResult);
              }
            } catch (rpcError) {
              console.error('[ADMIN_DELETE_AUTH] RPC fallback error:', rpcError);
            }
            
            // Check if it's a CORS error specifically
            if (e?.message?.includes('CORS') || e?.message?.includes('Access-Control-Allow-Origin')) {
              console.warn('[ADMIN_DELETE_AUTH] CORS error detected - Edge Function may not be deployed or configured correctly');
              toast.warning(
                'Staff removido do sistema. ⚠️ Usuário de autenticação pode ainda existir (erro de CORS). ' +
                'Pode ser necessário remover manualmente no painel do Supabase.',
                { duration: 8000 }
              );
            } else if (e?.message?.includes('No auth user found')) {
              console.log('[ADMIN_DELETE_AUTH] No auth user found to delete');
              toast.success('Staff removido do sistema (nenhum usuário de autenticação encontrado)');
            } else {
              console.error('[ADMIN_DELETE_AUTH] Unexpected error:', e);
              toast.warning(
                'Staff removido do sistema. ⚠️ Erro ao remover usuário de autenticação. ' +
                'Verifique manualmente no painel do Supabase se necessário.',
                { duration: 6000 }
              );
            }
          }
        } else {
          console.log('ℹ️ [ADMIN_SETTINGS] No linked auth user to delete');
          toast.success('Staff removido completamente do sistema');
        }
      } else {
        // Activating staff - this shouldn't happen since we're removing the profile
        toast.error('Não é possível reativar um staff removido. Crie um novo perfil.');
        return;
      }

      // Always refresh the staff list after successful deletion
      console.log('🔄 [ADMIN_SETTINGS] Refreshing staff list after deletion...');
      
      // Small delay to ensure database operations are complete
      await new Promise(resolve => setTimeout(resolve, 500));
      
      await fetchStaff();
      console.log('✅ [ADMIN_SETTINGS] Staff list refreshed successfully');
      
    } catch (error) {
      console.error('❌ [ADMIN_SETTINGS] Error removing staff:', error);
      toast.error('Erro ao remover staff');
      
      // Even on error, try to refresh the list to ensure UI is up to date
      try {
        console.log('🔄 [ADMIN_SETTINGS] Attempting to refresh staff list after error...');
        await fetchStaff();
      } catch (refreshError) {
        console.error('❌ [ADMIN_SETTINGS] Error refreshing staff list:', refreshError);
      }
    }
  };

  const openEditModal = (staffMember: StaffProfile) => {
    setSelectedStaff(staffMember);
    setStaffFormData({
      name: staffMember.name,
      email: staffMember.email,
      phone: staffMember.phone || '',
      bio: staffMember.bio || '',
      hourly_rate: staffMember.hourly_rate || 0,
      can_bathe: staffMember.can_bathe,
      can_groom: staffMember.can_groom,
      can_vet: staffMember.can_vet,
      role: 'staff',
      assignedServices: staffMember.assigned_services || [],
      location_id: staffMember.location_id || ''
    });

    setIsEditStaffModalOpen(true);
  };

  const resetStaffForm = () => {
    setStaffFormData({
      name: '',
      email: '',
      phone: '',
      bio: '',
      hourly_rate: 0,
      can_bathe: false,
      can_groom: false,
      can_vet: false,
      role: 'staff',
      assignedServices: [],
      location_id: ''
    });
  };

  const getRoleDisplay = (staff: StaffProfile) => {
    const roles = [];
    if (staff.can_bathe) roles.push('Banhista');
    if (staff.can_groom) roles.push('Tosador');
    if (staff.can_vet) roles.push('Veterinário');
    return roles.length > 0 ? roles.join(', ') : 'Sem função definida';
  };

  const getServiceTypeIcon = (serviceType: string) => {
    switch (serviceType) {
      case 'grooming':
        return <Scissors className="h-4 w-4" />;
      case 'veterinary':
        return <Stethoscope className="h-4 w-4" />;
      default:
        return <Scissors className="h-4 w-4" />;
    }
  };

  // Availability Management Functions
  const openAvailabilityPage = (staffMember: StaffProfile) => {
    navigate(`/admin/staff/${staffMember.id}/availability`);
  };



  const filteredStaff = staff.filter(staffMember => {
    const matchesSearch = 
      staffMember.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      staffMember.email?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRole = roleFilter === 'all' || roleFilter === '' || 
      (roleFilter === 'grooming' && (staffMember.can_bathe || staffMember.can_groom)) ||
      (roleFilter === 'veterinary' && staffMember.can_vet);
    
    return matchesSearch && matchesRole;
  });

  console.log('🔍 [ADMIN_SETTINGS] Staff filtering:', {
    totalStaff: staff.length,
    searchTerm,
    roleFilter,
    filteredCount: filteredStaff.length
  });

  if (!user) {
    return <div>Carregando...</div>;
  }

  return (
    <AdminLayout>
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Configurações do Sistema</h1>
          <p className="text-gray-600 mt-2">
            Gerencie staff, serviços, preços e configurações operacionais
          </p>
        </div>

        {/* Settings Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="staff" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Staff
            </TabsTrigger>
            {/* Serviços & Preços moved to dedicated page under /admin/pricing */}
            <TabsTrigger value="hours" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Horários
            </TabsTrigger>
            <TabsTrigger value="locations" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Locais
            </TabsTrigger>
          </TabsList>

          {/* Staff Management */}
          <TabsContent value="staff" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Gerenciar Staff
                </CardTitle>
                <CardDescription>
                  Adicione, edite ou remova profissionais da equipe
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Toolbar */}
                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                      <Input
                        placeholder="Buscar por nome ou email..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    
                    <div className="flex gap-2">
                      <Select value={roleFilter} onValueChange={setRoleFilter}>
                        <SelectTrigger className="w-48">
                          <Filter className="h-4 w-4 mr-2" />
                          <SelectValue placeholder="Filtrar por função" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todas as funções</SelectItem>
                          <SelectItem value="grooming">Tosador/Banhista</SelectItem>
                          <SelectItem value="veterinary">Veterinário</SelectItem>
                        </SelectContent>
                      </Select>

                      <Dialog open={isCreateStaffModalOpen} onOpenChange={setIsCreateStaffModalOpen}>
                        <DialogTrigger asChild>
                          <Button className="flex items-center gap-2">
                            <Plus className="h-4 w-4" />
                            Adicionar Staff
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>Adicionar Novo Staff</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <Label htmlFor="staff-name">Nome *</Label>
                                <Input
                                  id="staff-name"
                                  value={staffFormData.name}
                                  onChange={(e) => setStaffFormData({ ...staffFormData, name: e.target.value })}
                                  placeholder="Nome completo"
                                />
                              </div>
                              <div>
                                <Label htmlFor="staff-email">Email *</Label>
                                <Input
                                  id="staff-email"
                                  type="email"
                                  value={staffFormData.email}
                                  onChange={(e) => setStaffFormData({ ...staffFormData, email: e.target.value })}
                                  placeholder="email@exemplo.com"
                                />
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <Label htmlFor="staff-phone">Telefone</Label>
                                <PhoneInputBR
                                  value={staffFormData.phone}
                                  onChange={(value) => setStaffFormData({ ...staffFormData, phone: value })}
                                  placeholder="(11) 99999-9999"
                                />
                              </div>
                              <div>
                                <Label htmlFor="staff-hourly-rate">Taxa Horária (R$)</Label>
                                <Input
                                  id="staff-hourly-rate"
                                  type="number"
                                  value={staffFormData.hourly_rate}
                                  onChange={(e) => setStaffFormData({ ...staffFormData, hourly_rate: parseFloat(e.target.value) || 0 })}
                                  placeholder="0.00"
                                />
                              </div>
                            </div>

                            <div>
                              <Label htmlFor="staff-location">Local</Label>
                              <Select value={staffFormData.location_id} onValueChange={(value) => setStaffFormData({ ...staffFormData, location_id: value })}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecione um local (opcional)" />
                                </SelectTrigger>
                                <SelectContent>
                                  {locations.map((location) => (
                                    <SelectItem key={location.id} value={location.id}>
                                      {location.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div>
                              <Label htmlFor="staff-bio">Biografia</Label>
                              <Textarea
                                id="staff-bio"
                                value={staffFormData.bio}
                                onChange={(e) => setStaffFormData({ ...staffFormData, bio: e.target.value })}
                                placeholder="Breve descrição sobre o profissional"
                                rows={3}
                              />
                            </div>

                            <div>
                              <Label>Funções</Label>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="can-bathe"
                                    checked={staffFormData.can_bathe}
                                    onCheckedChange={(checked) => setStaffFormData({ ...staffFormData, can_bathe: checked as boolean })}
                                  />
                                  <Label htmlFor="can-bathe" className="flex items-center gap-2">
                                    <Droplets className="h-4 w-4" />
                                    Banhista
                                  </Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="can-groom"
                                    checked={staffFormData.can_groom}
                                    onCheckedChange={(checked) => setStaffFormData({ ...staffFormData, can_groom: checked as boolean })}
                                  />
                                  <Label htmlFor="can-groom" className="flex items-center gap-2">
                                    <Scissors className="h-4 w-4" />
                                    Tosador
                                  </Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="can-vet"
                                    checked={staffFormData.can_vet}
                                    onCheckedChange={(checked) => setStaffFormData({ ...staffFormData, can_vet: checked as boolean })}
                                  />
                                  <Label htmlFor="can-vet" className="flex items-center gap-2">
                                    <Stethoscope className="h-4 w-4" />
                                    Veterinário
                                  </Label>
                                </div>
                              </div>
                            </div>

                            

                            <div className="flex gap-2 pt-4">
                              <Button 
                                onClick={handleCreateStaff} 
                                className="flex-1"
                                disabled={isCreatingStaff}
                              >
                                {isCreatingStaff ? (
                                  <>
                                    <ClockIcon className="mr-2 h-4 w-4 animate-spin" />
                                    Criando Staff...
                                  </>
                                ) : (
                                  'Criar Staff'
                                )}
                              </Button>
                              <Button 
                                variant="outline" 
                                onClick={() => setIsCreateStaffModalOpen(false)}
                                disabled={isCreatingStaff}
                              >
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                  
                  {/* Staff List */}
                  {isLoading ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
                      <p className="mt-2 text-gray-600">Carregando staff...</p>
                    </div>
                  ) : filteredStaff.length === 0 ? (
                    <Card>
                      <CardContent className="text-center py-8">
                        <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                          {searchTerm || roleFilter !== 'all' ? 'Nenhum staff encontrado' : 'Nenhum staff cadastrado'}
                        </h3>
                        <p className="text-gray-600 mb-4">
                          {searchTerm || roleFilter !== 'all' 
                            ? 'Tente ajustar os filtros de busca' 
                            : 'Comece adicionando o primeiro profissional'
                          }
                        </p>
                        {!searchTerm && roleFilter === 'all' && (
                          <Button onClick={() => setIsCreateStaffModalOpen(true)}>
                            <Plus className="h-4 w-4 mr-2" />
                            Adicionar Primeiro Staff
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-3">
                      {filteredStaff.map((staffMember) => (
                        <Card key={staffMember.id} className="hover:shadow-lg transition-shadow">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <h3 className="font-semibold text-lg">{staffMember.name}</h3>
                                  <Badge variant={staffMember.active ? "secondary" : "destructive"}>
                                    {staffMember.active ? (
                                      <UserCheck className="h-3 w-3 mr-1" />
                                    ) : (
                                      <UserX className="h-3 w-3 mr-1" />
                                    )}
                                    {staffMember.active ? 'Ativo' : 'Inativo'}
                                  </Badge>
                                  {(() => {
                                    const claimStatus = getStaffClaimStatus(staffMember);
                                    return (
                                      <Badge variant={claimStatus.variant}>
                                        {claimStatus.label}
                                      </Badge>
                                    );
                                  })()}
                                </div>
                                
                                <div className="space-y-1 text-sm text-gray-600">
                                  <p className="flex items-center gap-2">
                                    <span>📧 {staffMember.email}</span>
                                  </p>
                                  {staffMember.phone && (
                                    <p className="flex items-center gap-2">
                                      <span>📞 {staffMember.phone}</span>
                                    </p>
                                  )}
                                  <p className="flex items-center gap-2">
                                    <span>🎯 {getRoleDisplay(staffMember)}</span>
                                  </p>
                                  {staffMember.location_id && (
                                    <p className="flex items-center gap-2">
                                      <span>🏢 {locations.find(loc => loc.id === staffMember.location_id)?.name || 'Local desconhecido'}</span>
                                    </p>
                                  )}
                                  {staffMember.assigned_services && staffMember.assigned_services.length > 0 && (
                                    <div className="flex items-center gap-2">
                                      <span>🔧 Serviços: {staffMember.assigned_services.join(', ')}</span>
                                    </div>
                                  )}
                                  {staffMember.hourly_rate > 0 && (
                                    <p className="flex items-center gap-2">
                                      <span>💰 R$ {staffMember.hourly_rate}/hora</span>
                                    </p>
                                  )}
                                </div>
                              </div>
                              
                                                             <div className="flex items-center gap-2">
                                 <Button
                                   size="sm"
                                   variant="outline"
                                   onClick={() => openEditModal(staffMember)}
                                 >
                                   <Edit className="h-3 w-3 mr-1" />
                                   Editar
                                 </Button>
                                 
                                 <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openAvailabilityPage(staffMember)}
                                  >
                                    <Calendar className="h-3 w-3 mr-1" />
                                    Disponibilidade
                                  </Button>

                                                                 {/* Setup/Re-send Setup Button - Show for staff without claimed accounts */}
                                {(getStaffClaimStatus(staffMember).status === 'invited' || 
                                  getStaffClaimStatus(staffMember).status === 'not_invited') && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => sendStaffInvite(staffMember)}
                                    disabled={resendingSetupFor === staffMember.id}
                                    className="text-blue-600 border-blue-600 hover:bg-blue-50"
                                  >
                                    {resendingSetupFor === staffMember.id ? (
                                      <>
                                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600 mr-1" />
                                        Enviando...
                                      </>
                                    ) : (
                                      <>
                                        <UserCheck className="h-3 w-3 mr-1" />
                                        {getStaffClaimStatus(staffMember).status === 'invited' ? 'Reenviar Setup' : 'Enviar Setup'}
                                      </>
                                    )}
                                  </Button>
                                )}
                                 
                                 <AlertDialog>
                                   <AlertDialogTrigger asChild>
                                     <Button
                                       size="sm"
                                       variant={staffMember.active ? "destructive" : "default"}
                                     >
                                       {staffMember.active ? (
                                         <UserX className="h-3 w-3 mr-1" />
                                       ) : (
                                         <UserCheck className="h-3 w-3 mr-1" />
                                       )}
                                       {staffMember.active ? 'Remover' : 'Ativar'}
                                     </Button>
                                   </AlertDialogTrigger>
                                   <AlertDialogContent>
                                     <AlertDialogHeader>
                                       <AlertDialogTitle>
                                         {staffMember.active ? 'Remover' : 'Ativar'} Staff
                                       </AlertDialogTitle>
                                       <AlertDialogDescription>
                                         Tem certeza que deseja {staffMember.active ? 'remover' : 'ativar'} o staff "{staffMember.name}"?
                                         {staffMember.active 
                                           ? ' Esta ação irá remover completamente o staff e todos os seus dados do sistema. Esta ação não pode ser desfeita.'
                                           : ' Eles poderão voltar a receber agendamentos.'
                                         }
                                       </AlertDialogDescription>
                                     </AlertDialogHeader>
                                     <AlertDialogFooter>
                                       <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                       <AlertDialogAction
                                         onClick={() => handleRemoveStaff(staffMember.id, staffMember.active)}
                                         className={staffMember.active ? "bg-red-600 hover:bg-red-700" : ""}
                                       >
                                         {staffMember.active ? 'Remover' : 'Ativar'}
                                       </AlertDialogAction>
                                     </AlertDialogFooter>
                                   </AlertDialogContent>
                                 </AlertDialog>
                               </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Edit Staff Modal */}
          <Dialog open={isEditStaffModalOpen} onOpenChange={setIsEditStaffModalOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Editar Staff</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit-staff-name">Nome *</Label>
                    <Input
                      id="edit-staff-name"
                      value={staffFormData.name}
                      onChange={(e) => setStaffFormData({ ...staffFormData, name: e.target.value })}
                      placeholder="Nome completo"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-staff-email">Email *</Label>
                    <Input
                      id="edit-staff-email"
                      type="email"
                      value={staffFormData.email}
                      onChange={(e) => setStaffFormData({ ...staffFormData, email: e.target.value })}
                      placeholder="email@exemplo.com"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit-staff-phone">Telefone</Label>
                    <PhoneInputBR
                      value={staffFormData.phone}
                      onChange={(value) => setStaffFormData({ ...staffFormData, phone: value })}
                      placeholder="(11) 99999-9999"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-staff-hourly-rate">Taxa Horária (R$)</Label>
                    <Input
                      id="edit-staff-hourly-rate"
                      type="number"
                      value={staffFormData.hourly_rate}
                      onChange={(e) => setStaffFormData({ ...staffFormData, hourly_rate: parseFloat(e.target.value) || 0 })}
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="edit-staff-location">Local</Label>
                  <Select value={staffFormData.location_id} onValueChange={(value) => setStaffFormData({ ...staffFormData, location_id: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um local (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((location) => (
                        <SelectItem key={location.id} value={location.id}>
                          {location.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="edit-staff-bio">Biografia</Label>
                  <Textarea
                    id="edit-staff-bio"
                    value={staffFormData.bio}
                    onChange={(e) => setStaffFormData({ ...staffFormData, bio: e.target.value })}
                    placeholder="Breve descrição sobre o profissional"
                    rows={3}
                  />
                </div>

                <div>
                  <Label>Funções</Label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="edit-can-bathe"
                        checked={staffFormData.can_bathe}
                        onCheckedChange={(checked) => setStaffFormData({ ...staffFormData, can_bathe: checked as boolean })}
                      />
                      <Label htmlFor="edit-can-bathe" className="flex items-center gap-2">
                        <Droplets className="h-4 w-4" />
                        Banhista
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="edit-can-groom"
                        checked={staffFormData.can_groom}
                        onCheckedChange={(checked) => setStaffFormData({ ...staffFormData, can_groom: checked as boolean })}
                      />
                      <Label htmlFor="edit-can-groom" className="flex items-center gap-2">
                        <Scissors className="h-4 w-4" />
                        Tosador
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="edit-can-vet"
                        checked={staffFormData.can_vet}
                        onCheckedChange={(checked) => setStaffFormData({ ...staffFormData, can_vet: checked as boolean })}
                      />
                      <Label htmlFor="edit-can-vet" className="flex items-center gap-2">
                        <Stethoscope className="h-4 w-4" />
                        Veterinário
                      </Label>
                    </div>
                  </div>
                </div>

                

                <div className="flex gap-2 pt-4">
                  <Button onClick={handleEditStaff} className="flex-1">
                    Salvar Alterações
                  </Button>
                  <Button variant="outline" onClick={() => setIsEditStaffModalOpen(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            </DialogContent>
                     </Dialog>
 

 
          {/* Services & Pricing moved to dedicated page under /admin/pricing */}

          {/* Operating Hours */}
          <TabsContent value="hours" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Horários de Funcionamento
                </CardTitle>
                <CardDescription>
                  Configure os horários de atendimento por dia da semana
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium">Configuração de Horários</h3>
                      <p className="text-sm text-gray-600">Defina horários de funcionamento</p>
                    </div>
                    <Button disabled>
                      <Edit className="h-4 w-4 mr-2" />
                      Editar Horários
                    </Button>
                  </div>
                  
                  {/* Placeholder Hours */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-3 border rounded-lg">
                      <h4 className="font-medium">Segunda a Sexta</h4>
                      <p className="text-sm text-gray-600">08:00 - 18:00</p>
                    </div>
                    
                    <div className="p-3 border rounded-lg">
                      <h4 className="font-medium">Sábado</h4>
                      <p className="text-sm text-gray-600">08:00 - 16:00</p>
                    </div>
                    
                    <div className="p-3 border rounded-lg">
                      <h4 className="font-medium">Domingo</h4>
                      <p className="text-sm text-gray-600">Fechado</p>
                    </div>
                    
                    <div className="p-3 border rounded-lg">
                      <h4 className="font-medium">Feriados</h4>
                      <p className="text-sm text-gray-600">Horário especial</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Locations */}
          <TabsContent value="locations" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Gerenciar Locais
                </CardTitle>
                <CardDescription>
                  Configure múltiplas unidades (desabilitado por enquanto)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium">Unidades</h3>
                      <p className="text-sm text-gray-600">Gerencie múltiplas localizações</p>
                    </div>
                    <Button disabled>
                      <Plus className="h-4 w-4 mr-2" />
                      Nova Unidade
                    </Button>
                  </div>
                  
                  <div className="p-4 border rounded-lg bg-gray-50">
                    <div className="flex items-center gap-3">
                      <Building2 className="h-5 w-5 text-gray-400" />
                      <div>
                        <p className="font-medium text-gray-600">Suporte Multi-unidade</p>
                        <p className="text-sm text-gray-500">
                          Funcionalidade em desenvolvimento. Por enquanto, apenas uma unidade é suportada.
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Placeholder Location */}
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">Unidade Principal</p>
                      <p className="text-sm text-gray-600">Alameda Prof. Lucas Nogueira Garcez, 4245</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">Ativo</Badge>
                      <Button size="sm" variant="outline" disabled>
                        <Edit className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* System Status */}
        <div className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle>Status do Sistema</CardTitle>
              <CardDescription>
                Informações sobre a configuração atual
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{staff.filter(s => s.active).length}</div>
                  <div className="text-sm text-gray-600">Profissionais Ativos</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{services.length}</div>
                  <div className="text-sm text-gray-600">Serviços Configurados</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">1</div>
                  <div className="text-sm text-gray-600">Unidade Ativa</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminSettings; 