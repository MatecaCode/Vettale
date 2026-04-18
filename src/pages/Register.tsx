
import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { PhoneInput } from '@/components/ui/phone-input';
import { useAuth } from '@/hooks/useAuth';
import Layout from '@/components/Layout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import ErrorBoundary from '@/components/ErrorBoundary';

type AccountType = 'cliente' | 'staff' | 'admin';

interface StaffCapabilities {
  can_bathe: boolean;
  can_groom: boolean;
  can_vet: boolean;
}

interface RegistrationStatus {
  isProcessing: boolean;
  step: string;
  error: string | null;
  retryCount: number;
}

const Register = () => {
  // ── Shared fields ─────────────────────────────────────────────
  const [name, setName]                         = useState('');
  const [accountType, setAccountType]           = useState<AccountType>('cliente');

  // ── Email registration fields ──────────────────────────────────
  const [email, setEmail]                       = useState('');
  const [password, setPassword]                 = useState('');
  const [confirmPassword, setConfirmPassword]   = useState('');
  const [emailError, setEmailError]             = useState<string | null>(null);
  const [isCheckingEmail, setIsCheckingEmail]   = useState(false);

  // ── Phone registration fields ──────────────────────────────────
  const [authMethod, setAuthMethod]             = useState<'email' | 'phone'>('email');
  const [phone, setPhone]                       = useState('');
  const [otpStep, setOtpStep]                   = useState(false);
  const [otpValue, setOtpValue]                 = useState('');
  const [otpCooldown, setOtpCooldown]           = useState(0);

  // ── Staff fields ───────────────────────────────────────────────
  const [staffCapabilities, setStaffCapabilities] = useState<StaffCapabilities>({
    can_bathe: false, can_groom: false, can_vet: false,
  });
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [registrationCode, setRegistrationCode] = useState('');
  const [locations, setLocations]               = useState<any[]>([]);

  // ── UI state ───────────────────────────────────────────────────
  const [isLoading, setIsLoading]               = useState(false);
  const [error, setError]                       = useState<string | null>(null);
  const [registrationStatus, setRegistrationStatus] = useState<RegistrationStatus>({
    isProcessing: false, step: '', error: null, retryCount: 0,
  });

  const { signUp, sendPhoneOtp, verifyPhoneOtp, user, authError, clearAuthError } = useAuth();
  const navigate       = useNavigate();
  const location       = useLocation();
  const suggestGroomerRole = location.state?.suggestGroomerRole;

  // ── Effects ────────────────────────────────────────────────────
  useEffect(() => {
    if (suggestGroomerRole) {
      setAccountType('staff');
      setStaffCapabilities(prev => ({ ...prev, can_groom: true }));
    }
  }, [suggestGroomerRole]);

  useEffect(() => { if (user) navigate('/'); }, [user, navigate]);
  useEffect(() => { clearAuthError(); }, [clearAuthError]);

  useEffect(() => {
    if (accountType !== 'staff') return;
    supabase.from('locations').select('id, name').eq('active', true).order('name')
      .then(({ data, error }) => { if (!error && data) setLocations(data); });
  }, [accountType]);

  // OTP cooldown countdown
  useEffect(() => {
    if (otpCooldown <= 0) return;
    const t = setInterval(() => setOtpCooldown(c => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [otpCooldown]);

  const requiresCode = accountType === 'staff' || accountType === 'admin';

  // ── Email validation ───────────────────────────────────────────
  const validateEmail = async (emailToCheck: string) => {
    if (!emailToCheck || emailToCheck.length < 3) { setEmailError(null); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailToCheck)) { setEmailError('Formato de email inválido'); return; }
    setIsCheckingEmail(true); setEmailError(null);
    try {
      if (accountType === 'cliente') {
        const { data: emailExists, error: emailCheckError } = await supabase.rpc('check_email_exists', { p_email: emailToCheck });
        if (emailCheckError) { setEmailError('Erro ao verificar email'); return; }
        if (emailExists) { setEmailError('Este email já está cadastrado. Se você já tem uma conta, faça login.'); return; }
      }
      setEmailError(null);
    } catch { setEmailError('Erro ao verificar email'); }
    finally { setIsCheckingEmail(false); }
  };

  const debouncedEmailValidation = React.useCallback(
    React.useMemo(() => {
      let timeoutId: NodeJS.Timeout;
      return (v: string) => { clearTimeout(timeoutId); timeoutId = setTimeout(() => validateEmail(v), 500); };
    }, [accountType]),
    [accountType]
  );

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value); debouncedEmailValidation(e.target.value);
  };

  // ── Registration code validation ───────────────────────────────
  const validateAndUseRegistrationCode = async (retryCount: number = 0): Promise<boolean> => {
    if (!requiresCode) return true;
    try {
      setRegistrationStatus(prev => ({ ...prev, isProcessing: true, step: 'Validando código de registro...', error: null, retryCount }));
      let isValid = false;
      const trimmedCode = registrationCode.trim();
      if (accountType === 'admin') {
        const { data, error } = await supabase.rpc('validate_admin_registration_code', { code_value: trimmedCode });
        if (error) throw new Error(`Erro ao validar código de administrador: ${error.message}`);
        isValid = data;
        if (!isValid) throw new Error('Código de administrador inválido ou já utilizado.');
      } else if (accountType === 'staff') {
        const { data, error } = await supabase.rpc('validate_staff_registration_code', { code_value: trimmedCode, account_type_value: 'staff' });
        if (error) throw new Error(`Erro ao validar código de funcionário: ${error.message}`);
        isValid = data;
        if (!isValid) throw new Error('Código de funcionário inválido ou já utilizado.');
      }
      setRegistrationStatus(prev => ({ ...prev, isProcessing: false, step: 'Código validado com sucesso', error: null }));
      return true;
    } catch (error: any) {
      setRegistrationStatus(prev => ({ ...prev, isProcessing: false, step: 'Falha na validação', error: error.message, retryCount: prev.retryCount + 1 }));
      if (retryCount < 3 && (error.message?.includes('network') || error.message?.includes('timeout'))) {
        await new Promise(r => setTimeout(r, 1000 * (retryCount + 1)));
        return validateAndUseRegistrationCode(retryCount + 1);
      }
      return false;
    }
  };

  // ── Email / staff / admin registration ────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); clearAuthError();

    if (password !== confirmPassword) { setError('As senhas não coincidem.'); return; }
    if (password.length < 6) { setError('A senha deve ter pelo menos 6 caracteres.'); return; }
    if (emailError) { setError('Por favor, corrija os erros no email antes de continuar.'); return; }
    if (requiresCode && !registrationCode) {
      setError(`Código de registro é obrigatório para ${accountType === 'admin' ? 'administradores' : 'funcionários'}.`);
      return;
    }
    if (accountType === 'staff' && !staffCapabilities.can_bathe && !staffCapabilities.can_groom && !staffCapabilities.can_vet) {
      setError('Selecione pelo menos uma função para funcionários.'); return;
    }

    setIsLoading(true);
    setRegistrationStatus({ isProcessing: true, step: 'Verificando email...', error: null, retryCount: 0 });

    try {
      if (accountType === 'cliente') {
        setRegistrationStatus(prev => ({ ...prev, step: 'Verificando se o email já está cadastrado...' }));
        const { data: emailExists, error: emailCheckError } = await supabase.rpc('check_email_exists', { p_email: email });
        if (emailCheckError) throw new Error(`Erro ao verificar email: ${emailCheckError.message}`);
        if (emailExists) {
          setError('Este email já está cadastrado. Se você já tem uma conta, faça login. Se esqueceu sua senha, use a opção "Esqueci minha senha".');
          return;
        }
      }

      setRegistrationStatus(prev => ({ ...prev, step: 'Iniciando registro...' }));

      if (requiresCode) {
        const isValid = await validateAndUseRegistrationCode();
        if (!isValid) { setError(registrationStatus.error || 'Erro ao validar código de registro.'); return; }
      }

      setRegistrationStatus(prev => ({ ...prev, step: 'Criando conta...' }));

      // Only include phone if the user actually entered a number (more than just the dial code)
      const cleanPhone = phone.replace(/\D/g, '');
      const phoneToSave = cleanPhone.length >= 7 ? phone : null;

      const signUpData: any = { name, phone: phoneToSave };
      if (accountType === 'admin') {
        signUpData.admin_registration_code = registrationCode;
      } else if (accountType === 'staff') {
        signUpData.registration_code = registrationCode;
        signUpData.can_groom  = staffCapabilities.can_groom;
        signUpData.can_vet    = staffCapabilities.can_vet;
        signUpData.can_bathe  = staffCapabilities.can_bathe;
        signUpData.location_id = selectedLocation === 'none' ? null : selectedLocation;
      }

      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email, password,
        options: { data: signUpData, emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (authErr) throw authErr;

      // Explicit phone save — belt-and-suspenders in case trigger metadata timing varies
      if (authData.user && phoneToSave) {
        try {
          await supabase
            .from('clients')
            .update({ phone: phoneToSave })
            .eq('user_id', authData.user.id);
        } catch (phoneErr) {
          console.warn('Could not save phone to clients row (non-critical):', phoneErr);
        }
      }

      setRegistrationStatus(prev => ({ ...prev, step: 'Conta criada com sucesso!', isProcessing: false }));
      toast.message('Verifique seu e-mail para confirmar sua conta.');

      // Admin immediate processing
      if (accountType === 'admin' && authData.user) {
        setRegistrationStatus(prev => ({ ...prev, step: 'Processando registro de administrador...', isProcessing: true }));
        try {
          const { data: res, error: aErr } = await supabase.rpc('process_immediate_admin_registration', { p_user_id: authData.user.id });
          if (aErr) throw new Error(`Erro ao processar registro de administrador: ${aErr.message}`);
          if (!res?.success) throw new Error(res?.error || 'Erro desconhecido no registro de administrador');
          setRegistrationStatus(prev => ({ ...prev, step: 'Registro de administrador concluído!', isProcessing: false }));
        } catch (aErr: any) {
          setRegistrationStatus(prev => ({ ...prev, step: 'Erro no registro de administrador', error: aErr.message, isProcessing: false }));
        }
      }

      // Staff immediate processing
      if (accountType === 'staff' && authData.user) {
        setRegistrationStatus(prev => ({ ...prev, step: 'Processando registro de funcionário...', isProcessing: true }));
        try {
          await new Promise(r => setTimeout(r, 1000));
          const { data: res, error: sErr } = await supabase.rpc('process_immediate_staff_registration', { p_user_id: authData.user.id });
          if (sErr) throw new Error(`Erro ao processar registro de funcionário: ${sErr.message}`);
          if (!res?.success) throw new Error(res?.error || 'Erro desconhecido no registro de funcionário');
          setRegistrationStatus(prev => ({ ...prev, step: 'Registro de funcionário concluído!', isProcessing: false }));
        } catch (sErr: any) {
          setRegistrationStatus(prev => ({ ...prev, step: 'Erro no registro de funcionário', error: sErr.message, isProcessing: false }));
        }
      }

      if (accountType === 'staff') {
        const caps = [staffCapabilities.can_bathe && 'banho', staffCapabilities.can_groom && 'tosa', staffCapabilities.can_vet && 'veterinário'].filter(Boolean);
        toast.success(`Registro realizado! Funções: ${caps.join(', ')}. Perfil e disponibilidade criados automaticamente.`);
      } else if (accountType === 'admin') {
        toast.success('Registro de administrador realizado! Verifique seu email para confirmar a conta.');
      } else {
        toast.success('Registro realizado! Verifique seu email para confirmar a conta. Se não encontrar o email, verifique sua pasta de spam.');
      }

      setError(null);
      setRegistrationStatus({ isProcessing: false, step: '', error: null, retryCount: 0 });
      navigate('/login');
    } catch (error: any) {
      console.error('Registration error:', error);
      setRegistrationStatus(prev => ({ ...prev, isProcessing: false, step: 'Erro no registro', error: error.message }));
      if (error.message?.includes('User already registered')) {
        setError('Este email já está registrado. Tente fazer login ou use outro email.');
      } else if (error.message?.includes('Invalid email')) {
        setError('Email inválido. Verifique o formato do email.');
      } else if (error.message?.includes('Password should be at least')) {
        setError('A senha deve ter pelo menos 6 caracteres.');
      } else if (error.message?.includes('Signup is disabled')) {
        setError('Registros estão temporariamente desabilitados.');
      } else if (error.message?.includes('network') || error.message?.includes('timeout')) {
        setError('Erro de conexão. Verifique sua internet e tente novamente.');
      } else {
        setError(error.message || 'Erro ao criar conta. Tente novamente.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ── Phone registration ─────────────────────────────────────────
  const handlePhoneRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Informe seu nome.'); return; }
    if (phone.length < 8) { setError('Informe um número de telefone válido.'); return; }
    setIsLoading(true); setError(null);
    try {
      await sendPhoneOtp(phone, name.trim());
      setOtpStep(true);
      setOtpCooldown(60);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePhoneOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true); setError(null);
    try {
      await verifyPhoneOtp(phone, otpValue);
      // verifyPhoneOtp navigates to '/' and shows toast — nothing else needed here
    } catch (err: any) {
      setError(err.message);
      setOtpValue('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendPhoneOtp = async () => {
    if (otpCooldown > 0) return;
    setError(null);
    try { await sendPhoneOtp(phone, name.trim()); setOtpCooldown(60); }
    catch (err: any) { setError(err.message); }
  };

  const handleStaffCapabilityChange = (capability: keyof StaffCapabilities, checked: boolean) => {
    setStaffCapabilities(prev => ({ ...prev, [capability]: checked }));
  };

  // ── Render ─────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="flex justify-center items-center py-12">
        <Card className="w-[500px]">
          <CardHeader>
            <CardTitle className="text-2xl">Criar Conta</CardTitle>
            <CardDescription>Preencha os campos abaixo para se registrar</CardDescription>
          </CardHeader>

          <CardContent>
            {/* Alerts */}
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {registrationStatus.isProcessing && (
              <Alert className="mb-4">
                <AlertDescription>
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                    <span>{registrationStatus.step}</span>
                  </div>
                </AlertDescription>
              </Alert>
            )}
            {registrationStatus.error && !registrationStatus.isProcessing && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>
                  <div className="flex items-center justify-between">
                    <span>{registrationStatus.error}</span>
                    {registrationStatus.retryCount < 3 && (
                      <Button variant="outline" size="sm" onClick={() => handleSubmit(new Event('submit') as any)} className="ml-2">
                        Tentar Novamente
                      </Button>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* ── Account type selector (always visible) ── */}
            <div className="grid gap-2 mb-5">
              <Label>Tipo de Conta</Label>
              <RadioGroup
                value={accountType}
                onValueChange={(v: AccountType) => { setAccountType(v); setError(null); setOtpStep(false); setOtpValue(''); }}
                className="grid grid-cols-3 gap-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="cliente" id="cliente" /><Label htmlFor="cliente">Cliente</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="staff" id="staff" /><Label htmlFor="staff">Staff</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="admin" id="admin" /><Label htmlFor="admin">Admin</Label>
                </div>
              </RadioGroup>
            </div>

            {/* ══════════ CLIENTE ══════════ */}
            {accountType === 'cliente' && (
              <form onSubmit={handleSubmit}>
                <div className="grid gap-4">

                  {/* Name */}
                  <div className="grid gap-2">
                    <Label htmlFor="name">Nome</Label>
                    <Input id="name" type="text" placeholder="Seu Nome"
                      value={name} onChange={e => setName(e.target.value)} required />
                  </div>

                  {/* Email */}
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" placeholder="seu@email.com"
                      value={email} onChange={handleEmailChange}
                      className={emailError ? 'border-red-500' : ''} required />
                    {isCheckingEmail && (
                      <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary" />
                        <span>Verificando email...</span>
                      </div>
                    )}
                    {emailError && <p className="text-sm text-red-500">{emailError}</p>}
                  </div>

                  {/* Password */}
                  <div className="grid gap-2">
                    <Label htmlFor="password">Senha</Label>
                    <Input id="password" type="password"
                      value={password} onChange={e => setPassword(e.target.value)} required />
                  </div>

                  {/* Confirm Password */}
                  <div className="grid gap-2">
                    <Label htmlFor="confirmPassword">Confirmar Senha</Label>
                    <Input id="confirmPassword" type="password"
                      value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
                  </div>

                  {/* Phone — always visible */}
                  <div className="grid gap-2">
                    <Label>Telefone <span className="text-muted-foreground text-xs font-normal">(opcional)</span></Label>
                    <PhoneInput value={phone} onChange={setPhone} />
                  </div>

                  {/* Verification method selector */}
                  <div className="grid gap-2">
                    <Label>Como deseja verificar sua conta?</Label>
                    <RadioGroup
                      value={authMethod}
                      onValueChange={v => { setAuthMethod(v as 'email' | 'phone'); setError(null); }}
                      className="grid grid-cols-2 gap-2"
                    >
                      <Label
                        htmlFor="verify-email"
                        className={`flex flex-col gap-1 rounded-lg border p-3 cursor-pointer transition-colors ${
                          authMethod === 'email' ? 'border-primary bg-primary/5' : 'border-input hover:border-primary/40'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="email" id="verify-email" />
                          <span className="font-medium text-sm">E-mail</span>
                        </div>
                        <span className="text-xs text-muted-foreground pl-5">Link de confirmação</span>
                      </Label>

                      <Label
                        htmlFor="verify-phone"
                        className={`flex flex-col gap-1 rounded-lg border p-3 cursor-pointer transition-colors ${
                          authMethod === 'phone' ? 'border-primary bg-primary/5' : 'border-input hover:border-primary/40'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="phone" id="verify-phone" />
                          <span className="font-medium text-sm">Telefone</span>
                        </div>
                        <span className="text-xs text-muted-foreground pl-5">Código SMS</span>
                      </Label>
                    </RadioGroup>
                  </div>

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? 'Registrando...' : 'Criar conta'}
                  </Button>
                </div>
              </form>
            )}

            {/* ══════════ STAFF / ADMIN: email only ══════════ */}
            {(accountType === 'staff' || accountType === 'admin') && (
              <form onSubmit={handleSubmit}>
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name-staff">Nome</Label>
                    <Input id="name-staff" type="text" placeholder="Seu Nome"
                      value={name} onChange={e => setName(e.target.value)} required />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="email-staff">Email</Label>
                    <Input id="email-staff" type="email" placeholder="seu@email.com"
                      value={email} onChange={handleEmailChange}
                      className={emailError ? 'border-red-500' : ''} required />
                    {isCheckingEmail && (
                      <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary" />
                        <span>Verificando email...</span>
                      </div>
                    )}
                    {emailError && <p className="text-sm text-red-500">{emailError}</p>}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="password-staff">Senha</Label>
                    <Input id="password-staff" type="password"
                      value={password} onChange={e => setPassword(e.target.value)} required />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="confirmPassword-staff">Confirmar Senha</Label>
                    <Input id="confirmPassword-staff" type="password"
                      value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
                  </div>

                  {/* Staff capabilities */}
                  {accountType === 'staff' && (
                    <>
                      <div className="grid gap-3">
                        <Label>Funções (selecione todas que se aplicam)</Label>
                        <div className="space-y-3">
                          {[
                            { key: 'can_bathe', label: 'Você vai dar banhos?' },
                            { key: 'can_groom',  label: 'Você vai trabalhar na tosa?' },
                            { key: 'can_vet',    label: 'Você vai performar como veterinário?' },
                          ].map(({ key, label }) => (
                            <div key={key} className="flex items-center space-x-2">
                              <Checkbox
                                id={key}
                                checked={staffCapabilities[key as keyof StaffCapabilities]}
                                onCheckedChange={c => handleStaffCapabilityChange(key as keyof StaffCapabilities, c as boolean)}
                              />
                              <Label htmlFor={key}>{label}</Label>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <Label>Local de Trabalho (opcional)</Label>
                        <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione um local (opcional)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Nenhum local específico</SelectItem>
                            {locations.map(loc => (
                              <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}

                  <Alert className="mb-2">
                    <AlertDescription>
                      {accountType === 'staff'
                        ? 'Ao se cadastrar como staff, você terá acesso ao calendário de agendamentos e será listado como profissional disponível para os clientes com base nas funções selecionadas.'
                        : 'Ao se cadastrar como administrador, você terá acesso completo ao sistema, incluindo o painel administrativo para gerenciar agendamentos, usuários e configurações.'}
                    </AlertDescription>
                  </Alert>

                  <div className="grid gap-2">
                    <Label htmlFor="registrationCode">Código de Registro</Label>
                    <Input id="registrationCode" type="text"
                      placeholder={`Insira o código de registro de ${accountType === 'admin' ? 'administrador' : 'funcionário'}`}
                      value={registrationCode} onChange={e => setRegistrationCode(e.target.value)} required />
                    <p className="text-sm text-muted-foreground">
                      Código fornecido pelo pet shop para registro de {accountType === 'admin' ? 'administradores' : 'funcionários'}
                    </p>
                  </div>

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? 'Registrando...' : 'Registrar'}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>

          <CardFooter>
            <div className="text-center w-full mt-2">
              Já tem uma conta?{' '}
              <Link to="/login" className="text-primary hover:underline">Faça Login</Link>
            </div>
          </CardFooter>
        </Card>
      </div>
    </Layout>
  );
};

export default Register;
