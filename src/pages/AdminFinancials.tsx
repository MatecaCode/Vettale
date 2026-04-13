import React, { useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from 'recharts';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  CreditCard,
  AlertTriangle,
  Clock,
  CheckCircle,
  Zap,
  BarChart2,
  PieChart,
  FileText,
} from 'lucide-react';

// ── Mock data (placeholder only — not real business data) ──────────────────
const mockMonthlyRevenue = [
  { label: 'Out', receita: 4200, cancelamentos: 380 },
  { label: 'Nov', receita: 5100, cancelamentos: 290 },
  { label: 'Dez', receita: 6800, cancelamentos: 410 },
  { label: 'Jan', receita: 4900, cancelamentos: 220 },
  { label: 'Fev', receita: 5700, cancelamentos: 340 },
  { label: 'Mar', receita: 7200, cancelamentos: 180 },
  { label: 'Abr', receita: 6100, cancelamentos: 260 },
];

const mockWeeklyRevenue = [
  { label: 'Seg', receita: 890, cancelamentos: 60 },
  { label: 'Ter', receita: 1200, cancelamentos: 40 },
  { label: 'Qua', receita: 750, cancelamentos: 90 },
  { label: 'Qui', receita: 1400, cancelamentos: 0 },
  { label: 'Sex', receita: 1650, cancelamentos: 120 },
  { label: 'Sáb', receita: 2100, cancelamentos: 80 },
  { label: 'Dom', receita: 300, cancelamentos: 0 },
];

type Period = 'week' | 'month';

