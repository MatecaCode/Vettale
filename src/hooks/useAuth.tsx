import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/utils/logger';
import { User, Session } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { translateEmailError } from '@/utils/errorMessages';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUp: (email: string, password: string, name: string, role?: string) => Promise<void>;
  sendPhoneOtp: (phone: string, name?: string) => Promise<void>;
  verifyPhoneOtp: (phone: string, token: string) => Promise<void>;
  signInWithPhonePassword: (phone: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  loading: boolean;
  rolesLoaded: boolean;
  isAdmin: boolean;
  isClient: boolean;
  isGroomer: boolean;
  isVet: boolean;
  isStaff: boolean;
  userRole: string | null;
  userRoles: string[];
  hasRole: (role: string) => boolean;
  refreshUserRoles: () => Promise<void>;
  forceRefreshUserRoles: () => Promise<void>;
  isInitialized: boolean;
  authError: string | null;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const navigate = useNavigate();

  // Computed role states based on user_roles table
  const isAdmin = userRoles.includes('admin');
  const isClient = userRoles.includes('client');
  const isGroomer = userRoles.includes('groomer');
  const isVet = userRoles.includes('vet');
  const isStaff = userRoles.includes('staff');
  
  // Primary role priority: admin > staff > groomer > vet > client
  const userRole = isAdmin ? 'admin' : 
                   isStaff ? 'staff' :
                   isGroomer ? 'groomer' : 
                   isVet ? 'vet' : 
                   isClient ? 'client' : null;

  const clearAuthError = () => {
    setAuthError(null);
  };

  const fetchUserRoles = async (userId: string): Promise<string[]> => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);
    if (error || !data?.length) return ['client'];
    return data.map(r => r.role);
  };

  const hasRole = (role: string) => {
    return userRoles.includes(role);
  };

  const refreshUserRoles = async () => {
    if (!user) return;
    
    try {
      console.log('🔄 Manually refreshing user roles for:', user.id);
      const roles = await fetchUserRoles(user.id);
      setUserRoles(roles);
      console.log('✅ User roles refreshed:', roles);
    } catch (error) {
      console.error('❌ Error refreshing user roles:', error);
      setAuthError('Erro ao atualizar roles do usuário');
    }
  };

  const forceRefreshUserRoles = async () => {
    if (!user) return;
    
    try {
      console.log('🔄🔄 FORCE refreshing user roles for:', user.id);
      // Clear current roles first
      setUserRoles([]);
      // Wait a bit then fetch fresh
      setTimeout(async () => {
        const roles = await fetchUserRoles(user.id);
        setUserRoles(roles);
        console.log('✅✅ User roles force refreshed:', roles);
      }, 100);
    } catch (error) {
      console.error('❌❌ Error force refreshing user roles:', error);
      setAuthError('Erro ao forçar atualização de roles');
    }
  };

  // Ensure a clients row exists for the signed-in user (self-registration fallback).
  const ensureClientRow = async (user: User) => {
    try {
      const { data: existing } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) return;

      await supabase
        .from('clients')
        .insert({
          user_id: user.id,
          name: user.user_metadata?.name || null,
          email: user.email || null,
          phone: user.user_metadata?.phone || null,
          admin_created: false,
        });
    } catch (err) {
      console.warn('ensureClientRow: could not create clients row', err);
    }
  };

  useEffect(() => {
    let mounted = true;
    let authTimeout: NodeJS.Timeout;
    let retryCount = 0;
    const maxRetries = 3;

    console.log('🔐 Setting up auth state listener...');

    // Set timeout to prevent infinite loading 
    authTimeout = setTimeout(() => {
      if (mounted && loading) {
        console.warn('⚠️ Auth timeout reached, setting loading to false');
        setLoading(false);
        setIsInitialized(true);
        setAuthError('Timeout ao inicializar autenticação');
      }
    }, 15000); // 15 second timeout

    const initializeAuth = async () => {
      try {
        // Get initial session first
        console.log('🔍 Getting initial session...');
        const { data: { session: initialSession }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('❌ Session error:', sessionError);
          if (mounted) {
            setSession(null);
            setUser(null);
            setUserRoles([]);
            setLoading(false);
            setIsInitialized(true);
            setAuthError(`Erro de sessão: ${sessionError.message}`);
          }
          return;
        }

        console.log('🔐 Initial session:', initialSession?.user?.email || 'No session');

        if (initialSession?.user && mounted) {
          setSession(initialSession);
          setUser(initialSession.user);
          // Frontend safety net: ensure client row exists after we have a session
          ensureClientRow(initialSession.user);
          
          // Roles are fetched exclusively by onAuthStateChange — no duplicate fetch here.
          // Having two concurrent fetchers caused a race condition: the onAuthStateChange
          // SIGNED_IN path would set ['admin'] correctly, then this retry path would finish
          // ~3 seconds later (after backoff) and overwrite with ['client'].
        } else if (mounted) {
          setSession(null);
          setUser(null);
          setUserRoles([]);
        }

        if (mounted) {
          setLoading(false);
          setIsInitialized(true);
        }

      } catch (error) {
        console.error('💥 Auth initialization error:', error);
        if (mounted) {
          setSession(null);
          setUser(null);
          setUserRoles([]);
          setLoading(false);
          setIsInitialized(true);
          setAuthError('Erro ao inicializar autenticação');
        }
      }
    };

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('🔐 Auth state changed:', event, session?.user?.email || 'No session');
        
        if (!mounted) return;

        clearTimeout(authTimeout);
        
        if (session?.user) {
          setSession(session);
          setUser(session.user);
          setAuthError(null); // Clear any previous errors
          // Ensure client row exists on successful sign-in
          if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
            ensureClientRow(session.user);
          }
          
          // Fetch roles with retry — this is the sole mechanism, so make it resilient.
          // Uses the same maxRetries as the old initializeAuth path but lives here
          // exclusively to avoid the race condition.
          (async () => {
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
              if (!mounted) return;
              try {
                const roles = await fetchUserRoles(session.user.id);
                if (mounted) { setUserRoles(roles); setRolesLoaded(true); }
                return; // success — stop retrying
              } catch (err) {
                console.warn(`⚠️ Auth event role fetch attempt ${attempt} failed`, err);
                if (attempt < maxRetries && mounted) {
                  await new Promise(r => setTimeout(r, 800 * attempt));
                }
              }
            }
            // All attempts exhausted
            if (mounted) {
              console.error('❌ All auth event role fetch attempts failed');
              setUserRoles(['client']);
              setRolesLoaded(true);
            }
          })();
        } else {
          setSession(null);
          setUser(null);
          setUserRoles([]);
          setRolesLoaded(true);
          setAuthError(null);
        }
        
        // Global redirect gate: if claim_in_progress and currently on /claim, do NOT auto-redirect elsewhere
        try {
          const claimGate = localStorage.getItem('claim_in_progress');
          const onClaimRoute = typeof window !== 'undefined' && window.location.pathname === '/claim';
          if (claimGate === '1' && onClaimRoute) {
            // Stay on claim page until password setup completes
            setLoading(false);
            return;
          }
        } catch {}

        setLoading(false);
      }
    );

    // Initialize auth
    initializeAuth();

    return () => {
      mounted = false;
      clearTimeout(authTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      setAuthError(null);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      toast.success('Login realizado com sucesso!');
      navigate('/');
    } catch (error: any) {
      console.error('Sign in error:', error);
      const translatedError = translateEmailError(error.message || 'Erro ao fazer login');
      setAuthError(translatedError);
      toast.error(translatedError);
      throw error;
    }
  };

  const signInWithGoogle = async () => {
    try {
      setAuthError(null);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) throw error;
    } catch (error: any) {
      console.error('Google sign in error:', error);
      setAuthError(error.message || 'Erro ao fazer login com Google');
      toast.error(error.message || 'Erro ao fazer login com Google');
      throw error;
    }
  };

  const signUp = async (email: string, password: string, name: string, role: string = 'client') => {
    try {
      setAuthError(null);
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            role, // This will be used by the handle_new_user trigger
          },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) throw error;

      toast.success('Conta criada com sucesso! Verifique seu email. Se não encontrar o email, verifique sua pasta de spam.');
      navigate('/login');
    } catch (error: any) {
      console.error('Sign up error:', error);
      const translatedError = translateEmailError(error.message || 'Erro ao criar conta');
      setAuthError(translatedError);
      toast.error(translatedError);
      throw error;
    }
  };

  const sendPhoneOtp = async (phone: string, name?: string): Promise<void> => {
    try {
      setAuthError(null);
      const { error } = await supabase.auth.signInWithOtp({
        phone,
        options: name ? { data: { name } } : undefined,
      });
      if (error) throw error;
    } catch (error: any) {
      console.error('Send phone OTP error:', error);
      const msg = translateEmailError(error.message || 'Erro ao enviar código SMS');
      setAuthError(msg);
      toast.error(msg);
      throw error;
    }
  };

  const signInWithPhonePassword = async (phone: string, password: string): Promise<void> => {
    try {
      setAuthError(null);
      const { error } = await supabase.auth.signInWithPassword({ phone, password });
      if (error) throw error;
      toast.success('Login realizado com sucesso!');
      navigate('/');
    } catch (error: any) {
      console.error('Phone password sign in error:', error);
      const msg = translateEmailError(error.message || 'Erro ao fazer login');
      setAuthError(msg);
      toast.error(msg);
      throw error;
    }
  };

  const verifyPhoneOtp = async (phone: string, token: string): Promise<void> => {
    try {
      setAuthError(null);
      const { error } = await supabase.auth.verifyOtp({
        phone,
        token,
        type: 'sms',
      });
      if (error) throw error;
      toast.success('Login realizado com sucesso!');
      navigate('/');
    } catch (error: any) {
      console.error('Verify phone OTP error:', error);
      const msg = translateEmailError(error.message || 'Código inválido ou expirado');
      setAuthError(msg);
      toast.error(msg);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      console.log('🚪 Starting logout process...');
      setAuthError(null);
      
      // Clear local state immediately to prevent UI issues
      setUser(null);
      setSession(null);
      setUserRoles([]);

      // Try multiple logout approaches to handle edge cases
      try {
        // First attempt: standard logout
        await supabase.auth.signOut();
        console.log('✅ Standard logout successful');
      } catch (standardError: any) {
        console.warn('⚠️ Standard logout failed, trying global logout:', standardError);
        
        try {
          // Second attempt: global logout
          await supabase.auth.signOut({ scope: 'global' });
          console.log('✅ Global logout successful');
        } catch (globalError: any) {
          console.warn('⚠️ Global logout also failed:', globalError);
          
          // Third attempt: Clear session locally and continue
          // This handles cases where the server session is already invalid
          if (globalError.message?.includes('session_not_found') || 
              globalError.message?.includes('Session not found') ||
              globalError.status === 403) {
            console.log('🔄 Session already invalid on server, proceeding with local cleanup');
          } else {
            throw globalError; // Re-throw if it's a different error
          }
        }
      }

      toast.success('Logout realizado com sucesso!');
      
      // Navigate immediately after clearing state
      navigate('/', { replace: true });
      
    } catch (error: any) {
      console.error('💥 Sign out error:', error);
      setAuthError(error.message || 'Erro ao fazer logout');
      
      // Even if there's an error, ensure we clear state and redirect
      // This prevents users from being stuck in a broken auth state
      setUser(null);
      setSession(null);
      setUserRoles([]);
      
      // Show a gentle message but still navigate
      toast.success('Sessão encerrada');
      navigate('/', { replace: true });
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        signIn,
        signInWithGoogle,
        signUp,
        sendPhoneOtp,
        verifyPhoneOtp,
        signInWithPhonePassword,
        signOut,
        loading,
        rolesLoaded,
        isAdmin,
        isClient,
        isGroomer,
        isVet,
        isStaff,
        userRole,
        userRoles,
        hasRole,
        refreshUserRoles,
        forceRefreshUserRoles,
        isInitialized,
        authError,
        clearAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
};
