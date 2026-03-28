# Refactor Log — Edge Function Removal
**Date:** 2026-03-28
**Project:** Vettale (Vite + Supabase veterinary booking app)
**Scope:** Remove all unnecessary Edge Functions; replace calls with direct Supabase DB queries via RLS + JWT

---

## Overview

Supabase RLS (Row Level Security) handles authorization automatically for authenticated users via JWT claims. The Edge Functions being removed were originally written as a security layer, but are redundant when RLS policies are correctly applied. Replacing them with direct `supabase.from()` queries simplifies the codebase, eliminates network hops through Deno workers, and removes a class of bugs caused by missing `Content-Type: application/json` headers in SDK v2.50.

**Supabase JS SDK version:** 2.50.0
**Note on JWT:** `getSession()` used for role checks (not `getClaims()` — requires SDK ≥ 2.68)

---

## Root Bug Fixed

**Symptom:** Admin user displayed as "Cliente" in the UI.

**Root cause:** `fetchUserRoles` in `useAuth.tsx` called the `get-current-user-context` Edge Function, which returned JSON responses without a `Content-Type: application/json` header. SDK v2.50 parsed the response as a plain text string. `data?.ok` evaluated to `undefined` on a string, triggering the `['client']` fallback on every login.

**Fix:** Replaced Edge Function call with direct query to `user_roles` table. RLS ensures only the authenticated user's own rows are returned.

---

## Files Changed

### `src/hooks/useAuth.tsx`
**`fetchUserRoles`** — removed Edge Function call, timeout, and retry logic. Replaced with:
```typescript
const fetchUserRoles = async (userId: string): Promise<string[]> => {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId);
  if (error || !data?.length) return ['client'];
  return data.map(r => r.role);
};
```

**`ensureClientRow`** — removed Edge Function invoke. Replaced with select-then-insert pattern:
```typescript
const ensureClientRow = async (user: User) => {
  try {
    const { data: existing } = await supabase
      .from('clients')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (existing) return;
    await supabase.from('clients').insert({
      user_id: user.id,
      name: user.user_metadata?.name || null,
      email: user.email || null,
      admin_created: false,
    });
  } catch (err) {
    console.warn('ensureClientRow: could not create clients row', err);
  }
};
```

---

### `src/components/Layout.tsx`
`.single()` → `.maybeSingle()` on the `staff_profiles` query.
**Why:** Admin users have no `staff_profiles` row. `.single()` throws 406 when no row exists. `.maybeSingle()` returns `null` safely.

---

### `src/components/Navigation.tsx`
- Removed `supabase` and `log` imports
- Removed `displayName` and `staffPhotoUrl` state
- Removed entire `useEffect` with Edge Function call and Realtime subscription
- Replaced with derived value:
```typescript
const displayName = user?.user_metadata?.name || user?.email || 'Usuário';
```
- Simplified `<AvatarImage />` — no src, no event handlers

---

### `src/pages/AuthCallback.tsx`
- Removed `import { adminRegistrationMonitor }`
- Removed entire admin code block (~38 lines): `monitorAdminRegistration` call, retry toast, and `else` branch
- Remaining logic: URL error handling, `getSession`, `getUser`, success toast, `setTimeout` redirect

---

### `src/pages/AdminDashboard.tsx`
Replaced `supabase.functions.invoke('admin-get-dashboard-stats')` with 8 parallel direct queries:
```typescript
const [
  { count: totalUsers }, { count: totalPets }, { count: totalBookings },
  { count: todayServices }, { count: pendingApprovals },
  { data: staffWithAppointments }, { data: todayAppointments },
  { count: pendingCancellations },
] = await Promise.all([
  supabase.from('user_roles').select('*', { count: 'exact', head: true }),
  supabase.from('pets').select('*', { count: 'exact', head: true }),
  supabase.from('appointments').select('*', { count: 'exact', head: true }),
  supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('date', today).neq('status', 'cancelled'),
  supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
  supabase.from('appointment_staff').select('staff_profile_id, appointments!inner(date, status)').eq('appointments.date', today).neq('appointments.status', 'cancelled'),
  supabase.from('appointments').select('total_price').eq('date', today).eq('status', 'confirmed'),
  supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('status', 'cancelled'),
]);
```

---

### `src/pages/AdminAvailabilityManager.tsx`
Removed `callFn` wrapper entirely. Replaced 6 call sites with direct queries and client-side helpers:

