
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pet, Service } from '@/hooks/useAppointmentForm';
import { usePricing } from '@/hooks/usePricing';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Link } from 'react-router-dom';
import { PlusCircle, AlertCircle, Info, CheckCircle2 } from 'lucide-react';
import { getServiceCategory } from '@/utils/serviceCategory';
import {
  getServicePriceRange,
  formatPriceRange,
  FIRST_VISIT_EXPLANATION,
  type PriceRange,
} from '@/utils/firstVisitPricing';

interface BasicInfoFormProps {
  userPets: Pet[];
  services: Service[];
  selectedPet: Pet | null;
  setSelectedPet: (pet: Pet | null) => void;
  selectedService: Service | null;
  setSelectedService: (service: Service | null) => void;
  selectedSecondaryService: Service | null;
  setSelectedSecondaryService: (service: Service | null) => void;
  secondaryOptions: Service[];
  onNext: () => void;
  serviceType: 'grooming' | 'veterinary';
}

// ── Service emoji + color mapping ──────────────────────────────────────────────
const SERVICE_META: Record<
  string,
  { emoji: string; bg: string; selectedBg: string; border: string }
> = {
  'Banho Completo':        { emoji: '🛁', bg: 'bg-blue-50',   selectedBg: 'bg-blue-100',   border: 'border-blue-400'   },
  'Tosa':                  { emoji: '✂️', bg: 'bg-purple-50', selectedBg: 'bg-purple-100', border: 'border-purple-400' },
  'Tosa na Tesoura':       { emoji: '✂️', bg: 'bg-violet-50', selectedBg: 'bg-violet-100', border: 'border-violet-400' },
  'Tosa Higiênica':        { emoji: '🪮', bg: 'bg-pink-50',   selectedBg: 'bg-pink-100',   border: 'border-pink-400'   },
  'Tosa Grande':           { emoji: '✂️', bg: 'bg-fuchsia-50',selectedBg: 'bg-fuchsia-100',border: 'border-fuchsia-400'},
  'Vacinação':             { emoji: '💉', bg: 'bg-green-50',  selectedBg: 'bg-green-100',  border: 'border-green-400'  },
  'Consulta Veterinária':  { emoji: '🩺', bg: 'bg-teal-50',   selectedBg: 'bg-teal-100',   border: 'border-teal-400'   },
  'Consulta Geral':        { emoji: '🏥', bg: 'bg-cyan-50',   selectedBg: 'bg-cyan-100',   border: 'border-cyan-400'   },
  'Exame de Sangue':       { emoji: '🩸', bg: 'bg-red-50',    selectedBg: 'bg-red-100',    border: 'border-red-400'    },
};

const DEFAULT_META = { emoji: '🐾', bg: 'bg-gray-50', selectedBg: 'bg-gray-100', border: 'border-gray-400' };

function getServiceMeta(name: string) {
  return SERVICE_META[name] ?? DEFAULT_META;
}

// ── Reusable service card ───────────────────────────────────────────────────────
const ServiceCard: React.FC<{
  service: Service;
  selected: boolean;
  onClick: () => void;
  compact?: boolean;
}> = ({ service, selected, onClick, compact = false }) => {
  const meta = getServiceMeta(service.name);
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'relative w-full text-left rounded-xl border-2 transition-all duration-200',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
        'hover:shadow-md hover:-translate-y-0.5 active:scale-95',
        compact ? 'px-3 py-2' : 'px-4 py-3',
        selected
          ? `${meta.selectedBg} ${meta.border} shadow-sm`
          : `${meta.bg} border-transparent hover:border-gray-200`,
      ].join(' ')}
    >
      <span className={`flex items-center gap-2 ${compact ? 'text-sm' : 'text-base'}`}>
        <span className={compact ? 'text-lg' : 'text-2xl'} aria-hidden>
          {meta.emoji}
        </span>
        <span className={`font-medium ${selected ? 'text-gray-900' : 'text-gray-700'}`}>
          {service.name}
        </span>
      </span>
      {selected && (
        <CheckCircle2
          className={`absolute top-2 right-2 text-primary ${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'}`}
        />
      )}
    </button>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────
