# Claude Code — Project Guidance & Best Practices
## Vettale (vettale.shop) · Supabase: ieotixprkfglummoobkb

This file is the living reference for how Claude Code works on this project.
Update it as new patterns are established or rules change.

---

## Branch Workflow

- All feature/security work happens on a **dedicated branch** (e.g. `security-batch-3`)
- Claude commits to that branch only — **never directly to `main`**
- The developer reviews the diff in **GitHub Desktop** (add the worktree path as a local repo):
  `C:\Users\Mathe\OneDrive\Documents\GitHub\Vettale\.claude\worktrees\hardcore-goldberg`
- Developer runs `npm run dev` locally to smoke-test before merging
- Only after explicit developer approval does anything go to `main`

---

## Edge Function Pattern (Standard)

Every Edge Function in this project follows this exact structure:

```ts
// 1. Check Authorization header → 401 if missing
// 2. Validate JWT via userClient.auth.getUser() → 401 if invalid
// 3. Check admin role in user_roles via adminClient (SERVICE_ROLE) → 403 if not admin
//    (skip step 3 for functions that serve any authenticated user, e.g. get-current-user-context)
// 4. Parse request body: { action, ...params }
// 5. Execute DB operation via adminClient (SERVICE_ROLE)
// 6. Return { ok: true, data } or { ok: false, error: "message" }
```

**Key security rules:**
- `user_id` always comes from the verified JWT — **never from the request body**
- All DB reads/writes use `SERVICE_ROLE` key — never the anon key for data ops
- CORS headers on every response including errors and OPTIONS

---

## Security Migration Rule (Standing)

> These changes are purely a security layer. Behavior from the user's perspective
> must be identical before and after each change.

- Do NOT refactor business logic while securing DB calls
- Do NOT change data structures or response shapes the frontend depends on
- Do NOT remove or alter any existing functionality
- The only allowed change: `supabase.from()` call → `supabase.functions.invoke()` returning the same data
- If a test fails after a change: **fix the Edge Function response shape first**, not the frontend

---

## Edge Functions Deployed (Live)

| Function | Tables | Actions | Used By |
|---|---|---|---|
| `admin-manage-pet` | pets | create, update, delete | AdminPets, AdminManualBooking |
| `admin-manage-availability` | staff_availability, staff_profiles | get_staff, get_availability, update_slots, update_slot_by_id, generate_availability | AdminAvailabilityManager |
| `admin-manage-client` | clients, user_roles, pets | create, update, get_by_id, list | AdminClients, AdminManualBooking |
| `admin-get-registration-status` | user_roles, admin_profiles, admin_registration_codes | verify | adminRegistrationMonitor |
| `get-current-user-context` | user_roles, clients, staff_profiles | get_context, ensure_client | Navigation, useAuth |
| `admin-get-dashboard-stats` | user_roles, pets, appointments, appointment_staff | (single call) | AdminDashboard |

---

## Commit Convention

```
Security: <description>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

Batch commits use:
- `Security: Batch 1 complete - ...`
- `Security: Batch 2 complete - ...`
- Per-task commits on feature branches use descriptive single-line messages

---

## Testing Checklist (before merging to main)

For every secured endpoint, verify in Network tab:
- Calls go to `functions/v1/<function-name>` ✅
- Zero calls to `rest/v1/<secured-table>` for that operation ✅
- Response is `{ ok: true, data: ... }` ✅
- UI behavior is identical to before ✅

---

## Known Notes / Future Work

- `admin_registration_codes` vs `staff_registration_codes`: The DB trigger uses
  `staff_registration_codes` with `account_type='admin'`, while `adminRegistrationMonitor`
  calls RPC `validate_admin_registration_code` which may reference `admin_registration_codes`.
  These appear to be two separate tables — worth auditing before the admin registration
  flow is next touched.

- The 3-second polling interval in `Navigation.tsx` has been removed (was redundant
  with the existing realtime subscription). If staff photo updates seem slow, the
  realtime subscription is the right place to investigate.

- `ensureClientRow` in `useAuth.tsx` is a safety net — the `unified_registration_trigger`
  on `auth.users` INSERT handles client row creation for all normal registration paths.

---

## Do's

- Read the file before editing it
- Propose plan → wait for confirmation → write code (for non-trivial tasks)
- Deploy Edge Functions immediately after writing them
- Prefix unused parameters with `_` when the value comes from JWT instead (`_userId`)
- Keep Edge Functions focused: one concern per function, actions for variants
- Batch independent DB queries with `Promise.all` server-side
- Always include graceful degradation on the frontend (set defaults before async calls)

## Don'ts

- Don't push to `main` directly during active batch work
- Don't add `role_check` to functions that serve mid-registration users
- Don't pass `user_id` in request bodies — always derive from JWT
- Don't use N+1 query patterns (use batch queries or joins)
- Don't change frontend data structures to match a new Edge Function shape —
  change the Edge Function to match the frontend
- Don't remove the `supabase` import from files that still use `supabase.functions.invoke()`
- Don't skip the smoke test before merging to main