const AdminFinancials = () => {
  const [period, setPeriod] = useState<Period>('month');
  const chartData = period === 'week' ? mockWeeklyRevenue : mockMonthlyRevenue;

  return (
    <AdminLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-6 space-y-6">

          {/* ── Header ── */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold text-gray-900">Área Financeira</h1>
                <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs font-semibold">
                  Rascunho
                </Badge>
              </div>
              <p className="text-sm text-gray-500">Visão financeira e receitas do negócio</p>
            </div>
          </div>

          {/* ── Draft Banner ── */}
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">
                Página em desenvolvimento — dados fictícios
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Este é um rascunho visual. Os números exibidos são exemplos ilustrativos e não refletem dados reais do sistema.
                O layout e as funcionalidades serão definidos em conjunto com a equipe.
              </p>
            </div>
          </div>

          {/* ── KPI Cards ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

            <Card className="bg-white border-0 shadow-sm">
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Receita Total (mês)
                  </p>
                  <div className="h-9 w-9 bg-green-100 rounded-lg flex items-center justify-center">
                    <DollarSign className="h-5 w-5 text-green-600" />
                  </div>
                </div>
                <p className="text-3xl font-bold text-gray-900">R$ 6.100</p>
                <div className="flex items-center gap-1 mt-1">
                  <TrendingUp className="h-3 w-3 text-green-500" />
                  <p className="text-xs text-green-600 font-medium">+12% vs. mês anterior</p>
                </div>
                <p className="text-xs text-gray-400 mt-0.5 italic">* valor fictício</p>
              </div>
            </Card>

            <Card className="bg-white border-0 shadow-sm">
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Ticket Médio
                  </p>
                  <div className="h-9 w-9 bg-brand-blue/10 rounded-lg flex items-center justify-center">
                    <CreditCard className="h-5 w-5 text-brand-blue" />
                  </div>
                </div>
                <p className="text-3xl font-bold text-gray-900">R$ 185</p>
                <div className="flex items-center gap-1 mt-1">
                  <TrendingUp className="h-3 w-3 text-green-500" />
                  <p className="text-xs text-green-600 font-medium">+5% vs. mês anterior</p>
                </div>
                <p className="text-xs text-gray-400 mt-0.5 italic">* valor fictício</p>
              </div>
            </Card>

            <Card className="bg-white border-0 shadow-sm">
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Taxa de Cancelamento
                  </p>
                  <div className="h-9 w-9 bg-red-50 rounded-lg flex items-center justify-center">
                    <TrendingDown className="h-5 w-5 text-red-400" />
                  </div>
                </div>
                <p className="text-3xl font-bold text-gray-900">4,2%</p>
                <div className="flex items-center gap-1 mt-1">
                  <TrendingDown className="h-3 w-3 text-green-500" />
                  <p className="text-xs text-green-600 font-medium">-1,3% vs. mês anterior</p>
                </div>
                <p className="text-xs text-gray-400 mt-0.5 italic">* valor fictício</p>
              </div>
            </Card>

            <Card className="bg-white border-0 shadow-sm">
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Serviços Concluídos
                  </p>
                  <div className="h-9 w-9 bg-emerald-100 rounded-lg flex items-center justify-center">
                    <CheckCircle className="h-5 w-5 text-emerald-600" />
                  </div>
                </div>
                <p className="text-3xl font-bold text-gray-900">33</p>
                <p className="text-xs text-gray-400 mt-1 italic">* valor fictício</p>
              </div>
            </Card>
          </div>

          {/* ── Revenue Chart ── */}
          <Card className="bg-white border-0 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="text-base font-semibold text-gray-800 flex items-center gap-2">
                    <BarChart2 className="h-4 w-4 text-brand-blue" />
                    Receita vs. Cancelamentos
                    <span className="text-xs font-normal text-gray-400 italic">(dados fictícios)</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-gray-500 mt-0.5">
                    Comparativo entre receita confirmada e valor perdido por cancelamentos
                  </CardDescription>
                </div>
                <div className="flex rounded-lg overflow-hidden border border-gray-200">
                  <button
                    onClick={() => setPeriod('week')}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      period === 'week' ? 'bg-brand-blue text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Semana
                  </button>
                  <button
                    onClick={() => setPeriod('month')}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-gray-200 ${
                      period === 'month' ? 'bg-brand-blue text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Meses
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9CA3AF' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} tickLine={false} axisLine={false} tickFormatter={(v) => `R$${v}`} />
                  <Tooltip
                    contentStyle={{ border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ fontWeight: 600, color: '#374151' }}
                    formatter={(v: number) => [`R$ ${v.toLocaleString('pt-BR')}`, undefined]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="receita" name="Receita" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cancelamentos" name="Cancelamentos" fill="#FCA5A5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* ── Planned Features ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            <Card className="bg-white border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  Funcionalidades Planejadas
                </CardTitle>
                <CardDescription className="text-xs text-gray-400">
                  O que está sendo considerado para esta área
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {[
                  'Extrato de receitas por serviço',
                  'Receita por profissional (staff)',
                  'Relatório mensal exportável (PDF/Excel)',
                  'Controle de pagamentos pendentes',
                  'Comissões e divisão de receita',
                  'Previsão de receita baseada em agendamentos futuros',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2 text-sm text-gray-600">
                    <Clock className="h-3.5 w-3.5 text-gray-300 flex-shrink-0" />
                    {item}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-white border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <PieChart className="h-4 w-4 text-brand-blue" />
                  Receita por Serviço
                  <span className="text-xs font-normal text-gray-400 italic">(fictício)</span>
                </CardTitle>
                <CardDescription className="text-xs text-gray-400">
                  Distribuição de receita por tipo de serviço
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {[
                  { label: 'Banho & Tosa', pct: 48, color: 'bg-brand-blue' },
                  { label: 'Consulta Veterinária', pct: 27, color: 'bg-emerald-400' },
                  { label: 'Tosa Completa', pct: 15, color: 'bg-amber-400' },
                  { label: 'Outros', pct: 10, color: 'bg-gray-300' },
                ].map(({ label, pct, color }) => (
                  <div key={label} className="space-y-1">
                    <div className="flex justify-between text-xs text-gray-600">
                      <span>{label}</span>
                      <span className="font-medium">{pct}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                ))}
                <p className="text-xs text-gray-400 italic pt-1">* distribuição fictícia para ilustração</p>
              </CardContent>
            </Card>
          </div>

          {/* ── Transactions placeholder ── */}
          <Card className="bg-white border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <FileText className="h-4 w-4 text-gray-400" />
                Histórico de Transações
                <span className="text-xs font-normal text-gray-400 italic">(a implementar)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-gray-200 rounded-xl">
                <FileText className="h-10 w-10 text-gray-300 mb-3" />
                <p className="text-sm font-medium text-gray-500">Histórico de transações</p>
                <p className="text-xs text-gray-400 mt-1 max-w-xs">
                  Aqui ficará a lista de receitas, pagamentos e estornos com filtros por data, status e serviço.
                </p>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminFinancials;
