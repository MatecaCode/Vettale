
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useAuth } from './useAuth';
import { useAppointmentData } from './useAppointmentData';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { usePricing } from './usePricing';
import { debugAppointmentStatus, debugServiceStatus } from '@/utils/debugAppointmentStatus';
import { useNavigate } from 'react-router-dom';
import { getRequiredBackendSlots } from '@/utils/timeSlotHelpers';
import { getServiceCategory, ServiceCategory } from '@/utils/serviceCategory';
import { PricingService } from '@/services/pricingService';

export interface Pet {
  id: string;
  name: string;
  breed?: string;
  breed_id?: string;
  age?: string;
  size?: string;
  weight?: number;
  gender?: string;
  notes?: string;
  // Item 23/22: true = pet has never had a completed appointment
  is_first_visit?: boolean;
}

export interface Service {
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

export interface Provider {
  id: string;
  name: string;
  role: string;
  rating: number;
  reviewCount?: number;
  about: string;
  profile_image?: string;
  specialty?: string;
}

export interface TimeSlot {
  id: string;
  time: string;
  available: boolean;
}

export interface NextAvailable {
  date: string;
  time: string;
  staff_name?: string;
}

export const useAppointmentForm = (serviceType: 'grooming' | 'veterinary') => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [selectedGroomerId, setSelectedGroomerId] = useState<string | null>(null);
  const [selectedTimeSlotId, setSelectedTimeSlotId] = useState<string | null>(null);
  const [selectedPet, setSelectedPet] = useState<Pet | null>(null);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedSecondaryService, setSelectedSecondaryService] = useState<Service | null>(null);
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'calendar' | 'next-available'>('calendar');
  const [formStep, setFormStep] = useState(1);
  const [serviceRequiresStaff, setServiceRequiresStaff] = useState(false);
  const [serviceRequirementsLoaded, setServiceRequirementsLoaded] = useState(false);

  // Add selected staff state for multi-role support
  const [selectedStaff, setSelectedStaff] = useState<{
    batherId?: string;
    groomerId?: string;
    vetId?: string;
  }>({});

  const {
    timeSlots,
    nextAvailable,
    userPets,
    services,
    groomers,
    fetchAvailableProviders,
    fetchServices,
    fetchUserPets,
    fetchTimeSlots,
  } = useAppointmentData();

  // Track available time slots
  useEffect(() => {
    const availableCount = timeSlots.filter(s => s.available).length;
    if (availableCount === 0 && timeSlots.length > 0) {
      console.log('[APPOINTMENT] No available slots found for selected date/staff');
    }
  }, [timeSlots]);

  // Get pricing for current pet/service combination
  // Use breed name (text) not breed_id (UUID) — service_pricing.breed stores names
  const pricingParams = selectedPet && selectedService ? {
    serviceId: selectedService.id,
    breedId: selectedPet.breed,
    size: selectedPet.size
  } : null;

  const { pricing } = usePricing(pricingParams);

  // Secondary pricing — needed so the time-slot availability check uses the
  // same breed-specific duration the DB will use when reserving slots.
  const secondaryPricingParams = selectedPet && selectedSecondaryService ? {
    serviceId: selectedSecondaryService.id,
    breedId: selectedPet.breed,
    size: selectedPet.size
  } : null;
  const { pricing: secondaryPricing } = usePricing(secondaryPricingParams);

  // Check service requirements when service is selected
  useEffect(() => {
    if (selectedService) {
      const requiresStaff = selectedService.requires_grooming || selectedService.requires_vet || selectedService.requires_bath;
      setServiceRequiresStaff(requiresStaff);
      setServiceRequirementsLoaded(true);

      // Clear secondary when primary isn't BATH
      const primaryCategory = getServiceCategory(selectedService as any);
      if (primaryCategory !== 'BATH' && selectedSecondaryService) {
        setSelectedSecondaryService(null);
      }
    } else {
      setServiceRequirementsLoaded(false);
    }
  }, [selectedService, selectedSecondaryService]);

  // Compute secondary options based on primary category
  const secondaryOptions = useMemo(() => {
    const primaryCategory: ServiceCategory = getServiceCategory(selectedService as any);
    if (primaryCategory !== 'BATH') return [];
    return (services || []).filter(s => getServiceCategory(s as any) === 'GROOM');
  }, [selectedService, services]);

  // Fetch user pets when user changes
  useEffect(() => {
    if (user) {
      fetchUserPets(user.id);
    }
  }, [user, fetchUserPets]);

  // Helper function to get all selected staff IDs as an array (DEDUPLICATED and MEMOIZED)
  const getSelectedStaffIds = useMemo((): string[] => {
    const staffIds: string[] = [];
    
    if (selectedStaff.batherId) staffIds.push(selectedStaff.batherId);
    if (selectedStaff.groomerId) staffIds.push(selectedStaff.groomerId);
    if (selectedStaff.vetId) staffIds.push(selectedStaff.vetId);
    
    // Fallback to legacy selectedGroomerId for backward compatibility
    if (staffIds.length === 0 && selectedGroomerId) {
      staffIds.push(selectedGroomerId);
    }
    
    // Deduplicate staff IDs to prevent double-checking same staff
    const uniqueStaffIds = [...new Set(staffIds)];
    
    return uniqueStaffIds;
  }, [selectedStaff, selectedGroomerId]);

  // Memoize the staff IDs as a string for stable dependency comparison
  const staffIdsKey = useMemo(() => {
    return getSelectedStaffIds.sort().join(',');
  }, [getSelectedStaffIds]);

  // Only fetch time slots when we have ALL required data (debounced to reduce flicker)
  const fetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // Only fetch on step 3 (date/time selection) and when we have ALL required data
    if (formStep !== 3 || !date || !selectedService) {
      return;
    }

    // If service requires staff, make sure staff is selected
    if (serviceRequiresStaff && getSelectedStaffIds.length === 0) {
      return;
    }

    // Wait for breed-specific pricing to resolve before fetching slots. Otherwise
    // the availability preview uses the service's default_duration (e.g. 40 min for
    // Banho Completo) while the backend reserves using the breed override (e.g. 75
    // min for Yorkshire medium) — slots then look free in the UI but the DB
    // rejects the booking with "Not enough primary slots reserved".
    if (selectedPet && !pricing) {
      return;
    }
    if (selectedPet && selectedSecondaryService && !secondaryPricing) {
      return;
    }

    if (fetchDebounceRef.current) {
      clearTimeout(fetchDebounceRef.current);
    }

    fetchDebounceRef.current = setTimeout(() => {
      const staffIds = serviceRequiresStaff ? getSelectedStaffIds : [];
      fetchTimeSlots(
        date,
        staffIds,
        setIsLoading,
        selectedService,
        selectedSecondaryService || null,
        pricing?.duration ?? null,
        secondaryPricing?.duration ?? null
      );
    }, 300); // debounce to avoid flicker and duplicate calls

    return () => {
      if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current);
    };
  }, [date, staffIdsKey, selectedService, selectedSecondaryService, serviceRequiresStaff, fetchTimeSlots, formStep, getSelectedStaffIds, pricing?.duration, secondaryPricing?.duration, selectedPet]);

  // Clear any selected time slot whenever the breed-specific duration changes —
  // a slot that looked free under the old duration may not be free under the new
  // one. Forcing the user to re-pick from the refreshed list prevents stale
  // selections from making it to submit.
  useEffect(() => {
    setSelectedTimeSlotId(null);
  }, [pricing?.duration, secondaryPricing?.duration]);

  const handleNextAvailableSelect = useCallback(() => {
    if (nextAvailable) {
      setDate(new Date(nextAvailable.date));
      setSelectedTimeSlotId(nextAvailable.time);
      setActiveTab('calendar');
    }
  }, [nextAvailable]);

  const handleSubmit = useCallback(async (e: React.FormEvent, selectedStaffIds?: string[]) => {
    e.preventDefault();
    
    // Starting booking submission
    
    if (!user || !selectedPet || !selectedService || !date || !selectedTimeSlotId) {
      toast.error('Por favor, preencha todos os campos obrigatórios');
      return;
    }

    // Runtime checks for category behavior
    const primaryCategory = getServiceCategory(selectedService as any);
    if (primaryCategory === 'BATH') {
      console.log('[CLIENT_BOOKING] Primary=BATH → secondary options should be GROOM only:', secondaryOptions.map(s => s.name));
    } else {
      if (selectedSecondaryService) {
        console.warn('[CLIENT_BOOKING] Secondary service should be cleared when primary is not BATH. Clearing now.');
        setSelectedSecondaryService(null);
      }
    }

    // Get staff IDs - use parameter if provided, otherwise get from state
    const rawStaffIds = selectedStaffIds || getSelectedStaffIds;
    // Deduplicate staff IDs at the very start of booking
    const uniqueStaffIds = [...new Set(rawStaffIds)];

    try {
      setIsLoading(true);
      
      // Start minimum loading time (1.5 seconds)
      const minimumLoadingTime = new Promise(resolve => setTimeout(resolve, 1500));
      
      // Optional debug (DEV only)
      if (import.meta.env && import.meta.env.DEV) {
        await debugAppointmentStatus();
        await debugServiceStatus();
      }
      
      // Preparing booking details

      // Get client_id from user_id
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (clientError || !clientData) {
        throw new Error('Erro ao encontrar dados do cliente');
      }

      const dateStr = date.toISOString().split('T')[0];

      // Item 22: first-visit pets get NULL price — the clinic will quote after evaluation.
      const isFirstVisit = selectedPet.is_first_visit === true;

      // Always compute pricing fresh at submit time using breed name (not UUID).
      // This avoids stale hook state and the breed_id vs breed name mismatch.
      const primaryPricingResult = await PricingService.calculatePricing({
        serviceId: selectedService.id,
        breedId: selectedPet.breed,
        size: selectedPet.size || undefined
      });

      const primaryPrice: number = primaryPricingResult?.price ?? (selectedService.base_price ?? 0);
      const primaryDuration: number = primaryPricingResult?.duration ?? (selectedService.default_duration ?? 60);

      let secondaryPrice = 0;
      let secondaryDuration = 0;

      const primaryCategory = getServiceCategory(selectedService as any);
      if (!isFirstVisit && primaryCategory === 'BATH' && selectedSecondaryService) {
        const sec = await PricingService.calculatePricing({
          serviceId: selectedSecondaryService.id,
          breedId: selectedPet.breed,
          size: selectedPet.size || undefined
        });
        secondaryPrice = sec?.price ?? 0;
        secondaryDuration = sec?.duration ?? 0;
      }

      const calculatedPrice: number | null = isFirstVisit
        ? null
        : primaryPrice + secondaryPrice;
      const calculatedDuration = primaryDuration + secondaryDuration;
      
      const appointmentData = {
        client_id: clientData.id,
        pet_id: selectedPet.id,
        service_id: selectedService.id,
        date: dateStr,
        time: selectedTimeSlotId,
        notes: notes || null,
        status: 'pending', // Always start as pending for admin approval
        service_status: 'not_started',
        duration: calculatedDuration,
        // Item 22: null for first-visit pets; the clinic quotes after evaluation
        total_price: calculatedPrice
      };

      // Creating appointment

      const bookingPromise = (async () => {
        // Use the clean client booking function with calculated values
        const { data: appointmentId, error: atomicError } = await supabase.rpc('create_booking_client', {
          _client_user_id: user.id,
          _pet_id: selectedPet.id,
          _service_id: selectedService.id,
          _secondary_service_id: selectedSecondaryService?.id || null,
          _provider_ids: uniqueStaffIds,
          _booking_date: dateStr,
          _time_slot: selectedTimeSlotId,
          _notes: notes || null,
          _calculated_price: calculatedPrice,
          _calculated_duration: calculatedDuration,
          _primary_price: isFirstVisit ? null : primaryPrice,
          _primary_duration: primaryDuration,
          _secondary_price: secondaryPrice > 0 ? secondaryPrice : null,
          _secondary_duration: secondaryDuration > 0 ? secondaryDuration : null
        });

        if (atomicError || !appointmentId) {
          throw new Error(`Erro ao criar agendamento: ${atomicError?.message || 'Erro desconhecido'}`);
        }

        // Fetch the created appointment details for response
        const { data: appointment, error: fetchError } = await supabase
          .from('appointments')
          .select('*')
          .eq('id', appointmentId)
          .single();

        if (fetchError || !appointment) {
          // Still return appointmentId since booking was successful
          return { id: appointmentId };
        }

        return appointment;
      })();

      // Wait for both minimum loading time and booking completion
      const [appointment] = await Promise.all([bookingPromise, minimumLoadingTime]);

      // Success! Show confirmation message
      toast.success('Agendamento criado com sucesso! Aguardando aprovação da clínica.', {
        duration: 4000,
        style: {
          background: '#F59E0B',
          color: 'white',
          border: 'none'
        }
      });

      // Booking completed successfully
      
      // Reset form
      setSelectedPet(null);
      setSelectedService(null);
      setDate(undefined);
      setSelectedTimeSlotId(null);
      setSelectedGroomerId(null);
      setSelectedStaff({});
      setNotes('');
      setFormStep(1);
      
      // Redirect to booking success page with appointment ID
      navigate(`/booking-success?id=${appointment.id}`);
      
    } catch (error: any) {
      console.error('Booking error:', error);
      
      // Wait for minimum loading time even on error
      await new Promise(resolve => setTimeout(resolve, Math.max(0, 1500)));
      
      const errorMessage = error.message || 'Erro desconhecido ao criar agendamento';
      toast.error(`Erro ao criar agendamento: ${errorMessage}`, {
        duration: 8000,
        style: {
          background: '#EF4444',
          color: 'white',
          border: 'none'
        }
      });
    } finally {
      setIsLoading(false);
    }
  }, [user, selectedPet, selectedService, date, selectedTimeSlotId, selectedGroomerId, selectedStaff, notes, serviceRequiresStaff, pricing, navigate, getSelectedStaffIds]);

  return {
    date,
    setDate,
    selectedGroomerId,
    setSelectedGroomerId,
    selectedTimeSlotId,
    setSelectedTimeSlotId,
    selectedPet,
    setSelectedPet,
    selectedService,
    setSelectedService,
    selectedSecondaryService,
    setSelectedSecondaryService,
    secondaryOptions,
    notes,
    setNotes,
    timeSlots,
    isLoading,
    nextAvailable,
    activeTab,
    setActiveTab,
    formStep,
    setFormStep,
    userPets,
    services,
    groomers,
    handleNextAvailableSelect,
    handleSubmit,
    fetchServices: fetchServices,
    serviceRequiresStaff,
    serviceRequirementsLoaded,
    pricing,
    // Expose multi-staff state and helpers
    selectedStaff,
    setSelectedStaff,
    getSelectedStaffIds,
  };
};
