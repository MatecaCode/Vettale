-- Multi-Pet Booking — PR 1: schema only.
--
-- Adds a nullable grouping identifier to `appointments` so that, in a future
-- PR, N back-to-back single-pet appointments can be linked together as one
-- logical "booking" for the admin UI. This migration is intentionally inert:
-- no code reads or writes these columns yet, so behavior does not change.
--
-- Design reference: docs/MULTI_PET_BOOKING_PROPOSAL.md (§4, §10 PR 1).
-- Rollback: safe to drop both columns; no data depends on them.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS booking_group_id UUID NULL,
  ADD COLUMN IF NOT EXISTS booking_group_order SMALLINT NULL;

-- Partial index: most appointments are single-pet (NULL group_id) and don't
-- need to be indexed. Only grouped rows are looked up by group_id.
CREATE INDEX IF NOT EXISTS idx_appointments_booking_group
  ON public.appointments(booking_group_id)
  WHERE booking_group_id IS NOT NULL;

COMMENT ON COLUMN public.appointments.booking_group_id IS
  'Multi-pet booking group. NULL for single-pet bookings (the default). '
  'When set, all appointments sharing this UUID represent one logical booking '
  'covering multiple pets of the same client, scheduled sequentially.';

COMMENT ON COLUMN public.appointments.booking_group_order IS
  'Display order of this pet within its booking group (1-based). NULL when '
  'booking_group_id IS NULL.';
