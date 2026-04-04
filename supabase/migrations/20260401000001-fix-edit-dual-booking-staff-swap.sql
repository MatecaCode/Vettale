-- Rewrite edit_admin_booking_with_dual_services to properly handle staff swaps.
--
-- Problems with the original function:
-- 1. No _new_staff_ids parameter — frontend passed it but Postgres silently ignored it.
-- 2. Slot freeing/blocking only triggered on date/time change, never on pure staff swap.
-- 3. appointment_staff table was never updated — the old person stayed assigned.
--
-- New behaviour:
-- • Accepts _new_staff_ids uuid[] where [1]=primary staff, [2]=secondary staff.
-- • Detects date_time_changed OR staff_changed independently.
-- • On any change: frees OLD staff slots at OLD date/time, blocks NEW staff slots at NEW date/time.
-- • Updates appointment_staff rows when staff actually changes.

CREATE OR REPLACE FUNCTION public.edit_admin_booking_with_dual_services(
    _appointment_id     uuid,
    _new_date           date,
    _new_time           time,
    _new_duration       integer  DEFAULT NULL,
    _extra_fee          numeric  DEFAULT NULL,
    _admin_notes        text     DEFAULT NULL,
    _edit_reason        text     DEFAULT NULL,
    _edited_by          uuid     DEFAULT NULL,
    _force_override     boolean  DEFAULT FALSE,
    _new_staff_ids      uuid[]   DEFAULT NULL   -- [1]=primary staff, [2]=secondary staff
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    appointment_record      record;
    -- current (old) state
    old_primary_staff_id    uuid;
    old_secondary_staff_id  uuid;
    primary_service_id      uuid;
    secondary_service_id    uuid;
    primary_service_duration   integer;
    secondary_service_duration integer;
    old_duration            integer;
    old_date                date;
    old_time                time;
    -- new (desired) state
    new_primary_staff_id    uuid;
    new_secondary_staff_id  uuid;
    new_total_duration      integer;
    -- loop helpers
    check_time              time;
    check_minutes           integer;
    slots_freed             integer := 0;
    slots_blocked           integer := 0;
    admin_user_id           uuid;
    date_time_changed       boolean;
    staff_changed           boolean;
BEGIN
    RAISE NOTICE '[EDIT_DUAL_BOOKING] Starting for appointment %', _appointment_id;

    IF _appointment_id IS NULL THEN
        RAISE EXCEPTION '[EDIT_DUAL_BOOKING] Appointment ID cannot be NULL';
    END IF;

    IF _edited_by IS NULL THEN
        SELECT get_admin_user_id() INTO admin_user_id;
    ELSE
        admin_user_id := _edited_by;
    END IF;

    -- ── Load current appointment ──────────────────────────────────────────────
    SELECT * INTO appointment_record FROM appointments WHERE id = _appointment_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION '[EDIT_DUAL_BOOKING] Appointment % not found', _appointment_id;
    END IF;

    old_duration := appointment_record.duration;
    old_date     := appointment_record.date;
    old_time     := appointment_record.time;

    -- ── Load primary service assignment (service_order = 1) ──────────────────
    SELECT
        ast.staff_profile_id,
        aps.service_id,
        aps.duration
    INTO old_primary_staff_id, primary_service_id, primary_service_duration
    FROM appointment_services aps
    LEFT JOIN appointment_staff ast
        ON  ast.appointment_id = aps.appointment_id
        AND ast.service_id     = aps.service_id
    WHERE aps.appointment_id = _appointment_id
      AND aps.service_order  = 1;

    IF primary_service_id IS NULL THEN
        RAISE EXCEPTION '[EDIT_DUAL_BOOKING] Primary service (order=1) not found for appointment %', _appointment_id;
    END IF;

    -- ── Load secondary service assignment (service_order = 2) ────────────────
    SELECT
        ast.staff_profile_id,
        aps.service_id,
        aps.duration
    INTO old_secondary_staff_id, secondary_service_id, secondary_service_duration
    FROM appointment_services aps
    LEFT JOIN appointment_staff ast
        ON  ast.appointment_id = aps.appointment_id
        AND ast.service_id     = aps.service_id
    WHERE aps.appointment_id = _appointment_id
      AND aps.service_order  = 2;

    secondary_service_duration := COALESCE(secondary_service_duration, 0);

    -- ── Resolve new staff (fall back to current if not supplied) ─────────────
    new_primary_staff_id := COALESCE(
        CASE WHEN array_length(_new_staff_ids, 1) >= 1 THEN _new_staff_ids[1] END,
        old_primary_staff_id
    );
    new_secondary_staff_id := COALESCE(
        CASE WHEN array_length(_new_staff_ids, 1) >= 2 THEN _new_staff_ids[2] END,
        old_secondary_staff_id
    );

    -- ── Resolve new total duration ────────────────────────────────────────────
    IF _new_duration IS NOT NULL AND _new_duration > 0 THEN
        new_total_duration := _new_duration;
    ELSE
        new_total_duration := primary_service_duration + secondary_service_duration;
    END IF;

    -- ── Detect what actually changed ──────────────────────────────────────────
    date_time_changed := (old_date != _new_date OR old_time != _new_time);
    staff_changed     := (
        new_primary_staff_id   IS DISTINCT FROM old_primary_staff_id OR
        new_secondary_staff_id IS DISTINCT FROM old_secondary_staff_id
    );

    RAISE NOTICE '[EDIT_DUAL_BOOKING] date_time_changed=%, staff_changed=%', date_time_changed, staff_changed;
    RAISE NOTICE '[EDIT_DUAL_BOOKING] primary  staff: % -> %', old_primary_staff_id, new_primary_staff_id;
    RAISE NOTICE '[EDIT_DUAL_BOOKING] secondary staff: % -> %', old_secondary_staff_id, new_secondary_staff_id;

    -- ── 1. Free OLD staff slots at OLD date/time ──────────────────────────────
    --    Triggered by either date/time change OR staff change.
    IF date_time_changed OR staff_changed THEN
        RAISE NOTICE '[EDIT_DUAL_BOOKING] Freeing old slots: date=% time=%', old_date, old_time;

        -- Primary staff old slots
        IF old_primary_staff_id IS NOT NULL THEN
            check_minutes := 0;
            WHILE check_minutes < primary_service_duration LOOP
                check_time := old_time + (check_minutes || ' minutes')::interval;
                UPDATE staff_availability
                SET available = TRUE, updated_at = now()
                WHERE staff_profile_id = old_primary_staff_id
                  AND date            = old_date
                  AND time_slot       = check_time;
                IF FOUND THEN slots_freed := slots_freed + 1; END IF;
                check_minutes := check_minutes + 10;
            END LOOP;
        END IF;

        -- Secondary staff old slots (only if different person)
        IF old_secondary_staff_id IS NOT NULL
           AND old_secondary_staff_id != old_primary_staff_id
           AND secondary_service_duration > 0 THEN
            check_minutes := 0;
            WHILE check_minutes < secondary_service_duration LOOP
                check_time := old_time + (primary_service_duration + check_minutes || ' minutes')::interval;
                UPDATE staff_availability
                SET available = TRUE, updated_at = now()
                WHERE staff_profile_id = old_secondary_staff_id
                  AND date            = old_date
                  AND time_slot       = check_time;
                IF FOUND THEN slots_freed := slots_freed + 1; END IF;
                check_minutes := check_minutes + 10;
            END LOOP;
        END IF;

        RAISE NOTICE '[EDIT_DUAL_BOOKING] Freed % slots', slots_freed;
    END IF;

    -- ── 2. Update appointment_staff when staff changed ────────────────────────
    IF staff_changed THEN
        IF new_primary_staff_id IS DISTINCT FROM old_primary_staff_id THEN
            UPDATE appointment_staff
            SET    staff_profile_id = new_primary_staff_id
            WHERE  appointment_id   = _appointment_id
              AND  service_id       = primary_service_id;
            RAISE NOTICE '[EDIT_DUAL_BOOKING] Primary staff updated: % -> %', old_primary_staff_id, new_primary_staff_id;
        END IF;

        IF new_secondary_staff_id IS DISTINCT FROM old_secondary_staff_id
           AND secondary_service_id IS NOT NULL THEN
            UPDATE appointment_staff
            SET    staff_profile_id = new_secondary_staff_id
            WHERE  appointment_id   = _appointment_id
              AND  service_id       = secondary_service_id;
            RAISE NOTICE '[EDIT_DUAL_BOOKING] Secondary staff updated: % -> %', old_secondary_staff_id, new_secondary_staff_id;
        END IF;
    END IF;

    -- ── 3. Update appointment row ─────────────────────────────────────────────
    UPDATE appointments
    SET date     = _new_date,
        time     = _new_time,
        duration = new_total_duration,
        extra_fee = COALESCE(_extra_fee, extra_fee),
        notes    = COALESCE(_admin_notes, notes),
        updated_at = now()
    WHERE id = _appointment_id;

    RAISE NOTICE '[EDIT_DUAL_BOOKING] Appointment row updated';

    -- ── 4. Block NEW staff slots at NEW date/time ─────────────────────────────
    IF date_time_changed OR staff_changed THEN
        RAISE NOTICE '[EDIT_DUAL_BOOKING] Blocking new slots: date=% time=%', _new_date, _new_time;

        -- Primary staff new slots
        IF new_primary_staff_id IS NOT NULL THEN
            check_minutes := 0;
            WHILE check_minutes < primary_service_duration LOOP
                check_time := _new_time + (check_minutes || ' minutes')::interval;
                IF _force_override THEN
                    UPDATE staff_availability
                    SET available = FALSE, updated_at = now()
                    WHERE staff_profile_id = new_primary_staff_id
                      AND date            = _new_date
                      AND time_slot       = check_time;
                ELSE
                    UPDATE staff_availability
                    SET available = FALSE, updated_at = now()
                    WHERE staff_profile_id = new_primary_staff_id
                      AND date            = _new_date
                      AND time_slot       = check_time
                      AND available       = TRUE;
                    IF NOT FOUND THEN
                        RAISE EXCEPTION '[EDIT_DUAL_BOOKING] Primary staff % not available at date=% time=%',
                            new_primary_staff_id, _new_date, check_time;
                    END IF;
                END IF;
                IF FOUND THEN slots_blocked := slots_blocked + 1; END IF;
                check_minutes := check_minutes + 10;
            END LOOP;
        END IF;

        -- Secondary staff new slots (only if different person)
        IF new_secondary_staff_id IS NOT NULL
           AND new_secondary_staff_id != new_primary_staff_id
           AND secondary_service_duration > 0 THEN
            check_minutes := 0;
            WHILE check_minutes < secondary_service_duration LOOP
                check_time := _new_time + (primary_service_duration + check_minutes || ' minutes')::interval;
                IF _force_override THEN
                    UPDATE staff_availability
                    SET available = FALSE, updated_at = now()
                    WHERE staff_profile_id = new_secondary_staff_id
                      AND date            = _new_date
                      AND time_slot       = check_time;
                ELSE
                    UPDATE staff_availability
                    SET available = FALSE, updated_at = now()
                    WHERE staff_profile_id = new_secondary_staff_id
                      AND date            = _new_date
                      AND time_slot       = check_time
                      AND available       = TRUE;
                    IF NOT FOUND THEN
                        RAISE EXCEPTION '[EDIT_DUAL_BOOKING] Secondary staff % not available at date=% time=%',
                            new_secondary_staff_id, _new_date, check_time;
                    END IF;
                END IF;
                IF FOUND THEN slots_blocked := slots_blocked + 1; END IF;
                check_minutes := check_minutes + 10;
            END LOOP;
        END IF;

        RAISE NOTICE '[EDIT_DUAL_BOOKING] Blocked % slots', slots_blocked;
    END IF;

    -- ── 5. Audit log ──────────────────────────────────────────────────────────
    INSERT INTO appointment_events (appointment_id, event_type, notes)
    VALUES (
        _appointment_id,
        'edited',
        format(
            'Dual-service edit: duration %->%min, date %->%, time %->%, primary staff %->%, secondary staff %->%',
            old_duration, new_total_duration,
            old_date, _new_date,
            old_time, _new_time,
            old_primary_staff_id, new_primary_staff_id,
            old_secondary_staff_id, new_secondary_staff_id
        )
    );

    IF admin_user_id IS NOT NULL THEN
        INSERT INTO admin_actions (admin_user_id, action_type, target_appointment_id, details)
        VALUES (
            admin_user_id, 'edit_dual_booking', _appointment_id,
            json_build_object(
                'old_duration',           old_duration,
                'new_duration',           new_total_duration,
                'old_date',               old_date,
                'new_date',               _new_date,
                'old_time',               old_time,
                'new_time',               _new_time,
                'old_primary_staff_id',   old_primary_staff_id,
                'new_primary_staff_id',   new_primary_staff_id,
                'old_secondary_staff_id', old_secondary_staff_id,
                'new_secondary_staff_id', new_secondary_staff_id,
                'extra_fee',              _extra_fee,
                'admin_notes',            _admin_notes,
                'edit_reason',            _edit_reason,
                'force_override',         _force_override,
                'slots_freed',            slots_freed,
                'slots_blocked',          slots_blocked
            )::text
        );
    END IF;

    RAISE NOTICE '[EDIT_DUAL_BOOKING] ✓ Done for %. Freed %, blocked % slots.', _appointment_id, slots_freed, slots_blocked;

EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION '[EDIT_DUAL_BOOKING] ✗ Failed for appointment %: % (SQLSTATE: %)',
            _appointment_id, SQLERRM, SQLSTATE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.edit_admin_booking_with_dual_services TO authenticated;

COMMENT ON FUNCTION public.edit_admin_booking_with_dual_services IS
'Edits dual-service appointments. Handles date/time changes, staff swaps, or both.
_new_staff_ids[1]=primary staff, _new_staff_ids[2]=secondary staff.
On any change: frees old staff slots, updates appointment_staff, blocks new staff slots.';
