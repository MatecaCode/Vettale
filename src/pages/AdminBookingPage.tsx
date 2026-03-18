
import React, { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BookingCalendar } from '@/components/calendars/admin/BookingCalendar';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { log } from '@/utils/logger';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

import { createAdminBooking } from '@/utils/adminBookingUtils';
import { useNavigate } from 'react-router-dom';
import BookingReviewModal from '@/components/admin/BookingReviewModal';
import BookingDiagnostics from '@/components/admin/BookingDiagnostics';
import { AlertCircle } from 'lucide-react';
import browserCompatibility from '@/utils/browserCompatibility';
import { initializeChromeCompatibility } from '@/utils/chromePolyfills';

interface Client {
  id: string;
  name: string;
  user_id: string;
}

interface Pet {
  id: string;
  name: string;
  breed?: string;
}

interface Service {
  id: string;
  name: string;
  default_duration: number;
  base_price: number;
  requires_bath?: boolean;
  requires_grooming?: boolean;
  requires_vet?: boolean;
}

interface Staff {
  id: string;
  name: string;
  can_groom: boolean;
  can_vet: boolean;
  can_bathe?: boolean;
}

interface TimeSlot {
  time_slot: string;
}

interface AvailabilitySummary {
  date: string;
  has_availability: boolean;
}

