-- ============================================================
-- Modify create_booking_client (both overloads) to emit
-- booking_created_by_client admin notifications.
--
-- INVARIANTS PRESERVED:
--   • Booking atomicity is unchanged (create_booking_atomic untouched)
--   • Notification emit is wrapped in BEGIN/EXCEPTION so any
--     notification failure CANNOT roll back the booking itself.
--   • Dedupe key prevents duplicate notifications on retry.
-- ============================================================

-- ── Overload 1: without _secondary_service_id ──────────────
CREATE OR REPLACE FUNCTION public.create_booking_client(
  _client_user_id    uuid,
  _pet_id            uuid,
  _service_id        uuid,
  _provider_ids      uuid[],
  _booking_date      date,
  _time_slot         time without time zone,
  _notes             text    DEFAULT NULL::text,
  _calculated_price  numeric DEFAULT NULL::numeric,
  _calculated_duration integer DEFAULT NULL::integer
)
RETURNS uuid
LANGUAGE plpgsql
AS $function$
DECLARE
  appointment_id uuid;
  v_client_id    uuid;
BEGIN
  -- Core booking (unchanged)
  SELECT public.create_booking_atomic(
    _client_user_id,
    _pet_id,
    _service_id,
    _provider_ids,
    _booking_date,
    _time_slot,
    _notes,
    _calculated_price,
    _calculated_duration
  ) INTO appointment_id;

  -- Emit admin notification (best-effort; never rolls back the booking)
  BEGIN
    SELECT client_id INTO v_client_id
    FROM   public.appointments
    WHERE  id = appointment_id
    LIMIT  1;

    PERFORM public.notify_all_admins(
      'booking_created_by_client',
      'appointment',
      appointment_id,
      'Nova Solicitação de Agendamento',
      'Um cliente criou um novo agendamento para ' ||
        to_char(_booking_date, 'DD/MM/YYYY') || ' às ' ||
        to_char(_time_slot, 'HH24:MI') || '.',
      '/admin/appointments?appointment=' || appointment_id::text,
      'create_booking_client',
      jsonb_build_object(
        'appointment_id', appointment_id,
        'client_id',      v_client_id,
        'pet_id',         _pet_id,
        'service_id',     _service_id,
        'booking_date',   _booking_date,
        'time_slot',      _time_slot::text
      ),
      'booking_created_by_client:' || appointment_id::text
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG '[create_booking_client] notification emit failed: %', SQLERRM;
  END;

  RETURN appointment_id;
END;
$function$;

-- ── Overload 2: with _secondary_service_id ─────────────────
CREATE OR REPLACE FUNCTION public.create_booking_client(
  _client_user_id      uuid,
  _pet_id              uuid,
  _service_id          uuid,
  _provider_ids        uuid[],
  _booking_date        date,
  _time_slot           time without time zone,
  _notes               text    DEFAULT NULL::text,
  _calculated_price    numeric DEFAULT NULL::numeric,
  _calculated_duration integer DEFAULT NULL::integer,
  _secondary_service_id uuid   DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
AS $function$
DECLARE
  appointment_id uuid;
  v_client_id    uuid;
BEGIN
  -- Core booking (unchanged)
  SELECT public.create_booking_atomic(
    _user_id              => _client_user_id,
    _pet_id               => _pet_id,
    _service_id           => _service_id,
    _provider_ids         => _provider_ids,
    _booking_date         => _booking_date,
    _time_slot            => _time_slot,
    _notes                => _notes,
    _calculated_price     => _calculated_price,
    _calculated_duration  => _calculated_duration,
    _secondary_service_id => _secondary_service_id
  ) INTO appointment_id;

  -- Emit admin notification (best-effort; never rolls back the booking)
  BEGIN
    SELECT client_id INTO v_client_id
    FROM   public.appointments
    WHERE  id = appointment_id
    LIMIT  1;

    PERFORM public.notify_all_admins(
      'booking_created_by_client',
      'appointment',
      appointment_id,
      'Nova Solicitação de Agendamento',
      'Um cliente criou um novo agendamento para ' ||
        to_char(_booking_date, 'DD/MM/YYYY') || ' às ' ||
        to_char(_time_slot, 'HH24:MI') || '.',
      '/admin/appointments?appointment=' || appointment_id::text,
      'create_booking_client',
      jsonb_build_object(
        'appointment_id',      appointment_id,
        'client_id',           v_client_id,
        'pet_id',              _pet_id,
        'service_id',          _service_id,
        'secondary_service_id', _secondary_service_id,
        'booking_date',        _booking_date,
        'time_slot',           _time_slot::text
      ),
      'booking_created_by_client:' || appointment_id::text
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG '[create_booking_client] notification emit failed: %', SQLERRM;
  END;

  RETURN appointment_id;
END;
$function$;