**Slot generation (client-side):**
```typescript
const generateSlotsForDay = (staffProfileId, dateStr, endHour) => { /* 10-min slots 9:00–endHour */ };
```
- Weekdays: `endHour = 16`
- Saturdays: `endHour = 12`
- Sundays: skipped

**Slot update helper:**
```typescript
const updateSlots = async (staffId, dateStr, timeSlots, available): Promise<number> => {
  const { data, error } = await supabase.from('staff_availability')
    .update({ available }).eq('staff_profile_id', staffId).eq('date', dateStr)
    .in('time_slot', timeSlots).select('id');
  if (error) throw error;
  return data?.length ?? 0;
};
```

**`fetchStaffProfiles`:** direct query to `staff_profiles` with `active = true`
**`fetchAvailabilityForDate`:** direct query to `staff_availability` with `staff_profiles!inner(name)` join
**`generateAvailabilityForStaff`:** client-side slot generation, upserts in batches of 500

---

### `src/pages/AdminPets.tsx`
Replaced 3 `admin-manage-pet` invoke calls with direct queries:

- **CREATE:** `supabase.from('pets').insert({...})`
- **UPDATE:** `supabase.from('pets').update(updateData).eq('id', selectedPet.id)`
- **DELETE:** `supabase.from('pets').delete().eq('id', petId)`

**Bug fix:** `size: formData.size || null` (both insert and update).
Empty string `''` violated `pets_size_check` DB constraint. `null` bypasses check constraints in PostgreSQL.

---

### `src/pages/AdminManualBooking.tsx`
Replaced 2 Edge Function calls. Core booking creation (`supabase.rpc('create_unified_admin_booking')`) is a PostgreSQL RPC — intentionally not changed.

**`savePetEdit`** — replaced `admin-manage-pet` invoke:
```typescript
const { error: petUpdateError } = await supabase
  .from('pets')
  .update(payload)       // payload already contains size: petEdit.size || null
  .eq('id', petEdit.id);
if (petUpdateError) throw petUpdateError;
```

**`saveClientEdit`** — replaced `admin-manage-client` invoke:
```typescript
const clientPayload = { name, email, phone, address, notes, location_id, is_whatsapp,
  preferred_channel, emergency_contact_name, emergency_contact_phone,
  preferred_staff_profile_id, accessibility_notes, general_notes,
  marketing_source_code, marketing_source_other, birth_date,
  updated_at: new Date().toISOString() };
const { error: clientUpdateError } = await supabase
  .from('clients').update(clientPayload).eq('id', clientEdit.id);
if (clientUpdateError) throw clientUpdateError;
```

---

### `src/pages/AdminClients.tsx`
Replaced 4 `admin-manage-client` invoke calls. Also removed `checkDataIntegrity` and rewrote the client list fetch pattern.

**`get_by_id` (deep link support):**
```typescript
const { data, error: fnError } = await supabase
  .from('clients').select('*').eq('id', highlightId).maybeSingle();
if (fnError || !data) return;
```

**`fetchClientsPage` (paginated list) — full rewrite:**
- Minimum 2 characters required to trigger a search (no auto-load on mount)
- 10 results per page with "Carregar mais" append pattern
- `pets(count)` join removed — was causing query timeouts on large datasets
- `locations(name)` join kept — lightweight FK lookup
- Search logic: digits-only input uses `.or(name, phone)`, text uses `.ilike('name')`
- Debounce: 400ms → 300ms
- `claimStatusMap` merges on append: `prev => replace ? map : { ...prev, ...map }`

```typescript
let listQuery = supabase
  .from('clients')
  .select('*, locations(name)', { count: 'exact' })
  .order('name')
  .range(from, to);   // 10 at a time

if (isDigitsOnly) {
  listQuery = listQuery.or(`name.ilike.%${term}%,phone.ilike.%${term}%`);
} else {
  listQuery = listQuery.ilike('name', `%${term}%`);
}
```

**`handleCreateClient`:**
```typescript
const { data: clientData, error: createError } = await supabase
  .from('clients').insert(clientDataToInsert).select().single();
```
`clientData.id` and `clientData.email` fed directly into the downstream `send-client-invite` Edge Function call (which remains).

**`handleEditClient`:**
```typescript
const { error: updateError } = await supabase
  .from('clients').update({ ...fields, updated_at: new Date().toISOString() })
  .eq('id', selectedClient.id);
```

