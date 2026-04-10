// Admin-specific availability hook - isolated from client logic
// This mirrors the client logic but is completely separate for admin use

import { useState, useCallback } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  generateAdminTimeSlots, 
  getAdminRequiredBackendSlots, 
  formatAdminTimeSlot
} from '@/utils/adminTimeSlotHelpers';
import { toHHMM } from '@/utils/time';

export interface AdminTimeSlot {
  id: string;
  time: string;
  available: boolean;
}

export interface AdminService {
  id: string;
  name: string;
  service_type: string;
  base_price?: number;
  default_duration?: number;
  requires_grooming?: boolean;
  requires_vet?: boolean;
  requires_bath?: boolean;
  active?: boolean;
}

export interface AdminProvider {
  id: string;
  name: string;
  bio?: string;
  can_bathe?: boolean;
  can_groom?: boolean;
  can_vet?: boolean;
  photo_url?: string;
  hourly_rate?: number;
}

export const useAdminAvailability = () => {
  const [timeSlots, setTimeSlots] = useState<AdminTimeSlot[]>([]);
  const [services, setServices] = useState<AdminService[]>([]);
  const [providers, setProviders] = useState<AdminProvider[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch all services for admin use
  const fetchAdminServices = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('active', true)
        .order('name');

      if (error) {
        console.error('Error fetching services:', error);
        toast.error('Erro ao buscar serviços');
        return;
      }

      setServices(data || []);
    } catch (error) {
      console.error('Unexpected error fetching services:', error);
      toast.error('Erro inesperado ao buscar serviços');
    }
  }, []);

  // Fetch all available providers for admin use
  const fetchAdminProviders = useCallback(async (serviceType?: string) => {
    try {
      let query = supabase
        .from('staff_profiles')
        .select('*')
        .eq('active', true);

      // Filter based on service type capabilities if specified
      if (serviceType === 'grooming') {
        query = query.eq('can_groom', true);
      } else if (serviceType === 'veterinary') {
        query = query.eq('can_vet', true);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching available providers:', error);
        toast.error('Erro ao buscar profissionais disponíveis');
        return;
      }

      // Transform staff_profiles data to match AdminProvider interface
      const transformedData = data?.map(staff => ({
        id: staff.id,
        name: staff.name,
        bio: staff.bio,
        can_bathe: staff.can_bathe,
        can_groom: staff.can_groom,
        can_vet: staff.can_vet,
        photo_url: staff.photo_url,
        hourly_rate: staff.hourly_rate,
      })) || [];

      setProviders(transformedData);
    } catch (error) {
      console.error('Unexpected error fetching available providers:', error);
      toast.error('Erro inesperado ao buscar profissionais');
    }
  }, []);

  // Enhanced admin time slot fetching with dual-service support
  const fetchAdminTimeSlots = useCallback(async (
    date: Date,
    staffIds: string[],
    selectedService: AdminService | null,
    selectedSecondaryService: AdminService | null = null,
    excludeAppointmentId: string | null = null
  ) => {
    console.log(`🔧 [ADMIN_AVAILABILITY] Fetching admin time slots`);
    console.log(`📅 [ADMIN_AVAILABILITY] Date: ${format(date, 'yyyy-MM-dd')}`);
    console.log(`👥 [ADMIN_AVAILABILITY] Staff IDs:`, staffIds);
    console.log(`📋 [ADMIN_AVAILABILITY] Selected service:`, selectedService?.name);

    // Always generate time slots for the selected date
    const isSaturday = date.getDay() === 6; // 6 = Saturday
    const clientSlots = generateAdminTimeSlots(isSaturday);
    
    console.log(`📊 [ADMIN_AVAILABILITY] Generated ${clientSlots.length} base slots for ${isSaturday ? 'Saturday' : 'weekday'}`);

    // If no service selected, mark all slots as unavailable
    if (!selectedService) {
      console.log(`⚠️ [ADMIN_AVAILABILITY] No service selected - marking all slots as unavailable`);
      const unavailableSlots = clientSlots.map(slot => ({
        id: slot,
        time: toHHMM(slot),
        available: false
      }));
      setTimeSlots(unavailableSlots);
      return;
    }

    // If no staff provided and service requires staff, mark all slots as unavailable
    if (!staffIds || staffIds.length === 0) {
      const serviceRequiresStaff = selectedService.requires_grooming || selectedService.requires_vet || selectedService.requires_bath;
      
      if (serviceRequiresStaff) {
        console.log(`⚠️ [ADMIN_AVAILABILITY] Service requires staff but none selected - marking all slots as unavailable`);
        const unavailableSlots = clientSlots.map(slot => ({
          id: slot,
          time: toHHMM(slot),
          available: false
        }));
        setTimeSlots(unavailableSlots);
        return;
      } else {
        // For services that don't require staff, mark all slots as available
        console.log(`✅ [ADMIN_AVAILABILITY] Service doesn't require staff - marking all slots as available`);
        const availableSlots = clientSlots.map(slot => ({
          id: slot,
          time: toHHMM(slot),
          available: true
        }));
        setTimeSlots(availableSlots);
        return;
      }
    }

    // Use the new dual-service RPC function
    const dateForQuery = format(date, 'yyyy-MM-dd');
    
    // Determine primary and secondary staff IDs
    const primaryStaffId = staffIds[0] || null;
    const secondaryStaffId = staffIds.length > 1 ? staffIds[1] : null;

    // Check if all required parameters are available
    if (!primaryStaffId || !selectedService?.id) {
      console.log(`⚠️ [ADMIN_AVAILABILITY] Missing required parameters - marking all slots as unavailable`);
      const unavailableSlots = clientSlots.map(slot => ({
        id: slot,
        time: toHHMM(slot),
        available: false
      }));
      setTimeSlots(unavailableSlots);
      return;
    }

    setLoading(true);

    try {
      console.log(`🔍 [ADMIN_AVAILABILITY] Using dual-service slot finding`);
      console.log(`👥 [ADMIN_AVAILABILITY] Primary staff: ${primaryStaffId}`);
      console.log(`👥 [ADMIN_AVAILABILITY] Secondary staff: ${secondaryStaffId}`);
      console.log(`📋 [ADMIN_AVAILABILITY] Primary service: ${selectedService?.name}`);
      console.log(`📋 [ADMIN_AVAILABILITY] Secondary service: ${selectedSecondaryService?.name}`);

      // Add debugging logs for development
      if (process.env.NODE_ENV === 'development') {
        console.log('[ADMIN_SLOTS] params', {
          date: dateForQuery,
          primaryServiceId: selectedService?.id,
          secondaryServiceId: selectedSecondaryService?.id,
          primaryStaffId,
          secondaryStaffId,
        });
      }

      const rpcParams: Record<string, any> = {
        _date: dateForQuery,
        _primary_staff_id: primaryStaffId,
        _primary_service_id: selectedService?.id,
        _secondary_staff_id: secondaryStaffId,
        _secondary_service_id: selectedSecondaryService?.id || null,
      };
      if (excludeAppointmentId) {
        rpcParams._exclude_appointment_id = excludeAppointmentId;
      }

      const { data: availableStartTimes, error } = await supabase.rpc('find_dual_service_slots', rpcParams);

      if (error) {
        console.error('[ADMIN_SLOTS] rpc error', error);
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[ADMIN_SLOTS] slots', (availableStartTimes ?? []).slice(0, 10));
      }

      if (error) {
        console.error('❌ [ADMIN_AVAILABILITY] Error fetching dual-service slots:', error);
        toast.error('Erro ao buscar horários disponíveis');
        // Mark all slots as unavailable on error
        const unavailableSlots = clientSlots.map(slot => ({
          id: slot,
          time: toHHMM(slot),
          available: false
        }));
        setTimeSlots(unavailableSlots);
        return;
      }

      console.log(`📊 [ADMIN_AVAILABILITY] Found ${availableStartTimes?.length || 0} available start times`);

      // Build available time slots set from RPC results (canonical HH:MM format)
      const availableHHMM = new Set((availableStartTimes ?? []).map((r: any) => toHHMM(r.start_time)));

      // Convert available start times to AdminTimeSlot format
      const availableSlots: AdminTimeSlot[] = clientSlots.map(slot => {
        const label = toHHMM(slot); // Ensure HH:MM format
        const isAvailable = availableHHMM.has(label);

        return {
          id: slot,
          time: label,
          available: isAvailable
        };
      });

      console.log(`✅ [ADMIN_AVAILABILITY] Generated ${availableSlots.length} admin time slots`);
      console.log(`📊 [ADMIN_AVAILABILITY] Available slots: ${availableSlots.filter(s => s.available).length}`);
      
      setTimeSlots(availableSlots);

    } catch (error) {
      console.error('❌ [ADMIN_AVAILABILITY] Pipeline error:', error);
      toast.error('Erro inesperado ao buscar horários');
              // Mark all slots as unavailable on error
        const unavailableSlots = clientSlots.map(slot => ({
          id: slot,
          time: toHHMM(slot),
          available: false
        }));
      setTimeSlots(unavailableSlots);
    } finally {
      setLoading(false);
    }
  }, []);

  // Monitor critical time slot issues
  const availableCount = timeSlots.filter(s => s.available).length;
  if (timeSlots.length > 0 && availableCount === 0) {
    console.log('[ADMIN_AVAILABILITY] No available slots found for current selection');
  }

  return {
    timeSlots,
    services,
    providers,
    loading,
    fetchAdminServices,
    fetchAdminProviders,
    fetchAdminTimeSlots,
  };
}; 