-- ============================================================
-- Migration: 20260330000000_add_is_first_visit_to_pets.sql
-- Item 23 — New Pet Detection Mechanism
-- ============================================================
--
-- PURPOSE
-- Adds a boolean flag `is_first_visit` to the pets table and a trigger on
-- the appointments table that automatically flips the flag to FALSE the
-- first time an appointment for that pet reaches status = 'completed'.
--
-- ============================================================
-- STEP 1 — SCHEMA AUDIT RESULTS
-- ============================================================
--
-- pets table (15 columns before this migration):
--   id           uuid         NOT NULL  PK  DEFAULT gen_random_uuid()
--   name         text         NOT NULL
--   breed        text         nullable
--   age          text         nullable
--   created_at   timestamptz  nullable  DEFAULT now()
--   updated_at   timestamptz  nullable  DEFAULT now()
--   client_id    uuid         NOT NULL  FK → clients.id
--   size         text         nullable
--   birth_date   date         nullable
--   weight       numeric      nullable
--   gender       text         nullable
--   notes        text         nullable
--   photo_url    text         nullable
--   active       boolean      nullable  DEFAULT true
--   breed_id     uuid         nullable  FK → breeds.id
--
-- appointments table (relevant fields):
--   id           uuid         NOT NULL  PK
--   pet_id       uuid         NOT NULL  FK → pets.id
--   status       text         NOT NULL  DEFAULT 'pending'
--                Known values: 'pending', 'confirmed', 'completed', 'cancelled'
--                Exact string for "done": 'completed'
--
-- ============================================================
-- STEP 2 — FRONTEND AUDIT RESULTS
-- ============================================================
-- Files that query pets, and impact of adding is_first_visit:
--
-- 1. src/pages/AdminManualBooking.tsx
--    Operations : SELECT specific cols (id, name, breed, size, client_id,
--                 breed_id, birth_date); UPDATE specific cols (breed, breed_id,
--                 name, age, notes, size, birth_date)
--    Local Pet  : interface Pet { id, name, breed?, size?, client_id,
--                 breed_id?, birth_date? }
--    Impact     : No change needed. Explicit column lists exclude
--                 is_first_visit; UPDATE payload does NOT include the flag.
--
-- 2. src/pages/AdminClients.tsx
--    Operations : SELECT specific cols (id, name, breed, breed_id, size, …);
--                 INSERT (name, breed, breed_id, size, birth_date, notes,
--                 client_id)
--    Local Pet  : interface Pet { id, name, breed, breed_id?, size?, … }
--    Impact     : No change needed. INSERT does not set is_first_visit
--                 (DEFAULT handles it). SELECT list is explicit.
--
-- 3. src/pages/AdminPets.tsx
--    Operations : SELECT * (line ~189 for detail view); SELECT specific cols;
--                 INSERT (name, breed, breed_id, size, age, birth_date, notes,
--                 client_id); UPDATE same cols; DELETE
--    Local Pet  : interface Pet { id, name, breed, breed_id?, size?, age?,
--                 birth_date?, notes?, created_at?, updated_at?, client_id? }
--    Impact     : SELECT * will now return is_first_visit. The local Pet
--                 interface does not include it, but TypeScript only errors
--                 on missing required fields — extra columns in returned data
--                 are harmlessly ignored at runtime. UPDATE payload does NOT
--                 include is_first_visit, so the flag is safe.
--                 → ACTION: Add is_first_visit?: boolean to local Pet interface
--                   for completeness (avoids implicit any on the field).
--
-- 4. src/pages/AdminDashboard.tsx
--    Operations : SELECT count only — select('*', { count: 'exact', head: true })
--    Impact     : No data returned, just a row count. No change needed.
--
-- 5. src/utils/appointmentUtils.ts
--    Operations : SELECT name only — .select('name')
--    Impact     : No change needed.
--
-- 6. src/pages/Pets.tsx
--    Operations : SELECT *, breeds(name); DELETE
--    Local Pet  : interface Pet { id, name, breed?, age?, size?, … }
--    Impact     : SELECT * returns is_first_visit. Pet interface does not
--                 declare it; the field is present in runtime data but unused.
--                 No regression. No frontend change strictly required, but
--                 is_first_visit?: boolean can be added for future use.
--
-- 7. src/pages/PetFormPage.tsx
--    Operations : SELECT *; INSERT specific cols; UPDATE specific cols
--    Local Pet  : interface Pet { id, name, breed?, breed_id?, age?, … }
--    Impact     : SELECT * returns is_first_visit. INSERT/UPDATE payloads
--                 are explicit and do NOT include is_first_visit. Safe.
--
-- 8. src/hooks/useAppointmentData.tsx
--    Operations : SELECT *, breeds(name)
--    Local Pet  : interface Pet { id, name, breed?, breed_id?, age?, size?,
--                 birth_date?, weight?, gender?, notes?, photo_url?,
--                 active?, client_id, breeds? }
--    Impact     : SELECT * returns is_first_visit. Pet interface does not
--                 declare it; runtime data has an extra field, harmlessly
--                 ignored. No regression.
--                 → ACTION: Add is_first_visit?: boolean to this Pet
--                   interface (used by items 22/18 which depend on this flag).
--
-- 9. src/pages/AdminBookingPage.tsx
--    Operations : SELECT specific cols (id, name, breed)
--    Local Pet  : interface Pet { id, name, breed? }
--    Impact     : No change needed. Explicit column list.
--
-- 10. src/components/PetForm.tsx
--     Operations : INSERT specific cols; UPDATE specific cols
--     Local Pet  : interface Pet { id, name, breed?, breed_id?, age?, size?,
--                  birth_date?, weight?, gender?, notes? }
--     Impact     : INSERT/UPDATE payloads are explicit and do NOT include
--                  is_first_visit. Safe. No change needed.
--
-- ============================================================
-- RLS AUDIT
-- ============================================================
-- Existing policies on pets:
--   SELECT : "Admin can view all pets"          — admins can read  ✓
--   SELECT : "Clients can view their own pets"  — clients can read ✓
--   UPDATE : "Admin can update all pets"        — admins can write ✓
--   UPDATE : "Clients can update their own pets"— clients CAN update any col
--            ↳ This would allow clients to write is_first_visit directly.
--   INSERT : "Users can create their own pets"  — with_check: true ✓
--
-- Fix: revoke column-level UPDATE privilege on is_first_visit from the
-- `authenticated` role. The SECURITY DEFINER trigger function runs as the
-- postgres/owner role and is unaffected by this revoke.
-- Admins who need to manually override the flag must do so via a
-- SECURITY DEFINER RPC (future, if ever needed).
--
-- ============================================================
-- STEP 6 — EXPECTED TRIGGER BEHAVIOR
-- ============================================================
-- Pet A: is_first_visit = TRUE  (no appointments at all)
-- Pet B: is_first_visit = TRUE  (has appointment with status = 'scheduled')
-- Pet C: is_first_visit = TRUE  (has appointment with status = 'pending')
-- Pet D: is_first_visit = FALSE (appointment status was updated to 'completed')
-- Trigger does NOT fire on INSERT into appointments — only on UPDATE
-- Trigger does NOT fire if status was already 'completed' and is updated again
--   (guard: NEW.status = 'completed' AND OLD.status <> 'completed')
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 3a. Add the column
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.pets
  ADD COLUMN IF NOT EXISTS is_first_visit BOOLEAN NOT NULL DEFAULT TRUE;

