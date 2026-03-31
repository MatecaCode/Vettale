import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '@/components/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ClipboardList, ExternalLink, RefreshCw, ChevronDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Category = 'booking' | 'client' | 'pet' | 'config';
type DateRange = 'today' | '7days' | '30days' | 'all';

interface ActionLogRow {
  id: string;
  created_at: string;
  admin_id: string | null;
  action_type: string;
  category: Category;
  description: string;
  link_type: string | null;
  link_id: string | null;
  metadata: Record<string, unknown> | null;
}

const PAGE_SIZE = 20;

const CATEGORY_LABELS: Record<Category, string> = {
  booking: 'Agendamentos',
  client: 'Clientes',
  pet: 'Pets',
  config: 'Configurações',
};

const CATEGORY_COLORS: Record<Category, string> = {
  booking: 'bg-blue-100 text-blue-800',
  client: 'bg-green-100 text-green-800',
  pet: 'bg-amber-100 text-amber-800',
  config: 'bg-purple-100 text-purple-800',
};

const LINK_ROUTES: Record<string, (id: string) => string> = {
  booking: (id) => `/admin/appointments?appointment=${id}`,
  client: (id) => `/admin/clients?id=${id}`,
  pet: (id) => `/admin/pets?id=${id}`,
};

function formatDateTime(iso: string) {
  try {
    return format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: ptBR });
  } catch {
    return iso;
  }
}

function getDateCutoff(range: DateRange): string | null {
  const now = new Date();
  if (range === 'today') return startOfDay(now).toISOString();
  if (range === '7days') return subDays(now, 7).toISOString();
  if (range === '30days') return subDays(now, 30).toISOString();
  return null;
}

const AdminActionLog: React.FC = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ActionLogRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);

  const [categoryFilter, setCategoryFilter] = useState<'all' | Category>('all');
  const [dateRange, setDateRange] = useState<DateRange>('7days');

  const fetchLogs = useCallback(async (reset: boolean) => {
    setIsLoading(true);
    try {
      const currentOffset = reset ? 0 : offset;

      let query = supabase
        .from('action_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .range(currentOffset, currentOffset + PAGE_SIZE - 1);

      if (categoryFilter !== 'all') {
        query = query.eq('category', categoryFilter);
      }

      const cutoff = getDateCutoff(dateRange);
      if (cutoff) {
        query = query.gte('created_at', cutoff);
      }

      const { data, error } = await query;
      if (error) throw error;

      const fetched = (data ?? []) as ActionLogRow[];

      if (reset) {
        setRows(fetched);
        setOffset(fetched.length);
      } else {
        setRows(prev => [...prev, ...fetched]);
        setOffset(prev => prev + fetched.length);
      }

      setHasMore(fetched.length === PAGE_SIZE);
    } catch (err) {
      console.error('[AdminActionLog] fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [categoryFilter, dateRange, offset]);

  // Re-fetch from scratch when filters change
  useEffect(() => {
    setOffset(0);
    fetchLogs(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter, dateRange]);

  const handleLoadMore = () => {
    fetchLogs(false);
  };

  const handleRefresh = () => {
    setOffset(0);
    fetchLogs(true);
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-brand-blue/10 rounded-xl flex items-center justify-center">
              <ClipboardList className="h-6 w-6 text-brand-blue" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Log de Ações</h1>
              <p className="text-sm text-gray-500">Histórico de todas as ações administrativas</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>

        {/* Filter bar */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Categoria:</span>
                <Select
                  value={categoryFilter}
                  onValueChange={(v) => setCategoryFilter(v as 'all' | Category)}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="booking">Agendamentos</SelectItem>
                    <SelectItem value="client">Clientes</SelectItem>
                    <SelectItem value="pet">Pets</SelectItem>
                    <SelectItem value="config">Configurações</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Período:</span>
                <Select
                  value={dateRange}
                  onValueChange={(v) => setDateRange(v as DateRange)}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Hoje</SelectItem>
                    <SelectItem value="7days">Últimos 7 dias</SelectItem>
                    <SelectItem value="30days">Últimos 30 dias</SelectItem>
                    <SelectItem value="all">Todo o período</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-gray-700">
              {rows.length === 0 && !isLoading
                ? 'Nenhuma ação encontrada para os filtros selecionados'
                : `${rows.length} ação${rows.length !== 1 ? 'ões' : ''} encontrada${rows.length !== 1 ? 's' : ''}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">Data/Hora</TableHead>
                    <TableHead className="w-32">Categoria</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-24 text-center">Detalhes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-12 text-gray-400">
                        <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                        Carregando...
                      </TableCell>
                    </TableRow>
                  ) : rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-12 text-gray-400">
                        Nenhuma ação registrada neste período.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => (
                      <TableRow key={row.id} className="hover:bg-gray-50">
                        <TableCell className="text-sm text-gray-600 whitespace-nowrap">
                          {formatDateTime(row.created_at)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={`text-xs font-medium ${CATEGORY_COLORS[row.category] ?? 'bg-gray-100 text-gray-700'}`}
                            variant="secondary"
                          >
                            {CATEGORY_LABELS[row.category] ?? row.category}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-gray-800">
                          {row.description}
                        </TableCell>
                        <TableCell className="text-center">
                          {row.link_type && row.link_id && LINK_ROUTES[row.link_type] ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-brand-blue hover:text-brand-blue hover:bg-brand-blue/10"
                              onClick={() => navigate(LINK_ROUTES[row.link_type!](row.link_id!))}
                            >
                              <ExternalLink className="h-3.5 w-3.5 mr-1" />
                              Ver
                            </Button>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Load more */}
            {hasMore && (
              <div className="flex justify-center py-4 border-t border-gray-100">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLoadMore}
                  disabled={isLoading}
                  className="gap-2"
                >
                  {isLoading ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                  Carregar mais
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminActionLog;
