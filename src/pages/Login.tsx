
import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PhoneInput } from '@/components/ui/phone-input';
import { useAuth } from '@/hooks/useAuth';
import Layout from '@/components/Layout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { resendConfirmation } from '@/integrations/supabase/resendConfirmation';

const Login = () => {
  // ── Email state ───────────────────────────────────────────────
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');

  // ── Phone state ───────────────────────────────────────────────
  const [phone, setPhone]               = useState('');
  const [phonePassword, setPhonePassword] = useState('');

  // ── Shared state ──────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [cooldown, setCooldown]   = useState(0);

  const { signIn, signInWithPhonePassword, user } = useAuth();

  const navigate  = useNavigate();
  const location  = useLocation();
  const suggestGroomerRole = location.state?.suggestGroomerRole;

  useEffect(() => { if (user) navigate('/'); }, [user, navigate]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const showResend =
    (error || '').toLowerCase().includes('confirm') ||
    (error || '').toLowerCase().includes('not confirmed');

  const handleResendEmail = async () => {
    if (!email || cooldown > 0) return;
    try { await resendConfirmation(email); setCooldown(30); }
    catch (err: any) { console.error('[RESEND]', err); }
  };

  // ── Email login ───────────────────────────────────────────────
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true); setError(null);
    try { await signIn(email, password); }
    catch (err: any) { setError(err.message || 'Falha ao fazer login. Verifique suas credenciais.'); }
    finally { setIsLoading(false); }
  };

  // ── Phone + password login ────────────────────────────────────
  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.length < 8) { setError('Informe um número de telefone válido.'); return; }
    setIsLoading(true); setError(null);
    try { await signInWithPhonePassword(phone, phonePassword); }
    catch (err: any) { setError(err.message); }
    finally { setIsLoading(false); }
  };

  return (
    <Layout>
      <div className="flex justify-center items-center min-h-[calc(100vh-200px)] py-12">
        <Card className="w-[420px]">
          <CardHeader>
            <CardTitle className="text-2xl">Entrar</CardTitle>
            <CardDescription>
              Entre na sua conta para acessar seus agendamentos e pets
            </CardDescription>
          </CardHeader>

          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {showResend && (
              <div className="mb-4 text-sm">
                <button type="button" onClick={handleResendEmail}
                  disabled={!email || cooldown > 0}
                  className="text-primary hover:underline disabled:opacity-50">
                  {cooldown > 0 ? `Reenviar em ${cooldown}s` : 'Reenviar e-mail de confirmação'}
                </button>
              </div>
            )}

            {suggestGroomerRole && (
              <Alert className="mb-4">
                <AlertDescription>
                  Para se cadastrar como tosador ou veterinário, faça login ou{' '}
                  <Link to="/register" className="font-medium underline" state={{ suggestGroomerRole }}>
                    registre uma nova conta
                  </Link>{' '}
                  selecionando o perfil adequado e fornecendo um código de registro válido.
                </AlertDescription>
              </Alert>
            )}

            <Tabs defaultValue="email" onValueChange={() => setError(null)}>
              <TabsList className="grid grid-cols-2 w-full mb-5">
                <TabsTrigger value="email">E-mail</TabsTrigger>
                <TabsTrigger value="phone">Telefone</TabsTrigger>
              </TabsList>

              {/* ── E-mail tab ── */}
              <TabsContent value="email">
                <form onSubmit={handleEmailSubmit}>
                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" type="email" placeholder="seu@email.com"
                        value={email} onChange={e => setEmail(e.target.value)} required />
                    </div>
                    <div className="grid gap-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password">Senha</Label>
                        <Link to="/forgot-password" className="text-sm text-primary hover:underline">
                          Esqueceu a senha?
                        </Link>
                      </div>
                      <Input id="password" type="password"
                        value={password} onChange={e => setPassword(e.target.value)} required />
                    </div>
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? 'Entrando...' : 'Entrar'}
                    </Button>
                  </div>
                </form>
              </TabsContent>

              {/* ── Telefone tab ── */}
              <TabsContent value="phone">
                <Alert className="mb-4">
                  <AlertDescription>
                    Login por número de telefone ainda não está ativo. Por favor, utilize o seu e-mail para entrar.
                  </AlertDescription>
                </Alert>
                <form onSubmit={handlePhoneSubmit}>
                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label>Telefone</Label>
                      <PhoneInput value={phone} onChange={setPhone} disabled={isLoading} />
                    </div>
                    <div className="grid gap-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="phone-password">Senha</Label>
                        <Link to="/forgot-password" className="text-sm text-primary hover:underline">
                          Esqueceu a senha?
                        </Link>
                      </div>
                      <Input id="phone-password" type="password"
                        value={phonePassword} onChange={e => setPhonePassword(e.target.value)} required />
                    </div>
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? 'Entrando...' : 'Entrar'}
                    </Button>
                  </div>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>

          <CardFooter>
            <div className="text-center w-full mt-2">
              Não tem uma conta?{' '}
              <Link to="/register" className="text-primary hover:underline" state={{ suggestGroomerRole }}>
                Registre-se
              </Link>
            </div>
          </CardFooter>
        </Card>
      </div>
    </Layout>
  );
};

export default Login;
