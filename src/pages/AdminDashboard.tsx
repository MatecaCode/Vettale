import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Users, 
  PawPrint, 
  Calendar, 
  Clock, 
  AlertCircle,
  CheckCircle,
  Settings,
  DollarSign,
  UserCheck,
  TrendingUp,
  Activity,
  Zap
} from 'lucide-react';
import { Link } from 'react-router-dom';
import AdminLayout from '@/components/AdminLayout';
import QuickStatsCard from '@/components/admin/QuickStatsCard';
import ActionCard from '@/components/admin/ActionCard';

interface DashboardStats {
  totalUsers: number;
  totalPets: number;
  totalBookings: number;
  todayServices: number;
  pendingApprovals: number;
  staffOnDuty: number;
  revenueToday: number;
  pendingCancellations: number;
}

const AdminDashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    totalPets: 0,
    totalBookings: 0,
    todayServices: 0,
    pendingApprovals: 0,
    staffOnDuty: 0,
    revenueToday: 0,
    pendingCancellations: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];

      const [
        { count: totalUsers },
        { count: totalPets },
        { count: totalBookings },
        { count: todayServices },
        { count: pendingApprovals },
        { data: staffWithAppointments },
        { data: todayAppointments },
        { count: pendingCancellations },
      ] = await Promise.all([
        supabase.from('user_roles').select('*', { count: 'exact', head: true }),
        supabase.from('pets').select('*', { count: 'exact', head: true }),
        supabase.from('appointments').select('*', { count: 'exact', head: true }),
        supabase.from('appointments').select('*', { count: 'exact', head: true })
          .eq('date', today).neq('status', 'cancelled'),
        supabase.from('appointments').select('*', { count: 'exact', head: true })
          .eq('status', 'pending'),
        supabase.from('appointment_staff')
          .select('staff_profile_id, appointments!inner(date, status)')
          .eq('appointments.date', today).neq('appointments.status', 'cancelled'),
        supabase.from('appointments').select('total_price')
          .eq('date', today).eq('status', 'confirmed'),
        supabase.from('appointments').select('*', { count: 'exact', head: true })
          .eq('status', 'cancelled'),
      ]);

      const staffOnDuty = new Set(
        (staffWithAppointments ?? []).map(r => r.staff_profile_id)
      ).size;

      const revenueToday = (todayAppointments ?? []).reduce(
        (sum, apt: any) => sum + (apt.total_price || 0),
        0
      );

      setStats({
        totalUsers: totalUsers ?? 0,
        totalPets: totalPets ?? 0,
        totalBookings: totalBookings ?? 0,
        todayServices: todayServices ?? 0,
        pendingApprovals: pendingApprovals ?? 0,
        staffOnDuty,
        revenueToday,
        pendingCancellations: pendingCancellations ?? 0,
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      toast.error('Erro ao carregar estatísticas do dashboard');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-blue mx-auto mb-4"></div>
        <p className="text-gray-600">Carregando...</p>
      </div>
    </div>;
  }

  return (
    <AdminLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-6">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Dashboard Administrativo</h1>
            <p className="text-sm font-medium text-gray-600">Visão geral do sistema e KPIs principais</p>
          </div>

          {/* Quick Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <QuickStatsCard
              title="Agendamentos Hoje"
              value={stats.todayServices}
              icon={<Calendar className="h-6 w-6" />}
              iconBgColor="bg-brand-blue/10"
              iconColor="text-brand-blue"
              href="/admin/agenda-hoje"
              loading={loading}
            />
            
            <QuickStatsCard
              title="Aprovações Pendentes"
              value={stats.pendingApprovals}
              icon={<AlertCircle className="h-6 w-6" />}
              iconBgColor="bg-orange-100"
              iconColor="text-orange-600"
              href="/admin/appointments"
              loading={loading}
            />
            
            <QuickStatsCard
              title="Staff em Serviço"
              value={stats.staffOnDuty}
              icon={<UserCheck className="h-6 w-6" />}
              iconBgColor="bg-green-100"
              iconColor="text-green-600"
              href="/admin/agenda-hoje"
              loading={loading}
            />
            
            <QuickStatsCard
              title="Receita Hoje"
              value={`R$ ${stats.revenueToday.toFixed(2)}`}
              icon={<DollarSign className="h-6 w-6" />}
              iconBgColor="bg-brand-gold/10"
              iconColor="text-brand-gold"
              href="/admin/appointments"
              loading={loading}
            />
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <ActionCard
              title="Centro de Ações"
              description="Agendamentos manuais, modificações e cobranças extras"
              icon={<Settings className="h-5 w-5" />}
              iconBgColor="bg-brand-blue/10"
              iconColor="text-brand-blue"
              href="/admin/actions"
            />
            
            <ActionCard
              title="Configurações"
              description="Staff, serviços, preços e horários de funcionamento"
              icon={<Settings className="h-5 w-5" />}
              iconBgColor="bg-brand-sage/10"
              iconColor="text-brand-sage"
              href="/admin/settings"
            />
            
            <ActionCard
              title="Logs de Ações"
              description="Histórico de ações administrativas"
              icon={<Activity className="h-5 w-5" />}
              iconBgColor="bg-gray-100"
              iconColor="text-gray-600"
              href="/admin/logs"
            />
          </div>

          {/* KPIs Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <Link to="/admin/clients">
              <Card className="bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer border-0">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wide text-gray-500">Total de Usuários</CardTitle>
                  <Users className="h-5 w-5 text-gray-400" />
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-2xl font-bold text-gray-900">{loading ? '...' : stats.totalUsers}</div>
                  <p className="text-xs font-medium text-gray-500 mt-1">
                    Clientes, staff e administradores
                  </p>
                </CardContent>
              </Card>
            </Link>

            <Link to="/admin/pets">
              <Card className="bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer border-0">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wide text-gray-500">Total de Pets</CardTitle>
                  <PawPrint className="h-5 w-5 text-gray-400" />
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-2xl font-bold text-gray-900">{loading ? '...' : stats.totalPets}</div>
                  <p className="text-xs font-medium text-gray-500 mt-1">
                    Pets cadastrados no sistema
                  </p>
                </CardContent>
              </Card>
            </Link>
          </div>

          {/* Pending Approvals Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-white rounded-xl shadow-sm border-0">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 bg-orange-100 rounded-lg flex items-center justify-center">
                      <AlertCircle className="h-5 w-5 text-orange-600" />
                    </div>
                    <span className="text-lg font-semibold text-gray-900">Aprovações Pendentes</span>
                  </div>
                  {stats.pendingApprovals > 0 && (
                    <Badge variant="destructive" className="text-lg px-3 py-1 bg-red-100 text-red-800 border-red-200">
                      {stats.pendingApprovals}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="text-sm font-medium text-gray-600">
                  Itens que requerem atenção administrativa
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {stats.pendingApprovals > 0 ? (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-600">
                      {stats.pendingApprovals} agendamento(s) aguardando aprovação
                    </span>
                    <Link to="/admin/appointments">
                      <Button size="sm" variant="outline" className="border-brand-blue text-brand-blue hover:bg-brand-blue hover:text-white">
                        Gerenciar
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-sm font-medium">Nenhuma aprovação pendente</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
