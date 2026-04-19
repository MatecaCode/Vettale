# Multi-Pet Booking — Proposal & Implementation Plan

**Status:** Proposal — §11 decisions confirmed 2026-04-19; awaiting go-ahead to start PR 1
**Author:** Drafted 2026-04-19
**Scope:** Admin-side booking enhancement. Client-side may follow later.
**Core requirement:** Allow a single booking to cover 2+ pets belonging to the same client, reusing the existing pricing/duration formula per pet, without impacting how the calendar currently works.

---

## 1. Guiding Principles

1. **Do not break the single-pet flow.** It works today. The multi-pet path must be strictly additive — a new code path triggered only when the admin explicitly opts in by adding a second pet.
2. **Reuse, do not rewrite, the pricing/duration formula.** The per-pet calculation (`PricingService.calculatePricing`) stays identical. We only call it N times instead of once.
3. **No behavior change to the calendar math for now.** If three pets each need 1h, the booking consumes 3h of the same staff's time, sequentially. No parallelization, no overlap logic — this is equivalent to three back-to-back single-pet bookings, bundled into one administrative record.
4. **Same staff across all pets in the booking.** This is the product requirement — the whole point is "same banhista, same tosador for all my pets." We do NOT solve the hard problem of assigning different staff to different pets in one booking. That's a v2 concern.
5. **Keep the legacy `appointments.pet_id` populated.** Every existing query, report, trigger, RLS policy, and downstream integration reads from it. Breaking this column = breaking the app.
6. **Ship behind an explicit trigger.** The multi-pet UI only appears when the selected client has 2+ active pets AND the admin clicks "Add another pet."

---

## 2. Current System — What Must Not Break

These are the load-bearing facts from the current architecture ([map compiled during this proposal](./MULTI_PET_BOOKING_PROPOSAL.md)):

- **Schema:** `appointments.pet_id` is a NOT-NULL FK to `pets.id`. One pet per appointment is a hard DB constraint.
- **Duration formula:** Lives in [pricingService.ts](src/services/pricingService.ts) — breed+size lookup in `service_pricing`, fallback cascade to `services.default_duration`. Returns `{price, duration, priceSource}` per (service, pet) pair.
- **Calendar slotting:** 10-min backend granularity in `staff_availability`. `getRequiredBackendSlots(startTime, totalDuration)` reserves contiguous slots. ([timeSlotHelpers.ts](src/utils/timeSlotHelpers.ts))
- **Admin booking RPC:** `create_booking_admin(_pet_id UUID, ...)` — single pet signature. Enforces conflicts, supports override, writes `admin_override_slots`, audit logs to `admin_actions`.
- **Client booking RPC:** `create_booking_client(_pet_id UUID, ...)` — same shape.
- **First-visit trigger:** `pets.is_first_visit` is flipped by a `SECURITY DEFINER` trigger on appointment completion. This MUST still fire once per pet.
- **Appointment staff:** `appointment_staff` is already a junction table (1 appointment → N staff by role). Good — we can reuse this.
- **Dual-service:** `appointment_services` already supports primary + secondary service rows per appointment. Also reusable.

---

## 3. The Core Design Question

**Should a multi-pet booking be ONE appointment row or N appointment rows?**

Two options, each with trade-offs:

### Option A — One `appointments` row, new `appointment_pets` junction

- Add `appointment_pets(appointment_id, pet_id, display_order, per_pet_duration, per_pet_price)` junction table.
- Keep `appointments.pet_id` = first/primary pet (for backward compat).
- `appointments.duration` = SUM of per-pet durations. `appointments.total_price` = SUM of per-pet prices.
- Pros: Single calendar event. Single "booking" concept in admin UI. Cleanest from the user's mental model ("one visit, multiple pets").
- Cons: Every screen that shows "pet name" needs to handle "multiple pet names." Reports that group by `pet_id` understate multi-pet bookings. First-visit trigger has to iterate the junction. RLS policies on `appointments` need to be re-examined so pet-owners still see bookings that reference their pet through the junction.

### Option B — N linked `appointments` rows, grouped by a `booking_group_id`

- Add `appointments.booking_group_id UUID NULL` (self-referential grouping).
- Create one appointment row per pet. Each row has its own `pet_id`, its own duration/price computed from the formula.
- The group shares `client_id`, `booking_date`, starting `time_slot` (slots assigned sequentially: pet 1 at 09:00, pet 2 at 09:00 + pet-1-duration, etc.), and `appointment_staff` mirrored across all rows.
- Pros: Zero schema disruption to existing queries. Every pet gets its own first-visit trigger firing naturally. Per-pet reports keep working. Each appointment is still one-pet, matching today's invariant. Easy to "unbundle" if the admin later needs to cancel just one pet.
- Cons: Admin UI must render the group as a single unit (list view filters, calendar coalescing). Slightly more write amplification (3 pets = 3 rows + 3x `appointment_staff` + 3x `appointment_services`).

