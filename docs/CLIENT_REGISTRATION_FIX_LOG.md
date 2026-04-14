# Client Registration Fix - August 24, 2025

## Problem Statement
Self-registration flow was not properly populating the `public.clients` table when users clicked "Registrar". Users could register and confirm email, but client records were incomplete or missing, causing issues with the client management system.

## Root Cause Analysis
- ✅ `handle_unified_registration()` trigger was firing correctly on user signup
- ✅ `user_roles` table was being populated with 'client' role  
- ❌ `clients` table INSERT was missing crucial fields:
  - `admin_created` (not set, defaulting to NULL)
  - `claimed_at` (not set, leaving NULL)
- ❌ Existing self-registered clients had incomplete records

## Solution Implemented

### Database Changes
**Migration Applied**: `fix_client_registration_claimed_at`
- Updated `public.handle_unified_registration()` trigger function
- Added `admin_created = false` for self-registered clients
- Added `claimed_at = now() at time zone 'America/Sao_Paulo'` for immediate claim
- Fixed existing client records with missing data

### Key Code Changes
```sql
-- OLD (incomplete):
INSERT INTO clients (user_id, name, email)
VALUES (NEW.id, user_name, NEW.email)

-- NEW (complete):
INSERT INTO clients (
  user_id, name, email, admin_created, claimed_at
) VALUES (
  new.id, user_name, new.email, 
  false,  -- self-registered, not admin-created
  (now() at time zone 'America/Sao_Paulo')  -- immediately claimed
)
```

## Flow Verification
**Self-Registration Process Now:**
1. User clicks "Registrar" → `auth.users` record created
2. `handle_unified_registration()` trigger fires immediately  
3. `clients` table populated with complete data:
   - ✅ `user_id` (from auth.users)
   - ✅ `name` (from form data)
   - ✅ `email` (from auth.users) 
   - ✅ `admin_created = false` (self-registered)
   - ✅ `claimed_at = now()` (immediately claimed)
4. `user_roles` table gets 'client' role
5. User confirms email → can log in with complete profile

## Admin Flow Preserved
- ✅ Admin-created clients still use `admin_created = true`, `user_id = NULL` until claim
- ✅ Admin booking guardrails maintained: `_client_id` only for admin-created+unclaimed
- ✅ Self-registered clients use `_client_user_id` path (admin_created=false)
- ✅ No conflicts between admin and self-registration flows

## Data Cleanup
- Updated 5 existing self-registered clients with proper `admin_created=false` and `claimed_at` 
- Created missing client record for test user `b2742024@ben.edu`
- All client records now complete and consistent

## Testing Results
✅ **BEFORE**: Client registration created incomplete records, missing admin_created/claimed_at  
✅ **AFTER**: Client registration immediately creates complete client records  
✅ **Verification**: All self-registered clients now have complete data  
✅ **Admin flows**: Unaffected, working as designed  

## Files Modified
- Database: `public.handle_unified_registration()` function
- Migration: Applied via `mcp_supabase_apply_migration`
- Data: Updated existing incomplete client records

## Timezone Compliance  
All timestamps use `America/Sao_Paulo` timezone as per project standards.

## Status
✅ **COMPLETE** - Self-registration client population now works immediately upon clicking "Registrar"

---
*Log Date: August 24, 2025*  
*Issue Scope: Client Registration / Database Triggers*  
*Solution: Database trigger function update + data cleanup*

---

## Session — 2026-04-13

### Auth & Registration Overhaul

**What changed:**
- **Email confirmation template** — Created `supabase/templates/confirmation.html` with full Vettale branding; `config.toml` updated to set subject to "Confirme seu cadastro na Vettale". Production requires manual paste into Supabase Dashboard → Auth → Email Templates + custom SMTP via Resend to replace "Supabase Auth" sender name.
- **Email redirect fixed** — `emailRedirectTo` was pointing to `/` (root), so email confirmation tokens were never exchanged for a session. Changed to `/auth/callback` in `useAuth.tsx` and `Register.tsx`. Updated `AuthCallback.tsx` to handle PKCE `?code=` param via `exchangeCodeForSession()` — users now auto-login after confirming email.
- **Phone input component** — New `src/components/ui/phone-input.tsx` with emoji flag country selector (27 countries, defaults to 🇧🇷 +55), emits E.164 format.
- **Phone number saved on registration** — `phone` was never reaching the DB. Fixed at three layers: (1) passed in `signUp` metadata, (2) `handle_unified_registration` trigger updated to read `raw_user_meta_data->>'phone'` and write to `clients.phone`, (3) explicit `clients.update({ phone })` after signUp as failsafe. Validation: only saves if ≥7 digits (prevents bare dial codes).
- **Register page restructured** — Cliente form now unified: name, email, password, phone (always visible), then verification method selector (E-mail card / Telefone card). Phone verification shows "not available" notice and disables submit until SMS provider (Twilio) is configured.
- **Login page** — Added E-mail / Telefone tabs. Phone tab: country selector + number + password (`signInWithPhonePassword`). SMS OTP removed from login to reduce UI clutter. "Not active" notice shown on phone tab until Twilio is configured.
- **useAuth additions** — `sendPhoneOtp`, `verifyPhoneOtp`, `signInWithPhonePassword` methods added.
- **Error messages** — Added PT-BR translations for rate limit errors and phone/OTP errors in `errorMessages.ts`.

**Gotchas:**
- Supabase free tier: ~3 emails/hour project-wide. Hitting this gives "email rate limit exceeded" — not an account-conflict error. Fix: configure custom SMTP with Resend.
- Phone login/signup requires an SMS provider (Twilio recommended). Until configured, phone verification is intentionally disabled in UI.
- `ON CONFLICT (user_id)` in trigger uses `COALESCE(user_phone, clients.phone)` — won't overwrite an existing phone with null.

**Files touched:**
`supabase/config.toml`, `supabase/templates/confirmation.html`, `supabase/migrations/save_phone_on_client_registration.sql`, `src/hooks/useAuth.tsx`, `src/pages/Login.tsx`, `src/pages/Register.tsx`, `src/pages/AuthCallback.tsx`, `src/components/ui/phone-input.tsx`, `src/utils/errorMessages.ts`
