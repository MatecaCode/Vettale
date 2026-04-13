
import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CheckCircle,
  XCircle,
  Clock,
  User,
  Calendar,
  PawPrint,
  ExternalLink,
  AlertTriangle,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { logAction } from '@/utils/actionLogger';
import { Link } from 'react-router-dom';

type ServiceStatus = 'not_started' | 'in_progress' | 'completed';
type ItemKind = 'pending_approval' | 'overdue_service';

interface ActionItem {
  id: string;
  kind: ItemKind;
  date: string;
  time: string;
  status: string;
  notes?: string;
  client_id: string;
  duration?: number;
  total_price?: number | null;
  service_status: ServiceStatus;
  created_at: string;
  client?: { name: string };
  pet?: { name: string };
  service?: { name: string };
  staff?: { name: string }[];
}

const SERVICE_STATUS_LABELS: Record<ServiceStatus, string> = {
  not_started: 'Não iniciado',
  in_progress: 'Em andamento',
  completed: 'Concluído',
};

const fetchAppointmentsWithJoins = async (filter: Record<string, unknown>, extra?: (q: any) => any) => {
  let query = supabase
    .from('appointments')
    .select(`
      id,
      date,
      time,
      status,
      notes,
      client_id,
      duration,
      total_price,
      service_status,
      created_at,
      clients:client_id (name),
      pets:pet_id (name),
      services:service_id (name),
      appointment_staff (
        staff_profiles (name)
      )
    `);

  for (const [col, val] of Object.entries(filter)) {
    query = (query as any).eq(col, val);
  }
  if (extra) query = extra(query);

  return query.order('created_at', { ascending: false }).limit(30);
};

const toActionItem = (apt: any, kind: ItemKind): ActionItem => ({
  id: apt.id,
  kind,
  date: apt.date,
  time: apt.time,
  status: apt.status,
  notes: apt.notes || undefined,
  client_id: apt.client_id,
  duration: apt.duration || 60,
  total_price: apt.total_price ?? null,
  service_status: (apt.service_status as ServiceStatus) || 'not_started',
  created_at: apt.created_at,
  client: { name: (apt.clients as any)?.name || 'Cliente' },
  pet: { name: (apt.pets as any)?.name || 'Pet' },
  service: { name: (apt.services as any)?.name || 'Serviço' },
  staff:
    (apt.appointment_staff as any)?.map((as: any) => ({
      name: as.staff_profiles?.name || 'Staff',
    })) || [],
});

