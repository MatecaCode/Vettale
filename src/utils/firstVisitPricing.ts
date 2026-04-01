// ─── First Visit Price Range Utility ─────────────────────────────────────────
// Item 18 & 22 — First Visit Price Range Logic
//
// When a pet's is_first_visit = true the clinic cannot quote a fixed price until
// the groomer evaluates the pet in person. Instead, we show the client the full
// range (min–max) of service_pricing rows for the selected service so they
// understand the possible cost before booking.
//
// This file is used exclusively by the CLIENT-FACING booking flow.
// The admin booking flow bypasses is_first_visit entirely and always uses a
// fixed calculated price (see AdminManualBooking.tsx / AdminBookingPage.tsx).

import { supabase } from '@/integrations/supabase/client';

export interface PriceRange {
  min: number;
  max: number;
}

/**
 * Fetches the min and max price across ALL porte/size rows in service_pricing
 * for the given service. Returns null when no valid prices exist for the service.
 */
export async function getServicePriceRange(serviceId: string): Promise<PriceRange | null> {
  const { data, error } = await supabase
    .from('service_pricing')
    .select('price')
    .eq('service_id', serviceId)
    .not('price', 'is', null)
    .gt('price', 0);

  if (error || !data || data.length === 0) return null;

  const prices = data.map((row) => Number(row.price));
  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
  };
}

/**
 * Formats a PriceRange for display in PT-BR.
 * When min === max (single porte), returns a single value instead of a range.
 * Examples:
 *   { min: 45, max: 89 } → "R$ 45,00 – R$ 89,00"
 *   { min: 60, max: 60 } → "R$ 60,00"
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
