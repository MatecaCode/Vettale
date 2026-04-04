-- Fix 1: Admin delete policy for pets
-- Admins could SELECT and UPDATE all pets but had no DELETE policy,
-- causing pet deletion to fail for pets owned by other users.
DROP POLICY IF EXISTS "Admins can delete all pets" ON public.pets;

CREATE POLICY "Admins can delete all pets"
  ON public.pets
  FOR DELETE
  USING (has_role(auth.uid(), 'admin'::text));

-- Fix 2: RLS policies for service_pricing
-- This table had no policies, blocking admin writes (INSERT/UPDATE/DELETE).
ALTER TABLE public.service_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage service pricing" ON public.service_pricing;
DROP POLICY IF EXISTS "Authenticated users can read service pricing" ON public.service_pricing;

-- Admins can do everything (INSERT requires auth.uid() to be an admin)
CREATE POLICY "Admins can manage service pricing"
  ON public.service_pricing
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::text))
  WITH CHECK (has_role(auth.uid(), 'admin'::text));

-- All authenticated users can read pricing (needed for booking flow)
CREATE POLICY "Authenticated users can read service pricing"
  ON public.service_pricing
  FOR SELECT
  TO authenticated
  USING (true);
