-- Fix create_booking_atomic: generate_series upper-bound off-by-one for
-- non-multiples of 10.
--
-- Root cause: the old code used
--   generate_series(v_start_ts, v_mid_ts - interval '10 minutes', '10 minutes')
-- For a 75-minute primary duration this generates 7 timestamps
-- (09:00, 09:10 … 10:00) but CEIL(75/10.0) = 8 is expected, so the
-- function always raised "Not enough primary slots reserved (expected 8, got 7)".
--
-- Fix: compute v_expected BEFORE the series and drive the series upper-bound
-- from v_expected instead of raw interval arithmetic:
--   generate_series(v_start_ts,
--                   v_start_ts + make_interval(mins => (v_expected-1)*10),
--                   '10 minutes')
-- This guarantees the series always produces exactly v_expected rows.
-- The same fix is applied to the secondary window.

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

  v_expected int;
  v_updated  int;

  v_primary_role   text := 'primary';
  v_secondary_role text := 'secondary';

  v_start_ts timestamp;
  v_mid_ts   timestamp;
  v_end_ts   timestamp;
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
  -- FIX: compute v_expected FIRST and drive the series upper-bound from it.
  -- Old code used (v_mid_ts - '10 minutes') which gives floor(dur/10) timestamps,
  -- not ceil(dur/10) — they disagree for any non-multiple-of-10 duration.
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
      RETURNING 1
    ) SELECT COUNT(*) INTO v_updated FROM upd;

    IF v_updated < v_expected THEN
      RAISE EXCEPTION 'Not enough primary slots reserved (expected %, got %)',
        v_expected, v_updated;
    END IF;
  END IF;

  -- ── Secondary slot reservation ───────────────────────────────────────────
  -- Same fix applied: series upper-bound driven by v_expected.
  IF _secondary_service_id IS NOT NULL
     AND v_secondary_staff IS NOT NULL
     AND v_dur_secondary > 0
  THEN
    v_expected := CEIL(v_dur_secondary / 10.0)::int;

    WITH series AS (
      SELECT generate_series(
        v_mid_ts,
        v_mid_ts + make_interval(mins => (v_expected - 1) * 10),
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
      RETURNING 1
    ) SELECT COUNT(*) INTO v_updated FROM upd;

    IF v_updated < v_expected THEN
      RAISE EXCEPTION 'Not enough secondary slots reserved (expected %, got %)',
        v_expected, v_updated;
    END IF;
  END IF;

  RETURN v_appt_id;
END;
$function$;
