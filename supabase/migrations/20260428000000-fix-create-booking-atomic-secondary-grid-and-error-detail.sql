-- Fix create_booking_atomic on two fronts:
--
-- 1) Grid-align the SECONDARY slot reservation series.
--    Old code started the secondary series at v_mid_ts = v_start_ts + primary_dur.
--    For any non-multiple-of-10 primary duration (e.g. Banho Completo = 75 min)
--    that lands at HH:15 / HH:25 / … which never matches the staff_availability
--    10-minute grid (rows live on :00 / :10 / :20 …). The UPDATE silently
--    matches 0 rows and the function raises "Not enough secondary slots
--    reserved (expected N, got 0)".
--
--    Fix: snap the secondary start to the next 10-minute grid slot
--    (v_secondary_start_ts), then drive the series upper-bound from
--    v_expected exactly like the primary section.
--
-- 2) Make the slot-shortage exception messages informative.
--    Instead of "Not enough primary slots reserved (expected 8, got 0)" —
--    which forces a developer to query the DB to find out which staff /
--    which window — include the staff name + role + uuid, the date, and the
--    full list of expected and actually-updated time slots in the message.
--    Especially useful for dual-service bookings where two staff are
--    involved and you need to know which one ran out of slots.
--    This is intentionally verbose; we'll trim once the surrounding
--    flow is stable.

