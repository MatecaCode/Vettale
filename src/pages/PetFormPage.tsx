import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import { BrandBackground } from '@/components/layout/BrandBackground';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { PetDobPicker } from '@/components/calendars/pet/PetDobPicker';
import { PetPhotoUpload } from '@/components/pet/PetPhotoUpload';
import { ArrowLeft, Save, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useBreeds } from '@/hooks/useBreeds';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface Pet {
  id: string;
  name: string;
  breed?: string;
  breed_id?: string;
  age?: string;
  birth_date?: string;
  size?: string;
  weight?: number;
  gender?: string;
  notes?: string;
}

const PetFormPage = () => {
  const navigate = useNavigate();
  const { petId } = useParams<{ petId: string }>();
  const { user } = useAuth();
  const { breeds, isLoading: breedsLoading } = useBreeds();
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [birthDate, setBirthDate] = useState<Date | undefined>();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    breed_id: '',
    size: '',
    weight: '',
    gender: '',
    notes: ''
  });

  const isEditing = !!petId;

  // Fetch pet data if editing
  useEffect(() => {
    if (isEditing && petId) {
      fetchPetData();
    }
  }, [petId, isEditing]);

  const fetchPetData = async () => {
    if (!petId) return;
    
    setIsFetching(true);
    try {
      const { data, error } = await supabase
        .from('pets')
        .select('*')
        .eq('id', petId)
        .single();

      if (error) throw error;

      if (data) {
        setFormData({
          name: data.name || '',
          breed_id: data.breed_id || '',
          size: data.size || '',
          weight: data.weight?.toString() || '',
          gender: data.gender || '',
          notes: data.notes || ''
        });
        
        if (data.birth_date) {
          setBirthDate(new Date(data.birth_date));
        }

        if (data.photo_url) {
          setPhotoUrl(data.photo_url);
        }
      }
    } catch (error: any) {
      console.error('Error fetching pet:', error);
      toast.error('Erro ao carregar dados do pet');
      navigate('/pets');
    } finally {
      setIsFetching(false);
    }
  };

  // Validation function
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Name validation
    if (!formData.name.trim()) {
      newErrors.name = 'Nome do pet é obrigatório';
    }

    // Breed validation
    if (!formData.breed_id) {
      newErrors.breed_id = 'Raça é obrigatória';
    }

    // Birth date validation
    if (!isEditing && !birthDate) {
      newErrors.birth_date = 'Data de nascimento é obrigatória';
    } else if (birthDate && birthDate > new Date()) {
      newErrors.birth_date = 'Data de nascimento não pode ser no futuro';
    }

    // Size validation
    if (!formData.size) {
      newErrors.size = 'Porte é obrigatório';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toast.error('Por favor, corrija os erros no formulário');
      return;
    }

    if (!user) {
      toast.error('Você precisa estar logado para cadastrar um pet');
      return;
    }

    setIsLoading(true);
    try {
      // Get client_id from user_id
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (clientError || !clientData) {
        toast.error('Erro ao encontrar dados do cliente');
        return;
      }

      // Get the breed name from the selected breed_id
      const selectedBreed = breeds.find(breed => breed.id === formData.breed_id);
      
      const petData = {
        name: formData.name,
        breed_id: formData.breed_id || null,
        breed: selectedBreed?.name || null,
        birth_date: birthDate ? format(birthDate, 'yyyy-MM-dd') : null,
        size: formData.size || null,
        weight: formData.weight ? parseFloat(formData.weight.toString()) : null,
        gender: formData.gender || null,
        notes: formData.notes || null,
        photo_url: photoUrl || null,
        client_id: clientData.id
      };

      let error;
      if (isEditing) {
        // Update existing pet
        const { error: updateError } = await supabase
          .from('pets')
          .update(petData)
          .eq('id', petId);
        error = updateError;
      } else {
        // Create new pet
        const { error: insertError } = await supabase
          .from('pets')
          .insert(petData);
        error = insertError;
      }

      if (error) throw error;

      toast.success(isEditing ? 'Pet atualizado com sucesso!' : 'Pet cadastrado com sucesso!');
      navigate('/pets');
    } catch (error: any) {
      console.error('Error saving pet:', error);
      toast.error('Erro ao salvar pet: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Convert breeds to options for the combobox
  const breedOptions = breeds.map(breed => ({
    value: breed.id,
    label: breed.name
  }));

  if (isFetching) {
    return (
      <Layout>
        <BrandBackground>
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
              <p>Carregando dados do pet...</p>
            </div>
          </div>
        </BrandBackground>
      </Layout>
    );
  }

  return (
    <Layout>
      <BrandBackground>
        <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => navigate('/pets')}
            className="mb-4 flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para Meus Pets
          </Button>
          
          <div>
            <h1 className="text-3xl font-bold">
              {isEditing ? 'Editar Pet' : 'Adicionar Novo Pet'}
            </h1>
            <p className="text-muted-foreground mt-2">
              {isEditing ? 'Atualize as informações do seu pet' : 'Preencha as informações do seu pet'}
            </p>
          </div>
        </div>

                 {/* Form */}
         <div className="max-w-2xl mx-auto">
           <div className="mb-6">
             <h2 className="text-2xl font-semibold text-gray-800">Informações do Pet</h2>
             <p className="text-gray-600 mt-1">
               Preencha todos os campos obrigatórios marcados com *
             </p>
           </div>
           <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-white/20 shadow-lg p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Pet Photo */}
              <div className="w-full flex flex-col items-center pb-2">
                <PetPhotoUpload
                  userId={user?.id ?? ''}
                  petId={petId}
                  currentPhotoUrl={photoUrl}
                  onPhotoChange={setPhotoUrl}
                  petName={formData.name}
                />
              </div>

              {/* Pet Name */}
               <div className="space-y-2">
                 <Label htmlFor="name" className="text-base font-normal text-gray-700">
                   Nome do Pet *
                 </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => {
                    setFormData({...formData, name: e.target.value});
                    if (errors.name) setErrors({...errors, name: ''});
                  }}
                  placeholder="Digite o nome do seu pet"
                  className={`h-12 text-base ${errors.name ? 'border-red-500' : ''}`}
                />
                {errors.name && (
                  <div className="flex items-center gap-2 text-red-500 text-sm mt-1">
                    <AlertCircle className="w-4 h-4" />
                    {errors.name}
                  </div>
                )}
              </div>

                                                           {/* Breed */}
                <div className="space-y-2">
                  <Label className="text-base font-normal text-gray-700">Raça *</Label>
                                   <Combobox
                    options={breedOptions}
                    value={formData.breed_id}
                    onValueChange={(value) => {
                      setFormData({...formData, breed_id: value});
                      if (errors.breed_id) setErrors({...errors, breed_id: ''});
                    }}
                    placeholder={breedsLoading ? "Carregando..." : "Selecione ou digite uma raça"}
                    searchPlaceholder="Digite para buscar raça..."
                    emptyText="Nenhuma raça encontrada."
                    disabled={breedsLoading}
                    className={`h-12 text-base ${errors.breed_id ? 'border-red-500' : ''}`}
                  />
                 {errors.breed_id && (
                   <div className="flex items-center gap-2 text-red-500 text-sm mt-1">
                     <AlertCircle className="w-4 h-4" />
                     {errors.breed_id}
                   </div>
                 )}
               </div>

                {/* Birth Date */}
                <div className="space-y-2">
                  <Label className="text-base font-normal text-gray-700">{isEditing ? 'Data de Nascimento' : 'Data de Nascimento *'}</Label>
                 <PetDobPicker
                   value={birthDate}
                   onChange={(date) => {
                     setBirthDate(date);
                     if (errors.birth_date) setErrors({...errors, birth_date: ''});
                   }}
                   placeholder="DD/MM/AAAA"
                   className={`w-full ${errors.birth_date ? '[&_input]:border-red-500' : ''}`}
                 />
                 <p className="text-xs text-gray-400">Digite a data ou clique no ícone do calendário</p>
                 {errors.birth_date && (
                   <div className="flex items-center gap-2 text-red-500 text-sm mt-1">
                     <AlertCircle className="w-4 h-4" />
                     {errors.birth_date}
                   </div>
                 )}
               </div>

                             {/* Size and Weight */}
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 <div className="space-y-2">
                   <Label htmlFor="size" className="text-base font-normal text-gray-700">
                     Porte *
                   </Label>
                  <Select 
                    value={formData.size} 
                    onValueChange={(value) => {
                      setFormData({...formData, size: value});
                      if (errors.size) setErrors({...errors, size: ''});
                    }}
                  >
                    <SelectTrigger className={`h-12 text-base ${errors.size ? 'border-red-500' : ''}`}>
                      <SelectValue placeholder="Selecione o porte" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="small">Pequeno</SelectItem>
                      <SelectItem value="medium">Médio</SelectItem>
                      <SelectItem value="large">Grande</SelectItem>
                      <SelectItem value="extra_large">Extra Grande</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.size && (
                    <div className="flex items-center gap-2 text-red-500 text-sm mt-1">
                      <AlertCircle className="w-4 h-4" />
                      {errors.size}
                    </div>
                  )}
                </div>

                                 <div className="space-y-2">
                   <Label htmlFor="weight" className="text-base font-normal text-gray-700 flex items-center gap-2">
                     Peso (kg)
                     <span className="text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">opcional</span>
                   </Label>
                  <Input
                    id="weight"
                    type="number"
                    step="0.1"
                    value={formData.weight}
                    onChange={(e) => setFormData({...formData, weight: e.target.value})}
                    placeholder="Ex: 15.5"
                    className="h-12 text-base"
                  />
                  <p className="text-xs text-gray-400">Não sabe o peso? Sem problema! Seu pet pode ser pesado na chegada.</p>
                </div>
              </div>

                             {/* Gender */}
               <div className="space-y-2">
                 <Label htmlFor="gender" className="text-base font-normal text-gray-700">
                   Sexo
                 </Label>
                <Select 
                  value={formData.gender} 
                  onValueChange={(value) => setFormData({...formData, gender: value})}
                >
                  <SelectTrigger className="h-12 text-base">
                    <SelectValue placeholder="Selecione o sexo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Macho</SelectItem>
                    <SelectItem value="female">Fêmea</SelectItem>
                  </SelectContent>
                </Select>
              </div>

                             {/* Notes */}
               <div className="space-y-2">
                 <Label htmlFor="notes" className="text-base font-normal text-gray-700">
                   Observações
                 </Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  placeholder="Temperamento, alergias, cuidados especiais, histórico médico..."
                  className="min-h-[120px] text-base resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 pt-4 -mx-8 px-5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/pets')}
                  className="flex-1 h-12 text-base"
                >
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={isLoading} 
                  className="flex-1 h-12 text-base"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      {isEditing ? 'Atualizar Pet' : 'Cadastrar Pet'}
                    </>
                  )}
                </Button>
              </div>
                         </form>
           </div>
         </div>
        </div>
      </BrandBackground>
    </Layout>
  );
};

export default PetFormPage;