const AdminBookingPage = () => {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  
  log.debug('[ADMIN_BOOKING] Component initialized');
  log.debug('[ADMIN_BOOKING] User:', user?.email);
  log.debug('[ADMIN_BOOKING] Is Admin:', isAdmin);
  const [clients, setClients] = useState<Client[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [availabilitySummary, setAvailabilitySummary] = useState<AvailabilitySummary[]>([]);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  
  // Client search states
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [isClientComboboxOpen, setIsClientComboboxOpen] = useState(false);
  const [isLoadingClients, setIsLoadingClients] = useState(false);
  
  // Updated state for dual-service support
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedPet, setSelectedPet] = useState('');
  const [selectedPrimaryService, setSelectedPrimaryService] = useState('');
  const [selectedSecondaryService, setSelectedSecondaryService] = useState('');
  const [showSecondaryServiceDropdown, setShowSecondaryServiceDropdown] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('');
  const [notes, setNotes] = useState('');
  
  // New state for staff profile IDs array and month tracking
  const [staffProfileIds, setStaffProfileIds] = useState<string[]>([]);
  const [visibleMonth, setVisibleMonth] = useState<Date>(new Date());
  const [enabledDates, setEnabledDates] = useState<Set<string>>(new Set());
  
  const [isLoading, setIsLoading] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewBookingData, setReviewBookingData] = useState<any>(null);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  // Global error handler for unhandled errors
  useEffect(() => {
    // Initialize browser compatibility and Chrome polyfills
    browserCompatibility.logCompatibilityReport();
    browserCompatibility.applyFallbacks();
    initializeChromeCompatibility();

    const handleUnhandledError = (event: ErrorEvent) => {
      log.error('[ADMIN_BOOKING] Unhandled error caught:', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error,
        browserInfo: browserCompatibility.getBrowserInfo()
      });
      toast.error('Erro inesperado detectado. Verifique o console para mais detalhes.');
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('🚨 [ADMIN_BOOKING] Unhandled promise rejection:', {
        reason: event.reason,
        promise: event.promise,
        browserInfo: browserCompatibility.getBrowserInfo()
      });
      toast.error('Erro de promessa não tratada. Verifique o console para mais detalhes.');
    };

    window.addEventListener('error', handleUnhandledError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleUnhandledError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  // Load initial data (excluding clients - they will be loaded on search)
  useEffect(() => {
    if (!isAdmin) return;
    
    console.log('🔍 [ADMIN_BOOKING] Loading initial data...');
    
    const loadData = async () => {
      setIsDataLoading(true);
      setDataError(null);
      try {
        // Load services with additional fields for role requirements
        const { data: servicesData } = await supabase
          .from('services')
          .select('id, name, default_duration, base_price, requires_bath, requires_grooming, requires_vet')
          .eq('active', true)
          .order('name');
        setServices(servicesData || []);

        // Load available staff (excludes admins)
        const { data: staffData } = await supabase
          .from('staff_profiles')
          .select('id, name, can_groom, can_vet, can_bathe')
          .eq('active', true)
          .order('name');
        setStaff(staffData || []);
        
        console.log('🔍 [ADMIN_BOOKING] Initial data loaded successfully');
        console.log('🔍 [ADMIN_BOOKING] Services:', servicesData?.length || 0);
        console.log('🔍 [ADMIN_BOOKING] Staff:', staffData?.length || 0);
      } catch (error) {
        console.error('Error loading data:', error);
        setDataError('Erro ao carregar dados');
        toast.error('Erro ao carregar dados');
      } finally {
        setIsDataLoading(false);
      }
    };

    loadData();
  }, [isAdmin]);

  // Load pets when client changes
  useEffect(() => {
    if (!selectedClient) {
      setPets([]);
      return;
    }

    const loadPets = async () => {
      try {
        console.log('🔍 [ADMIN_BOOKING] Loading pets for client:', selectedClient);
        const { data: petsData, error: petsError } = await supabase
          .from('pets')
          .select('id, name, breed')
          .eq('client_id', selectedClient)
          .eq('active', true)
          .order('name');
        
        if (petsError) {
          console.error('Error loading pets:', petsError);
          toast.error('Erro ao carregar pets');
          return;
        }
        
        console.log('🔍 [ADMIN_BOOKING] Loaded pets:', petsData);
        setPets(petsData || []);
      } catch (error) {
        console.error('Error loading pets:', error);
        toast.error('Erro ao carregar pets');
      }
    };

    loadPets();
  }, [selectedClient]);

  // Clear search when combobox closes
  useEffect(() => {
    if (!isClientComboboxOpen) {
      setClientSearchQuery('');
      // Keep the selected client in the list if one is selected
      if (selectedClient) {
        const selectedClientData = clients.find(c => c.id === selectedClient);
        if (selectedClientData) {
          setClients([selectedClientData]);
        }
      } else {
        setClients([]);
      }
    }
  }, [isClientComboboxOpen]);

  // Debounced client search
  useEffect(() => {
    // Don't search if the query is empty
    if (!clientSearchQuery || clientSearchQuery.length < 1) {
      // If there's a selected client, keep it in the list
      if (selectedClient && clientSearchQuery.length === 0) {
        const selectedClientData = clients.find(c => c.id === selectedClient);
        if (selectedClientData) {
          setClients([selectedClientData]);
        }
      } else {
        setClients([]);
      }
      return;
    }

    const searchClients = async () => {
      setIsLoadingClients(true);
      try {
        console.log('🔍 [ADMIN_BOOKING] Searching clients with query:', clientSearchQuery);
        
        // Search clients by name that START WITH the query (not contains)
        const { data: clientsData, error: clientsError } = await supabase
          .from('clients')
          .select('id, name, user_id')
          .ilike('name', `${clientSearchQuery}%`)
          .order('name')
          .limit(50); // Limit results for performance
        
        if (clientsError) {
          console.error('Error searching clients:', clientsError);
          toast.error('Erro ao buscar clientes');
          return;
        }
        
        console.log('🔍 [ADMIN_BOOKING] Found clients:', clientsData?.length || 0);
        setClients(clientsData || []);
      } catch (error) {
        console.error('Error searching clients:', error);
        toast.error('Erro ao buscar clientes');
      } finally {
        setIsLoadingClients(false);
      }
    };

    // Debounce the search by 300ms
    const timeoutId = setTimeout(() => {
      searchClients();
    }, 300);

    // Cleanup function to cancel the timeout if the query changes
    return () => clearTimeout(timeoutId);
  }, [clientSearchQuery, selectedClient, clients]);

  // Handle primary service selection
  const handlePrimaryServiceChange = (serviceId: string) => {
    try {
      console.log('🔍 [ADMIN_BOOKING] Service selection started:', serviceId);
      console.log('🔍 [ADMIN_BOOKING] Available services count:', services.length);
      const serviceList = [];
      for (let i = 0; i < services.length; i++) {
        const s = services[i];
        serviceList.push({ id: s.id, name: s.name });
      }
      console.log('🔍 [ADMIN_BOOKING] Services:', serviceList);
      
      setSelectedPrimaryService(serviceId);
      setSelectedSecondaryService(''); // Reset secondary service
      
      const service = services.find(s => s.id === serviceId);
      console.log('🔍 [ADMIN_BOOKING] Selected service:', service);
      
      if (!service) {
        console.error('🔍 [ADMIN_BOOKING] Service not found for ID:', serviceId);
        toast.error(`Serviço não encontrado: ${serviceId}`);
        return;
      }
      
      // More robust check for BANHO services
      const isBanho = service.name.toLowerCase().includes('banho') || 
                      service.name.toLowerCase().includes('bath') ||
                      service.name.toLowerCase().includes('banho completo');
      
      console.log('🔍 [ADMIN_BOOKING] Is BANHO service:', isBanho);
      console.log('🔍 [ADMIN_BOOKING] Service name:', service.name);
      console.log('🔍 [ADMIN_BOOKING] Service requirements:', {
        requires_bath: service.requires_bath,
        requires_grooming: service.requires_grooming,
        requires_vet: service.requires_vet
      });
      
      setShowSecondaryServiceDropdown(isBanho);
      
      console.log('🔍 [ADMIN_BOOKING] Service selection completed successfully');
    } catch (error) {
      console.error('🔍 [ADMIN_BOOKING] Error in service selection:', error);
      console.error('🔍 [ADMIN_BOOKING] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      console.error('🔍 [ADMIN_BOOKING] Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        name: error instanceof Error ? error.name : 'Unknown',
        serviceId,
        servicesLength: services.length
      });
      toast.error('Erro ao selecionar serviço');
    }
  };

  // Get TOSA services for secondary dropdown
  const tosaServices = [];
  for (let i = 0; i < services.length; i++) {
    const service = services[i];
    if (service.name.toLowerCase().indexOf('tosa') !== -1) {
      tosaServices.push(service);
    }
  }

  const tosaServiceNames = [];
  for (let i = 0; i < tosaServices.length; i++) {
    tosaServiceNames.push(tosaServices[i].name);
  }
  console.log('🔍 [ADMIN_BOOKING] Available TOSA services:', tosaServiceNames);
  console.log('🔍 [ADMIN_BOOKING] Show secondary dropdown:', showSecondaryServiceDropdown);

  // Get selected services for calculations
  const primaryService = services.find(s => s.id === selectedPrimaryService);
  const secondaryService = services.find(s => s.id === selectedSecondaryService);

  // Calculate total price and duration
  const primaryPrice = primaryService && primaryService.base_price ? primaryService.base_price : 0;
  const secondaryPrice = secondaryService && secondaryService.base_price ? secondaryService.base_price : 0;
  const totalPrice = primaryPrice + secondaryPrice;
  
  const primaryDuration = primaryService && primaryService.default_duration ? primaryService.default_duration : 0;
  const secondaryDuration = secondaryService && secondaryService.default_duration ? secondaryService.default_duration : 0;
  const totalDuration = primaryDuration + secondaryDuration;

  // Calculate required roles for staff filtering
  const primaryBath = primaryService && primaryService.requires_bath ? primaryService.requires_bath : false;
  const secondaryBath = secondaryService && secondaryService.requires_bath ? secondaryService.requires_bath : false;
  const primaryGroom = primaryService && primaryService.requires_grooming ? primaryService.requires_grooming : false;
  const secondaryGroom = secondaryService && secondaryService.requires_grooming ? secondaryService.requires_grooming : false;
  const primaryVet = primaryService && primaryService.requires_vet ? primaryService.requires_vet : false;
  const secondaryVet = secondaryService && secondaryService.requires_vet ? secondaryService.requires_vet : false;
  
  const requiredRoles = {
    can_bathe: primaryBath || secondaryBath,
    can_groom: primaryGroom || secondaryGroom,
    can_vet: primaryVet || secondaryVet
  };

  // Filter available staff based on combined requirements
  const availableStaff = [];
  for (let i = 0; i < staff.length; i++) {
    const member = staff[i];
    try {
      // Safety check for member properties
      if (!member) {
        console.warn('🔍 [ADMIN_BOOKING] Staff member is null/undefined');
        continue;
      }
      
      // Log each staff member being filtered
      console.log('🔍 [ADMIN_BOOKING] Filtering staff member:', {
        id: member.id,
        name: member.name,
        can_bathe: member.can_bathe,
        can_groom: member.can_groom,
        can_vet: member.can_vet,
        requiredRoles: requiredRoles
      });
      
      if (requiredRoles.can_bathe && !member.can_bathe) {
        console.log('🔍 [ADMIN_BOOKING] Staff member excluded - requires bath but cannot bathe:', member.name);
        continue;
      }
      if (requiredRoles.can_groom && !member.can_groom) {
        console.log('🔍 [ADMIN_BOOKING] Staff member excluded - requires grooming but cannot groom:', member.name);
        continue;
      }
      if (requiredRoles.can_vet && !member.can_vet) {
        console.log('🔍 [ADMIN_BOOKING] Staff member excluded - requires vet but cannot vet:', member.name);
        continue;
      }
      
      console.log('🔍 [ADMIN_BOOKING] Staff member included:', member.name);
      availableStaff.push(member);
    } catch (error) {
      console.error('🔍 [ADMIN_BOOKING] Error filtering staff member:', error, member);
      continue;
    }
  }

  // Debug logging for staff filtering
  const staffDetails = [];
  for (let i = 0; i < staff.length; i++) {
    const s = staff[i];
    staffDetails.push({
      id: s.id,
      name: s.name,
      can_bathe: s.can_bathe,
      can_groom: s.can_groom,
      can_vet: s.can_vet
    });
  }
  
  console.log('🔍 [ADMIN_BOOKING] Staff filtering debug:', {
    totalStaff: staff.length,
    availableStaff: availableStaff.length,
    requiredRoles: requiredRoles,
    primaryService: primaryService ? primaryService.name : null,
    secondaryService: secondaryService ? secondaryService.name : null,
    staffDetails: staffDetails
  });

  // Load available time slots when date and service change
  useEffect(() => {
    if (!selectedDate || !selectedPrimaryService) {
      setAvailableSlots([]);
      return;
    }

    const loadTimeSlots = async () => {
      try {
        setIsLoading(true);
        const dateStr = selectedDate.toISOString().split('T')[0];
        
        // Manual slot generation for Phase 1 (since RPC may not exist)
        const slots: TimeSlot[] = [];
        
        // Generate 30-minute slots from 9:00 to 16:00 (weekdays) / 12:00 (Saturdays)
        for (let hour = 9; hour < 17; hour++) {
          for (let minute = 0; minute < 60; minute += 30) {
            const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
            slots.push({ time_slot: timeStr });
          }
        }
        
        setAvailableSlots(slots);
      } catch (error) {
        console.error('Error loading time slots:', error);
        toast.error('Erro ao carregar horários');
      } finally {
        setIsLoading(false);
      }
    };

    loadTimeSlots();
  }, [selectedDate, selectedPrimaryService, selectedSecondaryService, selectedStaff]);

  // Fetch availability summary for selected staff
  const fetchAvailabilitySummary = async (staffIds: string[], monthStart: Date, monthEnd: Date) => {
    if (!staffIds || staffIds.length === 0) {
      setAvailabilitySummary([]);
      setEnabledDates(new Set());
      return;
    }

    try {
      setIsLoadingAvailability(true);
      
      console.log('🔍 [ADMIN_BOOKING] Fetching availability for staff:', staffIds);
      console.log('🔍 [ADMIN_BOOKING] Date range:', monthStart.toISOString().split('T')[0], 'to', monthEnd.toISOString().split('T')[0]);
      
      const { data, error } = await supabase.rpc('get_staff_availability_summary', {
        _staff_profile_ids: staffIds,
        _start_date: monthStart.toISOString().split('T')[0],
        _end_date: monthEnd.toISOString().split('T')[0]
      });

      if (error) {
        console.error('🔍 [ADMIN_BOOKING] Error fetching availability:', error);
        toast.error('Erro ao carregar disponibilidade');
        return;
      }

      console.log('🔍 [ADMIN_BOOKING] Availability data received:', data);
      setAvailabilitySummary(data || []);
      
      // Build enabled dates set
      const enabledSet = new Set<string>();
      if (data) {
        data.forEach(item => {
          if (item.has_availability) {
            enabledSet.add(item.date);
          }
        });
      }
      setEnabledDates(enabledSet);
      
      // Log the tuple as requested
      console.log('🔍 [ADMIN_BOOKING] Availability tuple:', {
        staffProfileIds: staffIds,
        monthStart: monthStart.toISOString().split('T')[0],
        monthEnd: monthEnd.toISOString().split('T')[0],
        enabledCount: enabledSet.size
      });
    } catch (error) {
      console.error('🔍 [ADMIN_BOOKING] Error in fetchAvailabilitySummary:', error);
      toast.error('Erro ao carregar disponibilidade');
    } finally {
      setIsLoadingAvailability(false);
    }
  };

  // Effect to fetch availability when staff selection or month changes
  useEffect(() => {
    console.log('🔍 [ADMIN_BOOKING] Month changed to:', visibleMonth.toISOString().split('T')[0]);
    
    // Calculate month start and end based on visibleMonth
    const monthStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const monthEnd = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0);
    
    if (staffProfileIds.length > 0) {
      fetchAvailabilitySummary(staffProfileIds, monthStart, monthEnd);
    } else {
      setAvailabilitySummary([]);
      setEnabledDates(new Set());
    }
  }, [staffProfileIds, visibleMonth]);

  // Effect to sync selectedStaff with staffProfileIds array
  useEffect(() => {
    if (selectedStaff) {
      setStaffProfileIds([selectedStaff]);
      console.log('🔍 [ADMIN_BOOKING] Staff profile IDs updated:', [selectedStaff]);
    } else {
      setStaffProfileIds([]);
    }
  }, [selectedStaff]);

  // Safety reset: normalize past dates on mount
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selectedDate && selectedDate < today) {
      console.log('🔍 [ADMIN_BOOKING] Resetting past selected date:', selectedDate);
      setSelectedDate(undefined);
    }
  }, [selectedDate]);

  // Handle month change from calendar
  const handleMonthChange = (newMonth: Date) => {
    console.log('🔍 [ADMIN_BOOKING] Calendar month change requested:', newMonth.toISOString().split('T')[0]);
    setVisibleMonth(newMonth);
  };

  // Compute availability predicate for staff
  const isEnabledDate = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Basic constraints: no past dates, no Sundays
    if (date < today || date.getDay() === 0) {
      return false;
    }
    
    // If no staff selected, allow all future dates
    if (staffProfileIds.length === 0) {
      return true;
    }
    
    // Check availability from enabled dates set
    const dateStr = date.toISOString().split('T')[0];
    return enabledDates.has(dateStr);
  };

  // Compute disabled predicate for calendar (inverted logic)
  const isDisabledDate = (date: Date) => {
    const d0 = new Date(date);
    d0.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Disable past dates
    if (d0 < today) return true;
    
    // Disable Sundays
    if (d0.getDay() === 0) return true;
    
    // If no staff selected, allow all future dates
    if (staffProfileIds.length === 0) return false;
    
    // Disable dates without availability
    const dateStr = d0.toISOString().split('T')[0];
    return !enabledDates.has(dateStr);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      console.log('🔍 [ADMIN_BOOKING] Form submission started');
      console.log('🔍 [ADMIN_BOOKING] Browser info:', browserCompatibility.getBrowserInfo());
      
      // Validate required fields
      if (!selectedClient) {
        toast.error('Por favor, selecione um cliente');
        return;
      }
      if (!selectedPet) {
        toast.error('Por favor, selecione um pet');
        return;
      }
      if (!selectedPrimaryService) {
        toast.error('Por favor, selecione um serviço');
        return;
      }
      if (!selectedDate) {
        toast.error('Por favor, selecione uma data');
        return;
      }
      if (!selectedTimeSlot) {
        toast.error('Por favor, selecione um horário');
        return;
      }

      // Get client and service data
      let client = null;
      for (let i = 0; i < clients.length; i++) {
        if (clients[i].id === selectedClient) {
          client = clients[i];
          break;
        }
      }
      if (!client) {
        console.error('🔍 [ADMIN_BOOKING] Client not found:', selectedClient);
        toast.error('Cliente não encontrado');
        return;
      }

      let primaryService = null;
      for (let i = 0; i < services.length; i++) {
        if (services[i].id === selectedPrimaryService) {
          primaryService = services[i];
          break;
        }
      }
      if (!primaryService) {
        console.error('🔍 [ADMIN_BOOKING] Primary service not found:', selectedPrimaryService);
        toast.error('Serviço primário não encontrado');
        return;
      }

      let staffMember = null;
      for (let i = 0; i < staff.length; i++) {
        if (staff[i].id === selectedStaff) {
          staffMember = staff[i];
          break;
        }
      }
      const providerIds = staffProfileIds;
      
      console.log('🔍 [ADMIN_BOOKING] Form validation passed');

      // Prepare booking data for review
      let petName = '';
      for (let i = 0; i < pets.length; i++) {
        if (pets[i].id === selectedPet) {
          petName = pets[i].name;
          break;
        }
      }
      
      let secondaryServiceName = 'Nenhum';
      if (secondaryService) {
        secondaryServiceName = secondaryService.name;
      }
      
      let staffName = null;
      if (staffMember) {
        staffName = staffMember.name;
      }
      
      const bookingData = {
        clientName: client.name,
        petName: petName,
        primaryServiceName: primaryService.name,
        secondaryServiceName: secondaryServiceName,
        totalPrice: totalPrice,
        totalDuration: totalDuration,
        date: selectedDate,
        time: selectedTimeSlot,
        staffName: staffName,
        notes: notes || undefined,
        clientUserId: client.id,
        petId: selectedPet,
        primaryServiceId: selectedPrimaryService,
        secondaryServiceId: selectedSecondaryService || null,
        providerIds: providerIds
      };

      setReviewBookingData(bookingData);
      setShowReviewModal(true);
    } catch (error) {
      console.error('🔍 [ADMIN_BOOKING] Error in form submission:', error);
      toast.error('Erro ao processar formulário');
    }
  };

  const handleReviewConfirm = async (bookingData: any) => {
    setIsLoading(true);
    
    try {
      // Calculate total price including addons and extra fee
      let addonsTotal = 0;
      if (bookingData.selectedAddons && bookingData.selectedAddons.length > 0) {
        for (let i = 0; i < bookingData.selectedAddons.length; i++) {
          const addon = bookingData.selectedAddons[i];
          addonsTotal = addonsTotal + (addon.price * addon.quantity);
        }
      }
      const finalTotalPrice = totalPrice + addonsTotal + (bookingData.extraFee || 0);

      // Create the appointment with dual services
      let addonsParam = null;
      if (bookingData.selectedAddons && bookingData.selectedAddons.length > 0) {
        addonsParam = bookingData.selectedAddons;
      }
      
      let extraFeeReasonParam = null;
      if (bookingData.extraFeeReason) {
        extraFeeReasonParam = bookingData.extraFeeReason;
      }
      
      let userIdParam = null;
      if (user && user.id) {
        userIdParam = user.id;
      }
      
      const { data: appointmentId, error } = await supabase.rpc('create_admin_booking_with_dual_services', {
        _client_user_id: bookingData.clientUserId,
        _pet_id: bookingData.petId,
        _primary_service_id: selectedPrimaryService,
        _booking_date: bookingData.date.toISOString().split('T')[0],
        _time_slot: bookingData.time,
        _secondary_service_id: selectedSecondaryService || null,
        _calculated_price: finalTotalPrice,
        _calculated_duration: totalDuration,
        _notes: bookingData.notes,
        _provider_ids: bookingData.providerIds,
        _extra_fee: bookingData.extraFee || 0,
        _extra_fee_reason: extraFeeReasonParam,
        _addons: addonsParam,
        _created_by: userIdParam
      });

      if (error) throw error;

      toast.success('Agendamento criado com sucesso!');
      
      // Reset form
      setSelectedClient('');
      setSelectedPet('');
      setSelectedPrimaryService('');
      setSelectedSecondaryService('');
      setShowSecondaryServiceDropdown(false);
      setSelectedStaff('');
      setSelectedDate(undefined);
      setSelectedTimeSlot('');
      setNotes('');
      setShowReviewModal(false);
      setReviewBookingData(null);
      
      // Redirect to admin appointments page
      navigate('/admin/appointments');
      
    } catch (error: any) {
      console.error('Error creating appointment:', error);
      toast.error('Erro ao criar agendamento: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAdmin) {
    console.log('🔍 [ADMIN_BOOKING] Access denied - user is not admin');
    return (
      <Layout>
        <div className="max-w-4xl mx-auto px-6 py-16">
          <Card>
            <CardContent className="p-8 text-center">
              <h2 className="text-2xl font-bold mb-4">Acesso Negado</h2>
              <p>Você não tem permissão para acessar esta página.</p>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-6 py-16">
        <Card>
          <CardHeader>
            <CardTitle>Agendamento Administrativo</CardTitle>
            <CardDescription>
              Crie agendamentos em nome dos clientes
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isDataLoading && (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-gray-600">Carregando dados...</p>
              </div>
            )}
            
            {dataError && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  <p className="text-red-700">{dataError}</p>
                </div>
              </div>
            )}
            
            {!isDataLoading && !dataError && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="client">Cliente *</Label>
                  <Popover open={isClientComboboxOpen} onOpenChange={setIsClientComboboxOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={isClientComboboxOpen}
                        className="w-full justify-between"
                      >
                        {selectedClient
                          ? clients.find((client) => client.id === selectedClient)?.name || 'Cliente selecionado'
                          : 'Digite para buscar cliente...'}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput 
                          placeholder="Buscar cliente..." 
                          value={clientSearchQuery}
                          onValueChange={setClientSearchQuery}
                        />
                        <CommandList>
                          {isLoadingClients ? (
                            <div className="py-6 text-center text-sm">Buscando clientes...</div>
                          ) : clientSearchQuery.length < 1 ? (
                            <CommandEmpty>Digite para buscar clientes</CommandEmpty>
                          ) : clients.length === 0 ? (
                            <CommandEmpty>Nenhum cliente encontrado</CommandEmpty>
                          ) : (
                            <CommandGroup>
                              {clients.map((client) => (
                                <CommandItem
                                  key={client.id}
                                  value={client.name}
                                  onSelect={(currentValue) => {
                                    // Find the client by name (case-insensitive)
                                    const selectedClientData = clients.find(
                                      (c) => c.name.toLowerCase() === currentValue.toLowerCase()
                                    );
                                    if (selectedClientData) {
                                      console.log('🔍 [ADMIN_BOOKING] Client selected:', selectedClientData.id);
                                      setSelectedClient(selectedClientData.id);
                                      setIsClientComboboxOpen(false);
                                    }
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      selectedClient === client.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {client.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <p className="text-xs text-gray-500">
                    {clientSearchQuery.length >= 1 
                      ? `Clientes encontrados: ${clients.length}`
                      : 'Digite para buscar clientes'
                    } | Cliente selecionado: {selectedClient ? clients.find(c => c.id === selectedClient)?.name || 'Carregando...' : 'Nenhum'}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pet">Pet *</Label>
                  <Select 
                    value={selectedPet} 
                    onValueChange={(value) => {
                      console.log('🔍 [ADMIN_BOOKING] Pet selected:', value);
                      setSelectedPet(value);
                    }}
                    disabled={!selectedClient}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um pet" />
                    </SelectTrigger>
                    <SelectContent>
                      {pets.map((pet) => (
                        <SelectItem key={pet.id} value={pet.id}>
                          {pet.name} {pet.breed && `(${pet.breed})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedClient && pets.length === 0 && (
                    <p className="text-sm text-red-600">Nenhum pet encontrado para este cliente</p>
                  )}
                  <p className="text-xs text-gray-500">
                    Pets carregados: {pets.length} | Pet selecionado: {selectedPet || 'Nenhum'}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="primaryService">Serviço Principal *</Label>
                  <Select value={selectedPrimaryService} onValueChange={handlePrimaryServiceChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um serviço" />
                    </SelectTrigger>
                    <SelectContent>
                      {services.map((service) => (
                        <SelectItem key={service.id} value={service.id}>
                          {service.name} - R$ {service.base_price}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Conditional Secondary Service Selection */}
                {showSecondaryServiceDropdown && (
                  <div className="space-y-2">
                    <Label htmlFor="secondaryService">Adicionar Tosa (opcional)</Label>
                    <Select value={selectedSecondaryService} onValueChange={setSelectedSecondaryService}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma tosa adicional" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Nenhuma tosa adicional</SelectItem>
                        {tosaServices.map((service) => (
                          <SelectItem key={service.id} value={service.id}>
                            {service.name} - R$ {service.base_price}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Diagnostic Component */}
                <div className="md:col-span-2">
                  <BookingDiagnostics
                    services={services}
                    staff={staff}
                    selectedPrimaryService={selectedPrimaryService}
                    selectedSecondaryService={selectedSecondaryService}
                    availableStaff={availableStaff}
                    requiredRoles={requiredRoles}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="staff">Profissional (opcional)</Label>
                  <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um profissional" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableStaff.length > 0 ? (
                        availableStaff.map((staffMember) => (
                          <SelectItem key={staffMember.id} value={staffMember.id}>
                            {staffMember.name}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="" disabled>
                          Nenhum profissional disponível para este serviço
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {availableStaff.length === 0 && selectedPrimaryService && (
                    <p className="text-sm text-amber-600">
                      Nenhum profissional disponível para este serviço. O agendamento será criado sem profissional específico.
                    </p>
                  )}
                </div>

                {/* Service Summary */}
                {(primaryService || secondaryService) && (
                  <div className="md:col-span-2 p-4 bg-gray-50 rounded-lg">
                    <h3 className="font-medium text-gray-900 mb-2">Resumo dos Serviços</h3>
                    <div className="space-y-1 text-sm">
                      {primaryService && (
                        <div className="flex justify-between">
                          <span>{primaryService.name}</span>
                          <span>R$ {primaryService.base_price} ({primaryService.default_duration} min)</span>
                        </div>
                      )}
                      {secondaryService && (
                        <div className="flex justify-between">
                          <span>{secondaryService.name}</span>
                          <span>R$ {secondaryService.base_price} ({secondaryService.default_duration} min)</span>
                        </div>
                      )}
                      <div className="border-t pt-1 mt-2">
                        <div className="flex justify-between font-medium">
                          <span>Total</span>
                          <span>R$ {totalPrice} ({totalDuration} min)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Data do Agendamento *</Label>
                  {staffProfileIds.length > 0 ? (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      {isLoadingAvailability ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                          <span>Carregando disponibilidade...</span>
                        </>
                      ) : (
                        <span>
                          {enabledDates.size > 0 
                            ? `${enabledDates.size} dias disponíveis`
                            : 'Nenhum dia disponível'
                          }
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">
                      Selecione o(s) profissional(is) no passo anterior para ver os dias disponíveis.
                    </div>
                  )}
                </div>
                <BookingCalendar
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  disabled={isDisabledDate}
                  visibleMonth={visibleMonth}
                  onMonthChange={handleMonthChange}
                  className="rounded-md border w-fit"
                />
                {staffProfileIds.length > 0 && availabilitySummary.length > 0 && (
                  <div className="text-xs text-gray-500">
                    <p>Dias com disponibilidade: {availabilitySummary.filter(a => a.has_availability).length}</p>
                    <p>Dias sem disponibilidade: {availabilitySummary.filter(a => !a.has_availability).length}</p>
                    {(() => {
                      const isDebug =
                        (typeof window !== 'undefined' &&
                         new URLSearchParams(window.location.search).get('debug') === '1') ||
                        (typeof localStorage !== 'undefined' &&
                         localStorage.getItem('debug') === '1');
                      
                      return isDebug ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-blue-600">Debug: Ver detalhes da disponibilidade</summary>
                          <div className="mt-1 p-2 bg-gray-100 rounded text-xs">
                            <p>Staff Profile IDs: {staffProfileIds.join(', ')}</p>
                            <p>Total de dias carregados: {availabilitySummary.length}</p>
                            <p>Primeiros 5 dias com disponibilidade:</p>
                                                     <ul className="ml-4">
                               {availabilitySummary
                                 .filter(a => a.has_availability)
                                 .slice(0, 5)
                                 .map((a, i) => (
                                   <li key={i}>{a.date} - Disponível</li>
                                 ))
                               }
                             </ul>
                          </div>
                        </details>
                      ) : null;
                    })()}
                  </div>
                )}
              </div>

              {selectedDate && (
                <div className="space-y-2">
                  <Label>Horário Disponível *</Label>
                  {isLoading ? (
                    <div className="grid grid-cols-3 gap-2">
                      {[...Array(6)].map((_, i) => (
                        <div key={i} className="h-10 bg-gray-200 rounded animate-pulse" />
                      ))}
                    </div>
                  ) : availableSlots.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2">
                      {availableSlots.map((slot) => (
                        <Button
                          key={slot.time_slot}
                          type="button"
                          variant={selectedTimeSlot === slot.time_slot ? "default" : "outline"}
                          onClick={() => setSelectedTimeSlot(slot.time_slot)}
                          className="h-10"
                        >
                          {slot.time_slot.substring(0, 5)}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Nenhum horário disponível para esta data.
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="notes">Observações</Label>
                <Textarea
                  id="notes"
                  placeholder="Observações sobre o agendamento..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <Button 
                type="submit" 
                disabled={isLoading || !selectedClient || !selectedPet || !selectedPrimaryService || !selectedDate || !selectedTimeSlot}
                className="w-full"
              >
                {isLoading ? 'Criando...' : 'Criar Agendamento'}
              </Button>
            </form>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Booking Review Modal */}
      {reviewBookingData && (
        <BookingReviewModal
          isOpen={showReviewModal}
          onClose={() => {
            setShowReviewModal(false);
            setReviewBookingData(null);
          }}
          onConfirm={handleReviewConfirm}
          bookingData={reviewBookingData}
          isLoading={isLoading}
        />
      )}
    </Layout>
  );
};

export default AdminBookingPage;