const BasicInfoForm: React.FC<BasicInfoFormProps> = ({
  userPets,
  services,
  selectedPet,
  setSelectedPet,
  selectedService,
  setSelectedService,
  selectedSecondaryService,
  setSelectedSecondaryService,
  secondaryOptions,
  onNext,
  serviceType
}) => {
  const isFirstVisit = selectedPet?.is_first_visit === true;

  const pricingParams = selectedPet && selectedService && !isFirstVisit ? {
    serviceId: selectedService.id,
    breedId: selectedPet.breed,
    size: selectedPet.size
  } : null;
  const { pricing, isLoading: pricingLoading } = usePricing(pricingParams);

  const secondaryPricingParams = selectedPet && selectedSecondaryService && !isFirstVisit ? {
    serviceId: selectedSecondaryService.id,
    breedId: selectedPet.breed,
    size: selectedPet.size
  } : null;
  const { pricing: secondaryPricing, isLoading: secondaryPricingLoading } = usePricing(secondaryPricingParams);

  const [priceRange, setPriceRange] = React.useState<PriceRange | null>(null);
  const [priceRangeLoading, setPriceRangeLoading] = React.useState(false);

  React.useEffect(() => {
    if (!isFirstVisit || !selectedService) {
      setPriceRange(null);
      return;
    }
    let cancelled = false;
    setPriceRangeLoading(true);

    const breedName = selectedPet?.breed || undefined;

    const fetchCombined = async () => {
      const [primaryRange, secondaryRange] = await Promise.all([
        getServicePriceRange(selectedService.id, breedName),
        selectedSecondaryService
          ? getServicePriceRange(selectedSecondaryService.id, breedName)
          : Promise.resolve(null),
      ]);

      if (cancelled) return;

      if (!primaryRange) {
        setPriceRange(null);
      } else if (secondaryRange) {
        setPriceRange({
          min: primaryRange.min + secondaryRange.min,
          max: primaryRange.max + secondaryRange.max,
        });
      } else {
        setPriceRange(primaryRange);
      }
      setPriceRangeLoading(false);
    };

    fetchCombined();
    return () => { cancelled = true; };
  }, [isFirstVisit, selectedService?.id, selectedSecondaryService?.id, selectedPet?.breed]);

  const handleNext = () => {
    if (selectedPet && selectedService) onNext();
  };

  const isNextEnabled = selectedPet && selectedService;

  const formatSizeLabel = (size?: string) => {
    if (!size) return size;
    const sizeMap = { small: 'Pequeno', medium: 'Médio', large: 'Grande', extra_large: 'Extra Grande' };
    return sizeMap[size as keyof typeof sizeMap] || size;
  };

  // ── No pets registered ──────────────────────────────────────────────────────
  if (userPets.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>1. Informações Básicas</CardTitle>
          <CardDescription>Selecione seu pet e o serviço desejado</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert className="border-orange-200 bg-orange-50">
            <AlertCircle className="h-4 w-4 text-orange-600" />
            <AlertDescription className="text-orange-800">
              <div className="space-y-4">
                <div>
                  <p className="font-medium mb-2">Você ainda não tem pets cadastrados!</p>
                  <p className="text-sm">
                    Para agendar um serviço, você precisa primeiro cadastrar pelo menos um pet no seu perfil.
                  </p>
                </div>
                <Button asChild className="bg-orange-600 hover:bg-orange-700 text-white">
                  <Link to="/pets" className="flex items-center gap-2">
                    <PlusCircle className="h-4 w-4" />
                    Cadastrar Meu Primeiro Pet
                  </Link>
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // ── Main form ───────────────────────────────────────────────────────────────
  return (
    <Card>
      <CardHeader>
        <CardTitle>1. Informações Básicas</CardTitle>
        <CardDescription>Selecione seu pet e o serviço desejado</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Pet selector — kept as dropdown since it's personal data */}
        <div className="space-y-2">
          <Label htmlFor="pet-select">Selecione seu Pet</Label>
          <Select
            value={selectedPet?.id || ''}
            onValueChange={(value) => {
              const pet = userPets.find(p => p.id === value);
              setSelectedPet(pet || null);
            }}
          >
            <SelectTrigger id="pet-select" className="h-12">
              <SelectValue placeholder="Escolha um pet 🐾" />
            </SelectTrigger>
            <SelectContent>
              {userPets.map((pet) => (
                <SelectItem key={pet.id} value={pet.id}>
                  <div className="flex flex-col items-start">
                    <span className="font-medium">{pet.name}</span>
                    {pet.breed && (
                      <span className="text-xs text-muted-foreground">
                        {pet.breed} · {formatSizeLabel(pet.size)}
                      </span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Service selector — animated cards */}
        <div className="space-y-2">
          <Label>Selecione o Serviço</Label>
          {services.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum serviço de {serviceType === 'grooming' ? 'tosa' : 'veterinária'} disponível.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {services.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  selected={selectedService?.id === service.id}
                  onClick={() => setSelectedService(
                    selectedService?.id === service.id ? null : service
                  )}
                />
              ))}
            </div>
          )}
        </div>

        {/* Secondary service — compact card row, only when primary is Banho */}
        {secondaryOptions.length > 0 && (
          <div className="space-y-2">
            <Label>Adicionar Tosa? <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            <div className="grid grid-cols-2 gap-2">
              {/* "Nenhum" option */}
              <button
                type="button"
                onClick={() => setSelectedSecondaryService(null)}
                className={[
                  'relative w-full text-left rounded-xl border-2 px-3 py-2 text-sm transition-all duration-200',
                  'hover:shadow-md hover:-translate-y-0.5 active:scale-95 focus:outline-none',
                  !selectedSecondaryService
                    ? 'bg-gray-100 border-gray-400 shadow-sm'
                    : 'bg-gray-50 border-transparent hover:border-gray-200',
                ].join(' ')}
              >
                <span className="flex items-center gap-2 font-medium text-gray-600">
                  <span className="text-lg" aria-hidden>🚫</span>
                  Nenhum
                </span>
                {!selectedSecondaryService && (
                  <CheckCircle2 className="absolute top-2 right-2 h-3.5 w-3.5 text-primary" />
                )}
              </button>

              {secondaryOptions.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  selected={selectedSecondaryService?.id === service.id}
                  onClick={() => setSelectedSecondaryService(
                    selectedSecondaryService?.id === service.id ? null : service
                  )}
                  compact
                />
              ))}
            </div>
          </div>
        )}

        {/* Resumo */}
        {selectedService && selectedPet && (
          <div className="rounded-xl bg-gradient-to-br from-slate-50 to-blue-50 border border-blue-100 p-4 space-y-3 transition-all duration-300">
            <h4 className="font-semibold text-gray-800 flex items-center gap-1.5">
              <span aria-hidden>📋</span> Resumo
            </h4>

            {isFirstVisit ? (
              <div className="space-y-2">
                <p className="font-medium text-gray-800 text-sm">
                  {selectedService.name}
                  {selectedSecondaryService && ` + ${selectedSecondaryService.name}`}
                </p>
                {priceRangeLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="animate-spin h-3.5 w-3.5 border-2 border-primary border-t-transparent rounded-full" />
                    Calculando faixa...
                  </div>
                ) : priceRange ? (
                  <p className="text-lg font-bold text-green-600">{formatPriceRange(priceRange)}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">A definir</p>
                )}
                <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-800">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                  <p className="text-xs leading-relaxed">{FIRST_VISIT_EXPLANATION}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                {/* Primary service row */}
                <div className="flex justify-between items-center">
                  <span className="text-gray-700 font-medium">{selectedService.name}</span>
                  {pricingLoading ? (
                    <div className="animate-spin h-3.5 w-3.5 border-2 border-primary border-t-transparent rounded-full" />
                  ) : pricing ? (
                    <span className="font-semibold text-green-700">
                      R$ {pricing.price.toFixed(2)}
                      <span className="text-gray-400 font-normal ml-1">· {pricing.duration} min</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>

                {/* Secondary service row */}
                {selectedSecondaryService && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700 font-medium">{selectedSecondaryService.name}</span>
                    {secondaryPricingLoading ? (
                      <div className="animate-spin h-3.5 w-3.5 border-2 border-primary border-t-transparent rounded-full" />
                    ) : secondaryPricing ? (
                      <span className="font-semibold text-green-700">
                        R$ {secondaryPricing.price.toFixed(2)}
                        <span className="text-gray-400 font-normal ml-1">· {secondaryPricing.duration} min</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                )}

                {/* Total row */}
                {selectedSecondaryService && (
                  <div className="flex justify-between items-center border-t border-blue-100 pt-2 mt-1">
                    <span className="font-bold text-gray-800">Total</span>
                    <span className="font-bold text-green-700 text-base">
                      R$ {((pricing?.price || 0) + (secondaryPricing?.price || 0)).toFixed(2)}
                      <span className="text-gray-400 font-normal text-sm ml-1">
                        · {(pricing?.duration || 0) + (secondaryPricing?.duration || 0)} min
                      </span>
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Next button */}
        <div className="flex justify-end pt-2">
          <Button
            onClick={handleNext}
            disabled={!isNextEnabled}
            className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 transition-all duration-200 hover:scale-105 disabled:hover:scale-100"
          >
            Próximo
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default BasicInfoForm;
