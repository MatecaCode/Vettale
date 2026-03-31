-- ============================================================
-- ACTION LOG SYSTEM — Item 17-B
-- Immutable audit trail for all admin mutations.
-- ============================================================

-- ── 1. Table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.action_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL    DEFAULT now(),
  -- admin_id is nullable so that deleted auth users don't orphan log rows
  admin_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type  TEXT        NOT NULL,
  category     TEXT        NOT NULL,
  description  TEXT        NOT NULL,
  link_type    TEXT,
  link_id      UUID,
  metadata     JSONB
);

-- ── 2. Indexes ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_action_logs_created_at
  ON public.action_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_action_logs_category
  ON public.action_logs(category);

CREATE INDEX IF NOT EXISTS idx_action_logs_admin_id
  ON public.action_logs(admin_id);

-- ── 3. RLS ───────────────────────────────────────────────────
ALTER TABLE public.action_logs ENABLE ROW LEVEL SECURITY;

-- Admins can read all log rows
CREATE POLICY "action_logs_select_admin"
  ON public.action_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Admins can insert rows (frontend logging utility writes here)
-- admin_id must match the authenticated user
CREATE POLICY "action_logs_insert_admin"
  ON public.action_logs FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    AND (admin_id = auth.uid() OR admin_id IS NULL)
  );

-- No UPDATE policy — log rows are immutable
-- No DELETE policy — log rows are immutable
-- Clients and staff have zero access (no permissive policies exist for them)