const ActionNecessarySection = () => {
  const [pendingItems, setPendingItems] = useState<ActionItem[]>([]);
  const [overdueItems, setOverdueItems] = useState<ActionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedForPreview, setSelectedForPreview] = useState<ActionItem | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  const fetchAll = async () => {
    setIsLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      const [pendingRes, overdueRes] = await Promise.all([
        // Pending approval — any date
        supabase
          .from('appointments')
          .select(`
            id, date, time, status, notes, client_id, duration, total_price,
            service_status, created_at,
            clients:client_id (name),
            pets:pet_id (name),
            services:service_id (name),
            appointment_staff ( staff_profiles (name) )
          `)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(30),

        // Past confirmed, service not yet completed
        supabase
          .from('appointments')
          .select(`
            id, date, time, status, notes, client_id, duration, total_price,
            service_status, created_at,
            clients:client_id (name),
            pets:pet_id (name),
            services:service_id (name),
            appointment_staff ( staff_profiles (name) )
          `)
          .eq('status', 'confirmed')
          .lt('date', today)
          .neq('service_status', 'completed')
          .order('date', { ascending: false })
          .limit(30),
      ]);

      setPendingItems((pendingRes.data ?? []).map((apt) => toActionItem(apt, 'pending_approval')));
      setOverdueItems((overdueRes.data ?? []).map((apt) => toActionItem(apt, 'overdue_service')));
    } catch (err) {
      console.error('❌ [ACTION_SECTION] fetch error:', err);
      toast.error('Erro ao carregar ações pendentes');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApproval = async (
    appointmentId: string,
    newStatus: 'confirmed' | 'rejected',
    e?: React.MouseEvent
  ) => {
    e?.stopPropagation();
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', appointmentId);
      if (error) throw error;

      const item = pendingItems.find((a) => a.id === appointmentId);
      void logAction({
        action_type: newStatus === 'confirmed' ? 'booking_approved' : 'booking_cancelled',
        category: 'booking',
        description:
          newStatus === 'confirmed'
            ? `Agendamento aprovado para ${item?.client?.name ?? 'cliente'}`
            : `Agendamento rejeitado de ${item?.client?.name ?? 'cliente'}`,
        link_type: 'booking',
        link_id: appointmentId,
        metadata: { newStatus },
      });

      toast.success(
        newStatus === 'confirmed'
          ? `Agendamento de ${item?.client?.name} aprovado!`
          : `Agendamento de ${item?.client?.name} rejeitado!`,
        {
          style: {
            background: newStatus === 'confirmed' ? '#10B981' : '#EF4444',
            color: 'white',
            border: 'none',
          },
        }
      );

      if (newStatus === 'rejected' && item?.staff?.length) {
        const { data: staffLinks } = await supabase
          .from('appointment_staff')
          .select('staff_profile_id')
          .eq('appointment_id', appointmentId);

        if (staffLinks) {
          const dur = item.duration || 60;
          for (const sl of staffLinks) {
            for (let offset = 0; offset < dur; offset += 30) {
              const t = new Date(`1970-01-01T${item.time}`);
              t.setMinutes(t.getMinutes() + offset);
              await supabase
                .from('staff_availability')
                .update({ available: true })
                .eq('staff_profile_id', sl.staff_profile_id)
                .eq('date', item.date)
                .eq('time_slot', t.toTimeString().split(' ')[0]);
            }
          }
        }
      }

      if (selectedForPreview?.id === appointmentId) setSelectedForPreview(null);
      fetchAll();
    } catch (err: any) {
      toast.error('Erro ao atualizar agendamento');
    }
  };

  const handleServiceStatusChange = async (
    item: ActionItem,
    newStatus: ServiceStatus,
    e?: React.MouseEvent
  ) => {
    e?.stopPropagation();
    setUpdatingStatusId(item.id);
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ service_status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', item.id);
      if (error) throw error;

      const update = (prev: ActionItem[]) =>
        prev.map((a) => (a.id === item.id ? { ...a, service_status: newStatus } : a));

      if (item.kind === 'pending_approval') setPendingItems(update);
      else setOverdueItems(update);

      if (selectedForPreview?.id === item.id) {
        setSelectedForPreview((prev) => (prev ? { ...prev, service_status: newStatus } : prev));
      }

      toast.success(`Status: ${SERVICE_STATUS_LABELS[newStatus]}`);

      // If marked completed, remove from overdue list
      if (item.kind === 'overdue_service' && newStatus === 'completed') {
        setOverdueItems((prev) => prev.filter((a) => a.id !== item.id));
        if (selectedForPreview?.id === item.id) setSelectedForPreview(null);
      }
    } catch (err: any) {
      toast.error('Erro ao atualizar status');
    } finally {
      setUpdatingStatusId(null);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const totalActions = pendingItems.length + overdueItems.length;

  if (isLoading) {
    return (
      <Card className="bg-white border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-5 w-5 text-orange-500" />
            Tome uma Ação
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-gray-100 rounded-xl" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-white border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-orange-500" />
              Tome uma Ação
            </div>
            {totalActions > 0 && (
              <Badge className="bg-orange-100 text-orange-800 border-orange-200">
                {totalActions}
              </Badge>
            )}
          </CardTitle>
          <CardDescription className="text-sm">
            {totalActions === 0
              ? 'Nenhuma ação necessária no momento'
              : `${pendingItems.length} aprovação${pendingItems.length !== 1 ? 'ões' : ''} pendente${pendingItems.length !== 1 ? 's' : ''} · ${overdueItems.length} serviço${overdueItems.length !== 1 ? 's' : ''} sem conclusão`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {totalActions === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <CheckCircle className="h-12 w-12 text-green-400 mb-3 opacity-70" />
              <p className="text-sm font-medium text-gray-600">Tudo em dia!</p>
              <p className="text-xs text-gray-400 mt-0.5">Nenhuma ação necessária</p>
            </div>
          ) : (
            <>
              {/* ── Pending Approvals ── */}
              {pendingItems.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="h-4 w-4 text-orange-500" />
                    <h3 className="text-sm font-semibold text-gray-700">
                      Aprovações Pendentes
                    </h3>
                    <Badge className="bg-orange-100 text-orange-800 border-orange-200 text-xs">
                      {pendingItems.length}
                    </Badge>
                  </div>
                  {pendingItems.map((item) => (
                    <AppointmentCard
                      key={item.id}
                      item={item}
                      updatingStatusId={updatingStatusId}
                      onSelect={setSelectedForPreview}
                      onApproval={handleApproval}
                      onStatusChange={handleServiceStatusChange}
                    />
                  ))}
                </div>
              )}

              {/* ── Overdue Services ── */}
              {overdueItems.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    <h3 className="text-sm font-semibold text-gray-700">
                      Serviços Sem Conclusão
                    </h3>
                    <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">
                      {overdueItems.length}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-400 -mt-1 mb-2">
                    Agendamentos passados com status não atualizado
                  </p>
                  {overdueItems.map((item) => (
                    <AppointmentCard
                      key={item.id}
                      item={item}
                      updatingStatusId={updatingStatusId}
                      onSelect={setSelectedForPreview}
                      onApproval={handleApproval}
                      onStatusChange={handleServiceStatusChange}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Preview Modal ── */}
      <Dialog
        open={!!selectedForPreview}
        onOpenChange={(open) => !open && setSelectedForPreview(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              {selectedForPreview?.kind === 'pending_approval' ? (
                <><Clock className="h-4 w-4 text-orange-500" /> Aprovar Agendamento</>
              ) : (
                <><AlertTriangle className="h-4 w-4 text-red-500" /> Atualizar Status</>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedForPreview && (
            <div className="space-y-4">
              {/* Client & Pet */}
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="h-9 w-9 bg-brand-blue/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <User className="h-5 w-5 text-brand-blue" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    {selectedForPreview.client?.name}
                  </p>
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <PawPrint className="h-3 w-3" />
                    {selectedForPreview.pet?.name}
                  </p>
                </div>
              </div>

              {/* Details */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-400 uppercase font-semibold mb-0.5">Data</p>
                  <p className="text-gray-800 font-medium">
                    {format(new Date(selectedForPreview.date), "dd 'de' MMMM yyyy", { locale: ptBR })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase font-semibold mb-0.5">Horário</p>
                  <p className="text-gray-800 font-medium">
                    {selectedForPreview.time} ({selectedForPreview.duration}min)
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase font-semibold mb-0.5">Serviço</p>
                  <p className="text-gray-800 font-medium">{selectedForPreview.service?.name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase font-semibold mb-0.5">Valor</p>
                  <p className="text-gray-800 font-medium">
                    {selectedForPreview.total_price == null ? (
                      <span className="text-amber-600">Primeira visita</span>
                    ) : selectedForPreview.total_price > 0 ? (
                      `R$ ${selectedForPreview.total_price.toFixed(2)}`
                    ) : '—'}
                  </p>
                </div>
              </div>

              {selectedForPreview.staff && selectedForPreview.staff.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Profissional</p>
                  <p className="text-sm text-gray-800">
                    {selectedForPreview.staff.map((s) => s.name).join(', ')}
                  </p>
                </div>
              )}

              {selectedForPreview.notes && (
                <div>
                  <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Observações</p>
                  <p className="text-sm text-gray-700 p-2 bg-gray-50 rounded-lg">
                    {selectedForPreview.notes}
                  </p>
                </div>
              )}

              {/* Service status */}
              <div>
                <p className="text-xs text-gray-400 uppercase font-semibold mb-1.5">
                  Status do Serviço
                </p>
                <Select
                  value={selectedForPreview.service_status}
                  onValueChange={(val) =>
                    handleServiceStatusChange(selectedForPreview, val as ServiceStatus)
                  }
                  disabled={updatingStatusId === selectedForPreview.id}
                >
                  <SelectTrigger className="h-9 text-sm border-gray-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_started">Não iniciado</SelectItem>
                    <SelectItem value="in_progress">Em andamento</SelectItem>
                    <SelectItem value="completed">Concluído</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <p className="text-xs text-gray-400">
                Solicitado em:{' '}
                {format(new Date(selectedForPreview.created_at), "dd/MM/yyyy 'às' HH:mm", {
                  locale: ptBR,
                })}
              </p>

              {/* Approve/reject only for pending items */}
              {selectedForPreview.kind === 'pending_approval' && (
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    variant="outline"
                    className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
                    onClick={(e) => handleApproval(selectedForPreview.id, 'rejected', e)}
                  >
                    <XCircle className="h-4 w-4 mr-1.5" />
                    Rejeitar
                  </Button>
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                    onClick={(e) => handleApproval(selectedForPreview.id, 'confirmed', e)}
                  >
                    <CheckCircle className="h-4 w-4 mr-1.5" />
                    Aprovar
                  </Button>
                </div>
              )}

              <Link
                to={`/admin/edit-booking/${selectedForPreview.id}`}
                onClick={() => setSelectedForPreview(null)}
              >
                <Button
                  variant="ghost"
                  className="w-full text-brand-blue hover:bg-brand-blue/5 text-sm"
                >
                  <ExternalLink className="h-4 w-4 mr-1.5" />
                  Ver agendamento completo
                </Button>
              </Link>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

/* ── Shared card sub-component ── */
interface CardProps {
  item: ActionItem;
  updatingStatusId: string | null;
  onSelect: (item: ActionItem) => void;
  onApproval: (id: string, status: 'confirmed' | 'rejected', e: React.MouseEvent) => void;
  onStatusChange: (item: ActionItem, status: ServiceStatus, e?: React.MouseEvent) => void;
}

const AppointmentCard: React.FC<CardProps> = ({
  item,
  updatingStatusId,
  onSelect,
  onApproval,
  onStatusChange,
}) => {
  const isPending = item.kind === 'pending_approval';

  return (
    <div
      onClick={() => onSelect(item)}
      className={`border rounded-xl p-4 hover:shadow-sm transition-all duration-150 cursor-pointer group ${
        isPending
          ? 'border-orange-100 hover:border-orange-200 bg-orange-50/30'
          : 'border-red-100 hover:border-red-200 bg-red-50/20'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1 text-sm font-semibold text-gray-800">
              <User className="h-3.5 w-3.5 text-brand-blue" />
              {item.client?.name}
            </span>
            <Badge variant="outline" className="text-xs py-0">
              <PawPrint className="h-3 w-3 mr-1" />
              {item.pet?.name}
            </Badge>
          </div>

          <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {format(new Date(item.date), "dd 'de' MMM", { locale: ptBR })}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {item.time} ({item.duration}min)
            </span>
          </div>

          <div className="text-xs text-gray-600">
            <span className="font-medium">{item.service?.name}</span>
            {item.total_price == null ? (
              <span className="ml-2 inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                Primeira visita
              </span>
            ) : item.total_price > 0 ? (
              <span className="ml-2 text-green-600 font-medium">
                R$ {item.total_price.toFixed(2)}
              </span>
            ) : null}
          </div>
        </div>

        <Badge
          className={
            isPending
              ? 'bg-amber-100 text-amber-800 border-amber-200 text-xs flex-shrink-0'
              : 'bg-red-100 text-red-800 border-red-200 text-xs flex-shrink-0'
          }
        >
          {isPending ? 'Pendente' : 'Sem conclusão'}
        </Badge>
      </div>

      {/* Actions row */}
      <div
        className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 flex-wrap"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">Status:</span>
          <Select
            value={item.service_status}
            onValueChange={(val) => onStatusChange(item, val as ServiceStatus)}
            disabled={updatingStatusId === item.id}
          >
            <SelectTrigger className="h-7 text-xs w-36 border-gray-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="not_started">Não iniciado</SelectItem>
              <SelectItem value="in_progress">Em andamento</SelectItem>
              <SelectItem value="completed">Concluído</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isPending && (
          <div className="flex items-center gap-2 ml-auto">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
              onClick={(e) => onApproval(item.id, 'rejected', e)}
            >
              <XCircle className="h-3.5 w-3.5 mr-1" />
              Rejeitar
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
              onClick={(e) => onApproval(item.id, 'confirmed', e)}
            >
              <CheckCircle className="h-3.5 w-3.5 mr-1" />
              Aprovar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ActionNecessarySection;