-- All existing pets default to TRUE (treated as new going forward).
-- No backfill is needed — the clinic's existing data is sparse
-- and this is intentional per project spec.


-- ────────────────────────────────────────────────────────────
-- 3b. Trigger function
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_pet_first_visit_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only act on the transition TO 'completed', not on repeated updates
  -- or updates to other statuses.
  IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
    UPDATE public.pets
       SET is_first_visit = FALSE
     WHERE id = NEW.pet_id
       AND is_first_visit = TRUE;  -- no-op if already flipped
  END IF;

  RETURN NEW;
END;
$$;

-- Grant EXECUTE to authenticated so Supabase can resolve the function
-- reference; the body runs as the owner (postgres) via SECURITY DEFINER.
GRANT EXECUTE ON FUNCTION public.update_pet_first_visit_flag() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_pet_first_visit_flag() TO service_role;


-- ────────────────────────────────────────────────────────────
-- 3c. Attach the trigger
-- ────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_flip_first_visit_on_completion ON public.appointments;

CREATE TRIGGER trg_flip_first_visit_on_completion
  AFTER UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_pet_first_visit_flag();


-- ────────────────────────────────────────────────────────────
-- 3d. Column-level RLS protection
-- ────────────────────────────────────────────────────────────
-- The `authenticated` role must not be able to SET is_first_visit
-- directly. The SECURITY DEFINER trigger (running as postgres) is
-- unaffected by this revoke and will continue to flip the flag.
REVOKE UPDATE (is_first_visit) ON public.pets FROM authenticated;

-- Re-confirm that anon cannot update it either (defensive).
REVOKE UPDATE (is_first_visit) ON public.pets FROM anon;
