
import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Navigation from './Navigation';
import Footer from './Footer';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/utils/logger';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const { user, userRole, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Role-based redirects using the centralized userRole from user_roles table
  useEffect(() => {
    // Don't redirect while auth is loading
    if (loading || !user || !userRole) return;
    
    log.debug('Layout - User role:', userRole, 'Current path:', location.pathname);
    
    // Check if user is staff and redirect to staff dashboard
    const checkStaffRedirect = async () => {
      if (location.pathname !== '/') return;
      
      const { data: profile } = await supabase.from('staff_profiles')
        .select('id').eq('user_id', user.id).maybeSingle();
      
      if (profile || userRole === 'groomer' || userRole === 'vet') {
        navigate('/staff-dashboard');
      }
    };
    
    checkStaffRedirect();
    
    // Clients and admins stay on whatever page they're on
  }, [user, userRole, location.pathname, navigate, loading]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navigation />
      <main className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
};

export default Layout;
