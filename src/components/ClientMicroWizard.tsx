import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import PhoneInputBR from '@/components/inputs/PhoneInputBR';
import { DateInputBR } from '@/components/inputs/DateInputBR';
import { PREFERRED_CONTACT_OPTIONS, MARKETING_SOURCE_OPTIONS } from '@/constants/profile';
import {
  User,
  MessageSquare,
  Heart,
  ChevronRight,
  ChevronLeft,
  Check,
  Phone,
  Mail,
  AlertCircle,
  Sparkles,
  PartyPopper,
  X as XIcon
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/utils/logger';
import { toast } from 'sonner';

interface StaffProfile {
  id: string;
  name: string;
  email: string;
  can_groom: boolean;
  can_vet: boolean;
  can_bathe: boolean;
}

interface WizardData {
  // Step 1 - Contato
  name?: string;
  phone?: string;
  is_whatsapp?: boolean;
  preferred_channel_code?: string;
  marketing_source_code?: string;
  marketing_source_other?: string;
  birth_date?: string;

  // Step 2 - Lembretes & Consents
  consent_reminders?: boolean;
  consent_tos?: boolean;
  consent_privacy?: boolean;

  // Step 3 - Emergência (kept in data model for backwards compat)
  emergency_contact_name?: string;
  emergency_contact_phone?: string;

  // Step 3 - Preferências
  preferred_staff_profile_id?: string;
  accessibility_notes?: string;
}

type WizardStepId = 'contact' | 'reminders' | 'emergency' | 'preferences';

interface ClientMicroWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  currentUserName?: string;
  startAt?: WizardStepId; // optional starting step
  initialValues?: Partial<WizardData>; // prefill values
}

const TOTAL_STEPS = 3;

