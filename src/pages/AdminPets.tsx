import React, { useState, useEffect, useCallback } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { PetDobPicker } from '@/components/calendars/pet/PetDobPicker';
import { BreedCombobox } from '@/components/BreedCombobox';
import { toast } from 'sonner';
import { 
  PawPrint,
  Search,
  Plus,
  Edit,
  Trash2,
  User,
  FileText,
  Dog,
  Cat,
  HelpCircle,
  Loader2,
  X,
  Sparkles
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { format, differenceInYears, differenceInMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Pet {
  id: string;
  name: string;
  breed: string;
  breed_id?: string;
  size?: string;
  age: string;
  birth_date?: string;
  notes: string;
  created_at: string;
  updated_at: string;
  client_id: string;
  client_name?: string;
  client_email?: string;
  // Item 23: New Pet Detection Mechanism — true until first completed appointment
  is_first_visit?: boolean;
}

interface Breed {
  id: string;
  name: string;
  active: boolean;
}

interface Client {
  id: string;
  name: string;
  email: string | null;
  user_id: string;
}

const AdminPets = () => {
  const { user } = useAuth();
  const [pets, setPets] = useState<Pet[]>([]);
  const [breeds, setBreeds] = useState<Breed[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedPet, setSelectedPet] = useState<Pet | null>(null);
  // Async client search state (used in both create and edit modals)
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [clientSearchResults, setClientSearchResults] = useState<Client[]>([]);
  const [isClientSearching, setIsClientSearching] = useState(false);
  const [isClientPopoverOpen, setIsClientPopoverOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    breed: '',
    breed_id: '',
    size: '',
    age: '',
    client_id: '',
    notes: '',
    birth_date: ''
  });
  const [birthDate, setBirthDate] = useState<Date | undefined>(undefined);
  const [selectedClient, setSelectedClient] = useState<Client | undefined>(undefined);
  const [selectedBreed, setSelectedBreed] = useState<Breed | undefined>(undefined);

  // Search-on-demand: only fires when term >= 2 chars OR a client filter is active.
  // Runs two parallel queries (pet name + client name) and merges/deduplicates up to 50 results.
  // Defined before the useEffects that reference it to avoid TDZ errors.
  const searchPets = useCallback(async (term: string) => {
    if (term.length < 2) {
      setPets([]);
      return;
    }

    setIsLoading(true);
    try {
      const cols = `
        id, name, breed, breed_id, size, age, birth_date, notes,
        created_at, updated_at, client_id, is_first_visit,
        clients:client_id (name, email)
      `;

      // Search pet name AND client name in parallel; merge and deduplicate
      const [byName, clientRows] = await Promise.all([
        supabase.from('pets').select(cols).ilike('name', `${term}%`).order('name').limit(50),
        supabase.from('clients').select('id').ilike('name', `${term}%`).limit(30),
      ]);

      let combined = [...(byName.data ?? [])];

      if (clientRows.data?.length) {
        const ids = clientRows.data.map(c => c.id);
        const { data: byClient } = await supabase
          .from('pets')
          .select(cols)
          .in('client_id', ids)
          .order('name')
          .limit(50);
        combined = [...combined, ...(byClient ?? [])];
      }

      const seen = new Set<string>();
      setPets(
        combined
          .filter(p => !seen.has(p.id) && !!seen.add(p.id))
          .slice(0, 50)
          .map(pet => ({
            ...pet,
            client_name: (pet.clients as any)?.name,
            client_email: (pet.clients as any)?.email,
          }))
      );
    } catch (err) {
      console.error('❌ [ADMIN_PETS] Search error:', err);
      toast.error('Erro ao buscar pets');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load breed list on mount (small reference table, used in modals)
  useEffect(() => {
    fetchBreeds();
  }, []);

  // Debounced pet search
  useEffect(() => {
    const timer = setTimeout(() => searchPets(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm, searchPets]);

  // Debounced async client search (for the Dono picker in modals)
  const searchClients = useCallback(async (term: string) => {
    if (term.length < 2) { setClientSearchResults([]); return; }
    setIsClientSearching(true);
    try {
      const { data } = await supabase
        .from('clients')
        .select('id, name, email, user_id')
        .ilike('name', `%${term}%`)
        .order('name')
        .limit(30);
      setClientSearchResults(data ?? []);
    } catch { /* ignore */ } finally {
      setIsClientSearching(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => searchClients(clientSearchTerm), 300);
    return () => clearTimeout(timer);
  }, [clientSearchTerm, searchClients]);

  // Deep link support: ?edit=<petId> opens edit modal for that pet
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const petId = params.get('edit');
    if (!petId) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('pets')
          .select(`
            id, name, breed, breed_id, size, age, birth_date, notes, created_at, updated_at, client_id
          `)
          .eq('id', petId)
          .single();
        if (error || !data) return;
        setTimeout(() => {
          (openEditModal as any)(data);
        }, 0);
      } catch {
        // ignore
      }
    })();
  }, []);

  const fetchBreeds = async () => {
    try {
      const { data, error } = await supabase
        .from('breeds')
        .select('id, name, active')
        .eq('active', true)
        .order('name');

      if (error) {
        console.error('❌ [ADMIN_PETS] Error fetching breeds:', error);
        throw error;
      }

      setBreeds(data || []);
    } catch (error) {
      console.error('❌ [ADMIN_PETS] Error fetching breeds:', error);
      toast.error('Erro ao carregar raças');
    }
  };

  // Server handles all filtering — use results directly
  const filteredPets = pets;

       const handleCreatePet = async () => {
    if (!formData.name || !formData.client_id) {
      toast.error('Nome e dono são obrigatórios');
      return;
    }

    if (!birthDate) {
      toast.error('Data de nascimento é obrigatória');
      return;
    }

           try {
        const { error: fnError } = await supabase
          .from('pets')
          .insert({
            name: formData.name,
            breed: selectedBreed?.name || formData.breed,
            breed_id: selectedBreed?.id || null,
            size: formData.size || null,
            age: formData.age,
            birth_date: birthDate ? format(birthDate, 'yyyy-MM-dd') : null,
            notes: formData.notes,
            client_id: formData.client_id,
          });

      if (fnError) {
        console.error('❌ [ADMIN_PETS] Pet creation error:', fnError);
        toast.error('Erro ao criar pet');
        return;
      }

      toast.success('Pet criado com sucesso');
      setIsCreateModalOpen(false);
      resetForm();
      searchPets(searchTerm);
    } catch (error) {
      console.error('❌ [ADMIN_PETS] Error creating pet:', error);
      toast.error('Erro ao criar pet');
    }
  };

       const handleEditPet = async () => {
    if (!selectedPet || !formData.name) {
      toast.error('Nome é obrigatório');
      return;
    }

    if (!birthDate) {
      toast.error('Data de nascimento é obrigatória');
      return;
    }

     console.log('🔍 [ADMIN_PETS] Updating pet:', selectedPet.id);
     console.log('🔍 [ADMIN_PETS] Form data:', formData);
     console.log('🔍 [ADMIN_PETS] Birth date:', birthDate);

     try {
               const updateData = {
          name: formData.name,
          breed: selectedBreed?.name || formData.breed,
          breed_id: selectedBreed?.id || null,
          size: formData.size || null,
          age: formData.age,
          birth_date: birthDate ? format(birthDate, 'yyyy-MM-dd') : null,
          notes: formData.notes,
          client_id: formData.client_id
        };

       console.log('🔍 [ADMIN_PETS] Update data:', updateData);

       const { error: fnError } = await supabase
          .from('pets')
          .update(updateData)
          .eq('id', selectedPet.id);

      if (fnError) {
        console.error('❌ [ADMIN_PETS] Update error:', fnError);
        toast.error('Erro ao atualizar pet');
        return;
      }

      console.log('✅ [ADMIN_PETS] Update successful');
      toast.success('Pet atualizado com sucesso');
      setIsEditModalOpen(false);
      setSelectedPet(null);
      resetForm();
      searchPets(searchTerm);
    } catch (error) {
      console.error('❌ [ADMIN_PETS] Error updating pet:', error);
      toast.error('Erro ao atualizar pet');
    }
  };

  const handleDeletePet = async (petId: string) => {
    try {
      const { error: fnError } = await supabase
        .from('pets')
        .delete()
        .eq('id', petId);

      if (fnError) {
        console.error('❌ [ADMIN_PETS] Delete error:', fnError);
        toast.error('Erro ao deletar pet');
        return;
      }

      toast.success('Pet deletado com sucesso');
      searchPets(searchTerm);
    } catch (error) {
      console.error('❌ [ADMIN_PETS] Error deleting pet:', error);
      toast.error('Erro ao deletar pet');
    }
  };

       const resetForm = () => {
    setFormData({
      name: '',
      breed: '',
      breed_id: '',
      size: '',
      age: '',
      client_id: '',
      notes: '',
      birth_date: ''
    });
    setBirthDate(undefined);
    setSelectedClient(undefined);
    setSelectedBreed(undefined);
    setClientSearchTerm('');
    setClientSearchResults([]);
  };

  const openEditModal = async (pet: Pet) => {
    setSelectedPet(pet);
    setFormData({
      name: pet.name || '',
      breed: pet.breed || '',
      breed_id: pet.breed_id || '',
      size: pet.size || '',
      age: pet.age || '',
      client_id: pet.client_id || '',
      notes: pet.notes || '',
      birth_date: pet.birth_date || ''
    });
    setBirthDate(pet.birth_date ? new Date(pet.birth_date) : undefined);

    // Fetch the specific client for this pet to pre-populate the picker
    if (pet.client_id) {
      try {
        const { data } = await supabase
          .from('clients')
          .select('id, name, email, user_id')
          .eq('id', pet.client_id)
          .single();
        if (data) setSelectedClient(data as Client);
      } catch { /* picker will just start empty */ }
    }

    // Find and set the selected breed
    const breed = breeds.find(b => b.id === pet.breed_id);
    setSelectedBreed(breed);

    setIsEditModalOpen(true);
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'dd/MM/yyyy', { locale: ptBR });
    } catch {
      return 'Data inválida';
    }
  };

  const formatPt = (d?: string | Date) => (d ? new Date(d).toLocaleDateString('pt-BR') : 'N/A');

     const getAgeDisplay = (age: string, birth_date?: string) => {
     if (birth_date) {
       try {
         const birthDate = new Date(birth_date);
         const today = new Date();
         const years = differenceInYears(today, birthDate);
         const months = differenceInMonths(today, birthDate) % 12;
         
         if (years > 0) {
           return `${years} ano${years > 1 ? 's' : ''}${months > 0 ? ` e ${months} mes${months > 1 ? 'es' : ''}` : ''}`;
         } else {
           return `${months} mes${months > 1 ? 'es' : ''}`;
         }
       } catch {
         return age || 'Idade não informada';
       }
     }
     if (!age) return 'Idade não informada';
     return age;
   };

           const getBreedIcon = (breed: string) => {
      if (!breed) return <HelpCircle className="h-4 w-4" />;
      
      const breedLower = breed.toLowerCase();
      if (breedLower.includes('retriever') || breedLower.includes('collie') || breedLower.includes('shepherd')) {
        return <Dog className="h-4 w-4" />;
      } else if (breedLower.includes('siamese') || breedLower.includes('persian')) {
        return <Cat className="h-4 w-4" />;
      } else {
        return <HelpCircle className="h-4 w-4" />;
      }
    };

    const getSizeDisplay = (size: string) => {
      switch (size) {
        case 'small': return 'Pequeno';
        case 'medium': return 'Médio';
        case 'large': return 'Grande';
        case 'extra_large': return 'Extra Grande';
        default: return size;
      }
    };

  if (!user) {
    return <div>Carregando...</div>;
  }

  return (
    <AdminLayout>
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <PawPrint className="h-8 w-8" />
            🐾 Gerenciar Pets
          </h1>
          <p className="text-gray-600 mt-2">Gerencie todos os pets cadastrados no sistema</p>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Buscar por nome do pet, dono ou raça..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <div className="flex gap-2">
            <Dialog open={isCreateModalOpen} onOpenChange={(open) => {
              setIsCreateModalOpen(open);
              if (!open) {
                resetForm();
              }
            }}>
              <DialogTrigger asChild>
                <Button className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Novo Pet
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Criar Novo Pet</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="name">Nome *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Nome do pet"
                    />
                  </div>
                                     <div>
                     <Label htmlFor="age">Idade</Label>
                     <Input
                       id="age"
                       value={formData.age}
                       onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                       placeholder="Ex: 3 anos"
                     />
                   </div>
                                                         <div>
                      <Label htmlFor="breed">Raça</Label>
                      <BreedCombobox
                        breeds={breeds}
                        onSelect={(breed) => {
                          setSelectedBreed(breed);
                          setFormData({ ...formData, breed: breed.name, breed_id: breed.id });
                        }}
                        selectedBreed={selectedBreed}
                        disabled={false}
                        isLoading={false}
                      />
                    </div>
                                         <div>
                       <Label htmlFor="size">Tamanho</Label>
                       <Select value={formData.size} onValueChange={(value) => setFormData({ ...formData, size: value })}>
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
                  
                                     <div>
                     <Label htmlFor="birth-date">Data de Nascimento *</Label>
                     <PetDobPicker
                       value={birthDate}
                       onChange={setBirthDate}
                     />
                   </div>

                                     <div>
                     <Label htmlFor="client">Dono *</Label>
                     <div className="relative">
                       <div className="flex items-center border rounded-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 bg-background">
                         <Input
                           id="client"
                           className="border-0 shadow-none focus-visible:ring-0"
                           placeholder="Digite para buscar cliente..."
                           autoComplete="off"
                           value={selectedClient ? selectedClient.name : clientSearchTerm}
                           onChange={(e) => {
                             setSelectedClient(undefined);
                             setFormData({ ...formData, client_id: '' });
                             setClientSearchTerm(e.target.value);
                             setIsClientPopoverOpen(true);
                           }}
                           onFocus={() => setIsClientPopoverOpen(true)}
                           onBlur={() => setTimeout(() => setIsClientPopoverOpen(false), 150)}
                         />
                         {selectedClient && (
                           <button type="button" className="pr-2 text-gray-400 hover:text-gray-600"
                             onMouseDown={(e) => { e.preventDefault(); setSelectedClient(undefined); setFormData({ ...formData, client_id: '' }); setClientSearchTerm(''); }}>
                             <X className="h-4 w-4" />
                           </button>
                         )}
                       </div>
                       {isClientPopoverOpen && !selectedClient && (
                         <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                           {clientSearchTerm.length < 2 ? (
                             <p className="px-3 py-2 text-sm text-gray-400">Digite para buscar um dono...</p>
                           ) : isClientSearching ? (
                             <p className="px-3 py-2 text-sm text-gray-400 flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" />Buscando...</p>
                           ) : clientSearchResults.length === 0 ? (
                             <p className="px-3 py-2 text-sm text-gray-400">Nenhum cliente encontrado</p>
                           ) : clientSearchResults.map(c => (
                             <button key={c.id} type="button"
                               className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                               onMouseDown={(e) => { e.preventDefault(); setSelectedClient(c); setFormData({ ...formData, client_id: c.id }); setClientSearchTerm(''); setIsClientPopoverOpen(false); }}>
                               <span className="font-medium">{c.name}</span>
                               {c.email && <span className="text-gray-400 ml-2 text-xs">{c.email}</span>}
                             </button>
                           ))}
                         </div>
                       )}
                     </div>
                   </div>
                  <div>
                    <Label htmlFor="notes">Notas</Label>
                    <Textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Observações sobre o pet"
                      rows={3}
                    />
                  </div>
                  <div className="flex gap-2 pt-4">
                    <Button onClick={handleCreatePet} className="flex-1">
                      Criar Pet
                    </Button>
                    <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Pets Grid */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
            <p className="mt-3 text-gray-600">Buscando pets...</p>
          </div>
        ) : searchTerm.length < 2 ? (
          <Card>
            <CardContent className="text-center py-12">
              <Search className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Busque um pet para começar</h3>
              <p className="text-gray-500">
                Digite pelo menos 2 caracteres para buscar por nome do pet ou dono.
              </p>
            </CardContent>
          </Card>
        ) : filteredPets.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <PawPrint className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Nenhum pet encontrado</h3>
              <p className="text-gray-600">
                Nenhum resultado para{searchTerm ? ` "${searchTerm}"` : ''}.
                Tente ajustar a busca ou os filtros.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-4">
              Mostrando {filteredPets.length} resultado{filteredPets.length !== 1 ? 's' : ''}
              {filteredPets.length === 50 ? ' (máximo de 50 — refine a busca para ver mais)' : ''}
            </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPets.map((pet) => (
              <Card key={pet.id} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg leading-tight mb-1">{pet.name}</CardTitle>
                      {pet.is_first_visit && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                          <Sparkles className="h-3 w-3" />
                          Primeira visita
                        </span>
                      )}
                    </div>
                    <div className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-slate-100 text-slate-700 ring-1 ring-slate-200">
                      <User className="h-3 w-3 mr-1" />
                      {pet.client_name}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-[auto,1fr] gap-x-2 gap-y-1.5 items-start text-sm text-gray-600">
                    <span>🐶</span>
                    <span className="text-slate-700">{pet.breed || 'Sem Raça Definida'}</span>

                    <span>📏</span>
                    <span className="text-slate-700">{getSizeDisplay(pet.size || '')}</span>

                    <span>⏳</span>
                    <span className="text-slate-700">{getAgeDisplay(pet.age, pet.birth_date)}</span>

                    <span>🎂</span>
                    <span className="text-slate-700">Nascimento: {pet.birth_date ? formatPt(pet.birth_date) : 'N/A'}</span>

                    <span>👤</span>
                    <span className="text-slate-700">{pet.client_name}</span>

                    <span>✉️</span>
                    <a
                      href={pet.client_email ? `mailto:${pet.client_email}` : undefined}
                      className="truncate text-slate-700 max-w-[19rem] md:max-w-[26rem]"
                      title={pet.client_email || ''}
                    >
                      {pet.client_email || 'N/A'}
                    </a>
                  </div>
                  {pet.notes && (
                    <div className="flex items-start gap-2 text-sm text-gray-600">
                      <FileText className="h-4 w-4 mt-0.5" />
                      <span className="line-clamp-2">{pet.notes}</span>
                    </div>
                  )}
                  
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditModal(pet)}
                      className="flex-1"
                    >
                      <Edit className="h-3 w-3 mr-1" />
                      Editar
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                          <AlertDialogDescription>
                            Tem certeza que deseja deletar o pet "{pet.name}"? 
                            Esta ação não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDeletePet(pet.id)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Deletar Pet
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          </>
        )}

        {/* Edit Modal */}
        <Dialog open={isEditModalOpen} onOpenChange={(open) => {
          setIsEditModalOpen(open);
          if (!open) {
            setSelectedPet(null);
            resetForm();
          }
        }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Editar Pet</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-name">Nome *</Label>
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Nome do pet"
                />
              </div>
                             <div>
                 <Label htmlFor="edit-age">Idade</Label>
                 <Input
                   id="edit-age"
                   value={formData.age}
                   onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                   placeholder="Ex: 3 anos"
                 />
               </div>
                                             <div>
                  <Label htmlFor="edit-breed">Raça</Label>
                  <BreedCombobox
                    breeds={breeds}
                    onSelect={(breed) => {
                      setSelectedBreed(breed);
                      setFormData({ ...formData, breed: breed.name, breed_id: breed.id });
                    }}
                    selectedBreed={selectedBreed}
                    disabled={false}
                    isLoading={false}
                  />
                </div>
                                 <div>
                   <Label htmlFor="edit-size">Tamanho</Label>
                   <Select value={formData.size} onValueChange={(value) => setFormData({ ...formData, size: value })}>
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
              
                                               <div>
                    <Label htmlFor="edit-birth-date">Data de Nascimento *</Label>
                    <PetDobPicker
                      value={birthDate}
                      onChange={setBirthDate}
                    />
                  </div>

                             <div>
                 <Label htmlFor="edit-client">Dono</Label>
                 <div className="relative">
                   <div className="flex items-center border rounded-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 bg-background">
                     <Input
                       id="edit-client"
                       className="border-0 shadow-none focus-visible:ring-0"
                       placeholder="Digite para buscar cliente..."
                       autoComplete="off"
                       value={selectedClient ? selectedClient.name : clientSearchTerm}
                       onChange={(e) => {
                         setSelectedClient(undefined);
                         setFormData({ ...formData, client_id: '' });
                         setClientSearchTerm(e.target.value);
                         setIsClientPopoverOpen(true);
                       }}
                       onFocus={() => setIsClientPopoverOpen(true)}
                       onBlur={() => setTimeout(() => setIsClientPopoverOpen(false), 150)}
                     />
                     {selectedClient && (
                       <button type="button" className="pr-2 text-gray-400 hover:text-gray-600"
                         onMouseDown={(e) => { e.preventDefault(); setSelectedClient(undefined); setFormData({ ...formData, client_id: '' }); setClientSearchTerm(''); }}>
                         <X className="h-4 w-4" />
                       </button>
                     )}
                   </div>
                   {isClientPopoverOpen && !selectedClient && (
                     <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                       {clientSearchTerm.length < 2 ? (
                         <p className="px-3 py-2 text-sm text-gray-400">Digite para buscar um dono...</p>
                       ) : isClientSearching ? (
                         <p className="px-3 py-2 text-sm text-gray-400 flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" />Buscando...</p>
                       ) : clientSearchResults.length === 0 ? (
                         <p className="px-3 py-2 text-sm text-gray-400">Nenhum cliente encontrado</p>
                       ) : clientSearchResults.map(c => (
                         <button key={c.id} type="button"
                           className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                           onMouseDown={(e) => { e.preventDefault(); setSelectedClient(c); setFormData({ ...formData, client_id: c.id }); setClientSearchTerm(''); setIsClientPopoverOpen(false); }}>
                           <span className="font-medium">{c.name}</span>
                           {c.email && <span className="text-gray-400 ml-2 text-xs">{c.email}</span>}
                         </button>
                       ))}
                     </div>
                   )}
                 </div>
               </div>
              <div>
                <Label htmlFor="edit-notes">Notas</Label>
                <Textarea
                  id="edit-notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Observações sobre o pet"
                  rows={3}
                />
              </div>
              <div className="flex gap-2 pt-4">
                <Button onClick={handleEditPet} className="flex-1">
                  Salvar Alterações
                </Button>
                <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default AdminPets; 