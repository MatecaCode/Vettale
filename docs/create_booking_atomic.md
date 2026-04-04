# `create_booking_atomic` — Function Reference

**Schema:** `public`
**Language:** PL/pgSQL
**Security:** `SECURITY DEFINER` (runs as the `postgres` owner role)
**Last modified:** Item 22/23 security hardening

---

## Purpose

`create_booking_atomic` is the single database function responsible for creating a
client appointment. It is called by `create_booking_client` (the RPC exposed to the
frontend) and performs everything needed for a valid booking in one transaction:

1. Resolves the client record from the authenticated user
2. Loads primary and optional secondary service metadata
3. Determines the correct price — including **enforcing `NULL` for first-visit pets**
4. Inserts the `appointments` row
5. Inserts `appointment_services` rows (primary + optional secondary)
6. Inserts `appointment_staff` rows with the correct role labels
7. Reserves the required `staff_availability` time slots, and **rolls back the entire
   transaction** if not enough slots are available

Because it is `SECURITY DEFINER`, it runs with the privileges of the `postgres` owner
regardless of which role calls it. This means RLS policies on the tables it writes
to are bypassed for the writes it performs — intentionally, since the function itself
enforces all business rules.

---

## Signature

```sql
CREATE OR REPLACE FUNCTION public.create_booking_atomic(
  _user_id              uuid,
  _pet_id               uuid,
  _service_id           uuid,
  _provider_ids         uuid[],
  _booking_date         date,
  _time_slot            time without time zone,
  _notes                text    DEFAULT NULL,
  _calculated_price     numeric DEFAULT NULL,
  _calculated_duration  integer DEFAULT NULL,
  _secondary_service_id uuid    DEFAULT NULL
)
RETURNS uuid
```

Returns the `uuid` of the newly created appointment.

---

## Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `_user_id` | `uuid` | ✅ | `auth.uid()` of the booking client. Used to look up the `clients` record. |
| `_pet_id` | `uuid` | ✅ | The pet being booked. The function reads `pets.is_first_visit` from this row. |
| `_service_id` | `uuid` | ✅ | Primary service to book. |
| `_provider_ids` | `uuid[]` | ✅ | Ordered array of staff profile IDs. `[0]` = primary staff, `[1]` = secondary staff (if applicable). Pass `'{}'` when no staff is required. |
| `_booking_date` | `date` | ✅ | Calendar date of the appointment (`YYYY-MM-DD`). |
| `_time_slot` | `time` | ✅ | Start time of the appointment (`HH:MM:SS`). |
| `_notes` | `text` | — | Optional client notes. Stored on the appointment row. |
| `_calculated_price` | `numeric` | — | Price calculated by the frontend (from `service_pricing` lookup). **See security note — this value is only used for non-first-visit pets.** Defaults to `NULL`. |
| `_calculated_duration` | `integer` | — | Duration in minutes calculated by the frontend. Falls back to service defaults if omitted. |
| `_secondary_service_id` | `uuid` | — | Optional second service (e.g. Tosa after a Banho). Triggers a second `appointment_services` row and sequential slot reservation. |

---

## Execution Flow

```
1. Resolve client_id from user_id
        ↓
2. Load primary service row → get base_price, default_duration, role flags
        ↓
3. If _secondary_service_id provided → load secondary service row
        ↓
4. Compute v_total_dur
   = COALESCE(_calculated_duration, primary_dur + secondary_dur)
        ↓
5. Read pets.is_first_visit from DB   ← SECURITY CHECKPOINT
        ↓
6. Compute v_total_price
   ┌─ is_first_visit = TRUE  → NULL   (clinic quotes after evaluation)
   └─ is_first_visit = FALSE → COALESCE(_calculated_price, base_price_sum)
        ↓
7. INSERT into appointments
        ↓
8. INSERT into appointment_services (primary, then secondary if present)
        ↓
9. INSERT into appointment_staff (primary, then secondary if present)
        ↓
10. UPDATE staff_availability → mark slots as unavailable
    ├─ Primary window:   [start_ts … start_ts + primary_dur)
    └─ Secondary window: [start_ts + primary_dur … start_ts + primary_dur + secondary_dur)
        ↓
11. Validate slot count — RAISE EXCEPTION if not enough slots reserved
        ↓
12. RETURN appointment_id
```

