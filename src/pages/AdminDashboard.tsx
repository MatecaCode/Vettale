import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Calendar,
  AlertCircle,
  CheckCircle,
  DollarSign,
  Play,
  XCircle,
  ArrowRight,
  Plus,
  Clock,
  TrendingUp,
  HelpCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import AdminLayout from '@/components/AdminLayout';
import ActionNecessarySection from '@/components/admin/PendingApprovalsSection';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { format, subDays, subWeeks, subMonths, startOfWeek, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface DashboardStats {
  todayServices: number;
  inProgressNow: number;
  overdueNotCompleted: number;
  pendingApprovals: number;
  revenueToday: number;
}

interface TrendPoint {
  label: string;
  concluidos: number;
  cancelados: number;
}

type TrendPeriod = 'week' | 'month' | '6months' | 'year';

const AdminDashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    todayServices: 0,
    inProgressNow: 0,
    overdueNotCompleted: 0,
    pendingApprovals: 0,
    revenueToday: 0,
  });
  const [loading, setLoading] = useState(true);
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>('week');
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [trendLoading, setTrendLoading] = useState(true);

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  useEffect(() => {
    fetchTrendData();
  }, [trendPeriod]);

  const fetchDashboardStats = async () => {
    try {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];

      const [
        { count: todayServices },
        { count: inProgressNow },
        { count: overdueNotCompleted },
        { count: pendingApprovals },
        { data: todayAppointments },
      ] = await Promise.all([
        supabase
          .from('appointments')
          .select('*', { count: 'exact', head: true })
          .eq('date', today)
          .neq('status', 'cancelled'),
        supabase
          .from('appointments')
          .select('*', { count: 'exact', head: true })
          .eq('date', today)
          .eq('status', 'confirmed')
          .eq('service_status', 'in_progress'),
        supabase
          .from('appointments')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'confirmed')
          .lt('date', today)
          .neq('service_status', 'completed'),
        supabase
          .from('appointments')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending'),
        supabase
          .from('appointments')
          .select('total_price')
          .eq('date', today)
          .eq('status', 'confirmed'),
      ]);

      const revenueToday = (todayAppointments ?? []).reduce(
        (sum, apt: any) => sum + (apt.total_price || 0),
        0
      );

      setStats({
        todayServices: todayServices ?? 0,
        inProgressNow: inProgressNow ?? 0,
        overdueNotCompleted: overdueNotCompleted ?? 0,
        pendingApprovals: pendingApprovals ?? 0,
        revenueToday,
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      toast.error('Erro ao carregar estatísticas do dashboard');
    } finally {
      setLoading(false);
    }
  };

  const fetchTrendData = async () => {
    try {
      setTrendLoading(true);

      // Determine start date and grouping strategy
      let startDate: string;
      let groupBy: 'day' | 'week' | 'month';

      if (trendPeriod === 'week') {
        startDate = subDays(new Date(), 6).toISOString().split('T')[0];
        groupBy = 'day';
      } else if (trendPeriod === 'month') {
        startDate = subDays(new Date(), 29).toISOString().split('T')[0];
        groupBy = 'day';
      } else if (trendPeriod === '6months') {
        startDate = subWeeks(new Date(), 25).toISOString().split('T')[0];
        groupBy = 'week';
      } else {
        startDate = subMonths(new Date(), 11).toISOString().split('T')[0];
        groupBy = 'month';
      }

      const { data, error } = await supabase
        .from('appointments')
        .select('date, status, service_status')
        .gte('date', startDate)
        .order('date', { ascending: true });

      if (error) throw error;

      let points: TrendPoint[] = [];

      if (groupBy === 'day') {
        const days = trendPeriod === 'week' ? 7 : 30;
        const map: Record<string, { concluidos: number; cancelados: number }> = {};
        for (let i = 0; i < days; i++) {
          const d = subDays(new Date(), days - 1 - i).toISOString().split('T')[0];
          map[d] = { concluidos: 0, cancelados: 0 };
        }
        (data ?? []).forEach((apt: any) => {
          if (!map[apt.date]) return;
          if (apt.service_status === 'completed') map[apt.date].concluidos++;
          if (apt.status === 'cancelled') map[apt.date].cancelados++;
        });
        points = Object.entries(map).map(([date, counts]) => ({
          label: trendPeriod === 'week'
            ? format(parseISO(date), 'EEE dd/MM', { locale: ptBR })
            : format(parseISO(date), 'dd/MM', { locale: ptBR }),
          ...counts,
        }));

      } else if (groupBy === 'week') {
        // 26 weeks — one entry per week, keyed by week-start date
        const map: Record<string, { label: string; concluidos: number; cancelados: number }> = {};
        for (let i = 25; i >= 0; i--) {
          const weekStart = startOfWeek(subWeeks(new Date(), i), { weekStartsOn: 1 });
          const key = weekStart.toISOString().split('T')[0];
          map[key] = { label: format(weekStart, 'dd/MM'), concluidos: 0, cancelados: 0 };
        }
        (data ?? []).forEach((apt: any) => {
          const weekStart = startOfWeek(parseISO(apt.date), { weekStartsOn: 1 });
          const key = weekStart.toISOString().split('T')[0];
          if (!map[key]) return;
          if (apt.service_status === 'completed') map[key].concluidos++;
          if (apt.status === 'cancelled') map[key].cancelados++;
        });
        points = Object.values(map);

      } else {
        // 12 months — one entry per month, keyed by 'YYYY-MM'
        const map: Record<string, { label: string; concluidos: number; cancelados: number }> = {};
        for (let i = 11; i >= 0; i--) {
          const monthDate = subMonths(new Date(), i);
          const key = format(monthDate, 'yyyy-MM');
          map[key] = { label: format(monthDate, 'MMM', { locale: ptBR }), concluidos: 0, cancelados: 0 };
        }
        (data ?? []).forEach((apt: any) => {
          const key = (apt.date as string).substring(0, 7);
          if (!map[key]) return;
          if (apt.service_status === 'completed') map[key].concluidos++;
          if (apt.status === 'cancelled') map[key].cancelados++;
        });
        points = Object.values(map);
      }

      setTrendData(points);
    } catch (error) {
      console.error('Error fetching trend data:', error);
    } finally {
      setTrendLoading(false);
    }
  };

  const hasAlerts = stats.pendingApprovals > 0 || stats.overdueNotCompleted > 0;

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const dateLabel = format(now, "EEEE, dd 'de' MMMM", { locale: ptBR });

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-blue mx-auto mb-4" />
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <AdminLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-6 space-y-6">

          {/* ── Header + Primary CTA ── */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{greeting}</h1>
              <p className="text-sm text-gray-500 capitalize mt-0.5">{dateLabel}</p>
            </div>
            <Link to="/admin/manual-booking">
              <Button
                className="bg-brand-blue hover:bg-brand-blue/90 text-white gap-2 shadow-sm"
                size="lg"
              >
                <Plus className="h-5 w-5" />
                Fazer Agendamento
              </Button>
            </Link>
          </div>

          {/* ── KPI Cards ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

            {/* Agendamentos Hoje */}
            <Link to="/admin/agenda-hoje" className="block">
              <Card className="bg-white border-0 shadow-sm hover:shadow-md transition-all duration-200 h-full">
                <div className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Agendamentos Hoje
                    </p>
                    <div className="h-9 w-9 bg-brand-blue/10 rounded-lg flex items-center justify-center">
                      <Calendar className="h-5 w-5 text-brand-blue" />
                    </div>
                  </div>
                  <p className="text-3xl font-bold text-gray-900">
                    {loading ? '—' : stats.todayServices}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">excluindo cancelados</p>
                </div>
              </Card>
            </Link>

            {/* Em Andamento */}
            <Link to="/admin/agenda-hoje" className="block">
              <Card className="bg-white border-0 shadow-sm hover:shadow-md transition-all duration-200 h-full">
                <div className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Em Andamento
                    </p>
                    <div className="h-9 w-9 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Play className="h-5 w-5 text-blue-600" />
                    </div>
                  </div>
                  <p className="text-3xl font-bold text-gray-900">
                    {loading ? '—' : stats.inProgressNow}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">status definido pelo staff</p>
                </div>
              </Card>
            </Link>

            {/* Receita Hoje → financials */}
            <Link to="/admin/financials" className="block">
              <Card className="bg-white border-0 shadow-sm hover:shadow-md transition-all duration-200 h-full">
                <div className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Receita Hoje
                    </p>
                    <div className="h-9 w-9 bg-green-100 rounded-lg flex items-center justify-center">
                      <DollarSign className="h-5 w-5 text-green-600" />
                    </div>
                  </div>
                  <p className="text-3xl font-bold text-gray-900">
                    {loading ? '—' : `R$ ${stats.revenueToday.toFixed(2)}`}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">agendamentos confirmados</p>
                </div>
              </Card>
            </Link>

            {/* Placeholder KPI — to be defined */}
            <Card className="bg-white border-0 shadow-sm h-full opacity-60">
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    A Definir
                  </p>
                  <div className="h-9 w-9 bg-gray-100 rounded-lg flex items-center justify-center">
                    <HelpCircle className="h-5 w-5 text-gray-400" />
                  </div>
                </div>
                <p className="text-lg font-medium text-gray-400 mt-2">Em breve</p>
                <p className="text-xs text-gray-300 mt-1">KPI a ser definido</p>
              </div>
            </Card>
          </div>

          {/* ── Trend Chart + Alerts ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Trend Chart */}
            <Card className="lg:col-span-2 bg-white border-0 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-base font-semibold text-gray-800 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-brand-blue" />
                    Tendência de Agendamentos
                  </CardTitle>
                  <div className="flex rounded-lg overflow-hidden border border-gray-200">
                    {(
                      [
                        { key: 'week', label: '7D' },
                        { key: 'month', label: '30D' },
                        { key: '6months', label: '6M' },
                        { key: 'year', label: '1A' },
                      ] as { key: TrendPeriod; label: string }[]
                    ).map(({ key, label }, idx) => (
                      <button
                        key={key}
                        onClick={() => setTrendPeriod(key)}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                          idx > 0 ? 'border-l border-gray-200' : ''
                        } ${
                          trendPeriod === key
                            ? 'bg-brand-blue text-white'
                            : 'bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-2">
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
                    Concluídos
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="h-2 w-2 rounded-full bg-red-400 inline-block" />
                    Cancelados
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {trendLoading ? (
                  <div className="h-48 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-blue" />
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart
                      data={trendData}
                      margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="colorConcluidos" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10B981" stopOpacity={0.18} />
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorCancelados" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#F87171" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#F87171" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: '#9CA3AF' }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: '#9CA3AF' }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          border: '1px solid #E5E7EB',
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        labelStyle={{ fontWeight: 600, color: '#374151' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="concluidos"
                        name="Concluídos"
                        stroke="#10B981"
                        strokeWidth={2}
                        fill="url(#colorConcluidos)"
                      />
                      <Area
                        type="monotone"
                        dataKey="cancelados"
                        name="Cancelados"
                        stroke="#F87171"
                        strokeWidth={2}
                        fill="url(#colorCancelados)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Atenção Necessária */}
            <Card className="bg-white border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-gray-800 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-orange-500" />
                  Atenção Necessária
                </CardTitle>
                <CardDescription className="text-xs text-gray-500">
                  Itens que requerem ação imediata
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {loading ? (
                  <div className="space-y-2">
                    {[1, 2].map((i) => (
                      <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : !hasAlerts ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <CheckCircle className="h-10 w-10 text-green-400 mb-2" />
                    <p className="text-sm font-medium text-gray-600">Tudo em dia!</p>
                    <p className="text-xs text-gray-400 mt-0.5">Nenhum item pendente</p>
                  </div>
                ) : (
                  <>
                    {stats.pendingApprovals > 0 && (
                      <Link to="/admin/appointments">
                        <div className="flex items-start gap-3 p-3 bg-orange-50 rounded-lg border border-orange-100 hover:border-orange-300 transition-colors cursor-pointer group">
                          <div className="h-8 w-8 bg-orange-100 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Clock className="h-4 w-4 text-orange-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-orange-800">
                              {stats.pendingApprovals} aguardando aprovação
                            </p>
                            <p className="text-xs text-orange-600 mt-0.5">
                              Agendamentos de clientes
                            </p>
                          </div>
                          <ArrowRight className="h-4 w-4 text-orange-400 group-hover:translate-x-0.5 transition-transform mt-1 flex-shrink-0" />
                        </div>
                      </Link>
                    )}
                    {stats.overdueNotCompleted > 0 && (
                      <Link to="/admin/appointments?tab=confirmed">
                        <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg border border-red-100 hover:border-red-300 transition-colors cursor-pointer group">
                          <div className="h-8 w-8 bg-red-100 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5">
                            <XCircle className="h-4 w-4 text-red-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-red-800">
                              {stats.overdueNotCompleted} não concluídos
                            </p>
                            <p className="text-xs text-red-600 mt-0.5">
                              Agendamentos passados sem conclusão
                            </p>
                          </div>
                          <ArrowRight className="h-4 w-4 text-red-400 group-hover:translate-x-0.5 transition-transform mt-1 flex-shrink-0" />
                        </div>
                      </Link>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Action Section — always rendered; component manages its own empty state ── */}
          <ActionNecessarySection />

        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
