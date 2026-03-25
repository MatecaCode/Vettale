
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon, Clock, User, Plus, Check, ChevronsUpDown } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import AdminLayout from '@/components/AdminLayout';

interface StaffProfile {
  id: string;
  name: string;
  can_bathe: boolean;
  can_groom: boolean;
  can_vet: boolean;
  active: boolean;
}

interface AvailabilitySlot {
  id: string;
  staff_profile_id: string;
  date: string;
  time_slot: string;
  available: boolean;
  staff_name?: string;
}

const AdminAvailabilityManager = () => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [staffProfiles, setStaffProfiles] = useState<StaffProfile[]>([]);
  const [availabilitySlots, setAvailabilitySlots] = useState<AvailabilitySlot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);

  useEffect(() => {
    fetchStaffProfiles();
  }, []);

  useEffect(() => {
    if (selectedDate) {
      fetchAvailabilityForDate(selectedDate);
    }
  }, [selectedDate]);

  const callFn = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('admin-manage-availability', { body });
    if (error) throw new Error(error.message);
    if (!data?.ok) throw new Error(data?.error ?? 'Unknown error');
    return data;
  };

  const fetchStaffProfiles = async () => {
    try {
      const result = await callFn({ action: 'get_staff' });
      setStaffProfiles(result.data || []);
    } catch (error: any) {
      console.error('Error fetching staff profiles:', error);
      toast.error('Erro ao carregar profissionais');
    }
  };

  const fetchAvailabilityForDate = async (date: Date) => {
    setIsLoading(true);
    try {
      const dateStr = format(date, 'yyyy-MM-dd');
      const result = await callFn({ action: 'get_availability', date: dateStr });
      setAvailabilitySlots(result.data || []);
    } catch (error: any) {
      console.error('Error fetching availability:', error);
      toast.error('Erro ao carregar disponibilidade');
    } finally {
      setIsLoading(false);
    }
  };

  // Timezone helpers — enforce America/Sao_Paulo for date comparisons
  const getSaoPauloDateParts = (date: Date) => {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(date).reduce((acc: Record<string, number>, p) => {
      if (p.type === 'year' || p.type === 'month' || p.type === 'day') {
        acc[p.type] = parseInt(p.value, 10);
      }
      return acc;
    }, {});
    return { year: parts.year, month: parts.month, day: parts.day } as { year: number; month: number; day: number };
  };

  const getTodaySaoPaulo = (): Date => {
    const { year, month, day } = getSaoPauloDateParts(new Date());
    // Use UTC midnight for stability when rendering day-only comparisons
    return new Date(Date.UTC(year, month - 1, day));
  };

  const isBeforeTodaySaoPaulo = (date: Date): boolean => {
    const { year, month, day } = getSaoPauloDateParts(date);
    const candidate = new Date(Date.UTC(year, month - 1, day));
    const today = getTodaySaoPaulo();
    return candidate.getTime() < today.getTime();
  };

  // Compute 30-minute anchor times within business hours for rendering
  const getAnchorTimes = (): string[] => {
    const anchors: string[] = [];
    const startHour = 9; // 09:00 baseline
    const endHour = 17; // up to 17:00; last anchor at 16:30
    for (let hour = startHour; hour < endHour; hour++) {
      anchors.push(`${hour.toString().padStart(2, '0')}:00:00`);
      anchors.push(`${hour.toString().padStart(2, '0')}:30:00`);
    }
    return anchors;
  };

  const getSubslotTimesForAnchor = (anchor: string): string[] => {
    // anchor format HH:MM:SS; cover +00, +10, +20 for :00 and +30, +40, +50 for :30
    const [hStr, mStr] = anchor.split(':');
    const hour = parseInt(hStr, 10);
    const minute = parseInt(mStr, 10);
    const baseMinutes = minute === 0 ? [0, 10, 20] : [30, 40, 50];
    return baseMinutes.map((min) => `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}:00`);
  };

  const getDateStr = (): string => format(selectedDate, 'yyyy-MM-dd');

  const toggleAnchorAvailability = async (
    staffId: string,
    anchor: string,
    currentAvailable: boolean
  ) => {
    try {
      const subslots = getSubslotTimesForAnchor(anchor);
      const dateStr = getDateStr();
      const result = await callFn({
        action: 'update_slots',
        staff_profile_id: staffId,
        date: dateStr,
        time_slots: subslots,
        available: !currentAvailable,
      });
      const affected = result.affected ?? 0;
      if (affected > 0) {
        toast.success(`Disponibilidade atualizada (${affected} horários).`);
      } else {
        toast.error('Nenhum horário atualizado para este intervalo.');
      }
      if (selectedDate) fetchAvailabilityForDate(selectedDate);
    } catch (err: any) {
      console.error('[ADMIN_AVAILABILITY] Anchor toggle error', err);
      toast.error('Erro ao atualizar disponibilidade');
    }
  };

  const getStaffRole = (staff: StaffProfile) => {
    const roles = [];
    if (staff.can_vet) roles.push('Veterinário');
    if (staff.can_groom) roles.push('Tosador');
    if (staff.can_bathe) roles.push('Banhista');
    return roles.join(', ') || 'Indefinido';
  };

  const generateAvailabilityForStaff = async (staffId: string) => {
    setIsLoading(true);
    try {
      const result = await callFn({ action: 'generate_availability', staff_profile_id: staffId });
      toast.success(`Disponibilidade gerada com sucesso! (${result.slots_generated} horários)`);
      if (selectedDate) fetchAvailabilityForDate(selectedDate);
    } catch (error: any) {
      console.error('Error generating availability:', error);
      toast.error('Erro ao gerar disponibilidade');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSlotAvailability = async (slotId: string, currentAvailability: boolean) => {
    try {
      const { error } = await supabase
        .from('staff_availability')
        .update({ available: !currentAvailability })
        .eq('id', slotId);

      if (error) throw error;

      toast.success('Disponibilidade atualizada!');
      if (selectedDate) {
        fetchAvailabilityForDate(selectedDate);
      }
    } catch (error: any) {
      console.error('Error updating availability:', error);
      toast.error('Erro ao atualizar disponibilidade');
    }
  };

  const getSlotsForStaff = (staffId: string): AvailabilitySlot[] =>
    availabilitySlots.filter((s) => s.staff_profile_id === staffId);

  // Simple MultiSelect using shadcn Command + Popover
  interface Option { value: string; label: string }
  const StaffMultiSelect: React.FC<{
    options: Option[];
    value: string[];
    onChange: (ids: string[]) => void;
    placeholder?: string;
  }> = ({ options, value, onChange, placeholder = 'Selecionar profissionais' }) => {
    const [open, setOpen] = useState(false);
    const isAll = value.length === 0;
    const buttonLabel = isAll
      ? 'Todos'
      : value.length === 1
        ? options.find(o => o.value === value[0])?.label || 'Selecionado'
        : `${value.length} selecionados`;

    const toggle = (id: string) => {
      if (value.includes(id)) onChange(value.filter(v => v !== id));
      else onChange([...value, id]);
    };

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="h-10 w-full min-w-[220px] justify-between rounded-md border bg-white px-3 text-left text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2"
          >
            <span className="truncate">{buttonLabel}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[260px] p-0" align="start">
          <Command>
            <CommandInput placeholder={placeholder} />
            <CommandList>
              <CommandEmpty>Nenhum resultado</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  key="all"
                  value="Todos"
                  onSelect={() => onChange([])}
                >
                  <Check className={`mr-2 h-4 w-4 ${isAll ? 'opacity-100' : 'opacity-0'}`} />
                  Todos
                </CommandItem>
                {options.map(o => (
                  <CommandItem
                    key={o.value}
                    value={o.label}
                    onSelect={() => toggle(o.value)}
                  >
                    <Check className={`mr-2 h-4 w-4 ${value.includes(o.value) ? 'opacity-100' : 'opacity-0'}`} />
                    {o.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  };

  return (
    <AdminLayout>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Gerenciamento de Disponibilidade</h1>
          <p className="text-gray-600 mt-2">Gerencie a disponibilidade dos profissionais</p>
        </div>
        {/* Page wrapper */}
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          {/* Left: Calendar */}
          <section className="rounded-2xl border p-5 bg-white">
            <div className="mb-3 flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              <h2 className="text-lg font-semibold">Selecionar Data</h2>
            </div>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              locale={ptBR}
              className="rounded-md border"
              disabled={(date) => isBeforeTodaySaoPaulo(date)}
              fromMonth={(() => {
                const t = getTodaySaoPaulo();
                return new Date(t.getUTCFullYear(), t.getUTCMonth(), 1);
              })()}
            />
          </section>

          {/* Right: Availability panel */}
          <section className="rounded-2xl border p-5 bg-white overflow-x-hidden overflow-y-auto max-h-[calc(100vh-220px)]">
            <div className="mb-3 flex items-center gap-2">
              <Clock className="h-5 w-5" />
              <h2 className="text-lg font-semibold">Disponibilidade - {format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}</h2>
            </div>

            {/* Header controls */}
            <header className="mb-4 flex flex-wrap items-center gap-4">
              <div className="min-w-[220px]">
                <StaffMultiSelect
                  options={staffProfiles.map(s => ({ value: s.id, label: s.name }))}
                  value={selectedStaffIds}
                  onChange={(ids) => setSelectedStaffIds(ids)}
                  placeholder="Buscar profissionais..."
                />
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-green-500" />
                  <span>Disponível</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-red-500" />
                  <span>Indisponível</span>
                </div>
              </div>
            </header>

            {/* Cards grid */}
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
              {(selectedStaffIds.length === 0 ? staffProfiles : staffProfiles.filter(s => selectedStaffIds.includes(s.id))).map((staff) => {
                const slots = getSlotsForStaff(staff.id);
                const availableSlots = slots.filter(s => s.available).length;
                const totalSlots = slots.length;
                return (
                  <div key={staff.id} className="rounded-2xl border p-4 shadow-sm">
                    {/* Title + counter */}
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold">{staff.name}</h3>
                        <p className="text-sm text-muted-foreground">{getStaffRole(staff)}</p>
                      </div>
                      <div className="shrink-0 rounded-full border px-3 py-1 text-xs">
                        {availableSlots}/{totalSlots} disponível(is)
                      </div>
                    </div>

                    {/* Actions row */}
                    <div className="mb-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        className="h-10 bg-green-500 px-3 text-sm hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 text-white"
                        onClick={async () => {
                          const dateStr = format(selectedDate, 'yyyy-MM-dd');
                          const subslots = getAnchorTimes().flatMap(getSubslotTimesForAnchor);
                          try {
                            const result = await callFn({
                              action: 'update_slots',
                              staff_profile_id: staff.id,
                              date: dateStr,
                              time_slots: subslots,
                              available: true,
                            });
                            toast.success(`Dia marcado disponível (${result.affected ?? 0} horários).`);
                            fetchAvailabilityForDate(selectedDate);
                          } catch (err: any) {
                            console.error('[ADMIN_AVAILABILITY] day-available error', err);
                            toast.error('Erro ao marcar dia disponível');
                          }
                        }}
                        disabled={isLoading}
                      >
                        Marcar dia todo Disponível
                      </Button>
                      <Button
                        size="sm"
                        className="h-10 bg-red-500 px-3 text-sm hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-offset-2 text-white"
                        onClick={async () => {
                          const dateStr = format(selectedDate, 'yyyy-MM-dd');
                          const subslots = getAnchorTimes().flatMap(getSubslotTimesForAnchor);
                          try {
                            const result = await callFn({
                              action: 'update_slots',
                              staff_profile_id: staff.id,
                              date: dateStr,
                              time_slots: subslots,
                              available: false,
                            });
                            toast.success(`Dia marcado indisponível (${result.affected ?? 0} horários).`);
                            fetchAvailabilityForDate(selectedDate);
                          } catch (err: any) {
                            console.error('[ADMIN_AVAILABILITY] day-unavailable error', err);
                            toast.error('Erro ao marcar dia indisponível');
                          }
                        }}
                        disabled={isLoading}
                      >
                        Marcar dia todo Indisponível
                      </Button>
                    </div>

                    {/* Slots grid */}
                    <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(88px,1fr))]">
                      {getAnchorTimes().map((anchor) => {
                        const subslots = getSubslotTimesForAnchor(anchor);
                        const subslotStates = subslots.map((t) => slots.find((s) => s.time_slot === t));
                        const allPresent = subslotStates.every(Boolean);
                        const allAvailable = allPresent && subslotStates.every((s) => (s as AvailabilitySlot).available);
                        const anchorLabel = anchor.substring(0, 5);
                        return (
                          <button
                            key={`${staff.id}-${anchor}`}
                            onClick={() => toggleAnchorAvailability(staff.id, anchor, allAvailable)}
                            className={`h-10 rounded-full px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 ${allAvailable ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}
                          >
                            {anchorLabel}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminAvailabilityManager;
