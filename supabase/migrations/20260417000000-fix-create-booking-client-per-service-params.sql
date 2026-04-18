-- Fix create_booking_client overload-2 (with _secondary_service_id) to accept and
-- forward breed-specific per-service price/duration params to create_booking_atomic.
--
-- Before this migration, those params were accepted by create_booking_atomic but
-- NOT accepted by create_booking_client, so the frontend's breed-specific values
-- were silently dropped — create_booking_atomic fell back to services.default_duration
-- for appointment_services rows and, critically, for slot-blocking math.
--
-- After this migration, both the appointment_services durations AND the
-- staff_availability slot-blocking use the breed-specific values the front end
-- already calculates.

-- Drop the old overload-2 (different param list → must DROP before replacing)
DROP FUNCTION IF EXISTS public.create_booking_client(
  uuid, uuid, uuid, uuid[], date, time without time zone,
  text, numeric, integer, uuid
);

-- New overload-2: accepts + forwards all per-service params
CREATE OR REPLACE FUNCTION public.create_booking_client(
  _client_user_id       uuid,
  _pet_id               uuid,
  _service_id           uuid,
  _provider_ids         uuid[],
  _booking_date         date,
  _time_slot            time without time zone,
  _notes                text    DEFAULT NULL::text,
  _calculated_price     numeric DEFAULT NULL::numeric,
  _calculated_duration  integer DEFAULT NULL::integer,
  _secondary_service_id uuid    DEFAULT NULL::uuid,
  _primary_price        numeric DEFAULT NULL::numeric,
  _primary_duration     integer DEFAULT NULL::integer,
  _secondary_price      numeric DEFAULT NULL::numeric,
  _secondary_duration   integer DEFAULT NULL::integer
)
RETURNS uuid
LANGUAGE plpgsql
AS $function$
DECLARE
  appointment_id uuid;
  v_client_id    uuid;
BEGIN
  -- Core booking — pass all per-service params through to create_booking_atomic
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
    _secondary_service_id => _secondary_service_id,
    _primary_price        => _primary_price,
    _primary_duration     => _primary_duration,
    _secondary_price      => _secondary_price,
    _secondary_duration   => _secondary_duration
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
        'appointment_id',       appointment_id,
        'client_id',            v_client_id,
        'pet_id',               _pet_id,
        'service_id',           _service_id,
        'secondary_service_id', _secondary_service_id,
        'booking_date',         _booking_date,
        'time_slot',            _time_slot::text
      ),
      'booking_created_by_client:' || appointment_id::text
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG '[create_booking_client] notification emit failed: %', SQLERRM;
  END;

  RETURN appointment_id;
END;
$function$;

COMMENT ON FUNCTION public.create_booking_client(
  uuid, uuid, uuid, uuid[], date, time without time zone,
  text, numeric, integer, uuid, numeric, integer, numeric, integer
) IS
'Client booking overload-2 (with secondary service). Forwards all breed-specific
per-service price/duration params to create_booking_atomic so that both
appointment_services rows and staff_availability slot-blocking use the correct
breed-specific values.';