const ClientMicroWizard: React.FC<ClientMicroWizardProps> = ({
  isOpen,
  onClose,
  onComplete,
  currentUserName = '',
  startAt,
  initialValues
}) => {
  const [currentStep, setCurrentStep] = useState(0); // 0 = welcome, 1-3 = form steps
  const [wizardData, setWizardData] = useState<WizardData>({
    name: currentUserName,
    preferred_channel_code: 'telefone'
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right'>('left');
  const [isAnimating, setIsAnimating] = useState(false);

  // Lookup data
  const [staffProfiles, setStaffProfiles] = useState<StaffProfile[]>([]);

  // Seed from initialValues only once on open
  useEffect(() => {
    if (isOpen) {
      if (initialValues) {
        setWizardData(prev => ({ ...prev, ...initialValues }));
      }
      if (startAt) {
        // Map old 4-step IDs to new 3-step layout
        const map: Record<WizardStepId, number> = {
          contact: 1,
          reminders: 2,
          emergency: 1, // emergency removed, go to contact
          preferences: 3
        };
        setCurrentStep(map[startAt] || 0);
      } else {
        setCurrentStep(0); // Start at welcome
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Load lookup data
  useEffect(() => {
    if (isOpen) {
      loadLookupData();
    }
  }, [isOpen]);

  const loadLookupData = async () => {
    try {
      setLoading(true);
      const { data: staff, error: staffError } = await supabase
        .from('staff_profiles')
        .select('id, name, email, can_groom, can_vet, can_bathe')
        .eq('active', true)
        .order('name');

      if (staffError) {
        log.error('Error loading staff profiles:', staffError);
      } else {
        setStaffProfiles(staff || []);
      }
    } catch (error) {
      log.error('Error loading staff profiles:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateWizardData = (updates: Partial<WizardData>) => {
    setWizardData(prev => ({ ...prev, ...updates }));
  };

  const animateToStep = useCallback((targetStep: number) => {
    if (isAnimating) return;
    setSlideDirection(targetStep > currentStep ? 'left' : 'right');
    setIsAnimating(true);
    setTimeout(() => {
      setCurrentStep(targetStep);
      setTimeout(() => setIsAnimating(false), 300);
    }, 150);
  }, [currentStep, isAnimating]);

  const savePartialProgress = async () => {
    try {
      setSaving(true);

      const profileUpdates: Record<string, unknown> = {};

      if (wizardData.phone) profileUpdates.p_phone = wizardData.phone;
      if (wizardData.is_whatsapp !== undefined) profileUpdates.p_is_whatsapp = wizardData.is_whatsapp;
      profileUpdates.p_preferred_channel_code = wizardData.preferred_channel_code || 'telefone';
      if (wizardData.marketing_source_code) profileUpdates.p_marketing_source_code = wizardData.marketing_source_code;
      if (wizardData.marketing_source_other) profileUpdates.p_marketing_source_other = wizardData.marketing_source_other;
      profileUpdates.p_birth_date = wizardData.birth_date || null;
      if (wizardData.emergency_contact_name) profileUpdates.p_emergency_contact_name = wizardData.emergency_contact_name;
      if (wizardData.emergency_contact_phone) profileUpdates.p_emergency_contact_phone = wizardData.emergency_contact_phone;
      if (wizardData.preferred_staff_profile_id) profileUpdates.p_preferred_staff_profile_id = wizardData.preferred_staff_profile_id;
      if (wizardData.accessibility_notes) profileUpdates.p_accessibility_notes = wizardData.accessibility_notes;

      if (Object.keys(profileUpdates).length > 0) {
        const { error: profileError } = await supabase.rpc('client_update_profile', profileUpdates);
        if (profileError) throw profileError;
      }

      // Log consents
      const consents = [];
      if (wizardData.consent_tos !== undefined) {
        consents.push({ type: 'tos', granted: wizardData.consent_tos });
      }
      if (wizardData.consent_privacy !== undefined) {
        consents.push({ type: 'privacy', granted: wizardData.consent_privacy });
      }
      if (wizardData.consent_reminders !== undefined) {
        consents.push({
          type: 'reminders',
          granted: wizardData.consent_reminders,
          channel_code: wizardData.preferred_channel_code || 'email'
        });
      }

      for (const consent of consents) {
        try {
          const { error: consentError } = await supabase.rpc('client_log_consent', {
            p_granted: consent.granted,
            p_type: consent.type,
            p_version: 'v1',
            p_channel_code: consent.channel_code || null
          });
          if (consentError) {
            log.error('Error logging consent:', consentError);
            toast.error('Falha ao registrar consentimento (continuando assim mesmo)');
          }
        } catch (consentError) {
          log.error('Error logging consent:', consentError);
          toast.error('Falha ao registrar consentimento (continuando assim mesmo)');
        }
      }
    } catch (error) {
      console.error('Error saving partial progress:', error);
      toast.error('Erro ao salvar progresso');
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    if (currentStep === 0) {
      animateToStep(1);
      return;
    }

    try {
      await savePartialProgress();

      if (currentStep < TOTAL_STEPS) {
        animateToStep(currentStep + 1);
      } else {
        await completeWizard();
      }
    } catch {
      // Error already handled in savePartialProgress
    }
  };

  const handleSkip = async () => {
    if (currentStep === 2) {
      toast.error('Para continuar, aceite os termos de uso, a política de privacidade e os lembretes.');
      return;
    }
    try {
      if (hasStepData()) {
        await savePartialProgress();
      }

      if (currentStep < TOTAL_STEPS) {
        animateToStep(currentStep + 1);
      } else {
        await completeWizard();
      }
    } catch {
      if (currentStep < TOTAL_STEPS) {
        animateToStep(currentStep + 1);
      } else {
        completeWizard();
      }
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      animateToStep(currentStep - 1);
    }
  };

  const completeWizard = async () => {
    try {
      const { error } = await supabase.rpc('client_mark_first_visit_setup');
      if (error) {
        console.error('Error completing first visit setup:', error);
        toast.error('Erro ao finalizar configuração');
        return;
      }

      await supabase.rpc('client_get_profile_progress');

      toast.success('Configuração inicial concluída!');
      onComplete();
    } catch (error) {
      console.error('Error completing wizard:', error);
      toast.error('Erro ao finalizar configuração');
    }
  };

  const hasStepData = (): boolean => {
    switch (currentStep) {
      case 1:
        return !!(wizardData.phone || wizardData.is_whatsapp !== undefined || wizardData.preferred_channel_code || wizardData.marketing_source_code || wizardData.birth_date);
      case 2:
        return !!(wizardData.consent_reminders !== undefined || wizardData.consent_tos !== undefined || wizardData.consent_privacy !== undefined);
      case 3:
        return !!(wizardData.preferred_staff_profile_id || wizardData.accessibility_notes);
      default:
        return false;
    }
  };

  const canProceed = (): boolean => {
    switch (currentStep) {
      case 0: return true; // Welcome
      case 1:
        return !!(wizardData.marketing_source_code &&
                 (wizardData.marketing_source_code !== 'outro' || wizardData.marketing_source_other));
      case 2:
        return !!(wizardData.consent_tos && wizardData.consent_privacy && wizardData.consent_reminders);
      case 3:
        return true;
      default:
        return true;
    }
  };

  const stepConfig = [
    { id: 'welcome', label: 'Bem-vindo', icon: Sparkles, color: 'from-brand-primary to-brand-secondary' },
    { id: 'contact', label: 'Contato', icon: User, color: 'from-brand-primary to-brand-secondary' },
    { id: 'consents', label: 'Termos', icon: MessageSquare, color: 'from-emerald-500 to-teal-600' },
    { id: 'preferences', label: 'Preferências', icon: Heart, color: 'from-brand-secondary to-brand-primary' },
  ];

  // ── Welcome Screen ──
  const renderWelcome = () => (
    <div className="flex flex-col items-center text-center py-4">
      <div className="w-20 h-20 bg-gradient-to-br from-brand-primary to-brand-secondary rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-brand-primary/20">
        <PartyPopper className="w-10 h-10 text-white" />
      </div>
      <h2 className="text-2xl font-bold text-brand-neutral mb-2">
        Bem-vindo à Vettale!
      </h2>
      <p className="text-brand-mutedFg mb-6 max-w-xs">
        Vamos configurar seu perfil em poucos passos para personalizar sua experiência.
      </p>
      <div className="flex items-center gap-3 text-sm text-brand-mutedFg bg-brand-accent/60 rounded-xl px-5 py-3">
        <Sparkles className="w-4 h-4 text-brand-primary flex-shrink-0" />
        <span>Leva menos de 1 minuto</span>
      </div>
    </div>
  );

  // ── Step 1: Contact ──
  const renderContactStep = () => (
    <div className="space-y-5">
      <div className="text-center mb-2">
        <h3 className="text-lg font-semibold text-brand-neutral">Informações de Contato</h3>
        <p className="text-sm text-brand-mutedFg mt-1">Como podemos falar com você?</p>
      </div>

      {/* Phone + WhatsApp inline */}
      <div>
        <Label htmlFor="wizard-phone" className="text-sm font-medium text-gray-700">Telefone</Label>
        <div className="flex items-center gap-3 mt-1.5">
          <div className="flex-1">
            <PhoneInputBR
              value={wizardData.phone || ''}
              onChange={(value) => updateWizardData({ phone: value })}
              placeholder="(11) 99999-9999"
            />
          </div>
          <label
            htmlFor="wizard-whatsapp"
            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border cursor-pointer transition-all select-none text-sm ${
              wizardData.is_whatsapp
                ? 'border-green-400 bg-green-50 text-green-700'
                : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
            }`}
          >
            <Checkbox
              id="wizard-whatsapp"
              checked={wizardData.is_whatsapp || false}
              onCheckedChange={(checked) => updateWizardData({ is_whatsapp: checked as boolean })}
              className="data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500"
            />
            <Phone className="w-3.5 h-3.5" />
            WhatsApp
          </label>
        </div>
      </div>

      {/* Contact preference as interactive cards */}
      <div>
        <Label className="text-sm font-medium text-gray-700">Canal de contato preferido</Label>
        <div className="grid grid-cols-3 gap-2 mt-1.5">
          {PREFERRED_CONTACT_OPTIONS.map((option) => {
            const isSelected = wizardData.preferred_channel_code === option.code;
            return (
              <button
                key={option.code}
                type="button"
                onClick={() => updateWizardData({ preferred_channel_code: option.code })}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-sm font-medium ${
                  isSelected
                    ? 'border-brand-primary bg-brand-accent text-brand-primary shadow-sm'
                    : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                {option.code === 'telefone' && <Phone className={`w-5 h-5 ${isSelected ? 'text-brand-primary' : 'text-gray-400'}`} />}
                {option.code === 'email' && <Mail className={`w-5 h-5 ${isSelected ? 'text-brand-primary' : 'text-gray-400'}`} />}
                {option.code === 'none' && <XIcon className={`w-5 h-5 ${isSelected ? 'text-brand-primary' : 'text-gray-400'}`} />}
                <span className="text-xs">{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Marketing source */}
      <div>
        <Label htmlFor="wizard-marketing" className="text-sm font-medium text-gray-700">Como nos conheceu? *</Label>
        <Select
          value={wizardData.marketing_source_code || ''}
          onValueChange={(value) => updateWizardData({ marketing_source_code: value })}
        >
          <SelectTrigger className={`mt-1.5 ${!wizardData.marketing_source_code ? 'border-amber-300 focus:border-amber-400' : ''}`}>
            <SelectValue placeholder="Selecione uma opção" />
          </SelectTrigger>
          <SelectContent>
            {MARKETING_SOURCE_OPTIONS.map((source) => (
              <SelectItem key={source.code} value={source.code}>
                {source.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!wizardData.marketing_source_code && (
          <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
            <AlertCircle className="w-3 h-3 flex-shrink-0" />
            Obrigatório para continuar
          </p>
        )}
      </div>

      {wizardData.marketing_source_code === 'outro' && (
        <div>
          <Label htmlFor="wizard-marketing-other" className="text-sm font-medium text-gray-700">Qual? *</Label>
          <Input
            id="wizard-marketing-other"
            value={wizardData.marketing_source_other || ''}
            onChange={(e) => updateWizardData({ marketing_source_other: e.target.value })}
            placeholder="Como você nos conheceu?"
            className="mt-1.5"
          />
        </div>
      )}

      {/* Birth Date */}
      <div>
        <Label htmlFor="wizard-birth-date" className="text-sm font-medium text-gray-700">Aniversário <span className="text-gray-400 font-normal">(opcional)</span></Label>
        <DateInputBR
          id="wizard-birth-date"
          value={wizardData.birth_date}
          onChange={(value) => updateWizardData({ birth_date: value })}
          className="mt-1.5"
        />
      </div>
    </div>
  );

  // ── Step 2: Consents ──
  const renderConsentsStep = () => {
    const allChecked = wizardData.consent_tos && wizardData.consent_privacy && wizardData.consent_reminders;

    return (
      <div className="space-y-5">
        <div className="text-center mb-2">
          <h3 className="text-lg font-semibold text-brand-neutral">Lembretes e Termos</h3>
          <p className="text-sm text-brand-mutedFg mt-1">Precisamos da sua autorização para continuar</p>
        </div>

        <div className="space-y-3">
          {/* Reminders consent */}
          <Card
            className={`border-2 transition-all cursor-pointer ${
              wizardData.consent_reminders
                ? 'border-brand-primary bg-brand-accent/40'
                : 'border-gray-200 hover:border-gray-300'
            }`}
            onClick={() => updateWizardData({ consent_reminders: !wizardData.consent_reminders })}
          >
            <CardContent className="p-4 flex items-start gap-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                wizardData.consent_reminders
                  ? 'bg-brand-primary text-white'
                  : 'bg-gray-200 text-gray-400'
              }`}>
                {wizardData.consent_reminders ? <Check className="w-3.5 h-3.5" /> : <MessageSquare className="w-3 h-3" />}
              </div>
              <div>
                <p className="font-medium text-sm text-gray-800">Receber lembretes de agendamentos</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Via telefone / e-mail — conforme canal configurado
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Terms of Use */}
          <Card
            className={`border-2 transition-all cursor-pointer ${
              wizardData.consent_tos
                ? 'border-brand-primary bg-brand-accent/40'
                : 'border-gray-200 hover:border-gray-300'
            }`}
            onClick={() => updateWizardData({ consent_tos: !wizardData.consent_tos })}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                wizardData.consent_tos
                  ? 'bg-brand-primary text-white'
                  : 'bg-gray-200 text-gray-400'
              }`}>
                {wizardData.consent_tos ? <Check className="w-3.5 h-3.5" /> : <span className="text-xs font-bold">T</span>}
              </div>
              <p className="font-medium text-sm text-gray-800">
                Aceito os <span className="text-brand-primary underline">Termos de Uso</span>
              </p>
            </CardContent>
          </Card>

          {/* Privacy Policy */}
          <Card
            className={`border-2 transition-all cursor-pointer ${
              wizardData.consent_privacy
                ? 'border-brand-primary bg-brand-accent/40'
                : 'border-gray-200 hover:border-gray-300'
            }`}
            onClick={() => updateWizardData({ consent_privacy: !wizardData.consent_privacy })}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                wizardData.consent_privacy
                  ? 'bg-brand-primary text-white'
                  : 'bg-gray-200 text-gray-400'
              }`}>
                {wizardData.consent_privacy ? <Check className="w-3.5 h-3.5" /> : <span className="text-xs font-bold">P</span>}
              </div>
              <p className="font-medium text-sm text-gray-800">
                Aceito a <span className="text-brand-primary underline">Política de Privacidade</span>
              </p>
            </CardContent>
          </Card>
        </div>

        {!allChecked && (
          <div className="flex items-center gap-2 text-amber-600 text-sm bg-amber-50 p-3 rounded-xl">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>Todos os itens acima são obrigatórios</span>
          </div>
        )}

        {/* Accept all shortcut */}
        {!allChecked && (
          <button
            type="button"
            onClick={() => updateWizardData({
              consent_reminders: true,
              consent_tos: true,
              consent_privacy: true
            })}
            className="w-full text-center text-sm text-brand-primary font-medium hover:text-brand-neutral transition-colors py-2"
          >
            Aceitar todos
          </button>
        )}
      </div>
    );
  };

  // ── Step 3: Preferences ──
  const renderPreferencesStep = () => (
    <div className="space-y-5">
      <div className="text-center mb-2">
        <h3 className="text-lg font-semibold text-brand-neutral">Suas Preferências</h3>
        <p className="text-sm text-brand-mutedFg mt-1">Personalize sua experiência</p>
      </div>

      <div>
        <Label htmlFor="wizard-staff" className="text-sm font-medium text-gray-700">
          Profissional preferido <span className="text-gray-400 font-normal">(opcional)</span>
        </Label>
        <Select
          value={wizardData.preferred_staff_profile_id || ''}
          onValueChange={(value) => updateWizardData({ preferred_staff_profile_id: value })}
        >
          <SelectTrigger className="mt-1.5">
            <SelectValue placeholder="Selecione um profissional" />
          </SelectTrigger>
          <SelectContent>
            {staffProfiles.map((staff) => (
              <SelectItem key={staff.id} value={staff.id}>
                <div>
                  <div className="font-medium">{staff.name}</div>
                  <div className="text-xs text-gray-500">
                    {[
                      staff.can_groom && 'Tosador',
                      staff.can_vet && 'Veterinário',
                      staff.can_bathe && 'Banho'
                    ].filter(Boolean).join(' · ')}
                  </div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-gray-400 mt-1.5">
          Indicamos sua preferência, mas não é garantia de disponibilidade
        </p>
      </div>

      <div>
        <Label htmlFor="wizard-accessibility" className="text-sm font-medium text-gray-700">
          Observações sobre seu pet <span className="text-gray-400 font-normal">(opcional)</span>
        </Label>
        <Textarea
          id="wizard-accessibility"
          value={wizardData.accessibility_notes || ''}
          onChange={(e) => updateWizardData({ accessibility_notes: e.target.value })}
          placeholder="Alergias, necessidades especiais, comportamento..."
          className="mt-1.5 resize-none"
          rows={3}
        />
      </div>

      {/* Completion encouragement */}
      <div className="bg-gradient-to-r from-brand-accent to-blue-50 rounded-xl p-4 flex items-center gap-3">
        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
          <PartyPopper className="w-5 h-5 text-brand-primary" />
        </div>
        <div>
          <p className="text-sm font-medium text-brand-neutral">Quase pronto!</p>
          <p className="text-xs text-brand-mutedFg">Clique em Finalizar para completar seu perfil</p>
        </div>
      </div>
    </div>
  );

  const renderStep = () => {
    switch (currentStep) {
      case 0: return renderWelcome();
      case 1: return renderContactStep();
      case 2: return renderConsentsStep();
      case 3: return renderPreferencesStep();
      default: return null;
    }
  };

  if (loading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary" />
            <span className="ml-3 text-brand-mutedFg">Carregando...</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) onClose();
    }}>
      <DialogContent className="max-w-[440px] max-h-[90vh] overflow-hidden p-0 gap-0 rounded-2xl border-0 shadow-2xl">
        {/* Top gradient accent bar */}
        <div className="h-1.5 bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-primary" />

        {/* Progress section - only show on form steps */}
        {currentStep > 0 && (
          <div className="px-6 pt-5 pb-3">
            {/* Step pills */}
            <div className="flex items-center gap-2 mb-3">
              {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((step) => {
                const config = stepConfig[step];
                const isActive = step === currentStep;
                const isComplete = step < currentStep;

                return (
                  <div key={step} className="flex items-center gap-2 flex-1">
                    <div className={`flex items-center gap-1.5 flex-1 h-9 rounded-full px-3 transition-all duration-300 ${
                      isActive
                        ? 'bg-brand-primary text-white shadow-md shadow-brand-primary/20'
                        : isComplete
                        ? 'bg-brand-success/20 text-brand-success'
                        : 'bg-gray-100 text-gray-400'
                    }`}>
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isActive
                          ? 'bg-white/20'
                          : isComplete
                          ? 'bg-brand-success/20'
                          : ''
                      }`}>
                        {isComplete ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          <config.icon className="w-3 h-3" />
                        )}
                      </div>
                      <span className="text-xs font-medium truncate">{config.label}</span>
                    </div>
                    {step < TOTAL_STEPS && (
                      <div className={`w-4 h-0.5 flex-shrink-0 transition-colors duration-300 ${
                        isComplete ? 'bg-brand-success' : 'bg-gray-200'
                      }`} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Subtle progress bar */}
            <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand-primary to-brand-secondary rounded-full transition-all duration-500 ease-out"
                style={{ width: `${(currentStep / TOTAL_STEPS) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Step content with animation */}
        <div className="px-6 py-4 overflow-y-auto max-h-[calc(90vh-180px)]">
          <div
            className={`transition-all duration-300 ease-out ${
              isAnimating
                ? slideDirection === 'left'
                  ? 'opacity-0 translate-x-4'
                  : 'opacity-0 -translate-x-4'
                : 'opacity-100 translate-x-0'
            }`}
          >
            {renderStep()}
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
          <div>
            {currentStep > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                disabled={saving || isAnimating}
                className="h-7 px-2.5 text-xs text-brand-mutedFg hover:text-brand-neutral"
              >
                <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                Voltar
              </Button>
            )}
            {currentStep === 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => animateToStep(0)}
                disabled={saving || isAnimating}
                className="h-7 px-2.5 text-xs text-brand-mutedFg hover:text-brand-neutral"
              >
                <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                Início
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {currentStep > 0 && currentStep !== 2 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkip}
                disabled={saving || isAnimating}
                className="h-7 px-2.5 text-xs text-gray-400 hover:text-gray-600"
              >
                Pular
              </Button>
            )}

            <Button
              onClick={handleNext}
              disabled={saving || !canProceed() || isAnimating}
              className={`h-8 px-4 text-sm font-medium min-w-[110px] transition-all duration-300 ${
                currentStep === 0
                  ? 'bg-gradient-to-r from-brand-primary to-brand-secondary hover:shadow-md hover:shadow-brand-primary/20 text-white'
                  : currentStep === TOTAL_STEPS
                  ? 'bg-gradient-to-r from-brand-success to-emerald-500 hover:shadow-md hover:shadow-brand-success/20 text-white'
                  : 'bg-brand-primary hover:bg-brand-neutral text-white'
              }`}
            >
              {saving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin mr-1.5" />
                  Salvando...
                </>
              ) : currentStep === 0 ? (
                <>
                  Começar
                  <Sparkles className="w-3.5 h-3.5 ml-1.5" />
                </>
              ) : currentStep === TOTAL_STEPS ? (
                <>
                  <Check className="w-3.5 h-3.5 mr-1.5" />
                  Finalizar
                </>
              ) : (
                <>
                  Continuar
                  <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ClientMicroWizard;
