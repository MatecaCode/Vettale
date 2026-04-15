// ─── First Visit Price Range Utility ─────────────────────────────────────────
// Item 18 & 22 — First Visit Price Range Logic
//
// When a pet's is_first_visit = true the clinic cannot quote a fixed price until
// the groomer evaluates the pet in person.  We show the min–max range for the
// pet's specific breed across all sizes so the client sees a realistic estimate.
//
// Range logic:
//   • min = lowest price for that breed across all sizes for the service
//   • max = highest price for that breed across all sizes for the service
//   • If the breed has no rows in service_pricing, falls back to all-breed range.
//
// This is shown ONLY when is_first_visit = true.  Returning pets always receive
// an exact calculated price (their registered size is considered reliable).
//
// This file is used exclusively by the CLIENT-FACING booking flow.
// The admin booking flow bypasses is_first_visit entirely.

import { supabase } from '@/integrations/supabase/client';

export interface PriceRange {
  min: number;
  max: number;
}

/**
 * Fetches the min and max price for a service scoped to a specific breed
 * (all sizes for that breed).  Falls back to all-breed range when no
 * breed-specific rows exist.
 *
 * @param serviceId  UUID of the service
 * @param breedName  Breed name string as stored in service_pricing.breed
 */
export async function getServicePriceRange(
  serviceId: string,
  breedName?: string,
): Promise<PriceRange | null> {
  // Step 1 — try breed-specific rows when a breed name is supplied
  if (breedName) {
    const { data: breedData, error: breedError } = await supabase
      .from('service_pricing')
      .select('price')
      .eq('service_id', serviceId)
      .eq('breed', breedName)
      .not('price', 'is', null)
      .gt('price', 0);

    if (!breedError && breedData && breedData.length > 0) {
      const prices = breedData.map((row) => Number(row.price));
      return { min: Math.min(...prices), max: Math.max(...prices) };
    }
  }

  // Step 2 — fall back to all-breed range
  const { data, error } = await supabase
    .from('service_pricing')
    .select('price')
    .eq('service_id', serviceId)
    .not('price', 'is', null)
    .gt('price', 0);

  if (error || !data || data.length === 0) return null;

  const prices = data.map((row) => Number(row.price));
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

/**
 * Formats a PriceRange for display in PT-BR.
 * When min === max (single porte), returns a single value instead of a range.
 * Examples:
 *   { min: 52, max: 55 } → "R$ 52,00 – R$ 55,00"
 *   { min: 67, max: 67 } → "R$ 67,00"
 */
export function formatPriceRange(range: PriceRange): string {
  const fmt = (n: number) =>
    n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  if (range.min === range.max) return fmt(range.min);
  return `${fmt(range.min)} – ${fmt(range.max)}`;
}

/**
 * PT-BR explanation shown to the client whenever is_first_visit = true.
 */
export const FIRST_VISIT_EXPLANATION =
  'Como é a primeira vez do seu pet, o preço final será definido após a avaliação presencial. ' +
  'O valor depende do tamanho, pelagem e condição do pet.';
