import React, { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { Clock, AlertCircle, Calendar, Phone, MessageCircle, Sparkles, Heart, Shield } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import AppointmentForm from '@/components/AppointmentForm';

// Extend Window interface for gtag
declare global {
  interface Window {
    gtag?: (command: string, eventName: string, parameters: any) => void;
  }
}

const Book = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [iconRotation, setIconRotation] = useState(0);
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isTestMode, setIsTestMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('bookingTestMode') === '1';
    } catch {
      return false;
    }
  });

  const enableTestMode = () => {
    try {
      localStorage.setItem('bookingTestMode', '1');
    } catch {
      // ignore storage failures in temporary test button
    }
    setIsTestMode(true);
  };

  useEffect(() => {
    setIsVisible(true);
    
    // Continuous rotation animation for the clock icon
    const interval = setInterval(() => {
      setIconRotation(prev => (prev + 1) % 360);
    }, 50);

    return () => clearInterval(interval);
  }, []);

  return (
    <Layout>
      {/* Hero Section with Enhanced Design */}
      <section className="relative bg-gradient-to-br from-blue-50 via-white to-purple-50 pb-0 md:py-12 overflow-hidden">
        {/* Animated Background Elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse" style={{ animationDelay: '2s' }}></div>
          <div className="absolute top-40 left-40 w-60 h-60 bg-pink-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse" style={{ animationDelay: '4s' }}></div>
        </div>

        <div className="relative max-w-7xl mx-auto px-6 text-center">
          <div className={`transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Agende um <span className="text-primary">Serviço</span>
            </h1>
            <p className="text-lg text-gray-600 max-w-3xl mx-auto mb-6 leading-relaxed">
              Marque um serviço de banho e tosa para seu amigo peludo usando nosso sistema de agendamento online.
            </p>
          </div>
        </div>
      </section>

      {/* Coming Soon Section with Enhanced Design */}
      <section className="pt-0 pb-0 md:py-12 relative bg-white min-h-screen flex items-center">
        <div className="max-w-7xl mx-auto px-6">
          <div className="relative">
            {/* When in test mode, render the real booking form; otherwise render the demo layout */}
            {isTestMode ? (
              <div className="max-w-7xl mx-auto px-6">
                {/* Subtle badge */}
                <div className="mb-6 text-xs text-slate-500 text-center">
                  Modo de teste habilitado
                </div>
                <div className={`${currentStep === 1 ? 'grid grid-cols-1 lg:grid-cols-2' : 'grid grid-cols-1'} gap-8`}>
                  {/* Left: Real self-service form */}
                  <div className="bg-white rounded-2xl shadow-2xl p-6 md:p-8 border border-gray-100">
                    <AppointmentForm serviceType="grooming" onStepChange={(s) => setCurrentStep(s)} />
                  </div>

                  {/* Right: Informational card preserved from preview */}
                  {currentStep === 1 && (
                  <div className="bg-white rounded-2xl shadow-2xl p-8 border border-gray-100">
                    <h3 className="text-2xl font-bold text-gray-800 mb-6">
                      Informações de Agendamento
                    </h3>
                    
                    <div className="space-y-8">
                      <div>
                        <h4 className="font-bold text-gray-800 mb-4 text-lg">Horário de Funcionamento</h4>
                        <div className="space-y-3 text-lg text-gray-600">
                          <div className="flex items-center gap-3">
                            <Calendar className="h-5 w-5 text-blue-500" />
                            <span>Segunda - Sexta: 9:00 - 17:00</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <Calendar className="h-5 w-5 text-blue-500" />
                            <span>Sábado: 9:00 - 15:00</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <Calendar className="h-5 w-5 text-red-500" />
                            <span>Domingo: Fechado</span>
                          </div>
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="font-bold text-gray-800 mb-4 text-lg">Contato</h4>
                        <p className="text-lg text-gray-600 mb-4">
                          Tem dúvidas sobre nossos serviços?
                        </p>
                        <div className="space-y-3 text-lg text-gray-600">
                          <div className="flex items-center gap-3">
                            <Phone className="h-5 w-5 text-green-500" />
                            <span>Telefone: (11) 2427-2827</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <MessageCircle className="h-5 w-5 text-green-500" />
                            <span>WhatsApp: (11) 99637-8518</span>
                          </div>
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="font-bold text-gray-800 mb-4 text-lg">Observações para Agendamento</h4>
                        <ul className="space-y-3 text-lg text-gray-600">
                          <li className="flex items-start gap-3">
                            <span className="text-blue-500 mt-1">•</span>
                            <span>Por favor chegue 15 minutos antes do horário marcado</span>
                          </li>
                          <li className="flex items-start gap-3">
                            <span className="text-blue-500 mt-1">•</span>
                            <span>Certifique-se de que seu cachorro fez suas necessidades antes da consulta</span>
                          </li>
                          <li className="flex items-start gap-3">
                            <span className="text-blue-500 mt-1">•</span>
                            <span>Traga a carteira de vacinação atualizada</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="filter blur-md opacity-20 pointer-events-none scale-95">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Left Panel - Basic Information (static preview) */}
                  <div className="bg-white rounded-2xl shadow-2xl p-8 border border-gray-100">
                    <h3 className="text-2xl font-bold text-gray-800 mb-6">
                      1. Informações Básicas
                    </h3>
                    <p className="text-gray-600 mb-8 text-lg">
                      Selecione seu pet e o serviço desejado
                    </p>
                    
                    <div className="space-y-6">
                      <div>
                        <label className="block text-lg font-semibold text-gray-700 mb-3">
                          Selecione seu Pet
                        </label>
                        <div className="relative">
                          <select className="w-full p-4 border-2 border-gray-200 rounded-xl bg-white text-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-300">
                            <option>Escolha um pet</option>
                          </select>
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-lg font-semibold text-gray-700 mb-3">
                          Selecione o Serviço
                        </label>
                        <div className="relative">
                          <select className="w-full p-4 border-2 border-gray-200 rounded-xl bg-white text-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-300">
                            <option>Escolha um serviço</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    
                    <button className="w-full mt-8 bg-gradient-to-r from-blue-600 to-purple-600 text-white py-4 px-6 rounded-xl text-lg font-semibold hover:from-blue-700 hover:to-purple-700 transform hover:scale-105 transition-all duration-300 shadow-lg">
                      Continuar
                    </button>
                  </div>

                  {/* Right Panel - Appointment Information */}
                  <div className="bg-white rounded-2xl shadow-2xl p-8 border border-gray-100">
                    <h3 className="text-2xl font-bold text-gray-800 mb-6">
                      Informações de Agendamento
                    </h3>
                    
                    <div className="space-y-8">
                      <div>
                        <h4 className="font-bold text-gray-800 mb-4 text-lg">Horário de Funcionamento</h4>
                        <div className="space-y-3 text-lg text-gray-600">
                          <div className="flex items-center gap-3">
                            <Calendar className="h-5 w-5 text-blue-500" />
                            <span>Segunda - Sexta: 9:00 - 17:00</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <Calendar className="h-5 w-5 text-blue-500" />
                            <span>Sábado: 9:00 - 15:00</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <Calendar className="h-5 w-5 text-red-500" />
                            <span>Domingo: Fechado</span>
                          </div>
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="font-bold text-gray-800 mb-4 text-lg">Contato</h4>
                        <p className="text-lg text-gray-600 mb-4">
                          Tem dúvidas sobre nossos serviços?
                        </p>
                        <div className="space-y-3 text-lg text-gray-600">
                          <div className="flex items-center gap-3">
                            <Phone className="h-5 w-5 text-green-500" />
                            <span>Telefone: (11) 2427-2827</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <MessageCircle className="h-5 w-5 text-green-500" />
                            <span>WhatsApp: (11) 99637-8518</span>
                          </div>
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="font-bold text-gray-800 mb-4 text-lg">Observações para Agendamento</h4>
                        <ul className="space-y-3 text-lg text-gray-600">
                          <li className="flex items-start gap-3">
                            <span className="text-blue-500 mt-1">•</span>
                            <span>Por favor chegue 15 minutos antes do horário marcado</span>
                          </li>
                          <li className="flex items-start gap-3">
                            <span className="text-blue-500 mt-1">•</span>
                            <span>Certifique-se de que seu cachorro fez suas necessidades antes da consulta</span>
                          </li>
                          <li className="flex items-start gap-3">
                            <span className="text-blue-500 mt-1">•</span>
                            <span>Traga a carteira de vacinação atualizada</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Enhanced Coming Soon Overlay */}
            {!isTestMode && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className={`transition-all duration-1000 delay-300 ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
                                 <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-10 max-w-2xl mx-4 relative overflow-hidden">
                  {/* Animated Background Elements */}
                  <div className="absolute -top-16 -right-16 w-32 h-32 bg-blue-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-pulse"></div>
                  <div className="absolute -bottom-16 -left-16 w-32 h-32 bg-purple-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-pulse" style={{ animationDelay: '1s' }}></div>
                  
                  <div className="relative text-center">
                    {/* Animated Icon */}
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full mb-6 shadow-lg">
                      <Clock 
                        className="h-10 w-10 text-blue-600" 
                        style={{ transform: `rotate(${iconRotation}deg)` }}
                      />
                    </div>
                    
                    {/* Animated Title */}
                    <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                      Agendamentos Online em Breve
                    </h2>
                    
                    {/* Animated Description */}
                    <p className="text-lg text-gray-600 mb-6 max-w-lg mx-auto leading-relaxed">
                      Estamos trabalhando para trazer o sistema de agendamento online para você. 
                      Em breve você poderá agendar seus serviços de forma rápida e prática.
                    </p>
                    
                    {/* Enhanced Contact Alert - Mobile Optimized */}
                    <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200 rounded-2xl p-4 sm:p-6 mx-4 sm:max-w-md sm:mx-auto shadow-lg mb-6">
                      <div className="text-center sm:flex sm:items-start sm:gap-3 sm:text-left">
                        <div className="flex justify-center sm:justify-start mb-3 sm:mb-0">
                          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                            <AlertCircle className="h-5 w-5 text-blue-600" />
                          </div>
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold text-blue-800 text-base mb-3 sm:mb-2">Entre em contato:</h3>
                          
                          {/* Phone Number - Two Line Format */}
                          <div className="mb-4">
                            <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
                              <Phone className="h-4 w-4 text-blue-600 flex-shrink-0" />
                              <span className="text-blue-700 font-medium text-sm">Telefone:</span>
                            </div>
                            <div className="text-center sm:text-left">
                              <span className="text-blue-700 font-medium text-sm">(11) 2427-2827</span>
                            </div>
                          </div>
                          
                          {/* WhatsApp Section */}
                          <div className="space-y-3">
                            {/* Helper Text */}
                            <div className="flex items-center justify-center sm:justify-start gap-2">
                              <span role="img" aria-label="apontando para baixo" className="text-lg">👇</span>
                              <span className="text-sm font-medium text-slate-700">Entre em contato com um clique:</span>
                            </div>
                            
                            {/* WhatsApp Button - Mobile Optimized */}
                            <a
                              href="https://rebrand.ly/VettaleWhats"
                              target="_blank"
                              rel="noopener"
                              aria-label="Abrir WhatsApp para agendamento"
                              onClick={() => window.gtag?.('event', 'wa_booking_click', { location: 'booking_soon_card' })}
                              className="flex items-center justify-center gap-3 w-full p-3 sm:p-4 rounded-xl bg-green-500 text-white shadow-md transition hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-300 hover:scale-105"
                            >
                              {/* WhatsApp icon */}
                              <svg viewBox="0 0 24 24" className="h-5 w-5 flex-shrink-0" fill="currentColor" aria-hidden="true">
                                <path d="M20.52 3.48A11.87 11.87 0 0 0 12.05 0C5.59 0 .34 5.24.34 11.72c0 2.06.54 4.08 1.57 5.86L0 24l6.57-1.86a11.7 11.7 0 0 0 5.47 1.4h.01c6.46 0 11.72-5.24 11.72-11.7 0-3.13-1.22-6.06-3.25-8.36ZM12.05 21.2h-.01a9.46 9.46 0 0 1-4.83-1.32l-.35-.2-3.9 1.1 1.08-3.8-.23-.39a9.44 9.44 0 0 1-1.47-5.06c0-5.22 4.25-9.47 9.48-9.47 2.53 0 4.9.98 6.69 2.77a9.42 9.42 0 0 1 2.78 6.7c0 5.22-4.25 9.47-9.54 9.47ZM17.2 14.2c-.26-.13-1.54-.76-1.77-.85-.23-.09-.4-.13-.57.13-.17.25-.66.85-.81 1.02-.15.17-.3.19-.56.06-.26-.13-1.09-.4-2.07-1.28-.77-.68-1.29-1.52-1.44-1.78-.15-.26-.02-.4.11-.53.11-.11.26-.3.38-.45.13-.15.17-.26.26-.43.09-.17.04-.32-.02-.45-.06-.13-.57-1.38-.78-1.89-.2-.48-.4-.42-.57-.43h-.49c-.17 0-.45.06-.68.32-.23.25-.9.87-.9 2.12 0 1.25.92 2.46 1.05 2.63.13.17 1.82 2.78 4.4 3.9.62.27 1.11.43 1.49.55.62.20 1.19.17 1.64.10.50-.07 1.54-.63 1.76-1.24.22-.61.22-1.13.15-1.24-.07-.11-.24-.17-.50-.30Z" />
                              </svg>
                              <span className="font-semibold text-base">Falar no WhatsApp</span>
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Additional Features Preview */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <div className="text-center group">
                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform duration-300">
                          <Sparkles className="h-6 w-6 text-blue-600" />
                        </div>
                        <h3 className="font-semibold text-gray-800 mb-1 text-sm">Agendamento Rápido</h3>
                        <p className="text-xs text-gray-600">Processo simples e intuitivo</p>
                      </div>
                      <div className="text-center group">
                        <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform duration-300">
                          <Heart className="h-6 w-6 text-purple-600" />
                        </div>
                        <h3 className="font-semibold text-gray-800 mb-1 text-sm">Cuidado Personalizado</h3>
                        <p className="text-xs text-gray-600">Atenção especial para cada pet</p>
                      </div>
                      <div className="text-center group">
                        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform duration-300">
                          <Shield className="h-6 w-6 text-green-600" />
                        </div>
                        <h3 className="font-semibold text-gray-800 mb-1 text-sm">Segurança Total</h3>
                        <p className="text-xs text-gray-600">Dados protegidos e seguros</p>
                      </div>
                    </div>

                    {/* Call to Action */}
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                      <Button
                        type="button"
                        size="lg"
                        variant="outline"
                        onClick={enableTestMode}
                        className="border-blue-200 text-blue-700 hover:bg-blue-50 px-6 py-2 rounded-xl font-semibold transition-all duration-300"
                      >
                        Teste o agendamento
                      </Button>
                      <Button asChild size="lg" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6 py-2 rounded-xl font-semibold transform hover:scale-105 transition-all duration-300 shadow-lg">
                        <Link to="/services">Conhecer Nossos Serviços</Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            )}
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default Book;
