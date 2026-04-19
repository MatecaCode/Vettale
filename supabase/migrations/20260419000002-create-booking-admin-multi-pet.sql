-- Multi-Pet Booking — PR 2: new RPC `create_booking_admin_multi_pet`.
--
-- Strategy: delegate 100% of per-pet booking logic to the existing
-- `create_admin_booking_with_dual_services` function (the real admin path).
-- This RPC is a thin loop that:
--   1. Validates all pets belong to the same client.
--   2. Allocates a shared booking_group_id.
--   3. For each pet in order, computes a sequential start time
--      (cumulative sum of prior pets' durations) and calls
--      `create_admin_booking_with_dual_services` with that pet's
--      pre-computed duration/price.
--   4. Stamps the resulting appointment with the group_id + order.
--
-- v1 scope: the group shares one primary service (and optionally one
-- secondary service — matching the "same banho+tosa for all pets" spirit).
-- Addons and extra fees are intentionally NOT supported in v1; admins needing
-- those should book single-pet style.
--
-- Any failure mid-loop rolls back the entire group (single tx).
--
-- Design reference: docs/MULTI_PET_BOOKING_PROPOSAL.md (§5, §10 PR 2).

-- Drop any prior version with the old signature.
DROP FUNCTION IF EXISTS public.create_booking_admin_multi_pet(
  UUID, UUID[], UUID, UUID[], DATE, TIME, INTEGER[], NUMERIC[], TEXT, UUID, BOOLEAN
);

CREATE OR REPLACE FUNCTION public.create_booking_admin_multi_pet(
  _client_user_id       UUID,
  _pet_ids              UUID[],
  _primary_service_id   UUID,
  _secondary_service_id UUID,
  _provider_ids         UUID[],
  _booking_date         DATE,
  _start_time_slot      TIME,
  _per_pet_durations    INTEGER[],
  _per_pet_prices       NUMERIC[],
  _notes                TEXT DEFAULT NULL,
  _created_by           UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_group_id           UUID := gen_random_uuid();
  v_pet_count          INTEGER;
  v_i                  INTEGER;
  v_pet_id             UUID;
  v_duration           INTEGER;
  v_price              NUMERIC;
  v_cumulative_minutes INTEGER := 0;
  v_pet_time           TIME;
  v_appt_id            UUID;
  v_client_id          UUID;
  v_first_appt_id      UUID;
  v_appointment_ids    UUID[] := ARRAY[]::UUID[];
BEGIN
  -- ---- Input validation ----
  IF _pet_ids IS NULL OR array_length(_pet_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'pet_ids is required';
  END IF;

  v_pet_count := array_length(_pet_ids, 1);

  IF v_pet_count < 2 THEN
    RAISE EXCEPTION 'Multi-pet booking requires at least 2 pets (got %). Use single-pet admin flow for 1 pet.', v_pet_count;
  END IF;

  IF array_length(_per_pet_durations, 1) <> v_pet_count THEN
    RAISE EXCEPTION 'per_pet_durations length (%) must match pet count (%)',
      array_length(_per_pet_durations, 1), v_pet_count;
  END IF;

  IF array_length(_per_pet_prices, 1) <> v_pet_count THEN
    RAISE EXCEPTION 'per_pet_prices length (%) must match pet count (%)',
      array_length(_per_pet_prices, 1), v_pet_count;
  END IF;

  IF (SELECT COUNT(DISTINCT p) FROM unnest(_pet_ids) AS p) <> v_pet_count THEN
    RAISE EXCEPTION 'Duplicate pet_id in multi-pet booking';
  END IF;

  SELECT id INTO v_client_id FROM public.clients WHERE user_id = _client_user_id;
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Client record not found for user_id: %', _client_user_id;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM unnest(_pet_ids) AS pid
     WHERE NOT EXISTS (
       SELECT 1 FROM public.pets
        WHERE id = pid
          AND client_id = v_client_id
          AND COALESCE(active, true) = true
     )
  ) THEN
    RAISE EXCEPTION 'One or more pets do not belong to client % (user %) or are inactive',
      v_client_id, _client_user_id;
  END IF;

  RAISE NOTICE '[create_booking_admin_multi_pet] group=%, client=%, pets=%, start=%, primary_service=%, secondary_service=%',
    v_group_id, v_client_id, v_pet_count, _start_time_slot, _primary_service_id, _secondary_service_id;

  -- ---- Sequential per-pet booking ----
  FOR v_i IN 1..v_pet_count LOOP
    v_pet_id   := _pet_ids[v_i];
    v_duration := _per_pet_durations[v_i];
    v_price    := _per_pet_prices[v_i];
    v_pet_time := _start_time_slot + (v_cumulative_minutes || ' minutes')::INTERVAL;

    RAISE NOTICE '[create_booking_admin_multi_pet] pet %/%: id=%, time=%, duration=%, price=%',
      v_i, v_pet_count, v_pet_id, v_pet_time, v_duration, v_price;

    SELECT public.create_admin_booking_with_dual_services(
      _client_user_id       => _client_user_id,
      _pet_id               => v_pet_id,
      _primary_service_id   => _primary_service_id,
      _booking_date         => _booking_date,
      _time_slot            => v_pet_time,
      _secondary_service_id => _secondary_service_id,
      _calculated_price     => v_price,
      _calculated_duration  => v_duration,
      _notes                => _notes,
      _provider_ids         => _provider_ids,
      _extra_fee            => 0,       -- addons/extra-fee not supported in multi-pet v1
      _extra_fee_reason     => NULL,
      _addons               => NULL,
      _created_by           => _created_by
    ) INTO v_appt_id;

    UPDATE public.appointments
       SET booking_group_id    = v_group_id,
           booking_group_order = v_i
     WHERE id = v_appt_id;

    v_appointment_ids := array_append(v_appointment_ids, v_appt_id);
    IF v_i = 1 THEN
      v_first_appt_id := v_appt_id;
    END IF;

    v_cumulative_minutes := v_cumulative_minutes + v_duration;
  END LOOP;

  -- ---- Group-level audit entry ----
  IF _created_by IS NOT NULL THEN
    INSERT INTO public.admin_actions (
      admin_user_id, action_type, target_appointment_id, details
    ) VALUES (
      _created_by,
      'create_booking_multi_pet',
      v_first_appt_id,
      jsonb_build_object(
        'booking_group_id',     v_group_id,
        'client_user_id',       _client_user_id,
        'client_id',            v_client_id,
        'pet_ids',              _pet_ids,
        'pet_count',            v_pet_count,
        'primary_service_id',   _primary_service_id,
        'secondary_service_id', _secondary_service_id,
        'provider_ids',         _provider_ids,
        'booking_date',         _booking_date,
        'start_time_slot',      _start_time_slot,
        'total_duration',       v_cumulative_minutes,
        'appointment_ids',      to_jsonb(v_appointment_ids)
      )::text
    );
  END IF;

  RAISE NOTICE '[create_booking_admin_multi_pet] SUCCESS: group=%, appointments=%, total_duration=%min',
    v_group_id, v_appointment_ids, v_cumulative_minutes;

  RETURN v_group_id;

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '[create_booking_admin_multi_pet] ERROR: % - %', SQLSTATE, SQLERRM;
    RAISE;
END;
$function$;

COMMENT ON FUNCTION public.create_booking_admin_multi_pet(
  UUID, UUID[], UUID, UUID, UUID[], DATE, TIME, INTEGER[], NUMERIC[], TEXT, UUID
) IS
  'Admin-side multi-pet booking. Creates N sequential appointments sharing a '
  'booking_group_id. Delegates per-pet logic to create_admin_booking_with_dual_services. '
  'Supports primary + secondary service shared across all pets. Addons and '
  'extra-fee are v2. All-or-nothing: rolls back entirely if any pet fails. '
  'Returns group UUID.';
