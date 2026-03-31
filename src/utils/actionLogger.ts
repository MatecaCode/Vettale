import { supabase } from '@/integrations/supabase/client';

export interface LogActionParams {
  action_type: string;
  category: 'booking' | 'client' | 'pet' | 'config';
  description: string;
  link_type?: 'booking' | 'client' | 'pet' | null;
  link_id?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Fire-and-forget admin action logger.
 *
 * Usage:  void logAction({ ... })
 *
 * NEVER throws — logging failures are swallowed and console.warn'd so they
 * never interrupt the main admin action the user was performing.
 */
export async function logAction(params: LogActionParams): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const adminId = session?.user?.id;

    if (!adminId) {
      console.warn('[ACTION_LOG] No authenticated user — skipping log entry', params.action_type);
      return;
    }

    const { error } = await supabase.from('action_logs').insert({
      admin_id: adminId,
      action_type: params.action_type,
      category: params.category,
      description: params.description,
      link_type: params.link_type ?? null,
      link_id: params.link_id ?? null,
      metadata: params.metadata ?? null,
    });

    if (error) {
      console.warn('[ACTION_LOG] Insert failed (non-fatal):', error.message, params);
    }
  } catch (err) {
    console.warn('[ACTION_LOG] Unexpected error (non-fatal):', err, params);
  }
}