### Recommendation — **Option B**

Option B is strictly safer. Every load-bearing piece of the current system keeps working on day one because the one-pet-per-appointment invariant is preserved at the row level. The "booking" becomes a presentation-layer concept (group by `booking_group_id`) rather than a schema change that cascades through RLS, triggers, and reports.

The user's own instinct aligns with this: *"I envision the implementation being a little bit separate from the current booking system."* Option B literally is that — it's N normal bookings that happen to share an ID.

---

## 4. Proposed Schema Changes (minimal)

```sql
-- New column, nullable. Single-pet bookings leave it NULL.
ALTER TABLE appointments
  ADD COLUMN booking_group_id UUID NULL;

CREATE INDEX idx_appointments_booking_group
  ON appointments(booking_group_id)
  WHERE booking_group_id IS NOT NULL;

-- Optional: display order within the group, for UI rendering.
ALTER TABLE appointments
  ADD COLUMN booking_group_order SMALLINT NULL;
```

That's it. No new tables, no FK changes, no trigger changes, no RLS rewrites. Everything else is application logic.

---

## 5. Proposed RPC — New, Not Modified

Create a **new** RPC: `create_booking_admin_multi_pet(...)`. Do **not** modify `create_booking_admin`.

```
create_booking_admin_multi_pet(
  _client_user_id UUID,
  _pet_ids UUID[],              -- ordered: first pet starts at _time_slot
  _service_id UUID,
  _secondary_service_id UUID,   -- nullable
  _provider_ids UUID[],         -- same staff for all pets
  _booking_date DATE,
  _start_time_slot TIME,
  _per_pet_durations INTEGER[], -- computed client-side, one per pet (primary+secondary summed per pet)
  _per_pet_prices NUMERIC[],
  _override_conflicts BOOLEAN
) RETURNS UUID  -- returns booking_group_id
```

Behavior:
1. Validate all `_pet_ids` belong to `_client_user_id`. Raise otherwise.
2. Generate `_group_id = gen_random_uuid()`.
3. Loop over pets in order:
   - Compute `pet_start = _start_time_slot + SUM(durations of prior pets)`.
   - Call the existing `create_booking_atomic` internals OR inline the same logic, passing `booking_group_id = _group_id` and `booking_group_order = i`.
   - Each iteration writes its own `appointments`, `appointment_services`, `appointment_staff`, and consumes its own `staff_availability` slots.
4. If any iteration fails, the whole transaction rolls back (already atomic in PG by default).
5. Audit log: one `admin_actions` entry referencing the group, not N entries.

This keeps the blast radius to one new function. Existing `create_booking_admin` is untouched and will keep working for every single-pet booking that ever happens.

---

## 6. Frontend Changes (Admin)

File: [AdminBookingPage.tsx](src/pages/AdminBookingPage.tsx)

### 6a. Pet selector
- Replace single-pet dropdown with a list that supports add/remove.
- "Add another pet" button appears **only if** `clientPets.length >= 2` AND at least one pet is already selected.
- Removing a pet is allowed down to a minimum of 1. If the admin removes all but one, we silently fall back to the single-pet flow (call `create_booking_admin`, not the multi-pet RPC).

### 6b. Duration/price preview
- For each selected pet, call `PricingService.calculatePricing` with that pet's breed+size and the chosen service(s).
- Show a per-pet line: `Rex (Golden, M) — Banho Completo — 75 min — R$ 120`.
- Show a total line: `3 pets · 210 min · R$ 360`.
- If any pet has `is_first_visit = true`, show "price to be quoted after evaluation" for that pet (matching current behavior).

### 6c. Calendar
- No changes to slot selection UI. The admin picks ONE start time. The preview shows the total span visually (e.g., "09:00 – 12:30" for 210 min).
- Availability check: the frontend computes total duration and asks the availability summary for the full contiguous block, exactly as today. No new RPC needed for the availability preview.

### 6d. Review modal
- Show all pets listed with their individual durations and the group total.
- Submit calls the **new** multi-pet RPC only if `selectedPets.length > 1`. Otherwise, fall through to the existing single-pet path unchanged.

### 6e. Calendar / list rendering (read side)
- The admin calendar/list view needs to coalesce rows sharing a `booking_group_id` into a single visual block with a "3 pets" badge, expandable to show each pet. This is cosmetic and can ship in a follow-up PR — if it doesn't ship day one, the calendar will simply show three adjacent bookings with the same client, which is not wrong, just verbose.

---

## 7. What Stays Identical

