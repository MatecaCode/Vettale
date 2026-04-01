
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pet, Service } from '@/hooks/useAppointmentForm';
import { usePricing } from '@/hooks/usePricing';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Link } from 'react-router-dom';
import { PlusCircle, AlertCircle, Info } from 'lucide-react';
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
  // Item 22: is_first_visit flag drives price-range display instead of fixed price
  const isFirstVisit = selectedPet?.is_first_visit === true;

  // Calculate pricing when both pet and service are selected (skipped for first-visit)
  const pricingParams = selectedPet && selectedService && !isFirstVisit ? {
    serviceId: selectedService.id,
    breedId: selectedPet.breed, // This is the breed name for veterinary services
    size: selectedPet.size
  } : null;

  const { pricing, isLoading: pricingLoading } = usePricing(pricingParams);

  // Secondary pricing when applicable (skipped for first-visit)
  const secondaryPricingParams = selectedPet && selectedSecondaryService && !isFirstVisit ? {
    serviceId: selectedSecondaryService.id,
    breedId: selectedPet.breed,
    size: selectedPet.size
  } : null;
  const { pricing: secondaryPricing, isLoading: secondaryPricingLoading } = usePricing(secondaryPricingParams);

  // Item 22: price range for first-visit pets — loaded async when service(s) change.
  // When a secondary service is also selected (Banho + Tosa combo), fetch both ranges
  // and add them together so the combined min/max reflects the full booking cost.
  const [priceRange, setPriceRange] = React.useState<PriceRange | null>(null);
  const [priceRangeLoading, setPriceRangeLoading] = React.useState(false);

  React.useEffect(() => {
    if (!isFirstVisit || !selectedService) {
      setPriceRange(null);
      return;
    }
    let cancelled = false;
    setPriceRangeLoading(true);

    const fetchCombined = async () => {
      const [primaryRange, secondaryRange] = await Promise.all([
        getServicePriceRange(selectedService.id),
        selectedSecondaryService ? getServicePriceRange(selectedSecondaryService.id) : Promise.resolve(null),
      ]);

      if (cancelled) return;

      if (!primaryRange) {
        setPriceRange(null);
      } else if (secondaryRange) {
        // Sum the two ranges: combined min = primary.min + secondary.min, etc.
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
  }, [isFirstVisit, selectedService?.id, selectedSecondaryService?.id]);

  const handleNext = () => {
    if (selectedPet && selectedService) {
      onNext();
    }
  };

  const isNextEnabled = selectedPet && selectedService;

  const formatSizeLabel = (size?: string) => {
    if (!size) return size;
    const sizeMap = {
      'small': 'Pequeno',
      'medium': 'Médio', 
      'large': 'Grande',
      'extra_large': 'Extra Grande'
    };
    return sizeMap[size as keyof typeof sizeMap] || size;
  };

  // If no pets are registered, show a prominent message
  if (userPets.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>1. Informações Básicas</CardTitle>
          <CardDescription>
            Selecione seu pet e o serviço desejado
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert className="border-orange-200 bg-orange-50">
            <AlertCircle className="h-4 w-4 text-orange-600" />
            <AlertDescription className="text-orange-800">
              <div className="space-y-4">
                <div>
                  <p className="font-medium mb-2">
                    Você ainda não tem pets cadastrados!
                  </p>
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>1. Informações Básicas</CardTitle>
        <CardDescription>
          Selecione seu pet e o serviço desejado
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="pet-select">Selecione seu Pet</Label>
          <Select
            value={selectedPet?.id || ''}
            onValueChange={(value) => {
              const pet = userPets.find(p => p.id === value);
              setSelectedPet(pet || null);
            }}
          >
            <SelectTrigger id="pet-select">
              <SelectValue placeholder="Escolha um pet" />
            </SelectTrigger>
            <SelectContent>
              {userPets.map((pet) => (
                <SelectItem key={pet.id} value={pet.id}>
                  <div className="flex flex-col items-start">
                    <span>{pet.name}</span>
                    {pet.breed && (
                      <span className="text-xs text-muted-foreground">
                        {pet.breed} - {formatSizeLabel(pet.size)}
                      </span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="service-select">Selecione o Serviço</Label>
          <Select
            value={selectedService?.id || ''}
            onValueChange={(value) => {
              const service = services.find(s => s.id === value);
              setSelectedService(service || null);
            }}
          >
            <SelectTrigger id="service-select">
              <SelectValue placeholder="Escolha um serviço" />
            </SelectTrigger>
            <SelectContent>
              {services.map((service) => (
                <SelectItem key={service.id} value={service.id}>
                  <div className="flex flex-col items-start">
                    <span>{service.name}</span>
                    {service.base_price && (
                      <span className="text-xs font-medium text-green-600">
                        A partir de R$ {service.base_price}
                      </span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {services.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum serviço de {serviceType === 'grooming' ? 'tosa' : 'veterinária'} disponível.
            </p>
          )}
        </div>

        {/* Secondary service - only when allowed */}
        {secondaryOptions.length > 0 && (
          <div className="space-y-2">
            <Label htmlFor="secondary-service-select">Selecione o Segundo Serviço (Tosa)</Label>
            <Select
              value={selectedSecondaryService?.id || ''}
              onValueChange={(value) => {
                const service = secondaryOptions.find(s => s.id === value);
                setSelectedSecondaryService(service || null);
              }}
            >
              <SelectTrigger id="secondary-service-select">
                <SelectValue placeholder="Opcional: escolha um serviço de tosa" />
              </SelectTrigger>
              <SelectContent>
                {secondaryOptions.map((service) => (
                  <SelectItem key={service.id} value={service.id}>
                    <div className="flex flex-col items-start">
                      <span>{service.name}</span>
                      {service.base_price && (
                        <span className="text-xs font-medium text-green-600">
                          A partir de R$ {service.base_price}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              O segundo serviço aparece quando o principal é de Banho.
            </p>
          </div>
        )}

        {/* Dynamic Pricing Display (supports optional secondary) */}
        {selectedService && selectedPet && (
          <div className="p-4 bg-muted rounded-lg">
            <h4 className="font-medium mb-2">Resumo</h4>
            <div className="text-sm space-y-2">

              {/* ── First-visit: show price range + explanation ── */}
              {isFirstVisit ? (
                <>
                  <div>
                    <p className="font-medium">
                      {selectedService.name}
                      {selectedSecondaryService && ` + ${selectedSecondaryService.name}`}
                    </p>
                    {priceRangeLoading ? (
                      <div className="flex items-center space-x-2">
                        <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
                        <span>Carregando faixa de preço...</span>
                      </div>
                    ) : priceRange ? (
                      <span className="text-green-700 font-medium">{formatPriceRange(priceRange)}</span>
                    ) : (
                      <span className="text-muted-foreground">A definir</span>
                    )}
                  </div>

                  {/* Explanation banner */}
                  <div className="mt-3 flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-blue-800">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                    <p className="text-xs leading-relaxed">{FIRST_VISIT_EXPLANATION}</p>
                  </div>
                </>
              ) : (
                <>
                  {/* ── Normal flow: fixed price ── */}
                  <div>
                    <p className="font-medium">{selectedService.name}</p>
                    {pricingLoading ? (
                      <div className="flex items-center space-x-2">
                        <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
                        <span>Calculando preço...</span>
                      </div>
                    ) : pricing ? (
                      <div className="flex items-center gap-2">
                        <span className="text-green-700 font-medium">R$ {pricing.price.toFixed(2)}</span>
                        <span className="text-muted-foreground">• {pricing.duration} min</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Preço não disponível</span>
                    )}
                  </div>

                  {selectedSecondaryService && (
                    <div>
                      <p className="font-medium">{selectedSecondaryService.name}</p>
                      {secondaryPricingLoading ? (
                        <div className="flex items-center space-x-2">
                          <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
                          <span>Calculando preço...</span>
                        </div>
                      ) : secondaryPricing ? (
                        <div className="flex items-center gap-2">
                          <span className="text-green-700 font-medium">R$ {secondaryPricing.price.toFixed(2)}</span>
                          <span className="text-muted-foreground">• {secondaryPricing.duration} min</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Preço não disponível</span>
                      )}
                    </div>
                  )}

                  {/* Total when secondary is present and allowed */}
                  {selectedSecondaryService && (
                    <div className="pt-2 border-t mt-2 text-sm">
                      <p className="font-semibold">
                        Total:{' '}
                        <span className="text-green-700">
                          R$ {((pricing?.price || 0) + (secondaryPricing?.price || 0)).toFixed(2)}
                        </span>{' '}
                        <span className="text-muted-foreground">
                          • {((pricing?.duration || 0) + (secondaryPricing?.duration || 0))} min
                        </span>
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Next Button */}
        <div className="flex justify-end pt-4">
          <Button 
            onClick={handleNext}
            disabled={!isNextEnabled}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            Próximo
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default BasicInfoForm;
