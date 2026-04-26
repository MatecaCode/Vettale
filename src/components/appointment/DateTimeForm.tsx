import React from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Clock, ArrowLeft, Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useStaffAvailability } from '@/hooks/useStaffAvailability';
import { BrandedLoading } from '@/components/ui/branded-loading';


interface TimeSlot {
  id: string;
  time: string;
  available: boolean;
}

interface NextAvailable {
  date: string;
  time: string;
  provider_name?: string;
}

interface DateTimeFormProps {
  date?: Date;
  setDate: (date: Date | undefined) => void;
  timeSlots: TimeSlot[];
  selectedTimeSlotId: string | null;
  setSelectedTimeSlotId: (id: string | null) => void;
  nextAvailable: NextAvailable | null;
  handleNextAvailableSelect: () => void;
  isLoading: boolean;
  activeTab: 'calendar' | 'next-available';
  setActiveTab: (tab: 'calendar' | 'next-available') => void;
  notes: string;
  setNotes: (notes: string) => void;
  onBack?: () => void;
  onSubmit?: (e: React.FormEvent) => void;
  showTimeSlots?: boolean;
  showSubmitButton?: boolean;
  stepTitle?: string;
  selectedStaff?: string[];
  serviceDuration?: number;
}

const DateTimeForm: React.FC<DateTimeFormProps> = ({
  date,
  setDate,
  timeSlots,
  selectedTimeSlotId,
  setSelectedTimeSlotId,
  nextAvailable,
  handleNextAvailableSelect,
  isLoading,
  activeTab,
  setActiveTab,
  notes,
  setNotes,
  onBack,
  onSubmit,
  showTimeSlots = true,
  showSubmitButton = true,
  stepTitle = "Escolha da Data e Horário",
  selectedStaff = [],
  serviceDuration = 60
}) => {
  const canSubmit = date && selectedTimeSlotId && !isLoading;

  // Stable, memoized staff selection to avoid effect loops
  const selectedStaffKey = React.useMemo(() => {
    return [...selectedStaff].sort().join('|');
  }, [selectedStaff]);

  const uniqueSelectedStaff = React.useMemo(() => {
    const ids = Array.from(new Set(selectedStaff));
    ids.sort();
    return ids;
  }, [selectedStaffKey]);

  // Memoize params to keep identity stable
  const availabilityParams = React.useMemo(() => ({
    selectedStaffIds: uniqueSelectedStaff,
    serviceDuration: serviceDuration
  }), [selectedStaffKey, serviceDuration]);

  const { isDateDisabled, isLoading: availabilityLoading, availableDates } = useStaffAvailability(availabilityParams);

  // Stable logging: once per key change only (use local date key, not UTC)
  const dateKey = React.useMemo(() => (date ? format(date, 'yyyy-MM-dd') : null), [date]);
  React.useEffect(() => {
    // eslint-disable-next-line no-console
    console.debug('[AVAILABILITY INIT]', { staffKey: selectedStaffKey, dateKey, duration: serviceDuration });
  }, [selectedStaffKey, dateKey, serviceDuration]);

  // Initialize date to next business day if undefined to prevent fetch loops
  React.useEffect(() => {
    if (!date) {
      const d = new Date();
      // next day
      d.setDate(d.getDate() + 1);
      // skip Sunday
      if (d.getDay() === 0) {
        d.setDate(d.getDate() + 1);
      }
      setDate(d);
    }
  // run only once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Remove hard-coded date range limitations - let the calendar navigate freely
  const calendarDateRange = React.useMemo(() => {
    const today = new Date();
    const nextYear = new Date();
    nextYear.setFullYear(today.getFullYear() + 2); // Allow 2 years ahead
    
    return {
      fromDate: today,
      toDate: nextYear
    };
  }, []);

  // Minimal logging only when core inputs change
  React.useEffect(() => {
    if (!date) return;
    const dateKey = date.toISOString().slice(0, 10);
    const availableCount = timeSlots?.filter(s => s.available)?.length || 0;
    console.debug('[DateTimeForm] slots:', timeSlots?.length || 0, 'available:', availableCount, 'date:', dateKey);
  }, [timeSlots, date]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canSubmit && onSubmit) {
      onSubmit(e);
    }
  };

  const handleDateSelect = (selectedDate: Date | undefined) => {
    setDate(selectedDate);
    setSelectedTimeSlotId(null);
  };

  // Returns true when the selected date is the current calendar day (local time)
  const isSelectedDateToday = React.useMemo(() => {
    if (!date) return false;
    const now = new Date();
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    );
  }, [date]);

  // Render available time slot buttons
  const renderTimeSlots = () => {
    if (!timeSlots || timeSlots.length === 0) {
      return null;
    }

    return timeSlots.map((slot) => {
      // If today is selected, check whether the slot time has already passed
      let isPast = false;
      if (isSelectedDateToday) {
        const [slotHour, slotMin] = slot.time.split(':').map(Number);
        const slotDateTime = new Date();
        slotDateTime.setHours(slotHour, slotMin, 0, 0);
        isPast = slotDateTime <= new Date();
      }

      const effectivelyUnavailable = !slot.available || isPast;

      return (
        <Button
          key={slot.id}
          type="button"
          variant={selectedTimeSlotId === slot.id ? "default" : "outline"}
          className={`h-auto py-2 transition-all duration-200 hover:scale-105 ${
            effectivelyUnavailable ? 'opacity-40 cursor-not-allowed' : ''
          }`}
          onClick={() => {
            if (!effectivelyUnavailable) {
              setSelectedTimeSlotId(slot.id);
            }
          }}
          disabled={effectivelyUnavailable || isLoading}
        >
          {slot.time}
          {effectivelyUnavailable && <span className="ml-1 text-xs">✕</span>}
        </Button>
      );
    });
  };

  // Full screen loading overlay
  if (isLoading && canSubmit) {
    return (
      <div className="fixed inset-0 bg-white/95 backdrop-blur-sm z-50 flex items-center justify-center">
        <BrandedLoading message="Processando seu agendamento..." />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{stepTitle}</h2>
        {onBack && (
          <Button 
            type="button" 
            variant="outline" 
            onClick={onBack}
            disabled={isLoading}
            className="hover-scale"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'calendar' | 'next-available')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="calendar" disabled={isLoading} className="transition-all duration-200">
            <CalendarIcon className="w-4 h-4 mr-2" />
            Escolher Data
          </TabsTrigger>
          <TabsTrigger value="next-available" disabled={isLoading} className="transition-all duration-200">
            <Clock className="w-4 h-4 mr-2" />
            Próximo Disponível
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="space-y-4 animate-slide-in-right">
          <div className="rounded-md border transition-all duration-200 hover:shadow-md p-3 md:p-6">
            <div className="flex flex-col md:flex-row gap-4 md:gap-6">
              {/* Calendar Section */}
              <div className="flex-1">
                <Label className="text-center block mb-3">Selecione uma data</Label>
                <div className="flex justify-center">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={handleDateSelect}
                    locale={ptBR}
                    disabled={isDateDisabled}
                    fromDate={calendarDateRange.fromDate}
                    toDate={calendarDateRange.toDate}
                    fromYear={calendarDateRange.fromDate.getFullYear()}
                    toYear={calendarDateRange.toDate.getFullYear()}
                    onMonthChange={(newMonth) => {
                      console.log('Month changed to:', newMonth);
                    }}
                    className="transition-all duration-200"
                  />
                </div>
                {availabilityLoading && (
                  <p className="text-sm text-muted-foreground mt-2 animate-pulse text-center">
                    Carregando disponibilidade para {uniqueSelectedStaff.length} profissionais únicos...
                  </p>
                )}
              </div>

              {/* Time Slots Section */}
              {showTimeSlots && date && (
                <div className="flex-1 animate-fade-in">
                  <Label className="text-center block mb-3">Horários disponíveis</Label>
                  {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin mr-2" />
                      <span>Carregando horários...</span>
                    </div>
                  ) : timeSlots.length > 0 ? (
                    <div className="mt-2 max-h-64 md:max-h-80 overflow-y-auto pr-1 md:pr-2 time-slots-scroll">
                      <div className="grid grid-cols-2 gap-2">
                        {renderTimeSlots()}
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground mt-2 text-sm">
                      Nenhum horário disponível para esta data com os profissionais selecionados.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="next-available" className="space-y-4 animate-slide-in-right">
          <div className="relative rounded-md border overflow-hidden">
            {/* Blurred placeholder content */}
            <div className="p-6 filter blur-sm opacity-40 pointer-events-none select-none">
              <h3 className="font-semibold mb-2">Próximo horário disponível</h3>
              <p className="text-sm text-muted-foreground mb-1">Sexta-feira, 17 de abril às 10:00</p>
              <p className="text-sm text-muted-foreground mb-4">Com: Profissional</p>
              <div className="h-9 w-40 rounded-md bg-primary/30" />
            </div>
            {/* Overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/70 backdrop-blur-[2px] px-6 text-center">
              <Clock className="w-8 h-8 text-muted-foreground mb-3" />
              <p className="font-semibold text-gray-700 mb-1">Funcionalidade em desenvolvimento</p>
              <p className="text-sm text-muted-foreground">
                Em breve você poderá usar esta opção. Por enquanto, por favor escolha uma data pelo calendário ao lado.
              </p>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <div className="animate-fade-in">
        <Label htmlFor="notes">Observações (opcional)</Label>
        <Textarea
          id="notes"
          placeholder="Alguma informação importante sobre seu pet ou preferências..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-2 transition-all duration-200 focus:shadow-md"
          rows={3}
          disabled={isLoading}
        />
      </div>

      {showSubmitButton && (
        <div className="flex gap-4 animate-fade-in">
          <Button
            type="submit"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 transition-all duration-200 hover:scale-105"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processando...
              </>
            ) : (
              'Confirmar Agendamento'
            )}
          </Button>
        </div>
      )}
    </div>
  );
};

export default DateTimeForm;