**`fetchClients` alias added** (was called in 7 places but never defined — pre-existing bug):
```typescript
const fetchClients = () => void fetchClientsPage(0, true);
```

**`checkDataIntegrity` removed entirely:**
The `client_data_integrity` view returns 403 for non-service-role callers. It was a diagnostic tool, not a core feature. Removed: function body, state (`dataIntegrity`), 3 call sites, and the JSX warning banner.

---

### `src/utils/adminRegistrationMonitor.ts`
**Deleted entirely.** Admin registration flow removed — admins are now added manually via Supabase dashboard.

---

## Edge Functions Deleted

The following Edge Function folders were deleted from disk (`supabase/functions/`) and should be removed from the Supabase dashboard:

| Function | Replaced By |
|---|---|
| `get-current-user-context` | Direct `user_roles` query + `clients` select-then-insert |
| `admin-get-dashboard-stats` | 8 parallel direct queries via `Promise.all()` |
| `admin-manage-availability` | Direct `staff_availability` queries + client-side slot generation |
| `admin-get-registration-status` | Entire flow removed (manual admin creation) |
| `admin-manage-client` | Direct `clients` table queries (CRUD) |
| `admin-manage-pet` | Direct `pets` table queries (CRUD) |

---

## Edge Functions Retained (active, not touched)

| Function | Purpose |
|---|---|
| `send-client-invite` | Sends invite email + handles link/unlink logic |
| `send-staff-invite` | Staff onboarding invite |
| `delete-staff-user` | Deletes auth.users record (requires service role) |
| `admin-delete-auth-user` | Auth user deletion for client cleanup flow |
| `admin_resend_verification` | Resends email verification |
| `send-booking-notifications` | Booking confirmation/reminder emails |
| `send-contact-intake` | Contact form intake emails |
| `send-staff-setup` | Staff setup flow |
| `roll-availability` | Weekly availability generation (cron) |
| `refresh-availability` | On-demand availability refresh |

---

## PostgreSQL RPCs — Not Changed

These are DB-level functions, not Edge Functions. They were never candidates for removal:

| RPC | Used In |
|---|---|
| `create_unified_admin_booking` | `AdminManualBooking.tsx` — core booking creation |
| `validate_dual_service_slot` | Slot conflict validation |
| `admin_get_client_claim_status` | `AdminClients.tsx` — claim/invite status per client |
| `delete_client_completely` | `AdminClients.tsx` — cascading client deletion |
| `cleanup_orphaned_clients` | `AdminClients.tsx` — orphaned record cleanup |
| `cleanup_staff_client_duplicates` | `AdminClients.tsx` — staff/client deduplication |

---

## Bugs Fixed Along the Way

| Bug | Fix |
|---|---|
| Admin showing as "Cliente" | `fetchUserRoles` now uses direct DB query; removes Edge Function JSON header issue |
| `staff_profiles` 406 on every page load | `.single()` → `.maybeSingle()` in `Layout.tsx` |
| `pets_size_check` constraint violation (23514) | `size: formData.size \|\| null` — empty string → NULL |
| `fetchClients is not defined` ReferenceError | Added `const fetchClients = () => void fetchClientsPage(0, true)` alias |
| `updated_at` not refreshing on client edit | Explicit `updated_at: new Date().toISOString()` in update payloads (no trigger on `clients` table) |
| `AdminClients` timeout on page load | Removed auto-fetch on mount; 2-char minimum search; removed `pets(count)` join |
| `Navigation.tsx` linter error after import removal | Removed orphaned `log.error` call in `handleLogout` |

---

## Key Patterns Established

**Direct query over Edge Function:**
```typescript
// Before
const { data, error } = await supabase.functions.invoke('admin-manage-x', {
  body: { action: 'update', id, payload }
});
if (error || !data?.ok) throw new Error(data?.error);

// After
const { error } = await supabase.from('table').update(payload).eq('id', id);
if (error) throw error;
```

**`.maybeSingle()` vs `.single()`:**
Use `.maybeSingle()` whenever a row may not exist. `.single()` throws 406 on zero rows.

**`size || null` pattern:**
Empty strings from unselected dropdowns must be converted to `null` before insert/update to satisfy DB check constraints.

**`Promise.all()` for dashboard stats:**
8 independent count queries run in parallel instead of sequentially inside a Deno worker.

**Search-on-demand pattern:**
Large tables (`clients`, 2400+ rows) must not be fetched on mount. Require ≥2 character search term, paginate in chunks of 10, append with "Carregar mais".
