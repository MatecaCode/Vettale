import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, DollarSign, Clock, Save, Edit } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { BreedCombobox } from '@/components/BreedCombobox';
import { logAction } from '@/utils/actionLogger';

// Interfaces
interface Service {
  id: string;
  name: string;
  service_type: 'grooming' | 'veterinary';
  base_price: number | null;
  default_duration: number | null;
  description: string | null;
  active: boolean;
}

interface Breed {
  id: string;
  name: string;
  active: boolean;
}

interface ServicePricing {
  id: string;
  service_id: string;
  breed: string;
  size: string;
  price: number;
  duration_override: number | null;
  created_at: string;
}

const EditServicePricing = () => {
  const { serviceId } = useParams<{ serviceId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // State
  const [service, setService] = useState<Service | null>(null);
  const [breeds, setBreeds] = useState<Breed[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Form state
  const [selectedBreed, setSelectedBreed] = useState<Breed | null>(null);
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [currentPricing, setCurrentPricing] = useState<ServicePricing | null>(null);
  const [newPrice, setNewPrice] = useState<string>('');
  const [newDuration, setNewDuration] = useState<string>('');

  // Service base edit state
  const [isEditingService, setIsEditingService] = useState(false);
  const [serviceEditData, setServiceEditData] = useState({
    base_price: '',
    default_duration: '',
    description: ''
  });

  // Load data on component mount
  useEffect(() => {
    if (serviceId) {
      fetchService();
      fetchBreeds();
    }
  }, [serviceId]);

  // Handle breed and size selection changes
  useEffect(() => {
    if (selectedBreed && selectedSize) {
      handleBreedSizeSelection();
    }
  }, [selectedBreed, selectedSize]);

  // Fetch service data
  const fetchService = async () => {
    try {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('id', serviceId)
        .single();

      if (error) throw error;
      setService(data);
    } catch (error) {
      console.error('Error fetching service:', error);
      toast.error('Erro ao carregar dados do serviço');
    }
  };

  // Fetch breeds
  const fetchBreeds = async () => {
    try {
      const { data, error } = await supabase
        .from('breeds')
        .select('id, name, active')
        .eq('active', true)
        .order('name');

      if (error) throw error;
      setBreeds(data || []);
    } catch (error) {
      console.error('Error fetching breeds:', error);
      toast.error('Erro ao carregar raças');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle breed and size selection
  const handleBreedSizeSelection = async () => {
    if (!selectedBreed || !selectedSize || !serviceId) return;

    try {
      console.log('🔍 [SERVICE_PRICING] Fetching pricing for:', {
        serviceId,
        breed: selectedBreed.name,
        size: selectedSize
      });

      const { data, error } = await supabase
        .from('service_pricing')
        .select('id, price, duration_override, created_at')
        .eq('service_id', serviceId)
        .eq('breed', selectedBreed.name)
        .eq('size', selectedSize)
        .maybeSingle(); // Use maybeSingle instead of single to avoid 406 error

      if (error) {
        console.error('❌ [SERVICE_PRICING] Error fetching pricing:', error);
        throw error;
      }

      console.log('✅ [SERVICE_PRICING] Pricing fetch result:', data);

      if (data) {
        // Create a complete ServicePricing object with all required fields
        const pricingData: ServicePricing = {
          id: data.id,
          service_id: serviceId,
          breed: selectedBreed.name,
          size: selectedSize,
          price: data.price,
          duration_override: data.duration_override,
          created_at: data.created_at
        };
        setCurrentPricing(pricingData);
        setNewPrice(data.price.toString());
        setNewDuration(data.duration_override?.toString() || '');
      } else {
        setCurrentPricing(null);
        setNewPrice('');
        setNewDuration('');
      }
    } catch (error) {
      console.error('❌ [SERVICE_PRICING] Error in handleBreedSizeSelection:', error);
      toast.error('Erro ao carregar preços personalizados');
      
      // Reset form state on error
      setCurrentPricing(null);
      setNewPrice('');
      setNewDuration('');
    }
  };

  // Handle form submission
  const handleSavePricing = async () => {
    if (!selectedBreed || !selectedSize || !newPrice || !serviceId) {
      toast.error('Por favor, preencha todos os campos obrigatórios');
      return;
    }

    setIsSaving(true);
    try {
      const pricingData = {
        service_id: serviceId,
        service_name: service.name,
        breed: selectedBreed.name,
        size: selectedSize,
        price: parseFloat(newPrice),
        duration_override: newDuration ? parseInt(newDuration) : null
      };

      if (currentPricing) {
        // Update existing pricing
        const { error } = await supabase
          .from('service_pricing')
          .update(pricingData)
          .eq('id', currentPricing.id);

        if (error) throw error;
        void logAction({
          action_type: 'price_updated',
          category: 'config',
          description: `Preço atualizado para serviço "${service?.name ?? serviceId}" — raça: ${selectedBreed?.name}, porte: ${selectedSize}, novo preço: R$ ${pricingData.price}`,
          link_type: null,
          link_id: null,
          metadata: { serviceId, breedId: selectedBreed?.id, breedName: selectedBreed?.name, size: selectedSize, price: pricingData.price, durationOverride: pricingData.duration_override },
        });
        toast.success('Preços atualizados com sucesso!');
      } else {
        // Insert new pricing
        const { error } = await supabase
          .from('service_pricing')
          .insert(pricingData);

        if (error) throw error;
        void logAction({
          action_type: 'price_updated',
          category: 'config',
          description: `Preço criado para serviço "${service?.name ?? serviceId}" — raça: ${selectedBreed?.name}, porte: ${selectedSize}, preço: R$ ${pricingData.price}`,
          link_type: null,
          link_id: null,
          metadata: { serviceId, breedId: selectedBreed?.id, breedName: selectedBreed?.name, size: selectedSize, price: pricingData.price, durationOverride: pricingData.duration_override },
        });
        toast.success('Preços salvos com sucesso!');
      }

      // Refresh current pricing
      await handleBreedSizeSelection();
    } catch (error) {
      console.error('Error saving pricing:', error);
      toast.error('Erro ao salvar preços');
    } finally {
      setIsSaving(false);
    }
  };

  // Get size display name
  const getSizeDisplay = (size: string) => {
    const sizeMap: Record<string, string> = {
      'small': 'Pequeno',
      'medium': 'Médio',
      'large': 'Grande',
      'extra_large': 'Extra Grande'
    };
    return sizeMap[size] || size;
  };

  // Get service type display
  const getServiceTypeDisplay = (type: string) => {
    const typeMap: Record<string, string> = {
      'grooming': 'Tosa e Banho',
      'veterinary': 'Veterinário'
    };
    return typeMap[type] || type;
  };

  // Service base edit functions
  const startEditingService = () => {
    if (!service) return;
    
    setServiceEditData({
      base_price: service.base_price?.toString() || '',
      default_duration: service.default_duration?.toString() || '',
      description: service.description || ''
    });
    setIsEditingService(true);
  };

  const cancelEditingService = () => {
    setIsEditingService(false);
    setServiceEditData({
      base_price: '',
      default_duration: '',
      description: ''
    });
  };

  const saveServiceChanges = async () => {
    if (!service || !serviceId) return;

    setIsSaving(true);
    try {
      const updateData = {
        base_price: serviceEditData.base_price ? parseFloat(serviceEditData.base_price) : null,
        default_duration: serviceEditData.default_duration ? parseInt(serviceEditData.default_duration) : null,
        description: serviceEditData.description || null
      };

      console.log('🔧 [SERVICE_UPDATE] Attempting to update service:', {
        serviceId,
        updateData,
        currentUser: user?.id
      });

      const { data, error } = await supabase
        .from('services')
        .update(updateData)
        .eq('id', serviceId)
        .select(); // Add select to get the updated data

      if (error) {
        console.error('❌ [SERVICE_UPDATE] Error updating service:', error);
        throw error;
      }

      console.log('✅ [SERVICE_UPDATE] Service update result:', data);

      void logAction({
        action_type: 'config_updated',
        category: 'config',
        description: `Serviço editado: "${service?.name ?? serviceId}"`,
        link_type: null,
        link_id: null,
        metadata: { serviceId, ...updateData },
      });

      // Refresh service data
      await fetchService();
      setIsEditingService(false);
      toast.success('Informações do serviço atualizadas com sucesso!');
    } catch (error) {
      console.error('❌ [SERVICE_UPDATE] Error in saveServiceChanges:', error);
      toast.error('Erro ao atualizar informações do serviço');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-2 text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!service) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-8">
          <p className="text-gray-600">Serviço não encontrado</p>
          <Button onClick={() => navigate('/admin/settings')} className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Button 
            variant="outline" 
            onClick={() => navigate('/admin/pricing')}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <h1 className="text-2xl font-bold text-gray-900">Editar Preços</h1>
          <p className="text-gray-600">Configure preços por raça e tamanho</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Service Overview */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  {service.name}
                </div>
                {!isEditingService && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={startEditingService}
                    disabled={isSaving}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Editar
                  </Button>
                )}
              </CardTitle>
              <CardDescription>
                {isEditingService ? 'Editar informações do serviço' : 'Informações do serviço'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm font-medium text-gray-700">Tipo</Label>
                <p className="text-sm text-gray-600">{getServiceTypeDisplay(service.service_type)}</p>
              </div>
              
              {isEditingService ? (
                // Edit mode
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="edit-base-price" className="text-sm font-medium text-gray-700">
                      Novo Preço Base (R$)
                    </Label>
                    <Input
                      id="edit-base-price"
                      type="number"
                      step="0.01"
                      value={serviceEditData.base_price}
                      onChange={(e) => setServiceEditData(prev => ({ ...prev, base_price: e.target.value }))}
                      placeholder="0.00"
                      disabled={isSaving}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="edit-default-duration" className="text-sm font-medium text-gray-700">
                      Nova Duração Padrão (minutos)
                    </Label>
                    <Input
                      id="edit-default-duration"
                      type="number"
                      value={serviceEditData.default_duration}
                      onChange={(e) => setServiceEditData(prev => ({ ...prev, default_duration: e.target.value }))}
                      placeholder="0"
                      disabled={isSaving}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="edit-description" className="text-sm font-medium text-gray-700">
                      Nova Descrição
                    </Label>
                    <textarea
                      id="edit-description"
                      value={serviceEditData.description}
                      onChange={(e) => setServiceEditData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Descrição do serviço"
                      disabled={isSaving}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                      rows={3}
                    />
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      onClick={saveServiceChanges}
                      disabled={isSaving}
                      size="sm"
                    >
                      <Save className="h-4 w-4 mr-1" />
                      {isSaving ? 'Salvando...' : 'Salvar'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={cancelEditingService}
                      disabled={isSaving}
                      size="sm"
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                // View mode
                <>
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Preço Base</Label>
                    <p className="text-sm text-gray-600">R$ {service.base_price?.toFixed(2) || '0.00'}</p>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Duração Padrão</Label>
                    <p className="text-sm text-gray-600">{service.default_duration || 0} minutos</p>
                  </div>
                  
                  {service.description && (
                    <div>
                      <Label className="text-sm font-medium text-gray-700">Descrição</Label>
                      <p className="text-sm text-gray-600">{service.description}</p>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Edit Form */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Configurar Preços</CardTitle>
              <CardDescription>
                Selecione a raça e tamanho para configurar preços específicos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Breed Selection */}
              <div>
                <Label htmlFor="breed">Raça</Label>
                <BreedCombobox
                  breeds={breeds}
                  onSelect={setSelectedBreed}
                  selectedBreed={selectedBreed}
                  disabled={isSaving}
                />
              </div>

              {/* Size Selection */}
              <div>
                <Label htmlFor="size">Tamanho</Label>
                <Select 
                  value={selectedSize} 
                  onValueChange={setSelectedSize}
                  disabled={isSaving}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tamanho" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Pequeno</SelectItem>
                    <SelectItem value="medium">Médio</SelectItem>
                    <SelectItem value="large">Grande</SelectItem>
                    <SelectItem value="extra_large">Extra Grande</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Current Pricing Display */}
              {selectedBreed && selectedSize && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium mb-2">Preços Atuais</h4>
                  {currentPricing ? (
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Preço:</span>
                        <Badge variant="outline">R$ {currentPricing.price.toFixed(2)}</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Duração:</span>
                        <Badge variant="outline">
                          {currentPricing.duration_override || service.default_duration} min
                        </Badge>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Nenhum preço personalizado configurado ainda</p>
                  )}
                </div>
              )}

              {/* New Pricing Form */}
              {selectedBreed && selectedSize && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="new-price">Novo Preço (R$)</Label>
                      <Input
                        id="new-price"
                        type="number"
                        step="0.01"
                        value={newPrice}
                        onChange={(e) => setNewPrice(e.target.value)}
                        placeholder="0.00"
                        disabled={isSaving}
                      />
                    </div>
                    <div>
                      <Label htmlFor="new-duration">Duração (minutos)</Label>
                      <Input
                        id="new-duration"
                        type="number"
                        value={newDuration}
                        onChange={(e) => setNewDuration(e.target.value)}
                        placeholder={service.default_duration?.toString() || "0"}
                        disabled={isSaving}
                      />
                    </div>
                  </div>

                  <Button 
                    onClick={handleSavePricing}
                    disabled={!newPrice || isSaving}
                    className="w-full"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {isSaving ? 'Salvando...' : 'Salvar Preços'}
                  </Button>
                </div>
              )}

              {/* Instructions */}
              {!selectedBreed || !selectedSize ? (
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-700">
                    Selecione uma raça e tamanho para começar a configurar os preços.
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default EditServicePricing; 