
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Star, CheckCircle } from 'lucide-react';
import { Provider } from '@/hooks/useAppointmentForm';

interface StaffCardSelectorProps {
  staff: Provider[];
  selectedStaffIds: string[];
  onStaffSelect: (staffId: string) => void;
  allowMultiple?: boolean;
  isLoading?: boolean;
  error?: string | null;
}

const StaffCardSelector: React.FC<StaffCardSelectorProps> = ({
  staff,
  selectedStaffIds,
  onStaffSelect,
  allowMultiple = false,
  isLoading = false,
  error
}) => {
  const [hoveredStaff, setHoveredStaff] = React.useState<string | null>(null);
  const renderStars = (rating: number, isHovered: boolean = false) => {
    return Array(5).fill(0).map((_, i) => (
      <Star
        key={i}
        className={`h-4 w-4 transition-all duration-1000 ease-out ${
          i < Math.floor(rating) 
            ? `text-yellow-400 fill-yellow-400 ${isHovered ? 'animate-pulse drop-shadow-sm' : ''}` 
            : 'text-gray-300'
        } ${isHovered ? 'transform scale-110' : ''}`}
        style={isHovered ? {
          animationDelay: `${i * 300}ms`,
          filter: 'drop-shadow(0 0 8px rgba(251, 191, 36, 0.9))',
          animationDuration: '2s'
        } : {}}
      />
    ));
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'vet': return 'bg-green-100 text-green-800';
      case 'groomer': return 'bg-blue-100 text-blue-800';
      case 'bather': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'vet': return 'Veterinário';
      case 'groomer': return 'Tosador';
      case 'bather': return 'Banhista';
      default: return 'Profissional';
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="flex items-center space-x-4">
                <div className="h-16 w-16 bg-gray-200 rounded-full"></div>
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h3 className="text-lg font-medium text-red-800 mb-2">
            Nenhum profissional disponível
          </h3>
          <p className="text-red-600 mb-4">{error}</p>
          <p className="text-sm text-red-500">
            Tente selecionar uma data diferente ou um serviço alternativo.
          </p>
        </div>
      </div>
    );
  }

  if (staff.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h3 className="text-lg font-medium text-yellow-800 mb-2">
            Nenhum profissional disponível
          </h3>
          <p className="text-yellow-600 mb-4">
            Não há profissionais disponíveis para este serviço.
          </p>
          <p className="text-sm text-yellow-500">
            Por favor, tente outro serviço ou contate-nos diretamente.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-lg text-muted-foreground">
          {allowMultiple ? 
            'Selecione um ou mais profissionais para cuidar do seu pet' : 
            'Escolha o profissional que irá cuidar do seu pet'
          }
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {staff.map((member) => {
          const isSelected = selectedStaffIds.includes(member.id);
          
          return (
            <Card
              key={member.id}
              className={`group cursor-pointer transition-all duration-300 ease-out transform hover:scale-[1.02] hover:shadow-xl ${
                isSelected 
                  ? 'border-primary ring-2 ring-primary/30 bg-gradient-to-br from-primary/5 to-primary/10 shadow-lg scale-[1.02]' 
                  : 'hover:border-primary/30 hover:shadow-lg border-border/50'
              } bg-card/80 backdrop-blur-sm`}
              onClick={() => onStaffSelect(member.id)}
              onMouseEnter={() => setHoveredStaff(member.id)}
              onMouseLeave={() => setHoveredStaff(null)}
            >
              <CardContent className="p-4 md:p-6">
                <div className="space-y-3 md:space-y-4">
                  {/* Header with avatar and name */}
                  <div className="flex items-center space-x-3 md:space-x-4">
                    <div className="relative">
                      <Avatar className={`h-14 w-14 md:h-20 md:w-20 border-3 transition-all duration-300 ${
                        isSelected ? 'border-primary shadow-lg' : 'border-border group-hover:border-primary/50'
                      }`}>
                        <AvatarImage
                          src={member.profile_image || undefined}
                          alt={member.name}
                          className="object-cover"
                        />
                        <AvatarFallback className={`text-sm md:text-lg font-bold transition-colors duration-300 ${
                          isSelected
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-gradient-to-br from-primary/10 to-primary/20 text-primary group-hover:from-primary/20 group-hover:to-primary/30'
                        }`}>
                          {member.name.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {isSelected && (
                        <div className="absolute -top-2 -right-2 animate-scale-in">
                          <CheckCircle className="h-6 w-6 text-primary bg-background rounded-full shadow-md" />
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-bold text-base md:text-xl transition-colors duration-300 ${
                        isSelected ? 'text-primary' : 'text-foreground group-hover:text-primary'
                      }`}>
                        {member.name}
                      </h3>
                    </div>
                  </div>

                  {/* Centralized Role and Rating */}
                  <div className="text-center space-y-3">
                    <Badge 
                      variant="secondary" 
                      className={`text-sm font-medium px-3 py-1 transition-all duration-300 ${
                        isSelected 
                          ? 'bg-primary/20 text-primary border-primary/30' 
                          : `${getRoleColor(member.role)} group-hover:scale-105`
                      }`}
                    >
                      {getRoleLabel(member.role)}
                    </Badge>
                    
                    {member.reviewCount && member.reviewCount > 0 ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="flex items-center gap-1">
                          {renderStars(member.rating, hoveredStaff === member.id)}
                        </div>
                        <span 
                          className={`text-lg font-bold text-primary transition-all duration-1000 ease-out ${hoveredStaff === member.id ? 'drop-shadow-lg' : ''}`}
                          style={hoveredStaff === member.id ? {
                            animationDelay: '1.5s',
                            filter: 'drop-shadow(0 0 8px rgba(59, 130, 246, 0.8))',
                            transition: 'filter 0.5s ease-out'
                          } : {}}
                        >
                          {member.rating.toFixed(1)} ({member.reviewCount})
                        </span>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">Sem avaliações</div>
                    )}
                  </div>

                  {/* Specialty - Smaller */}
                  {member.specialty && (
                    <div className="bg-secondary/20 rounded-md p-2 border border-border/30">
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        Especialidade
                      </p>
                      <p className="text-sm font-semibold text-foreground">
                        {member.specialty}
                      </p>
                    </div>
                  )}

                  {/* About/Bio */}
                  {member.about && (
                    <div className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                      {member.about}
                    </div>
                  )}

                  {/* Selection indicator - Slimmer */}
                  <div className={`text-center py-2 rounded-lg font-semibold text-sm transition-all duration-300 transform ${
                    isSelected 
                      ? 'bg-gradient-to-r from-primary to-primary/90 text-primary-foreground shadow-md scale-105' 
                      : 'bg-gradient-to-r from-secondary/50 to-secondary/80 text-foreground hover:from-primary/10 hover:to-primary/20 hover:text-primary group-hover:scale-105'
                  }`}>
                    {isSelected ? (
                      <div className="flex items-center justify-center gap-2">
                        <CheckCircle className="h-4 w-4" />
                        <span>Selecionado</span>
                      </div>
                    ) : (
                      'Selecionar'
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default StaffCardSelector;
