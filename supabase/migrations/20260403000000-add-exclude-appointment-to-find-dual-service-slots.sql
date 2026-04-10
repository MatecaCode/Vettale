-- Add _exclude_appointment_id to find_dual_service_slots.
-- When editing a booking the caller passes the appointment being edited so
-- its own blocked slots are treated as virtually free ("self-conflict" fix).

DROP FUNCTION IF EXISTS public.find_dual_service_slots(date, uuid, uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.find_dual_service_slots(
  _date                   date,
  _primary_staff_id       uuid,
  _primary_service_id     uuid,
  _secondary_staff_id     uuid DEFAULT NULL::uuid,
  _secondary_service_id   uuid DEFAULT NULL::uuid,
  _exclude_appointment_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(start_time time without time zone)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_dur1 integer;
  v_dur2 integer;
  v_primary_count integer;
  v_secondary_count integer;
  v_primary_start time;
  v_primary_end time;
  v_secondary_start time;
  v_secondary_end time;
  v_time time;
  v_primary_available boolean;
  v_excl_active    boolean := FALSE;
  v_excl_pri_staff uuid;
  v_excl_sec_staff uuid;
  v_excl_pri_dur   integer;
  v_excl_sec_dur   integer;
  v_excl_pri_start time;
  v_excl_pri_end   time;
  v_excl_sec_start time;
  v_excl_sec_end   time;
  v_excl_date      date;
  v_excl_time      time;
BEGIN
  SELECT default_duration INTO v_dur1 FROM services WHERE id = _primary_service_id;
  IF _secondary_service_id IS NOT NULL THEN
    SELECT default_duration INTO v_dur2 FROM services WHERE id = _secondary_service_id;
  ELSE
    v_dur2 := 0;
  END IF;

  IF _exclude_appointment_id IS NOT NULL THEN
    SELECT a.date, a.time
    INTO   v_excl_date, v_excl_time
    FROM   appointments a
    WHERE  a.id = _exclude_appointment_id;

    IF v_excl_date = _date THEN
      v_excl_active := TRUE;

      SELECT ast.staff_profile_id,
             COALESCE(aps.duration, s.default_duration, 0)
      INTO   v_excl_pri_staff, v_excl_pri_dur
      FROM   appointment_services aps
      JOIN   services s ON s.id = aps.service_id
      LEFT JOIN appointment_staff ast
              ON  ast.appointment_id = aps.appointment_id
              AND ast.service_id     = aps.service_id
      WHERE  aps.appointment_id = _exclude_appointment_id
        AND  aps.service_order  = 1;

      v_excl_pri_dur   := COALESCE(v_excl_pri_dur, 0);
      v_excl_pri_start := v_excl_time;
      v_excl_pri_end   := (v_excl_time + (v_excl_pri_dur || ' minutes')::interval)::time;

      SELECT ast.staff_profile_id,
             COALESCE(aps.duration, s.default_duration, 0)
      INTO   v_excl_sec_staff, v_excl_sec_dur
      FROM   appointment_services aps
      JOIN   services s ON s.id = aps.service_id
      LEFT JOIN appointment_staff ast
              ON  ast.appointment_id = aps.appointment_id
              AND ast.service_id     = aps.service_id
      WHERE  aps.appointment_id = _exclude_appointment_id
        AND  aps.service_order  = 2;

      v_excl_sec_dur   := COALESCE(v_excl_sec_dur, 0);
      v_excl_sec_start := v_excl_pri_end;
      v_excl_sec_end   := (v_excl_sec_start + (v_excl_sec_dur || ' minutes')::interval)::time;
    END IF;
  END IF;

  FOR v_time IN
    SELECT time '08:00' + (i * interval '10 minutes')
    FROM   generate_series(0, 54) i
    WHERE  time '08:00' + (i * interval '10 minutes') <= time '17:00'
  LOOP
    SELECT COALESCE(sa.available, FALSE)
    INTO   v_primary_available
    FROM   staff_availability sa
    WHERE  sa.staff_profile_id = _primary_staff_id
      AND  sa.date      = _date
      AND  sa.time_slot  = v_time;

    IF NOT COALESCE(v_primary_available, FALSE) AND v_excl_active THEN
      IF (_primary_staff_id = v_excl_pri_staff
          AND v_time >= v_excl_pri_start AND v_time < v_excl_pri_end)
         OR
         (v_excl_sec_dur > 0
          AND _primary_staff_id = v_excl_sec_staff
          AND v_time >= v_excl_sec_start AND v_time < v_excl_sec_end)
      THEN
        v_primary_available := TRUE;
      END IF;
    END IF;

    IF COALESCE(v_primary_available, FALSE) THEN
      v_primary_start := v_time;
      v_primary_end   := (v_time + (v_dur1 || ' minutes')::interval)::time;

      SELECT count(*) INTO v_primary_count
      FROM   staff_availability sa
      WHERE  sa.staff_profile_id = _primary_staff_id
        AND  sa.date      = _date
        AND  sa.time_slot >= v_primary_start
        AND  sa.time_slot <  v_primary_end
        AND  (
          sa.available = TRUE
          OR (
            v_excl_active AND (
              (_primary_staff_id = v_excl_pri_staff
               AND sa.time_slot >= v_excl_pri_start AND sa.time_slot < v_excl_pri_end)
              OR
              (v_excl_sec_dur > 0
               AND _primary_staff_id = v_excl_sec_staff
               AND sa.time_slot >= v_excl_sec_start AND sa.time_slot < v_excl_sec_end)
            )
          )
        );

      IF v_primary_count >= (v_dur1 / 10) THEN
        IF v_dur2 > 0 AND _secondary_staff_id IS NOT NULL THEN
          v_secondary_start := v_primary_end;
          v_secondary_end   := (v_secondary_start + (v_dur2 || ' minutes')::interval)::time;

          SELECT count(*) INTO v_secondary_count
          FROM   staff_availability sa
          WHERE  sa.staff_profile_id = _secondary_staff_id
            AND  sa.date      = _date
            AND  sa.time_slot >= v_secondary_start
            AND  sa.time_slot <  v_secondary_end
            AND  (
              sa.available = TRUE
              OR (
                v_excl_active AND (
                  (_secondary_staff_id = v_excl_pri_staff
                   AND sa.time_slot >= v_excl_pri_start AND sa.time_slot < v_excl_pri_end)
                  OR
                  (v_excl_sec_dur > 0
                   AND _secondary_staff_id = v_excl_sec_staff
                   AND sa.time_slot >= v_excl_sec_start AND sa.time_slot < v_excl_sec_end)
                )
              )
            );

          IF v_secondary_count >= (v_dur2 / 10) THEN
            RETURN QUERY SELECT v_time;
          END IF;
        ELSE
          RETURN QUERY SELECT v_time;
        END IF;
      END IF;
    END IF;
  END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.find_dual_service_slots TO authenticated;

COMMENT ON FUNCTION public.find_dual_service_slots IS
'Returns valid start times for a dual-service booking.
Optional _exclude_appointment_id treats that appointment''s blocked slots as free
(used during edit to avoid self-conflict).';
