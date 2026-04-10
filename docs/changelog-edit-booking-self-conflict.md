# Edit Booking: Availability Self-Conflict & Stale Slots

**Date:** 2026-04-03

## Problem 1 — Booking blocks its own slots

When an admin opens the edit screen, the availability grid shows the current booking's
time window as "Occupied" because `find_dual_service_slots` reads `staff_availability`
where the booking has already set `available = FALSE`.

### Fix

| Layer | File | Change |
|-------|------|--------|
| Database | `20260403000000-add-exclude-appointment-to-find-dual-service-slots.sql` | Added `_exclude_appointment_id uuid DEFAULT NULL` parameter. When provided, the function pre-computes the excluded appointment's primary/secondary time windows and treats those slots as virtually free during availability checks. |
| Hook | `src/hooks/useAdminAvailability.tsx` | `fetchAdminTimeSlots` now accepts `excludeAppointmentId` and forwards it to the RPC as `_exclude_appointment_id`. |
| Page | `src/pages/AdminEditBooking.tsx` | The time-slot loading effect passes `appointmentId` so the RPC excludes the booking being edited. |

## Problem 2 — Grid does not refresh on staff change

When the admin swaps a staff member, `selectedStaffIds` was computed inside
`handleServiceStaffChange` using a stale closure of `pendingStaffChanges`,
which could produce wrong IDs on consecutive changes.

### Fix

| Layer | File | Change |
|-------|------|--------|
| Page | `src/pages/AdminEditBooking.tsx` | Replaced `useState` for `selectedStaffIds` with a `useMemo` derived from `serviceStaffAssignments + pendingStaffChanges`. Now any `setPendingStaffChanges` automatically recomputes staff IDs and triggers a re-fetch. `handleServiceStaffChange` simplified to a single `setPendingStaffChanges` call. |

## Not touched

- `create_unified_admin_booking` and the creation flow.
- Any write RPC (`edit_admin_booking_with_dual_services`, etc.).
- `AdminManualBooking.tsx` — backward-compatible (new param has a default).
