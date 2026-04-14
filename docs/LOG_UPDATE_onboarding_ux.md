# Client Profile UX — Micro-wizard auto-open rules and targeted CTA

- date: 2025-10-27
- author: Cursor (assistant), paired with Matheus
- scope: Frontend only (React/TS, Supabase JS v2)

## Summary

- Prevent the onboarding micro-wizard from auto-opening after a user has completed it once or clicked "Lembrar depois".
- If only emergency contact fields are missing, show a soft reminder and route the CTA directly to the Emergency step.
- The CTA opens the wizard at the correct step with all existing values prefilled; wizard state is not cleared between steps.
- PGRST203 error previously seen on profile save from wizard addressed by always sending `p_birth_date` (ISO or null).

## Details

### A) Persistent onboarding flag (frontend only)
- Added `src/utils/onboarding.ts` exposing:
  - `hasRunOnboarding(uid)` — check localStorage key `vt_onboarding_done_<uid>`
  - `setOnboardingDone(uid)` — set the flag
- `Profile.tsx` now checks this flag before auto-opening the wizard. If set, the wizard never auto-opens again.
- The flag is set when:
  - Wizard completes successfully, and
  - User clicks "Lembrar depois" in the smart nudge (banner).

### B) Auto-open logic and banner tweaks
- Auto-open now runs only once per session and only when profile is incomplete and not exclusively missing emergency fields.
- When only emergency contact fields are pending, banner text is softer and CTA label changes to "Adicionar agora".

### C) Targeted CTA and prefilling
- `ClientMicroWizard` now supports props:
  - `startAt`: 'contact' | 'reminders' | 'emergency' | 'preferences'
  - `initialValues`: prefilled values for wizard state
- On open, the wizard seeds state from `initialValues` and positions to `startAt` without resetting on step navigation.
- `Profile.tsx` passes `key={user.id}`, `startAt` based on missing fields, and `initialValues` from current client data.

### D) Wizard parameters fix
- In `ClientMicroWizard`, RPC payload always includes `p_birth_date` as ISO `YYYY-MM-DD` or `null` to avoid PGRST203 function overloading ambiguity.

## Files touched
- `src/utils/onboarding.ts` — new
- `src/components/ClientMicroWizard.tsx` — accept `startAt`/`initialValues`, always send `p_birth_date`, mandatory step 2 (consents) skip disabled
- `src/pages/Profile.tsx` — respect onboarding flag, avoid auto-open for emergency-only, pass `startAt` and `initialValues`, set onboarding done on complete
- `src/components/SmartNudges.tsx` — soft banner copy for emergency-only, CTA wiring, set onboarding done on "Lembrar depois"

## Expected behavior
- First visit with incomplete profile → may auto-open once unless only emergency is missing.
- After completion or "Lembrar depois" → wizard no longer auto-opens on future visits.
- Clicking CTA opens the wizard at the correct step with data prefilled; no blank resets.

## Rollback
- Revert the above files to the previous commit to restore old behavior.

---

## 2026-04-13 — Wizard redesign & input fixes

### Summary
- Rebuilt `ClientMicroWizard` from 4 steps → 3 steps (removed emergency contact step from setup flow).
- Added a welcome screen (step 0) before form steps begin.
- Replaced plain dropdowns with interactive card/chip selectors for contact channel preference.
- Added smooth slide animation between steps with direction awareness.
- Progress indicator redesigned as pill-shaped step labels with connecting lines.
- Consent items are now full clickable cards (not checkbox rows); added "Aceitar todos" shortcut.
- Buttons slimmed down (`h-7`/`h-8`) to reduce visual weight.
- Marketing source field now shows amber border + inline hint when empty.
- Reminder consent copy changed to "Via telefone / e-mail — conforme canal configurado".
- Profile completion meter redesigned: raw DB field names replaced by friendly section chips (Informações básicas, Contato, Termos aceitos, Contato de emergência, Preferências).
- `DateInputBR`: fixed Ctrl+A / Ctrl+C / Ctrl+V / Ctrl+Z being blocked by key filter.
- `PhoneInputBR`: added E.164 / international number support — numbers starting with `+` bypass BR formatting and are stored as-is.

### Gotchas
- `startAt: 'emergency'` no longer routes to a dedicated step; it now falls through to `contact` (step 1). The `emergency_contact_*` fields are still saved via the data model if present in `initialValues`.
- Profile.tsx `startAt` prop hardcoded to `'contact'` (emergency routing removed).

### Files touched
- `src/components/ClientMicroWizard.tsx` — full redesign
- `src/pages/Profile.tsx` — updated `renderProgressMeter`, removed emergency `startAt` logic
- `src/components/inputs/DateInputBR.tsx` — allow Ctrl/Cmd shortcuts in keydown handler
- `src/components/inputs/PhoneInputBR.tsx` — E.164 / international number support
