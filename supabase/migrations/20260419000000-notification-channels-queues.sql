-- ============================================================
-- NOTIFICATION CHANNELS: queues + dispatcher plumbing
--
-- Builds on the existing client notification system
-- (20260417000001-client-notification-system.sql).
--
-- What this migration does:
--   1. Adds retry/tracking/dedupe columns to email_queue.
--   2. Creates whatsapp_queue (sibling of email_queue).
--   3. Replaces on_appointment_lifecycle_change so that:
--        - email_queue inserts are gated on consent_reminders + email,
--        - whatsapp_queue inserts are gated on consent_reminders + phone,
--        - both use a stable dedupe_key so re-fires can't duplicate.
--   4. Adds a helper view for the dispatcher (pending_notifications).
--   5. Leaves a commented pg_cron schedule block for when the
--      notifications-dispatcher edge function is deployed with keys.
-- ============================================================

-- ── 1. Extend email_queue with retry/tracking columns ────────────────────────
ALTER TABLE public.email_queue
  ADD COLUMN IF NOT EXISTS retry_count          integer      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at        timestamptz,
  ADD COLUMN IF NOT EXISTS provider_message_id  text,
  ADD COLUMN IF NOT EXISTS dedupe_key           text,
  ADD COLUMN IF NOT EXISTS locked_at            timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_queue_dedupe_key
  ON public.email_queue (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_queue_dispatch
  ON public.email_queue (status, next_retry_at NULLS FIRST, created_at)
  WHERE status = 'pending';

-- ── 2. whatsapp_queue table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_queue (
  id                   uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_type       text         NOT NULL DEFAULT 'client',
  recipient_id         uuid,
  phone_e164           text         NOT NULL,
  template_name        text         NOT NULL,
  template_language    text         NOT NULL DEFAULT 'pt_BR',
  template_variables   jsonb        NOT NULL DEFAULT '{}'::jsonb,
  payload              jsonb        NOT NULL DEFAULT '{}'::jsonb,
  status               text         NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending', 'sent', 'failed')),
  retry_count          integer      NOT NULL DEFAULT 0,
  next_retry_at        timestamptz,
  locked_at            timestamptz,
  provider_message_id  text,
  error                text,
  dedupe_key           text,
  created_at           timestamptz  NOT NULL DEFAULT now(),
  sent_at              timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_queue_dedupe_key
  ON public.whatsapp_queue (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_queue_dispatch
  ON public.whatsapp_queue (status, next_retry_at NULLS FIRST, created_at)
  WHERE status = 'pending';

-- Service-role only; no client-facing policies.
ALTER TABLE public.whatsapp_queue ENABLE ROW LEVEL SECURITY;

-- ── 3. Replace the lifecycle trigger with consent-aware, deduped version ─────
CREATE OR REPLACE FUNCTION public.on_appointment_lifecycle_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pet_name         text;
  v_service_name     text;
  v_deep_link        text;
  v_review_link      text;
  v_client_email     text;
  v_client_phone     text;
  v_consent_rem      boolean;
BEGIN
  -- Resolve display names (best-effort)
  BEGIN
    SELECT p.name INTO v_pet_name     FROM public.pets     p WHERE p.id = NEW.pet_id;
    SELECT s.name INTO v_service_name FROM public.services s WHERE s.id = NEW.service_id;
  EXCEPTION WHEN OTHERS THEN
    v_pet_name     := 'seu pet';
    v_service_name := 'o serviço';
  END;

  -- Resolve client contact + consent once (best-effort)
  BEGIN
    SELECT c.email, c.phone, COALESCE(c.consent_reminders, false)
      INTO v_client_email, v_client_phone, v_consent_rem
      FROM public.clients c
     WHERE c.id = NEW.client_id;
  EXCEPTION WHEN OTHERS THEN
    v_client_email := NULL;
    v_client_phone := NULL;
    v_consent_rem  := false;
  END;

  v_deep_link   := '/appointments?highlight=' || NEW.id::text;
  v_review_link := '/appointments?highlight=' || NEW.id::text || '&review=1';

  -- ── booking_approved (pending → confirmed/approved) ─────────────────────
  IF OLD.status = 'pending' AND NEW.status IN ('confirmed', 'approved') THEN

    -- in-app
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
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG '[lifecycle] booking_approved in-app emit failed: %', SQLERRM;
    END;

    -- email (gated on consent_reminders + email)
    IF v_consent_rem AND v_client_email IS NOT NULL AND length(btrim(v_client_email)) > 0 THEN
      BEGIN
        INSERT INTO public.email_queue
          (recipient_type, recipient_id, recipient_email, template, subject, payload, dedupe_key)
        VALUES (
          'client', NEW.client_id, v_client_email,
          'booking_approved',
          'Agendamento Confirmado – Vettale',
          jsonb_build_object(
            'appointment_id', NEW.id,
            'client_id',      NEW.client_id,
            'pet_name',       v_pet_name,
            'service_name',   v_service_name,
            'date',           NEW.date,
            'time',           NEW.time
          ),
          'email:booking_approved:' || NEW.id::text
        )
        ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
      EXCEPTION WHEN OTHERS THEN
        RAISE LOG '[lifecycle] booking_approved email enqueue failed: %', SQLERRM;
      END;
    END IF;

    -- whatsapp (gated on consent_reminders + phone)
    IF v_consent_rem AND v_client_phone IS NOT NULL AND length(btrim(v_client_phone)) > 0 THEN
      BEGIN
        INSERT INTO public.whatsapp_queue
          (recipient_type, recipient_id, phone_e164, template_name, template_variables, payload, dedupe_key)
        VALUES (
          'client', NEW.client_id, v_client_phone,
          'booking_confirmed_v1',
          jsonb_build_object(
            'pet_name',     COALESCE(v_pet_name, 'seu pet'),
            'service_name', COALESCE(v_service_name, 'o serviço'),
            'date',         NEW.date::text,
            'time',         NEW.time::text
          ),
          jsonb_build_object(
            'appointment_id', NEW.id,
            'client_id',      NEW.client_id
          ),
          'wa:booking_approved:' || NEW.id::text
        )
        ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
      EXCEPTION WHEN OTHERS THEN
        RAISE LOG '[lifecycle] booking_approved whatsapp enqueue failed: %', SQLERRM;
      END;
    END IF;
  END IF;

  -- ── service_in_progress (→ in_progress) ────────────────────────────────
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
      RAISE LOG '[lifecycle] service_in_progress emit failed: %', SQLERRM;
    END;
  END IF;

  -- ── service_completed (→ completed) ────────────────────────────────────
  IF (OLD.service_status IS DISTINCT FROM 'completed')
     AND NEW.service_status = 'completed'
  THEN
    -- in-app completion
    BEGIN
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
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG '[lifecycle] service_completed in-app emit failed: %', SQLERRM;
    END;

    -- email
    IF v_consent_rem AND v_client_email IS NOT NULL AND length(btrim(v_client_email)) > 0 THEN
      BEGIN
        INSERT INTO public.email_queue
          (recipient_type, recipient_id, recipient_email, template, subject, payload, dedupe_key)
        VALUES (
          'client', NEW.client_id, v_client_email,
          'service_completed',
          'Serviço Concluído – Vettale',
          jsonb_build_object(
            'appointment_id', NEW.id,
            'client_id',      NEW.client_id,
            'pet_name',       v_pet_name,
            'service_name',   v_service_name,
            'date',           NEW.date
          ),
          'email:service_completed:' || NEW.id::text
        )
        ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
      EXCEPTION WHEN OTHERS THEN
        RAISE LOG '[lifecycle] service_completed email enqueue failed: %', SQLERRM;
      END;
    END IF;

    -- whatsapp
    IF v_consent_rem AND v_client_phone IS NOT NULL AND length(btrim(v_client_phone)) > 0 THEN
      BEGIN
        INSERT INTO public.whatsapp_queue
          (recipient_type, recipient_id, phone_e164, template_name, template_variables, payload, dedupe_key)
        VALUES (
          'client', NEW.client_id, v_client_phone,
          'service_completed_v1',
          jsonb_build_object(
            'pet_name',     COALESCE(v_pet_name, 'seu pet'),
            'service_name', COALESCE(v_service_name, 'o serviço')
          ),
          jsonb_build_object(
            'appointment_id', NEW.id,
            'client_id',      NEW.client_id
          ),
          'wa:service_completed:' || NEW.id::text
        )
        ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
      EXCEPTION WHEN OTHERS THEN
        RAISE LOG '[lifecycle] service_completed whatsapp enqueue failed: %', SQLERRM;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger is already attached by the previous migration; CREATE OR REPLACE above
-- swaps the function body in place. No DROP/CREATE TRIGGER needed.

-- ── 4. pg_cron schedule (commented — enable after deploying dispatcher) ──────
--
-- Once RESEND_API_KEY + WHATSAPP_* secrets are set and the edge function
-- `notifications-dispatcher` is deployed, uncomment the block below to
-- invoke it every minute. Replace <PROJECT_REF> and <SERVICE_ROLE_KEY>.
--
-- SELECT cron.schedule(
--   'notifications-dispatcher-every-minute',
--   '* * * * *',
--   $$
--   SELECT net.http_post(
--     url     := 'https://<PROJECT_REF>.functions.supabase.co/notifications-dispatcher',
--     headers := jsonb_build_object(
--       'Content-Type',  'application/json',
--       'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
--     ),
--     body    := jsonb_build_object('source', 'cron')
--   );
--   $$
-- );
