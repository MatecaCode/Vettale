import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logAction } from '@/utils/actionLogger';
import { 
  generateAdminTimeSlots, 
  getAdminRequiredBackendSlots, 
  formatAdminTimeSlot,
  buildAdminAvailabilityMatrix
} from '@/utils/adminTimeSlotHelpers';

export interface AdminBookingData {
  clientUserId: string;
  petId: string;
  serviceId: string;
  providerIds: string[];
  bookingDate: string;
  timeSlot: string;
  notes?: string;
  calculatedPrice?: number;
  calculatedDuration?: number;
  overrideConflicts?: boolean;
}

export interface AdminBookingResult {
  success: boolean;
  appointmentId?: string;
  error?: any;
}

/**
 * Create a booking using the admin booking function
 * This function allows admins to book for any client and bypass certain constraints
 */
export async function createAdminBooking(
  bookingData: AdminBookingData,
  adminUserId?: string
): Promise<AdminBookingResult> {
  try {
    console.log('🔧 [ADMIN_BOOKING] Creating admin booking:', bookingData);

    const { data: appointmentId, error } = await supabase.rpc('create_booking_admin', {
      _client_user_id: bookingData.clientUserId,
      _pet_id: bookingData.petId,
      _service_id: bookingData.serviceId,
      _provider_ids: bookingData.providerIds,
      _booking_date: bookingData.bookingDate,
      _time_slot: bookingData.timeSlot,
      _notes: bookingData.notes || null,
      _calculated_price: bookingData.calculatedPrice || null,
      _calculated_duration: bookingData.calculatedDuration || null,
      _created_by: adminUserId || null,
      _override_conflicts: bookingData.overrideConflicts || false
    });

    if (error) {
      console.error('❌ [ADMIN_BOOKING] RPC error:', error);
      toast.error('Erro ao criar agendamento: ' + error.message);
      return { success: false, error };
    }

    console.log('✅ [ADMIN_BOOKING] Booking created successfully:', appointmentId);
    toast.success('Agendamento criado com sucesso!');

    void logAction({
      action_type: 'booking_created',
      category: 'booking',
      description: `Agendamento criado (admin) — pet ID: ${bookingData.petId}`,
      link_type: 'booking',
      link_id: appointmentId,
      metadata: { date: bookingData.bookingDate, time: bookingData.timeSlot, override: bookingData.overrideConflicts },
    });
    
    return { success: true, appointmentId };
  } catch (error: any) {
    console.error('❌ [ADMIN_BOOKING] Unexpected error:', error);
    toast.error('Erro inesperado ao criar agendamento');
    return { success: false, error };
  }
}

/**
 * Check if a user has admin privileges
 */
export async function checkAdminPrivileges(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('is_user_admin', {
      _user_id: userId
    });

    if (error) {
      console.error('❌ [ADMIN_BOOKING] Error checking admin privileges:', error);
      return false;
    }

    return data || false;
  } catch (error) {
    console.error('❌ [ADMIN_BOOKING] Error checking admin privileges:', error);
    return false;
  }
}

/**
 * Get the current admin user ID
 */
export async function getCurrentAdminUserId(): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('get_admin_user_id');

    if (error) {
      console.error('❌ [ADMIN_BOOKING] Error getting admin user ID:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('❌ [ADMIN_BOOKING] Error getting admin user ID:', error);
    return null;
  }
}

/**
 * Fetch admin availability for a specific date and staff
 * This is a standalone admin function that mirrors client logic but is isolated
 */
export async function fetchAdminAvailability(
  date: Date,
  staffIds: string[],
  serviceDuration: number
): Promise<Array<{ id: string; time: string; available: boolean }>> {
  try {
    console.log('🔧 [ADMIN_BOOKING] Fetching admin availability');
    console.log('📅 [ADMIN_BOOKING] Date:', date);
    console.log('👥 [ADMIN_BOOKING] Staff IDs:', staffIds);
    console.log('⏱️ [ADMIN_BOOKING] Service duration:', serviceDuration);

    // Deduplicate staff IDs
    const uniqueStaffIds = [...new Set(staffIds)];
    const dateForQuery = date.toISOString().split('T')[0];
    const isSaturday = date.getDay() === 6; // 6 = Saturday

    // Fetch staff availability from database
    const { data: rawAvailabilityData, error } = await supabase
      .from('staff_availability')
      .select('staff_profile_id, time_slot, available')
      .in('staff_profile_id', uniqueStaffIds)
      .eq('date', dateForQuery);

    if (error) {
      console.error('❌ [ADMIN_BOOKING] Error fetching staff availability:', error);
      throw error;
    }

    if (!rawAvailabilityData || rawAvailabilityData.length === 0) {
      console.log('⚠️ [ADMIN_BOOKING] No availability data found');
      return [];
    }

    console.log('📊 [ADMIN_BOOKING] Raw availability data:', rawAvailabilityData.length, 'records');

    // Build availability matrix using admin helper
    const availabilityMatrix = buildAdminAvailabilityMatrix(
      rawAvailabilityData,
      uniqueStaffIds,
      isSaturday
    );

    // Check each 30-minute slot for availability
    const clientSlots = generateAdminTimeSlots(isSaturday);
    const availableSlots: Array<{ id: string; time: string; available: boolean }> = [];

    for (const clientSlot of clientSlots) {
      let isSlotAvailable = true;

      // Get all required slots for the full service duration
      const requiredSlots = getAdminRequiredBackendSlots(clientSlot, serviceDuration, isSaturday);
      
      // Check if ALL selected staff are available for ALL required slots
      for (const staffId of uniqueStaffIds) {
        let staffAvailable = true;
        
        for (const requiredSlot of requiredSlots) {
          if (!availabilityMatrix[requiredSlot] || availabilityMatrix[requiredSlot][staffId] !== true) {
            staffAvailable = false;
            break;
          }
        }
        
        if (!staffAvailable) {
          isSlotAvailable = false;
          break;
        }
      }

      availableSlots.push({
        id: clientSlot,
        time: formatAdminTimeSlot(clientSlot),
        available: isSlotAvailable
      });
    }

    console.log('✅ [ADMIN_BOOKING] Generated admin availability:', availableSlots.length, 'slots');
    console.log('📊 [ADMIN_BOOKING] Available slots:', availableSlots.filter(s => s.available).length);

    return availableSlots;

  } catch (error) {
    console.error('❌ [ADMIN_BOOKING] Error fetching admin availability:', error);
    throw error;
  }
} 