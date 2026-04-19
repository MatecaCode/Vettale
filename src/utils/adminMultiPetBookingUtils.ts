import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logAction } from '@/utils/actionLogger';
import { PricingService } from '@/services/pricingService';

export interface PetPricing {
  petId: string;
  duration: number;
  price: number;
  isFirstVisit: boolean;
  priceSource: string;
}

export interface MultiPetBookingData {
  clientUserId: string;
  petIds: string[];
  primaryServiceId: string;
  secondaryServiceId: string | null;
  providerIds: string[];
  bookingDate: string;
  startTimeSlot: string;
  perPetDurations: number[];
  perPetPrices: (number | null)[];
  notes?: string;
}

export interface MultiPetBookingResult {
  success: boolean;
  bookingGroupId?: string;
  error?: any;
}

/**
 * Computes per-pet duration and price for a multi-pet booking using the
 * existing PricingService. First-visit pets get their computed price but
 * the caller is responsible for deciding how to render the total range.
 */
export async function computePerPetPricing(
  pets: Array<{ id: string; breed?: string | null; size?: string | null; is_first_visit?: boolean | null }>,
  primaryServiceId: string,
  secondaryServiceId: string | null
): Promise<PetPricing[]> {
  const results: PetPricing[] = [];

  for (const pet of pets) {
    const primary = await PricingService.calculatePricing({
      serviceId: primaryServiceId,
      breedId: pet.breed || undefined,
      size: pet.size || undefined,
    });

    let duration = primary.duration;
    let price = primary.price;
    let priceSource = primary.priceSource;

    if (secondaryServiceId) {
      const secondary = await PricingService.calculatePricing({
        serviceId: secondaryServiceId,
        breedId: pet.breed || undefined,
        size: pet.size || undefined,
      });
      duration += secondary.duration;
      price += secondary.price;
    }

    results.push({
      petId: pet.id,
      duration,
      price,
      isFirstVisit: pet.is_first_visit === true,
      priceSource,
    });
  }

  return results;
}

/**
 * Submit a multi-pet admin booking. The RPC creates N sequential
 * appointments sharing a `booking_group_id` and returns that group UUID.
 */
export async function createAdminMultiPetBooking(
  data: MultiPetBookingData,
  adminUserId?: string
): Promise<MultiPetBookingResult> {
  try {
    console.log('🔧 [ADMIN_MULTI_PET] Creating multi-pet booking:', data);

    // Supabase RPC doesn't love mixed null/number arrays for numeric[];
    // first-visit pets get 0 here, and the caller should surface "to be quoted"
    // in the UI. The admin can edit price after the visit if needed.
    const prices = data.perPetPrices.map((p) => (p === null ? 0 : p));

    const { data: groupId, error } = await supabase.rpc('create_booking_admin_multi_pet', {
      _client_user_id: data.clientUserId,
      _pet_ids: data.petIds,
      _primary_service_id: data.primaryServiceId,
      _secondary_service_id: data.secondaryServiceId,
      _provider_ids: data.providerIds,
      _booking_date: data.bookingDate,
      _start_time_slot: data.startTimeSlot,
      _per_pet_durations: data.perPetDurations,
      _per_pet_prices: prices,
      _notes: data.notes || null,
      _created_by: adminUserId || null,
    });

    if (error) {
      console.error('❌ [ADMIN_MULTI_PET] RPC error:', error);
      toast.error('Erro ao criar agendamento múltiplo: ' + error.message);
      return { success: false, error };
    }

    console.log('✅ [ADMIN_MULTI_PET] Group created:', groupId);
    toast.success(`Agendamento para ${data.petIds.length} pets criado com sucesso!`);

    void logAction({
      action_type: 'booking_created',
      category: 'booking',
      description: `Agendamento multi-pet criado (admin) — ${data.petIds.length} pets`,
      link_type: 'booking',
      link_id: groupId as string,
      metadata: {
        date: data.bookingDate,
        time: data.startTimeSlot,
        pet_count: data.petIds.length,
        booking_group_id: groupId,
      },
    });

    return { success: true, bookingGroupId: groupId as string };
  } catch (error: any) {
    console.error('❌ [ADMIN_MULTI_PET] Unexpected error:', error);
    toast.error('Erro inesperado ao criar agendamento múltiplo');
    return { success: false, error };
  }
}
