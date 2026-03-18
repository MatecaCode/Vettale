-- ============================================================
-- ADMIN NOTIFICATION SYSTEM V1
-- Tables, indexes, RLS, and all helper functions
-- ============================================================

-- ── 1. Tables ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  type         text        NOT NULL,
  entity_type  text        NOT NULL,
  entity_id    uuid        NOT NULL,
  title        text        NOT NULL,
  body         text        NOT NULL,
  metadata     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  deep_link    text        NOT NULL,
  source       text        NOT NULL,
  dedupe_key   text        NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_notification_receipts (
  notification_id  uuid        NOT NULL REFERENCES public.admin_notifications(id) ON DELETE CASCADE,
  admin_user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at          timestamptz NULL,
  PRIMARY KEY (notification_id, admin_user_id)
);

-- ── 2. Indexes ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_admin_notif_entity
  ON public.admin_notifications(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_admin_notif_created_at
  ON public.admin_notifications(created_at DESC);

-- Partial unique index drives the ON CONFLICT dedupe
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_notif_dedupe_key
  ON public.admin_notifications(dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_notif_receipts_admin_unread
  ON public.admin_notification_receipts(admin_user_id, read_at)
  WHERE read_at IS NULL;

-- ── 3. RLS ─────────────────────────────────────────────────
ALTER TABLE public.admin_notifications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_notification_receipts ENABLE ROW LEVEL SECURITY;

-- Admins can read all notification rows
CREATE POLICY "admin_notifications_select_admin"
  ON public.admin_notifications FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- System (SECURITY DEFINER functions) bypass RLS on insert;
-- no direct client INSERT needed, so no permissive INSERT policy.

-- Admins can read their own receipts
CREATE POLICY "admin_notification_receipts_select_own"
  ON public.admin_notification_receipts FOR SELECT
  USING (admin_user_id = auth.uid() AND public.has_role(auth.uid(), 'admin'));

-- Admins can update their own receipts (mark read)
CREATE POLICY "admin_notification_receipts_update_own"
  ON public.admin_notification_receipts FOR UPDATE
  USING (admin_user_id = auth.uid() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (admin_user_id = auth.uid());

-- ── 4. Core write helper (SECURITY DEFINER) ────────────────
-- Called from booking/claim producers to fan-out to all admins.
-- Returns the new notification id, or NULL if deduped.
CREATE OR REPLACE FUNCTION public.notify_all_admins(
  _type        text,
  _entity_type text,
  _entity_id   uuid,
  _title       text,
  _body        text,
  _deep_link   text,
  _source      text,
  _metadata    jsonb  DEFAULT '{}'::jsonb,
  _dedupe_key  text   DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_notification_id uuid;
BEGIN
  INSERT INTO public.admin_notifications
    (type, entity_type, entity_id, title, body, metadata, deep_link, source, dedupe_key)
  VALUES
    (_type, _entity_type, _entity_id, _title, _body, _metadata, _deep_link, _source, _dedupe_key)
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_notification_id;

  -- Deduped: notification already exists
  IF v_notification_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Fan-out: one unread receipt per current admin
  INSERT INTO public.admin_notification_receipts (notification_id, admin_user_id, read_at)
  SELECT v_notification_id, ur.user_id, NULL
  FROM   public.user_roles ur
  WHERE  ur.role = 'admin'
  ON CONFLICT (notification_id, admin_user_id) DO NOTHING;

  RETURN v_notification_id;
END;
$$;

-- ── 5. Read helpers (all SECURITY DEFINER, admin-only) ─────

-- 5a. Get paginated notifications for the calling admin
CREATE OR REPLACE FUNCTION public.get_admin_notifications(
  _limit  integer DEFAULT 50,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  id          uuid,
  type        text,
  entity_type text,
  entity_id   uuid,
  title       text,
  body        text,
  metadata    jsonb,
  deep_link   text,
  source      text,
  created_at  timestamptz,
  read_at     timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    n.id,
    n.type,
    n.entity_type,
    n.entity_id,
    n.title,
    n.body,
    n.metadata,
    n.deep_link,
    n.source,
    n.created_at,
    r.read_at
  FROM public.admin_notifications n
  INNER JOIN public.admin_notification_receipts r
    ON r.notification_id = n.id
   AND r.admin_user_id   = auth.uid()
  ORDER BY n.created_at DESC
  LIMIT  _limit
  OFFSET _offset;
END;
$$;

-- 5b. Unread count for the calling admin
CREATE OR REPLACE FUNCTION public.get_admin_unread_notification_count()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT count(*)
    FROM   public.admin_notification_receipts r
    WHERE  r.admin_user_id = auth.uid()
      AND  r.read_at IS NULL
  );
END;
$$;

-- 5c. Mark one notification read for the calling admin
CREATE OR REPLACE FUNCTION public.mark_admin_notification_read(_notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.admin_notification_receipts
  SET    read_at = now()
  WHERE  notification_id = _notification_id
    AND  admin_user_id   = auth.uid()
    AND  read_at IS NULL;
END;
$$;

-- 5d. Mark all notifications read for the calling admin
CREATE OR REPLACE FUNCTION public.mark_all_admin_notifications_read()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.admin_notification_receipts
  SET    read_at = now()
  WHERE  admin_user_id = auth.uid()
    AND  read_at IS NULL;
END;
$$;
