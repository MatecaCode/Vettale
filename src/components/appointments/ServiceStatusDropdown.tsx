import React, { useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logAction } from '@/utils/actionLogger';

type ServiceStatus = 'not_started' | 'in_progress' | 'completed';

const LABEL: Record<ServiceStatus, string> = {
  not_started: 'Não iniciado',
  in_progress: 'Em progresso',
  completed: 'Concluído',
};

export function ServiceStatusDropdown({
  appointmentId,
  value,
  canEdit,
  refetchAppointments,
  isAdmin,
}: {
  appointmentId: string;
  value: ServiceStatus;
  canEdit: boolean;
  refetchAppointments?: () => Promise<void> | void;
  isAdmin?: boolean;
}) {
  if (!value) {
    return (
      <span className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
        Sem status
      </span>
    );
  }
  const [status, setStatus] = useState<ServiceStatus>(value);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<ServiceStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const allowedNext = useMemo<ServiceStatus[]>(() => {
    if (status === 'not_started') return (isAdmin ? ['in_progress','completed'] : ['in_progress']) as ServiceStatus[];
    if (status === 'in_progress') return ['completed'];
    return [];
  }, [status, isAdmin]);

  async function confirmChange(next: ServiceStatus) {
    try {
      setLoading(true);

      // Fetch all service rows for this appointment and update each one
      const { data: svcRows, error: svcErr } = await supabase
        .from('appointment_services')
        .select('service_id')
        .eq('appointment_id', appointmentId);
      if (svcErr) throw svcErr;

      if (!svcRows || svcRows.length === 0) {
        throw new Error('No services found for this appointment');
      }

      for (const row of svcRows) {
        const { error: mErr } = await supabase.rpc('mark_appointment_service_status', {
          _appointment_id: appointmentId,
          _service_id: row.service_id,
          _status: next,
          _force: false,
        });
        if (mErr) throw mErr;
      }

      setStatus(next);
      if (refetchAppointments) await Promise.resolve(refetchAppointments());

      if (isAdmin) {
        void logAction({
          action_type: 'config_updated',
          category: 'booking',
          description: `Status do serviço atualizado para "${next}" — agendamento ID: ${appointmentId}`,
          link_type: 'booking',
          link_id: appointmentId,
          metadata: { newStatus: next },
        });
      }

      toast.success('Status do serviço atualizado');
    } catch (e: any) {
      console.error('Failed to update service status', e);
      toast.error('Erro ao atualizar status do serviço');
    } finally {
      setLoading(false);
      setPending(null);
      setOpen(false);
    }
  }

  const pillClass = 'inline-flex items-center rounded-full px-3 py-1 text-sm font-medium';
  const cls =
    status === 'not_started'
      ? 'bg-amber-100 text-amber-800'
      : status === 'in_progress'
      ? 'bg-blue-100 text-blue-800'
      : 'bg-emerald-100 text-emerald-800';

  return (
    <div className="relative inline-block">
      <button
        type="button"
        className={`${pillClass} ${cls} ${(!canEdit || status === 'completed' || loading) ? 'opacity-60 cursor-not-allowed' : ''}`}
        onClick={() => canEdit && status !== 'completed' && !loading && setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={!canEdit || status === 'completed' || loading}
        title={canEdit ? 'Alterar status do serviço' : 'Somente leitura'}
      >
        {LABEL[status]}
        <svg className="ml-2 h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M5.5 7.5l4.5 4.5 4.5-4.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-10 mt-2 w-56 rounded-xl border bg-white p-2 shadow" role="listbox">
          {allowedNext.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">Sem mudanças disponíveis</div>
          ) : (
            allowedNext.map((opt) => (
              <button
                key={opt}
                className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50"
                onClick={() => setPending(opt)}
                role="option"
              >
                {LABEL[opt]}
              </button>
            ))
          )}
        </div>
      )}

      {pending && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 p-4" aria-modal="true" role="dialog">
          <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-lg">
            <h3 className="mb-2 text-base font-semibold">Confirmar alteração</h3>
            <p className="mb-4 text-sm text-gray-700">
              Mudar de <b>{LABEL[status]}</b> para <b>{LABEL[pending]}</b>?
            </p>
            <div className="flex justify-end gap-2">
              <button className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => setPending(null)} disabled={loading}>
                Cancelar
              </button>
              <button
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-60"
                onClick={() => confirmChange(pending)}
                disabled={loading}
              >
                {loading ? 'Salvando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ServiceStatusDropdown;


