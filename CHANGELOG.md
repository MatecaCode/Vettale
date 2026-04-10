# Vettale — Dev Changelog

## Session Log

---

### Pet Deletion Fix
**Status: Working**

`.single()` was throwing a 406 error when an appointment wasn't found during pet deletion.

**Fix:** Changed `.single()` → `.maybeSingle()` with an explicit null guard in `AppointmentActions.tsx`.

---

### Service Pricing INSERT Fix
**Status: Working**

`service_pricing` INSERT was failing with HTTP 400 because `service_name TEXT NOT NULL` was not being sent.

**Fix:** Added `service_name: service.name` to every `.insert()` and `.upsert()` payload in `EditServicePricing.tsx`.

---

### Past Confirmed Appointments — "Pending Conclusion" Badge
**Status: Working**

Confirmed appointments that were in the past showed the same "Confirmado" badge as future ones. No visual distinction.

**Fix:** `getStatusBadge()` in `AdminAppointments.tsx` now accepts a `date` parameter. When `status = 'confirmed'` and the date is before today, it renders an orange "Pendente conclusão" badge instead of the blue "Confirmado" one.

---

### Edit Form — Default Date/Time Pre-selected
**Status: Working**

Opening the booking edit form required the admin to re-pick the date and time even if they only wanted to change staff or notes. If they forgot, `handleSubmit` would fail or treat it as a date change, triggering incorrect slot operations.

**Fix:** Added `setSelectedDate(new Date(data.date + 'T12:00:00'))` and `setSelectedTime(data.time)` on appointment load in `AdminEditBooking.tsx`.

---

### Edit Form — Per-Service Time Breakdown
**Status: Working**

The edit form had no visibility into when each service segment started and ended for dual-service appointments.

**Fix:** Added a time breakdown block (IIFE) in `AdminEditBooking.tsx` that calculates per-segment start/end times from `appointment_services.duration`, rendered above the staff pickers.

---

### Staff Swap — RPC Rewrite (`edit_admin_booking_with_dual_services`)
**Status: Deployed — Pending Full Test**

The original RPC silently ignored `_new_staff_ids`, never updated `appointment_staff`, and only freed/blocked slots on date/time changes (not staff swaps).

**What changed (migrations applied to live DB):**

- `20260401000001` — Full rewrite of the RPC:
  - Added `_new_staff_ids uuid[]` parameter (`[1]` = primary, `[2]` = secondary)
  - Reads primary/secondary service IDs and durations via JOINs on `appointment_services` + `appointment_staff`
  - Added `date_time_changed` and `staff_changed` boolean flags (evaluated independently)
  - Frees OLD staff slots on any change, updates `appointment_staff`, then blocks NEW staff slots
  - Audit log entries now include old/new staff IDs for both services

- `20260401000002` — Bug fixes on top of 000001:
  - Duration now uses `COALESCE(aps.duration, s.default_duration, 0)` via JOIN to `services` table — prevents `WHILE check_minutes < NULL` loops from never running
  - Removed same-staff guard (`old_secondary != old_primary`) from freeing and blocking — secondary window is non-overlapping so the guard was incorrect when one person handles both services

**Known issue during testing (with old function version):**
The RPC threw "Primary staff not available" on notes/fee-only edits because `staff_changed` was evaluated as TRUE — likely caused by `get_appointment_service_staff` returning staff IDs that differed from what the RPC read directly from `appointment_staff`.

**Frontend fix applied (not yet confirmed working):**
`AdminEditBooking.tsx` `performEdit()` now only passes `_new_staff_ids` to the RPC when `Object.keys(pendingStaffChanges).length > 0`. If no staff change was made, the parameter is omitted entirely — the RPC falls back to reading the current DB staff, ensuring `staff_changed = FALSE` for notes/fee-only edits.

**Next step:** Live test the full staff swap flow with the new RPC and updated frontend.

---