CREATE OR REPLACE FUNCTION public.create_booking_atomic(
  _user_id              uuid,
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
SECURITY DEFINER
AS $function$
DECLARE
  v_appt_id uuid;
  v_client_id uuid;

  primary_srv   public.services%ROWTYPE;
  secondary_srv public.services%ROWTYPE;

  v_dur_primary   int;
  v_dur_secondary int := 0;
  v_total_dur     int;

  v_price_primary   numeric := 0;
  v_price_secondary numeric := 0;
  v_total_price     numeric;

  v_is_first_visit  boolean := false;

  v_primary_staff   uuid;
  v_secondary_staff uuid;
  v_primary_staff_name   text;
  v_secondary_staff_name text;

  v_expected int;
  v_updated  int;

  v_primary_role   text := 'primary';
  v_secondary_role text := 'secondary';

  v_start_ts             timestamp;
  v_mid_ts               timestamp;
  v_secondary_start_ts   timestamp;
  v_end_ts               timestamp;

  -- For diagnostics in the exception message
  v_expected_slots time[];
  v_updated_slots  time[];
BEGIN
  -- resolve client
  SELECT id INTO v_client_id FROM public.clients WHERE user_id = _user_id;
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Client record not found for user: %', _user_id;
  END IF;

  -- load primary service
  SELECT * INTO primary_srv FROM public.services WHERE id = _service_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Primary service not found: %', _service_id;
  END IF;

  -- Per-service price/duration: prefer caller-supplied breed-specific values,
  -- then fall back to service-table defaults.
  v_dur_primary   := COALESCE(_primary_duration,   primary_srv.default_duration, 60);
  v_price_primary := COALESCE(_primary_price,      primary_srv.base_price,       0);

  -- secondary (only if provided)
  IF _secondary_service_id IS NOT NULL THEN
    SELECT * INTO secondary_srv FROM public.services WHERE id = _secondary_service_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Secondary service not found: %', _secondary_service_id;
    END IF;
    v_dur_secondary   := COALESCE(_secondary_duration, secondary_srv.default_duration, 0);
    v_price_secondary := COALESCE(_secondary_price,    secondary_srv.base_price,       0);
  END IF;

  -- total duration: prefer explicit override, otherwise sum per-service
  v_total_dur := COALESCE(_calculated_duration, v_dur_primary + v_dur_secondary);

  -- security: read is_first_visit from DB — never trust client
  SELECT is_first_visit INTO v_is_first_visit
  FROM public.pets
  WHERE id = _pet_id;

  -- total price: NULL for first-visit; prefer explicit override, else sum
  IF COALESCE(v_is_first_visit, false) = true THEN
    v_total_price := NULL;
  ELSE
    v_total_price := COALESCE(_calculated_price, v_price_primary + v_price_secondary);
  END IF;

  -- staff mapping
  v_primary_staff   := CASE WHEN array_length(_provider_ids,1) >= 1
                             THEN _provider_ids[1] ELSE NULL END;
  v_secondary_staff := CASE WHEN array_length(_provider_ids,1) >= 2
                             THEN _provider_ids[2] ELSE v_primary_staff END;

  -- Resolve names for diagnostic messages (best-effort; missing row leaves NULL)
  IF v_primary_staff IS NOT NULL THEN
    SELECT name INTO v_primary_staff_name FROM public.staff_profiles WHERE id = v_primary_staff;
  END IF;
  IF v_secondary_staff IS NOT NULL THEN
    SELECT name INTO v_secondary_staff_name FROM public.staff_profiles WHERE id = v_secondary_staff;
  END IF;

  -- roles
  v_primary_role := CASE
    WHEN COALESCE(primary_srv.requires_bath,false)     THEN 'banhista'
    WHEN COALESCE(primary_srv.requires_grooming,false) THEN 'tosador'
    WHEN COALESCE(primary_srv.requires_vet,false)      THEN 'veterinario'
    ELSE 'primary' END;

  IF _secondary_service_id IS NOT NULL THEN
    v_secondary_role := CASE
      WHEN COALESCE(secondary_srv.requires_bath,false)     THEN 'banhista'
      WHEN COALESCE(secondary_srv.requires_grooming,false) THEN 'tosador'
      WHEN COALESCE(secondary_srv.requires_vet,false)      THEN 'veterinario'
      ELSE 'secondary' END;
  END IF;

  -- time windows
  v_start_ts := (_booking_date::timestamp + _time_slot);
  v_mid_ts   := v_start_ts + make_interval(mins => v_dur_primary);
  v_end_ts   := v_mid_ts   + make_interval(mins => v_dur_secondary);

  -- Snap the SECONDARY start to the 10-minute grid (rows in staff_availability
  -- live on :00 / :10 / :20). When v_dur_primary is not a multiple of 10
  -- (e.g. 75 min Banho Completo) v_mid_ts lands off-grid and the series
  -- never matches a row. Round UP so we never overlap the primary window.
  v_secondary_start_ts := date_trunc('hour', v_mid_ts)
                       + make_interval(mins =>
                           CEIL(EXTRACT(minute FROM v_mid_ts)::numeric / 10) * 10
                         );

  -- appointment row
  INSERT INTO public.appointments (
    client_id, pet_id, service_id, date, time, notes,
    status, service_status, duration, total_price
  ) VALUES (
    v_client_id, _pet_id, _service_id, _booking_date, _time_slot, _notes,
    'pending', 'not_started', v_total_dur, v_total_price
  ) RETURNING id INTO v_appt_id;

  -- appointment_services: use breed/size-specific values (or service defaults)
  INSERT INTO public.appointment_services(appointment_id, service_id, service_order, price, duration)
  VALUES (v_appt_id, _service_id, 1, v_price_primary, v_dur_primary);

  -- appointment_staff primary
  IF v_primary_staff IS NOT NULL THEN
    INSERT INTO public.appointment_staff(appointment_id, service_id, staff_profile_id, role)
    VALUES (v_appt_id, _service_id, v_primary_staff, v_primary_role);
  END IF;

  -- secondary rows only when present
  IF _secondary_service_id IS NOT NULL THEN
    INSERT INTO public.appointment_services(appointment_id, service_id, service_order, price, duration)
    VALUES (v_appt_id, _secondary_service_id, 2, v_price_secondary, v_dur_secondary);

    IF v_secondary_staff IS NOT NULL THEN
      INSERT INTO public.appointment_staff(appointment_id, service_id, staff_profile_id, role)
      VALUES (v_appt_id, _secondary_service_id, v_secondary_staff, v_secondary_role);
    END IF;
  END IF;

  -- ── Primary slot reservation ─────────────────────────────────────────────
  IF v_primary_staff IS NOT NULL THEN
    v_expected := CEIL(v_dur_primary / 10.0)::int;

    WITH series AS (
      SELECT generate_series(
        v_start_ts,
        v_start_ts + make_interval(mins => (v_expected - 1) * 10),
        interval '10 minutes'
      ) AS ts
    ), upd AS (
      UPDATE public.staff_availability sa
         SET available = FALSE,
             reserved_appointment_id = v_appt_id,
             reserved_status = 'pending'
        FROM series
       WHERE sa.staff_profile_id = v_primary_staff
         AND sa.date = _booking_date
         AND sa.time_slot = (series.ts::time)
         AND sa.available = TRUE
      RETURNING sa.time_slot
    ) SELECT array_agg(time_slot ORDER BY time_slot) INTO v_updated_slots FROM upd;

    v_updated := COALESCE(array_length(v_updated_slots, 1), 0);

    IF v_updated < v_expected THEN
      SELECT array_agg((v_start_ts + make_interval(mins => i*10))::time ORDER BY i)
        INTO v_expected_slots
        FROM generate_series(0, v_expected - 1) AS i;

      RAISE EXCEPTION
        'Not enough primary slots reserved (expected %, got %). staff=% [%] (%), role=%, date=%, primary_duration=%min, expected_slots=%, updated_slots=%, service=% (%)',
        v_expected, v_updated,
        COALESCE(v_primary_staff_name, '<unknown>'), v_primary_role, v_primary_staff,
        v_primary_role,
        _booking_date, v_dur_primary,
        v_expected_slots,
        COALESCE(v_updated_slots, ARRAY[]::time[]),
        primary_srv.name, _service_id;
    END IF;
  END IF;

  -- ── Secondary slot reservation ───────────────────────────────────────────
  IF _secondary_service_id IS NOT NULL
     AND v_secondary_staff IS NOT NULL
     AND v_dur_secondary > 0
  THEN
    v_expected := CEIL(v_dur_secondary / 10.0)::int;

    WITH series AS (
      SELECT generate_series(
        v_secondary_start_ts,
        v_secondary_start_ts + make_interval(mins => (v_expected - 1) * 10),
        interval '10 minutes'
      ) AS ts
    ), upd AS (
      UPDATE public.staff_availability sa
         SET available = FALSE,
             reserved_appointment_id = v_appt_id,
             reserved_status = 'pending'
        FROM series
       WHERE sa.staff_profile_id = v_secondary_staff
         AND sa.date = _booking_date
         AND sa.time_slot = (series.ts::time)
         AND sa.available = TRUE
      RETURNING sa.time_slot
    ) SELECT array_agg(time_slot ORDER BY time_slot) INTO v_updated_slots FROM upd;

    v_updated := COALESCE(array_length(v_updated_slots, 1), 0);

    IF v_updated < v_expected THEN
      SELECT array_agg((v_secondary_start_ts + make_interval(mins => i*10))::time ORDER BY i)
        INTO v_expected_slots
        FROM generate_series(0, v_expected - 1) AS i;

      RAISE EXCEPTION
        'Not enough secondary slots reserved (expected %, got %). staff=% [%] (%), role=%, date=%, secondary_duration=%min, secondary_start=% (snapped from mid_ts=%), expected_slots=%, updated_slots=%, service=% (%)',
        v_expected, v_updated,
        COALESCE(v_secondary_staff_name, '<unknown>'), v_secondary_role, v_secondary_staff,
        v_secondary_role,
        _booking_date, v_dur_secondary,
        v_secondary_start_ts::time, v_mid_ts::time,
        v_expected_slots,
        COALESCE(v_updated_slots, ARRAY[]::time[]),
        secondary_srv.name, _secondary_service_id;
    END IF;
  END IF;

  RETURN v_appt_id;
END;
$function$;

COMMENT ON FUNCTION public.create_booking_atomic(
  uuid, uuid, uuid, uuid[], date, time without time zone,
  text, numeric, integer, uuid, numeric, integer, numeric, integer
) IS
'Creates a client appointment atomically. Reserves staff_availability slots for
primary and (optional) secondary service windows. Secondary window start is
snapped to the 10-minute grid so non-multiple-of-10 primary durations work.
Slot-shortage exceptions include staff_profile_id, role, date, expected and
updated time slot arrays for diagnostics.';
