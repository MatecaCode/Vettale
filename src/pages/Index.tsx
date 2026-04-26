import React, { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import Hero from '@/components/Hero';
import ServiceCard from '@/components/ServiceCard';
import Testimonials from '@/components/Testimonials';
import { Scissors, ShowerHead, Dog, Sparkles, Syringe, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link, useNavigate } from 'react-router-dom';
import { useScrollAnimation, animationClasses } from '@/hooks/useScrollAnimation';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';




const Index = () => {
  const navigate = useNavigate();
  const { user, isStaff, loading } = useAuth();
  
  const institutionalAnimation = useScrollAnimation<HTMLDivElement>({ delay: 200 });
  const servicesHeaderAnimation = useScrollAnimation<HTMLDivElement>({ delay: 100 });
  const banhoTosaHeaderAnimation = useScrollAnimation<HTMLDivElement>({ delay: 100 });
  const ctaAnimation = useScrollAnimation<HTMLDivElement>({ delay: 200 });

  // Redirect staff members to their dashboard
  useEffect(() => {
    if (!loading && user && isStaff) {
      console.log('🏥 Staff member detected, redirecting to dashboard...');
      navigate('/staff-dashboard', { replace: true });
    }
  }, [user, isStaff, loading, navigate]);

const [imageUrl, setImageUrl] = useState('');

useEffect(() => {
  const { data } = supabase
    .storage
    .from('websitecontent')
    .getPublicUrl('TempInnovation.png');

  if (data?.publicUrl) {
    setImageUrl(data.publicUrl);
  }
}, []);

  
  const services = [
    {
      title: "Vacinação",
      description: "Imunização com as principais vacinas para manter seu pet protegido e saudável.",
      icon: <Heart className="h-6 w-6" />,
      backgroundColor: "#EAF4FB", // Light blue
    },
    {
      title: "Consulta Veterinária",
      description: "Avaliação completa da saúde do seu pet com médico veterinário especializado.",
      icon: <Syringe className="h-6 w-6" />,
      popular: true,
      badge: "Mais Agendado",
      backgroundColor: "#E9F3E1", // Soft green
    },
    {
      title: "Banho & Tosa Higiênica",
      description: "Banho com carinho e tosa higiênica para conforto e bem-estar no dia a dia.",
      icon: <ShowerHead className="h-6 w-6" />,
      backgroundColor: "#FDECE4", // Soft blush/peach
    },
  ];

  const banhoTosaServices = [
    {
      title: "Banho Ionizado",
      description: "Banho com ozônio para higiene profunda e bem-estar da pele, conforme indicação.",
      icon: <Sparkles className="h-6 w-6" />,
      backgroundColor: "#EAF4FB", // Light blue
    },
    {
      title: "Primeira Tosa do Filhote",
      description: "Introdução suave à tosa para filhotes com até 6 meses.",
      icon: <Dog className="h-6 w-6" />,
      backgroundColor: "#FDECE4", // Soft blush/peach
    },
    {
      title: "Pacote Spa Luxo",
      description: "Banho com shampoo especial e condicionador, tosa completa e limpeza de dentes.",
      icon: <Sparkles className="h-6 w-6" />,
      popular: true,
      badge: "Mais Popular",
      backgroundColor: "#F5EEE5", // Light beige
    }
  ];

  return (
    <Layout>
      <div style={{ backgroundColor: '#FAF9F7', minHeight: '100vh' }}>
        <Hero />
        
        {/* História Breve */}
        <section className="py-20" style={{ backgroundColor: '#F5EEE5' }}>
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
              <div 
                ref={institutionalAnimation.ref}
                className={`${animationClasses.fadeIn} ${
                  institutionalAnimation.isVisible ? animationClasses.fadeInActive : animationClasses.fadeInInactive
                }`}
              >
                <h2 className="mb-4">Tradição e <span className="text-brand-primary">Inovação</span> desde 1981</h2>
                <p className="text-muted-foreground mb-6">
                  Há mais de 40 anos cuidando de cada história. E sempre com carinho, excelência e dedicação.
                </p>
                
                <Link to="/about">
                  <Button variant="outline" className="border-primary text-primary hover:bg-primary/5 transition-all duration-300 hover:shadow-md">
                    Conheça Nossa História
                  </Button>
                </Link>
              </div>
              <div
                className={`${animationClasses.slideInRight} ${
                  institutionalAnimation.isVisible ? animationClasses.slideInRightActive : animationClasses.slideInRightInactive
                }`}
              >
                <img
                  src="https://ieotixprkfglummoobkb.supabase.co/storage/v1/object/public/websitecontent//Dog%20Minhada%20com%20pessoas.jpg"
                  alt="Nossa 2ª Cãominhada (1995): um encontro inesquecível que uniu famílias e arrecadou fundos para cães em situação de risco"
                  className="rounded-lg shadow-lg h-80 w-full object-cover transition-transform duration-500 hover:scale-105"
                />
                <p className="text-xs text-muted-foreground mt-2 text-center italic">Nossa 2ª Cãominhada (1995): tradição e comunidade desde sempre.</p>
              </div>
            </div>
          </div>
        </section>
        
        {/* Services Section */}
        <section className="py-20" style={{ backgroundColor: '#FFFCF8' }}>
          <div className="max-w-7xl mx-auto px-6">
            <div 
              ref={servicesHeaderAnimation.ref}
              className={`text-center mb-12 ${animationClasses.fadeIn} ${
                servicesHeaderAnimation.isVisible ? animationClasses.fadeInActive : animationClasses.fadeInInactive
              }`}
            >
              <h2 className="mb-4">Nossos <span className="text-brand-primary">Serviços</span> Principais</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Oferecemos uma variedade de serviços veterinários e de estética para manter seu pet saudável e bonito.
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {services.map((service, index) => (
                <ServiceCard 
                  key={index}
                  title={service.title}
                  description={service.description}
                  icon={service.icon}
                  popular={service.popular}
                  badge={service.badge}
                  backgroundColor={service.backgroundColor}
                  className="hover:scale-105 transition-transform duration-300"
                />
              ))}
            </div>
            
            <div className="mt-12 text-center">
              <Link to="/services">
                <Button variant="outline" className="border-primary text-primary hover:bg-primary/5 transition-all duration-300 hover:shadow-md">
                  Ver Todos os Serviços
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Banho & Tosa Section */}
        <section id="banho-e-tosa" className="py-20" style={{ backgroundColor: '#F5EEE5' }}>
          <div className="max-w-7xl mx-auto px-6">
            <div 
              ref={banhoTosaHeaderAnimation.ref}
              className={`text-center mb-12 ${animationClasses.fadeIn} ${
                banhoTosaHeaderAnimation.isVisible ? animationClasses.fadeInActive : animationClasses.fadeInInactive
              }`}
            >
              <h2 className="mb-4">Banho & <span className="text-brand-primary">Tosa</span> Especializada</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Cuidamos da beleza e higiene do seu pet com carinho, produtos de qualidade e técnicas profissionais.
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {banhoTosaServices.map((service, index) => (
                <ServiceCard 
                  key={index}
                  title={service.title}
                  description={service.description}
                  icon={service.icon}
                  popular={service.popular}
                  badge={service.badge}
                  backgroundColor={service.backgroundColor}
                  className="hover:scale-105 transition-transform duration-300"
                />
              ))}
            </div>
          </div>
        </section>
        
        <Testimonials />

        {/* Stats + Legacy Section */}
        <section className="py-16" style={{ backgroundColor: '#F5EEE5' }}>
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
              <div className="bg-white p-6 rounded-lg shadow text-center group hover:shadow-xl hover:-translate-y-2 transition-all duration-500 cursor-pointer relative overflow-hidden">
                <div className="text-3xl font-bold text-primary mb-2 group-hover:scale-110 transition-transform duration-300">+250.000</div>
                <h3 className="font-semibold text-lg mb-2">Banhos</h3>
                <p className="text-sm text-muted-foreground">Pets felizes e cheirosos que passaram por nossas mãos</p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow text-center group hover:shadow-xl hover:-translate-y-2 transition-all duration-500 cursor-pointer relative overflow-hidden">
                <div className="text-3xl font-bold text-primary mb-2 group-hover:scale-110 transition-transform duration-300">+16.000</div>
                <h3 className="font-semibold text-lg mb-2">Consultas</h3>
                <p className="text-sm text-muted-foreground">Consultas e cuidados especializados para cada pet</p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow text-center group hover:shadow-xl hover:-translate-y-2 transition-all duration-500 cursor-pointer relative overflow-hidden">
                <div className="text-3xl font-bold text-primary mb-2 group-hover:scale-110 transition-transform duration-300">+600</div>
                <h3 className="font-semibold text-lg mb-2">Cirurgias</h3>
                <p className="text-sm text-muted-foreground">Procedimentos cirúrgicos realizados com excelência</p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow text-center group hover:shadow-xl hover:-translate-y-2 transition-all duration-500 cursor-pointer relative overflow-hidden">
                <div className="text-3xl font-bold text-primary mb-2 group-hover:scale-110 transition-transform duration-300">∞</div>
                <h3 className="font-semibold text-lg mb-2">Sorrisos Incontáveis</h3>
                <p className="text-sm text-muted-foreground">Momentos de alegria e gratidão que não podem ser medidos</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-8 rounded-lg shadow">
                <h3 className="text-xl font-bold mb-4 text-center">Legado Preservado</h3>
                <p className="text-muted-foreground">
                  Apesar do crescimento, mantemos viva a essência dos fundadores: cuidado personalizado, atenção aos detalhes e amor pelos animais.
                </p>
              </div>
              <div className="bg-white p-8 rounded-lg shadow">
                <h3 className="text-xl font-bold mb-4 text-center">Tecnologia e Carinho</h3>
                <p className="text-muted-foreground">
                  Combinamos equipamentos de última geração com o mesmo carinho e atenção que sempre nos caracterizou.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 bg-brand-primary text-brand-primaryFg">
          <div className="max-w-7xl mx-auto px-6 text-center">
            <div 
              ref={ctaAnimation.ref}
              className={`${animationClasses.scaleIn} ${
                ctaAnimation.isVisible ? animationClasses.scaleInActive : animationClasses.scaleInInactive
              }`}
            >
              <div className="inline-flex items-center justify-center rounded-full p-2 mb-8" style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)' }}>
                <Dog className="h-5 w-5" />
              </div>
              
              <h2 className="mb-6">Pronto para Cuidar da Saúde do Seu Pet?</h2>
              
              <p className="text-brand-primaryFg/90 max-w-2xl mx-auto mb-8">
                Porque cada pet tem uma história. E a gente cuida de todas elas com amor e excelência.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button size="lg" className="bg-white text-brand-primary hover:bg-white/90 transition-all duration-300 hover:shadow-lg hover:scale-105" asChild>
                  <Link to="/book">Agendar Consulta</Link>
                </Button>
                <Button size="lg" variant="outline" className="bg-transparent border-white text-white hover:bg-white/10 transition-all duration-300 hover:shadow-lg" asChild>
                  <Link to="/services">Conhecer Serviços</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
};

export default Index;
