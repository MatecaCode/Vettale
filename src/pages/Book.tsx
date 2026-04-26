import React, { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { Calendar, Phone, MessageCircle } from 'lucide-react';
import AppointmentForm from '@/components/AppointmentForm';

// Extend Window interface for gtag
declare global {
  interface Window {
    gtag?: (command: string, eventName: string, parameters: any) => void;
  }
}

const Book = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState<number>(1);

  useEffect(() => {
    setIsVisible(true);
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

        <div className="relative max-w-7xl mx-auto px-4 md:px-6 text-center">
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

      {/* Booking Section */}
      <section className="pt-0 pb-12 md:py-12 relative bg-white">
        <div className="max-w-7xl mx-auto px-3 md:px-6">
          {/* Beta notice */}
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 shadow-sm">
            <p className="font-semibold text-amber-800 mb-1">⚠️ Sistema de Agendamento em Beta</p>
            <p>
              Nosso sistema de agendamento online está em fase beta. Você já pode realizar seu agendamento normalmente —
              assim que recebermos sua solicitação, entraremos em contato com você pelo telefone ou e-mail cadastrado
              na sua conta para confirmar os detalhes e finalizar o agendamento.
            </p>
          </div>

          <div className={`${currentStep === 1 ? 'grid grid-cols-1 lg:grid-cols-2' : 'grid grid-cols-1'} gap-8`}>
            {/* Left: Booking form */}
            <div className="bg-white rounded-2xl shadow-2xl p-4 md:p-8 border border-gray-100">
              <AppointmentForm serviceType="grooming" onStepChange={(s) => setCurrentStep(s)} />
            </div>

            {/* Right: Info card (step 1 only) */}
            {currentStep === 1 && (
              <div className="bg-white rounded-2xl shadow-2xl p-8 border border-gray-100">
                <h3 className="text-2xl font-bold text-gray-800 mb-6">Informações de Agendamento</h3>
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
                    <h4 className="font-bold text-gray-800 mb-4 text-lg">Observações</h4>
                    <ul className="space-y-3 text-lg text-gray-600">
                      <li className="flex items-start gap-3">
                        <span className="text-blue-500 mt-1">•</span>
                        <span>Por favor chegue 15 minutos antes do horário marcado</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-blue-500 mt-1">•</span>
                        <span>Certifique-se de que seu pet fez suas necessidades antes</span>
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
      </section>
    </Layout>
  );
};

export default Book;
