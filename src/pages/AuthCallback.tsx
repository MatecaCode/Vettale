
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const AuthCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        console.log("🔄 AuthCallback started");

        const queryParams = new URLSearchParams(window.location.search);
        const error = queryParams.get('error');
        const errorDescription = queryParams.get('error_description');
        const code = queryParams.get('code');       // PKCE flow (email confirmation)
        const type = queryParams.get('type');        // e.g. "signup", "recovery"

        // Handle errors from the URL
        if (error) {
          console.error("❌ Auth error:", error, errorDescription);
          toast.error(errorDescription || 'Erro na autenticação');
          navigate('/login', { replace: true });
          return;
        }

        // PKCE code exchange — email confirmations arrive here with ?code=
        if (code) {
          console.log("🔄 Exchanging PKCE code for session (type:", type, ")");
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

          if (exchangeError) {
            console.error("❌ Code exchange error:", exchangeError);
            toast.error(exchangeError.message || 'Erro ao confirmar conta');
            navigate('/login', { replace: true });
            return;
          }

          if (data?.session) {
            console.log("✅ Session established via code exchange");
            const successMsg = type === 'signup'
              ? 'Conta confirmada com sucesso! Bem-vindo à Vettale!'
              : 'Autenticação realizada com sucesso!';
            toast.success(successMsg);
            setTimeout(() => navigate('/', { replace: true }), 500);
            return;
          }
        }

        // Fallback: check if a session already exists (OAuth / hash-based flow)
        const { data, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error("❌ Session error:", sessionError);
          throw sessionError;
        }

        if (data?.session) {
          console.log("✅ Session found via getSession");
          toast.success('Autenticação realizada com sucesso!');
          setTimeout(() => navigate('/', { replace: true }), 500);
          return;
        }

        // No session found
        console.error("❌ No session found");
        toast.error('Sessão não encontrada. Por favor, faça login.');
        navigate('/login', { replace: true });

      } catch (error: any) {
        console.error("❌ Auth callback error:", error);
        toast.error(error.message || 'Erro na autenticação');
        navigate('/login', { replace: true });
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="text-center">
        <h2 className="text-2xl font-semibold mb-4">Confirmando sua conta...</h2>
        <div className="animate-pulse text-primary">Aguarde um momento</div>
      </div>
    </div>
  );
};

export default AuthCallback;