If any step raises an exception the entire transaction is rolled back — no partial
appointment is left in the database.

---

## Price Logic & Security

### Why the frontend price is not blindly trusted

`_calculated_price` is supplied by the client browser. A malicious or modified client
could send any value — including `NULL` to fake a first-visit discount, or an
artificially low number. The function therefore:

1. **Reads `pets.is_first_visit` directly from the database** — not from the request payload.
2. **If `is_first_visit = TRUE`**: stores `NULL` unconditionally, ignoring whatever
   `_calculated_price` the client sent.
3. **If `is_first_visit = FALSE`**: uses `COALESCE(_calculated_price, base_price_sum)`.
   A client that sends `NULL` here gets the service's base prices — never a free booking.

```sql
SELECT is_first_visit INTO v_is_first_visit
FROM public.pets
WHERE id = _pet_id;

IF COALESCE(v_is_first_visit, false) = true THEN
  v_total_price := NULL;
ELSE
  v_total_price := COALESCE(_calculated_price, v_price_primary + v_price_secondary);
END IF;
```

### `NULL` total_price meaning

A `NULL` value in `appointments.total_price` means the appointment is a **first visit**
and the price has not yet been determined. The admin interface displays an amber
**"Primeira visita"** badge wherever a price would normally appear.

Once the appointment is completed and the status flips to `'completed'`, the trigger
`trg_flip_first_visit_on_completion` sets `pets.is_first_visit = FALSE` — future
bookings for this pet will use normal fixed pricing.

---

## Staff Role Labels

The function maps service requirement flags to Brazilian role labels written into
`appointment_staff.role`:

| Flag on `services` | Role label stored |
|---|---|
| `requires_bath = true` | `'banhista'` |
| `requires_grooming = true` | `'tosador'` |
| `requires_vet = true` | `'veterinario'` |
| *(none of the above)* | `'primary'` / `'secondary'` |

---

## Slot Reservation

Available 10-minute blocks in `staff_availability` are reserved by setting
`available = FALSE` and `reserved_appointment_id = <new appointment id>`.

The function calculates how many blocks are expected:

```
expected_primary   = CEIL(primary_duration   / 10)
expected_secondary = CEIL(secondary_duration / 10)
```

If fewer blocks are updated than expected (race condition — another booking grabbed
a slot between the frontend check and the insert), the function raises an exception
and the entire transaction rolls back. The client receives an error and must pick a
different time slot.

---

## Error Cases

| Condition | Exception message |
|---|---|
| No `clients` row for `_user_id` | `Client record not found for user: <uuid>` |
| Primary service not found | `Primary service not found: <uuid>` |
| Secondary service not found | `Secondary service not found: <uuid>` |
| Too few primary slots reserved | `Not enough primary slots reserved (expected N, got M)` |
| Too few secondary slots reserved | `Not enough secondary slots reserved (expected N, got M)` |

---

## Who calls this function

```
create_booking_client   (RPC exposed to frontend)
        └── create_booking_atomic   (this function)
```

`create_booking_client` wraps this function and additionally emits an admin
notification after the booking succeeds (best-effort — a notification failure never
rolls back the booking).

The admin booking flow uses a separate RPC (`create_unified_admin_booking`) and does
**not** call `create_booking_atomic`. Admin bookings always use a fixed price and
intentionally bypass `is_first_visit` logic.

---

## Related database objects

| Object | Type | Relationship |
|---|---|---|
| `create_booking_client` | Function | Caller — wraps this function |
| `trg_flip_first_visit_on_completion` | Trigger | Fires after an appointment reaches `'completed'`; flips `pets.is_first_visit` to `FALSE` |
| `trg_protect_is_first_visit` | Trigger | BEFORE UPDATE on `pets`; prevents non-admin, non-system changes to `is_first_visit` |
| `update_pet_first_visit_flag` | Function | Trigger function for the above |
| `service_pricing` | Table | Source of the price range shown to the client in the frontend (read by `getServicePriceRange()` in `src/utils/firstVisitPricing.ts`) |
| `staff_availability` | Table | Rows updated by this function to reserve time slots |
| `appointment_services` | Table | Child rows inserted by this function |
| `appointment_staff` | Table | Child rows inserted by this function |
