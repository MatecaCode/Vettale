-- Fix mark_appointment_service_status:
-- 1) Allow not_started -> completed (admin skip)
-- 2) Auto-promote appointments.status to 'completed' when all services done

CREATE OR REPLACE FUNCTION public.mark_appointment_service_status(
  _appointment_id uuid,
  _service_id uuid,
  _status text,
  _force boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current text;
  v_appt_lifecycle text;
  v_old_app_service_status text;
  v_cancelled boolean;
  v_new_app_service_status text;
  v_total int;
  v_completed int;
  v_in_progress int;
  v_not_started int;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'admin required'; END IF;
  IF _status NOT IN ('not_started','in_progress','completed') THEN RAISE EXCEPTION 'invalid status'; END IF;

  SELECT status, service_status INTO v_appt_lifecycle, v_old_app_service_status
  FROM public.appointments WHERE id = _appointment_id FOR UPDATE;
  IF v_appt_lifecycle IS NULL THEN RAISE EXCEPTION 'appointment_not_found'; END IF;
  v_cancelled := lower(v_appt_lifecycle) IN ('cancelled','canceled');
  IF v_cancelled THEN RAISE EXCEPTION 'cannot_complete_cancelled'; END IF;

  SELECT status INTO v_current
  FROM public.appointment_services
  WHERE appointment_id = _appointment_id AND service_id = _service_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'service_row_not_found'; END IF;

  IF v_current = _status THEN
    NULL;
  ELSE
    IF NOT _force THEN
      IF v_current = 'not_started' AND _status NOT IN ('in_progress', 'completed') THEN
        RAISE EXCEPTION 'invalid_transition';
      ELSIF v_current = 'in_progress' AND _status <> 'completed' THEN
        RAISE EXCEPTION 'invalid_transition';
      ELSIF v_current = 'completed' THEN
        RAISE EXCEPTION 'invalid_transition';
      END IF;
    END IF;

    UPDATE public.appointment_services
       SET status = _status
     WHERE appointment_id = _appointment_id AND service_id = _service_id;
  END IF;

  SELECT count(*)::int,
         sum((status = 'completed')::int)::int,
         sum((status = 'in_progress')::int)::int,
         sum((status = 'not_started')::int)::int
    INTO v_total, v_completed, v_in_progress, v_not_started
  FROM public.appointment_services
  WHERE appointment_id = _appointment_id;

  IF v_in_progress > 0 THEN
    v_new_app_service_status := 'in_progress';
  ELSIF v_completed = v_total AND v_total > 0 THEN
    v_new_app_service_status := 'completed';
  ELSIF v_not_started = v_total THEN
    v_new_app_service_status := 'not_started';
  ELSE
    v_new_app_service_status := 'in_progress';
  END IF;

  UPDATE public.appointments
     SET service_status = v_new_app_service_status
   WHERE id = _appointment_id;

  -- Auto-promote lifecycle to 'completed' when all services are done
  IF v_new_app_service_status = 'completed' THEN
    UPDATE public.appointments
       SET status = 'completed'
     WHERE id = _appointment_id
       AND status NOT IN ('cancelled', 'canceled');
  END IF;

  INSERT INTO public.appointment_events(appointment_id, event_type, notes, created_by)
  VALUES (
    _appointment_id,
    'service_status_changed',
    format('{"from":"%s","to":"%s","service_id":"%s"}', coalesce(v_old_app_service_status,'null'), v_new_app_service_status, _service_id)::text,
    auth.uid()
  );
END;
$function$;


-- Fix appointment_set_service_status (used by groomer/staff calendar):
-- Same two fixes: allow skip, auto-promote lifecycle.

DROP FUNCTION IF EXISTS public.appointment_set_service_status(uuid, text, text);

CREATE OR REPLACE FUNCTION public.appointment_set_service_status(
  p_appointment_id uuid,
  p_new_status text,
  p_note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_current text;
  v_started_at timestamptz;
  v_completed_at timestamptz;
  v_client_id uuid;
  v_actor uuid := auth.uid();
  v_allowed boolean := false;
  v_now timestamptz := now();
BEGIN
  IF p_appointment_id IS NULL THEN
    RAISE EXCEPTION 'appointment_id is required';
  END IF;

  IF p_new_status NOT IN ('not_started','in_progress','completed') THEN
    RAISE EXCEPTION 'Invalid service status: %', p_new_status;
  END IF;

  SELECT service_status, service_started_at, service_completed_at, client_id
  INTO v_current, v_started_at, v_completed_at, v_client_id
  FROM public.appointments
  WHERE id = p_appointment_id
  FOR UPDATE;

  IF v_current IS NULL THEN
    v_current := 'not_started';
  END IF;

  v_allowed := public.is_admin(v_actor)
    OR EXISTS (
      SELECT 1
      FROM public.appointment_staff ast
      JOIN public.staff_profiles sp ON sp.id = ast.staff_profile_id
      WHERE ast.appointment_id = p_appointment_id
        AND sp.user_id = v_actor
    );

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Not authorized to change service status for this appointment';
  END IF;

  IF p_new_status = v_current THEN
    INSERT INTO public.appointment_events (appointment_id, event_type, notes, created_by)
    VALUES (
      p_appointment_id,
      'service_status_changed',
      jsonb_build_object('from', v_current, 'to', p_new_status, 'note', p_note, 'idempotent', true)::text,
      v_actor
    );
    RETURN;
  END IF;

  IF p_new_status = 'not_started' AND v_current <> 'not_started' THEN
    RAISE EXCEPTION 'Cannot revert service status to not_started from %', v_current;
  END IF;

  IF p_new_status = 'in_progress' AND v_current NOT IN ('not_started','in_progress') THEN
    RAISE EXCEPTION 'Invalid transition: % -> %', v_current, p_new_status;
  END IF;

  IF p_new_status = 'completed' AND v_current NOT IN ('not_started','in_progress','completed') THEN
    RAISE EXCEPTION 'Invalid transition: % -> %', v_current, p_new_status;
  END IF;

  UPDATE public.appointments
  SET
    service_status = p_new_status,
    service_started_at = CASE
      WHEN p_new_status IN ('in_progress','completed') AND service_started_at IS NULL THEN v_now
      ELSE service_started_at
    END,
    service_completed_at = CASE
      WHEN p_new_status = 'completed' AND service_completed_at IS NULL THEN v_now
      ELSE service_completed_at
    END,
    updated_at = v_now
  WHERE id = p_appointment_id;

  IF p_new_status = 'completed' THEN
    UPDATE public.appointments
       SET status = 'completed'
     WHERE id = p_appointment_id
       AND status NOT IN ('cancelled', 'canceled');
  END IF;

  INSERT INTO public.appointment_events (appointment_id, event_type, notes, created_by)
  VALUES (
    p_appointment_id,
    'service_status_changed',
    jsonb_build_object('from', v_current, 'to', p_new_status, 'note', p_note)::text,
    v_actor
  );

  IF p_new_status = 'completed' AND v_client_id IS NOT NULL THEN
    INSERT INTO public.notification_queue (appointment_id, recipient_type, recipient_id, message_type, message)
    VALUES (p_appointment_id, 'user', v_client_id, 'booking_completed', 'Seu servico foi concluido. Obrigado!');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.appointment_set_service_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.appointment_set_service_status(uuid, text, text) TO anon;
