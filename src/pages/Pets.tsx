
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PlusCircle, Trash2, Edit, PawPrint, Heart, Camera, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { log } from '@/utils/logger';

interface Pet {
  id: string;
  name: string;
  breed?: string;
  age?: string;
  size?: string;
  weight?: number;
  gender?: string;
  notes?: string;
  photo_url?: string | null;
}

const Pets = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [pets, setPets] = useState<Pet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isVisible, setIsVisible] = useState(false);

  const fetchPets = async () => {
    log.debug('fetchPets called:', { 
      user: user?.id, 
      authLoading,
      isLoading 
    });

    if (authLoading) {
      log.debug('Auth still loading, waiting...');
      return;
    }

    if (!user) {
      log.debug('No user found, clearing pets');
      setPets([]);
      setIsLoading(false);
      return;
    }

    log.debug('Fetching pets for user:', user.id);
    setIsLoading(true);
    
    try {
      log.debug('Making pets fetch query...');
      
      // Get client_id first
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (clientError || !clientData) {
        log.debug('No client record found for user:', user.id);
        setPets([]);
        return;
      }

      // Now get pets using client_id with breed information
      const { data, error } = await supabase
        .from('pets')
        .select(`
          *,
          breeds(name)
        `)
        .eq('client_id', clientData.id)
        .eq('active', true)
        .order('created_at', { ascending: false });

      log.debug('Fetch pets result:', { 
        data, 
        error, 
        userCount: data?.length || 0,
        clientId: clientData.id
      });

      if (error) {
        log.error('Error fetching pets:', error);
        toast.error('Erro ao carregar pets: ' + error.message);
        return;
      }

      // Transform data to include breed name from join
      const transformedPets = data?.map(pet => ({
        ...pet,
        breed: pet.breeds?.name || pet.breed // Use joined breed name or fallback to existing breed field
      })) || [];
      
      setPets(transformedPets);
      log.debug('Pets loaded successfully:', transformedPets?.length || 0, 'pets');
      
    } catch (error: any) {
      log.error('Unexpected error fetching pets:', error);
      if (error.message === 'Fetch timeout') {
        toast.error('Timeout ao carregar pets. Tente novamente.');
      } else {
        toast.error('Erro inesperado ao carregar pets');
      }
    } finally {
      log.debug('Setting fetchPets isLoading to false');
      setIsLoading(false);
    }
  };

  const deletePet = async (petId: string) => {
    if (!confirm('Tem certeza que deseja remover este pet?')) return;

    log.debug('Deleting pet:', petId, 'for user:', user?.id);
    
    try {
      const { error } = await supabase
        .from('pets')
        .delete()
        .eq('id', petId);

      if (error) {
        log.error('Error deleting pet:', error);
        toast.error('Erro ao remover pet: ' + error.message);
        return;
      }

      log.debug('Pet deleted successfully');
      toast.success('Pet removido com sucesso!');
      await fetchPets();
    } catch (error: any) {
      log.error('Unexpected error deleting pet:', error);
      toast.error('Erro inesperado ao remover pet');
    }
  };

  useEffect(() => {
    log.debug('useEffect triggered:', { user: user?.id, authLoading });
    const controller = new AbortController();
    
    fetchPets();
    
    return () => {
      controller.abort();
    };
  }, [user, authLoading]);

  useEffect(() => {
    // Animate in the content
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const handleEditPet = (pet: Pet) => {
    navigate(`/pets/edit/${pet.id}`);
  };

  const handleAddPet = () => {
    navigate('/pets/new');
  };

  log.debug('Pets page render:', { 
    user: user?.id, 
    authLoading, 
    isLoading, 
    petsCount: pets.length
  });

  if (authLoading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#E7F0FF] via-white to-[#F1F5F9]">
          <div className="text-center space-y-6">
            <div className="animate-spin rounded-full h-12 w-12 border-3 border-[#6BAEDB] border-t-[#2B70B2] mx-auto"></div>
            <p className="text-lg font-medium text-[#1A4670]">Verificando autenticação...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!user && !authLoading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#E7F0FF] via-white to-[#F1F5F9]">
          <div className="text-center space-y-4">
            <div className="w-24 h-24 bg-gradient-to-br from-[#2B70B2] to-[#6BAEDB] rounded-full flex items-center justify-center mx-auto mb-4">
              <PawPrint className="w-12 h-12 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-[#1A4670]">Acesso Restrito</h2>
            <p className="text-[#334155]">Você precisa estar logado para gerenciar seus pets.</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-[#E7F0FF] via-white to-[#F1F5F9] py-8">
        {/* Animated Background Elements */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-[#6BAEDB] rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-[#2B70B2] rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse" style={{ animationDelay: '2s' }}></div>
          <div className="absolute top-40 left-40 w-60 h-60 bg-[#8FBF9F] rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse" style={{ animationDelay: '4s' }}></div>
        </div>

        <div className="relative max-w-6xl mx-auto px-6">
          {/* Header Section */}
          <div className={`transition-all duration-1000 delay-200 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <div className="text-center mb-12">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-[#2B70B2] to-[#6BAEDB] rounded-full mb-6 shadow-lg">
                <PawPrint className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-[#2B70B2] to-[#6BAEDB] bg-clip-text text-transparent mb-3">
                Meus Pets
              </h1>
              <p className="text-xl text-[#334155] max-w-2xl mx-auto">
                Gerencie seus companheiros peludos e mantenha suas informações sempre atualizadas
              </p>
              <div className="flex justify-center mt-4">
                <div className="flex items-center space-x-2 bg-white/80 backdrop-blur-sm rounded-full px-4 py-2 shadow-sm">
                  <Heart className="w-4 h-4 text-[#2B70B2]" />
                  <span className="text-sm text-[#334155]">
                    {isLoading ? 'Carregando...' : `${pets.length} pet(s) encontrado(s)`}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className={`flex justify-center mb-8 transition-all duration-1000 delay-300 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <Button 
              onClick={handleAddPet} 
              className="flex items-center gap-3 bg-gradient-to-r from-[#2B70B2] to-[#6BAEDB] hover:from-[#1A4670] hover:to-[#2B70B2] text-white px-8 py-3 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
            >
              <PlusCircle className="h-5 w-5" />
              Adicionar Pet
            </Button>
          </div>

          {/* Content Section */}
          <div className={`w-full transition-all duration-1000 delay-400 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            {isLoading ? (
              <div className="text-center py-16">
                <div className="animate-spin rounded-full h-16 w-16 border-4 border-[#6BAEDB] border-t-[#2B70B2] mx-auto mb-6"></div>
                <p className="text-lg font-medium text-[#1A4670]">Carregando pets...</p>
              </div>
            ) : pets.length > 0 ? (
              <div className={
                pets.length === 1
                  ? 'flex justify-center'
                  : pets.length === 2
                  ? 'grid grid-cols-2 max-w-2xl mx-auto gap-8'
                  : pets.length === 4
                  ? 'grid grid-cols-2 max-w-3xl mx-auto gap-8'
                  : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8'
              }>
                {pets.map((pet, index) => (
                  <Card
                    key={pet.id}
                    className={`group hover:shadow-2xl transition-all duration-300 border-0 bg-white/80 backdrop-blur-sm shadow-lg overflow-hidden ${
                      pets.length === 1 ? 'w-full max-w-sm' : ''
                    } ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
                    style={{ transitionDelay: `${500 + index * 100}ms` }}
                  >
                    {/* Photo banner */}
                    <div className="relative h-64 w-full overflow-hidden">
                      {pet.photo_url ? (
                        <img
                          src={pet.photo_url}
                          alt={pet.name}
                          className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div
                          className="w-full h-full bg-gradient-to-br from-[#8FBF9F] to-[#6BAEDB] flex flex-col items-center justify-center gap-2 cursor-pointer"
                          onClick={() => handleEditPet(pet)}
                        >
                          <Camera className="w-10 h-10 text-white/70" />
                          <span className="text-sm text-white/80 font-medium">Adicionar foto</span>
                        </div>
                      )}

                      {/* Action buttons overlay */}
                      <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditPet(pet)}
                          className="bg-white/90 hover:bg-white border-0 text-[#2B70B2] hover:text-[#1A4670] shadow-md h-8 w-8 p-0"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deletePet(pet.id)}
                          className="bg-[#DC2626]/90 hover:bg-[#DC2626] border-0 shadow-md h-8 w-8 p-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    <CardContent className="pt-5 pb-6 px-6 space-y-4">
                      {/* Name + breed */}
                      <div>
                        <h3 className="text-2xl font-bold text-[#1A4670] leading-tight">{pet.name}</h3>
                        {pet.breed && (
                          <Badge className="mt-2 bg-gradient-to-r from-[#2B70B2] to-[#6BAEDB] text-white border-0 text-xs">
                            {pet.breed}
                          </Badge>
                        )}
                      </div>

                      {/* Info grid */}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        {pet.size && (
                          <div>
                            <p className="text-gray-400 text-xs uppercase tracking-wide font-medium">Porte</p>
                            <p className="text-[#1A4670] font-medium capitalize">{pet.size}</p>
                          </div>
                        )}
                        {pet.gender && (
                          <div>
                            <p className="text-gray-400 text-xs uppercase tracking-wide font-medium">Sexo</p>
                            <p className="text-[#1A4670] font-medium capitalize">{pet.gender === 'male' ? 'Macho' : pet.gender === 'female' ? 'Fêmea' : pet.gender}</p>
                          </div>
                        )}
                        {pet.age && (
                          <div>
                            <p className="text-gray-400 text-xs uppercase tracking-wide font-medium">Idade</p>
                            <p className="text-[#1A4670] font-medium">{pet.age}</p>
                          </div>
                        )}
                        {pet.weight && (
                          <div>
                            <p className="text-gray-400 text-xs uppercase tracking-wide font-medium">Peso</p>
                            <p className="text-[#1A4670] font-medium">{pet.weight} kg</p>
                          </div>
                        )}
                      </div>

                      {pet.notes && (
                        <div className="pt-3 border-t border-[#E7F0FF]">
                          <p className="text-sm text-[#334155] italic leading-relaxed">"{pet.notes}"</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="group hover:shadow-xl transition-all duration-300 border-0 bg-white/80 backdrop-blur-sm shadow-lg">
                <CardContent className="flex items-center justify-center py-20 text-center">
                  <div className="space-y-6">
                    <div className="w-24 h-24 bg-gradient-to-br from-[#8FBF9F] to-[#6BAEDB] rounded-full flex items-center justify-center mx-auto">
                      <PawPrint className="w-12 h-12 text-white" />
                    </div>
                    <div className="space-y-3">
                      <h3 className="text-2xl font-bold text-[#1A4670]">Nenhum Pet Cadastrado</h3>
                      <p className="text-[#334155] max-w-md mx-auto">
                        Adicione seu primeiro pet para começar a agendar serviços e cuidar da saúde do seu companheiro
                      </p>
                    </div>
                    <Button 
                      onClick={handleAddPet}
                      className="bg-gradient-to-r from-[#2B70B2] to-[#6BAEDB] hover:from-[#1A4670] hover:to-[#2B70B2] text-white px-8 py-3 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
                    >
                      <PlusCircle className="h-5 w-5 mr-2" />
                      Adicionar Primeiro Pet
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Bottom Spacing */}
          <div className="h-16"></div>
        </div>
      </div>
    </Layout>
  );
};

export default Pets;