- `PricingService.calculatePricing` — no changes.
- `services`, `service_pricing`, `breeds`, `pets`, `clients` tables — no changes.
- `staff_availability` 10-min slot model — no changes.
- `create_booking_admin`, `create_booking_client`, `create_booking_atomic` — no changes.
- `appointment_staff`, `appointment_services` — no changes.
- First-visit trigger — no changes (fires naturally per pet, per appointment row).
- Admin override logic and `admin_override_slots` — no changes.
- Client-side booking flow — no changes (this proposal is admin-only for v1).

---

## 8. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Partial group write if one pet's slot check fails | Med | RPC runs in a single transaction; any raise rolls everything back. |
| Calendar/list view shows N rows instead of one coalesced block | High on day 1 | Acceptable cosmetic degradation; coalescing lands in a follow-up. |
| Reports that count "bookings per day" now overcount (3 rows for 1 visit) | Med | Add `COUNT(DISTINCT COALESCE(booking_group_id, id))` where the report means "visits." Audit reports before shipping. |
| Admin edits one pet in a group and breaks sequential timing | Med | Edit-booking flow (see [ADMIN_BOOKING_EDIT_SYSTEM.md](docs/ADMIN_BOOKING_EDIT_SYSTEM.md)) must disallow editing time on a grouped appointment without re-sequencing the group. Add a guard in v1; full group-edit UX in v2. |
| Admin cancels one pet in a group; the others have now-stale start times | Low | Cancellation leaves other rows as-is (their times don't move backwards). This matches intuition — slots don't retroactively free up just because an earlier pet was removed. |
| RLS: client sees only their own appointments — grouped rows all reference the same `client_id`, so no change | N/A | Verified in schema map. |
| `booking_group_id` column added but old code paths never set it | N/A | Column is nullable, default NULL. No code has to change unless it opts into the group concept. |

---

## 9. Out of Scope (Explicit v2 Candidates)

- Different staff per pet within one group.
- Parallel scheduling (two pets with two banhistas simultaneously).
- Client-side multi-pet booking (phase 2 once admin UX is proven).
- Group-level edit UX (reschedule all pets at once, swap staff across the whole group).
- Per-pet status updates rolled up to a group status.

---

## 10. Proposed Rollout

1. **PR 1 — Migration only.** Add `booking_group_id` + `booking_group_order` columns and index. Deploy. No behavior change.
2. **PR 2 — New RPC.** Add `create_booking_admin_multi_pet`. Deploy. Still no UI change, so still no behavior change.
3. **PR 3 — Admin UI opt-in.** Ship the multi-pet selector, preview, and wire the submit button to the new RPC when `pets.length > 1`. Single-pet path untouched.
4. **PR 4 (optional/follow-up) — Calendar coalescing.** Render grouped appointments as one visual block with a pet-count badge.
5. **PR 5 (optional) — Reporting audit.** Update any internal reports to use `DISTINCT booking_group_id`.

Between each PR we can verify the system is still healthy with zero multi-pet bookings in the DB. The feature is fully dormant until PR 3 ships.

---

## 11. Decisions (confirmed with product owner, 2026-04-19)

1. **Sequential order — hybrid A+B.** Default order is the order the admin selects the pets in. The UI also exposes drag-to-reorder so the admin can rearrange before submitting. Reordering recomputes each pet's start time live in the preview.
2. **Per-pet service combo — all pets share the same service combo.** If one pet needs a different combo, it goes into a separate booking. Keeps v1 scope tight and matches the "same banhista, same tosador, same everything" intent.
3. **First-visit pricing — per-pet line + range total.** Pets with known breed/size pricing show an exact price. Pets with `is_first_visit = true` show "to be quoted after evaluation" on their line. The total displays a **range**: the floor is the sum of known-pet prices, and the ceiling adds the expected quote range for the unknown pet(s) (using the service's default/base price band as the upper estimate). Example UI: "Total: R$ 240 + ~R$ 80–150 (1 pet to be quoted) = **R$ 320–390 est.**"
4. **Scope — admin-only for v1.** Client-side multi-pet stays off. Once the admin flow is proven in production, we port the same UX to the client booking page as a follow-up.

---

## 12. TL;DR

- Add **one nullable column** (`booking_group_id`) to `appointments`.
- Add **one new RPC** (`create_booking_admin_multi_pet`) that wraps the existing single-pet logic in a loop.
- Add **one new UI affordance** (add-pet button + per-pet preview) in the admin booking page, gated on `clientPets.length >= 2`.
- **Touch nothing** in the existing single-pet code path.
- Ship in 3 small, reversible PRs with the feature fully dormant until the UI lands.

The safest way to build this is to make it look, from the database's perspective, like N ordinary back-to-back single-pet bookings that happen to share a grouping ID. That's the lowest-risk architecture for a system that currently works well.
