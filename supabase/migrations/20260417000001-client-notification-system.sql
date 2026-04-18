-- ============================================================
-- Client Notification System
--
-- Provides in-app notifications for clients at every appointment
-- lifecycle step:
--   1. booking_approved        — admin confirms the booking
--   2. service_in_progress     — staff starts the service
--   3. service_completed       — service is finished
--   4. review_reminder         — prompt to review staff (after completion)
--
-- Also creates an email_queue table as groundwork for future
-- transactional email delivery (the edge function reads this
-- table on a scheduled basis or via DB webhook).
-- ============================================================

-- ── 1. client_notifications table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_notifications (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      uuid        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  appointment_id uuid        REFERENCES public.appointments(id) ON DELETE SET NULL,
  type           text        NOT NULL,
  title          text        NOT NULL,
  body           text        NOT NULL,
  deep_link      text        NOT NULL DEFAULT '/appointments',
  metadata       jsonb       NOT NULL DEFAULT '{}',
  read_at        timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_notif_client_unread
  ON public.client_notifications (client_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_client_notif_client_all
  ON public.client_notifications (client_id, created_at DESC);

-- ── 2. RLS for client_notifications ─────────────────────────────────────────
ALTER TABLE public.client_notifications ENABLE ROW LEVEL SECURITY;

-- Clients can read their own notifications
CREATE POLICY "client_notifications_select_own"
  ON public.client_notifications FOR SELECT
  USING (
    client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
  );

-- Clients can mark their own notifications as read (UPDATE read_at)
CREATE POLICY "client_notifications_update_own"
  ON public.client_notifications FOR UPDATE
  USING (
    client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
  );

-- ── 3. email_queue table (groundwork for future email sending) ───────────────
CREATE TABLE IF NOT EXISTS public.email_queue (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_type text        NOT NULL DEFAULT 'client',
  recipient_id   uuid,
  recipient_email text,
  template       text        NOT NULL,
  subject        text        NOT NULL,
  payload        jsonb       NOT NULL DEFAULT '{}',
  status         text        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'sent', 'failed')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  sent_at        timestamptz,
  error          text
);

CREATE INDEX IF NOT EXISTS idx_email_queue_pending
  ON public.email_queue (created_at)
  WHERE status = 'pending';

-- Only service-role / edge functions can access email_queue
ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;
-- No client-facing policies — all access via SECURITY DEFINER functions or service role.

-- ── 4. notify_client helper ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_client(
  _client_id      uuid,
  _type           text,
  _title          text,
  _body           text,
  _appointment_id uuid    DEFAULT NULL,
  _deep_link      text    DEFAULT '/appointments',
  _metadata       jsonb   DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.client_notifications
    (client_id, appointment_id, type, title, body, deep_link, metadata)
  VALUES
    (_client_id, _appointment_id, _type, _title, _body, _deep_link, _metadata);
END;
$$;

-- ── 5. get_client_notifications ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_client_notifications(
  _limit  integer DEFAULT 50,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  id             uuid,
  client_id      uuid,
  appointment_id uuid,
  type           text,
  title          text,
  body           text,
  deep_link      text,
  metadata       jsonb,
  read_at        timestamptz,
  created_at     timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
BEGIN
  SELECT c.id INTO v_client_id
  FROM public.clients c
  WHERE c.user_id = auth.uid();

  IF v_client_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT
      cn.id, cn.client_id, cn.appointment_id,
      cn.type, cn.title, cn.body, cn.deep_link,
      cn.metadata, cn.read_at, cn.created_at
    FROM public.client_notifications cn
    WHERE cn.client_id = v_client_id
    ORDER BY cn.created_at DESC
    LIMIT  _limit
    OFFSET _offset;
END;
$$;

-- ── 6. get_client_unread_notification_count ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_client_unread_notification_count()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
  v_count     bigint;
BEGIN
  SELECT c.id INTO v_client_id
  FROM public.clients c
  WHERE c.user_id = auth.uid();

  IF v_client_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.client_notifications
  WHERE client_id = v_client_id
    AND read_at IS NULL;

  RETURN COALESCE(v_count, 0);
END;
$$;

-- ── 7. mark_client_notification_read ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_client_notification_read(
  _notification_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
BEGIN
  SELECT c.id INTO v_client_id
  FROM public.clients c
  WHERE c.user_id = auth.uid();

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Client not found';
  END IF;

  UPDATE public.client_notifications
  SET    read_at = now()
  WHERE  id        = _notification_id
    AND  client_id = v_client_id
    AND  read_at   IS NULL;
END;
$$;

-- ── 8. mark_all_client_notifications_read ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_all_client_notifications_read()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
BEGIN
  SELECT c.id INTO v_client_id
  FROM public.clients c
  WHERE c.user_id = auth.uid();

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Client not found';
  END IF;

  UPDATE public.client_notifications
  SET    read_at = now()
  WHERE  client_id = v_client_id
    AND  read_at   IS NULL;
END;
$$;

-- ── 9. Trigger function: emit notifications on appointment lifecycle changes ──
CREATE OR REPLACE FUNCTION public.on_appointment_lifecycle_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pet_name     text;
  v_service_name text;
  v_deep_link    text;
  v_review_link  text;
BEGIN
  -- Resolve display names once (best-effort — never fail the UPDATE)
  BEGIN
    SELECT p.name INTO v_pet_name   FROM public.pets     p WHERE p.id = NEW.pet_id;
    SELECT s.name INTO v_service_name FROM public.services s WHERE s.id = NEW.service_id;
  EXCEPTION WHEN OTHERS THEN
    v_pet_name     := 'seu pet';
    v_service_name := 'o serviço';
  END;

  v_deep_link   := '/appointments?highlight=' || NEW.id::text;
  v_review_link := '/appointments?highlight=' || NEW.id::text || '&review=1';

  -- ── booking_approved (pending → confirmed) ────────────────────────────────
  IF OLD.status = 'pending' AND NEW.status IN ('confirmed', 'approved') THEN
    BEGIN
      PERFORM public.notify_client(
        NEW.client_id,
        'booking_approved',
        'Agendamento Confirmado!',
        'Seu agendamento para ' || COALESCE(v_pet_name, 'seu pet') ||
          ' foi confirmado. Até breve!',
        NEW.id,
        v_deep_link,
        jsonb_build_object(
          'appointment_id', NEW.id,
          'pet_name',       v_pet_name,
          'service_name',   v_service_name,
          'date',           NEW.date,
          'time',           NEW.time
        )
      );
      -- Email queue entry for future delivery
      INSERT INTO public.email_queue (recipient_type, recipient_id, template, subject, payload)
      VALUES (
        'client', NEW.client_id,
        'booking_approved',
        'Agendamento Confirmado – Vettale',
        jsonb_build_object(
          'appointment_id', NEW.id,
          'client_id',      NEW.client_id,
          'pet_name',       v_pet_name,
          'service_name',   v_service_name,
          'date',           NEW.date,
          'time',           NEW.time
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG '[on_appointment_lifecycle_change] booking_approved emit failed: %', SQLERRM;
    END;
  END IF;

  -- ── service_in_progress (→ in_progress) ──────────────────────────────────
  IF (OLD.service_status IS DISTINCT FROM 'in_progress')
     AND NEW.service_status = 'in_progress'
  THEN
    BEGIN
      PERFORM public.notify_client(
        NEW.client_id,
        'service_in_progress',
        'Serviço em Andamento',
        COALESCE(v_service_name, 'O serviço') || ' do ' ||
          COALESCE(v_pet_name, 'seu pet') || ' está em andamento.',
        NEW.id,
        v_deep_link,
        jsonb_build_object(
          'appointment_id', NEW.id,
          'pet_name',       v_pet_name,
          'service_name',   v_service_name
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG '[on_appointment_lifecycle_change] service_in_progress emit failed: %', SQLERRM;
    END;
  END IF;

  -- ── service_completed (→ completed) ──────────────────────────────────────
  IF (OLD.service_status IS DISTINCT FROM 'completed')
     AND NEW.service_status = 'completed'
  THEN
    BEGIN
      -- Completion notification
      PERFORM public.notify_client(
        NEW.client_id,
        'service_completed',
        'Serviço Concluído!',
        COALESCE(v_service_name, 'O serviço') || ' do ' ||
          COALESCE(v_pet_name, 'seu pet') ||
          ' foi concluído. Pode vir buscá-lo!',
        NEW.id,
        v_deep_link,
        jsonb_build_object(
          'appointment_id', NEW.id,
          'pet_name',       v_pet_name,
          'service_name',   v_service_name
        )
      );
      -- Review reminder notification (uses v_review_link to auto-open the dialog)
      PERFORM public.notify_client(
        NEW.client_id,
        'review_reminder',
        'Avalie o Serviço',
        'Como foi o atendimento? Compartilhe sua experiência e ajude outros clientes.',
        NEW.id,
        v_review_link,
        jsonb_build_object(
          'appointment_id', NEW.id,
          'pet_name',       v_pet_name,
          'service_name',   v_service_name
        )
      );
      -- Email queue entry for future delivery
      INSERT INTO public.email_queue (recipient_type, recipient_id, template, subject, payload)
      VALUES (
        'client', NEW.client_id,
        'service_completed',
        'Serviço Concluído – Vettale',
        jsonb_build_object(
          'appointment_id', NEW.id,
          'client_id',      NEW.client_id,
          'pet_name',       v_pet_name,
          'service_name',   v_service_name,
          'date',           NEW.date
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG '[on_appointment_lifecycle_change] service_completed emit failed: %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- ── 10. Attach trigger to appointments ───────────────────────────────────────
DROP TRIGGER IF EXISTS appointment_lifecycle_notify ON public.appointments;

CREATE TRIGGER appointment_lifecycle_notify
  AFTER UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.on_appointment_lifecycle_change();

-- ── 11. Grant execute on RPC functions to authenticated users ────────────────
GRANT EXECUTE ON FUNCTION public.get_client_notifications(integer, integer)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_unread_notification_count()             TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_client_notification_read(uuid)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_client_notifications_read()               TO authenticated;
