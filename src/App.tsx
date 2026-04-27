
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useEffect, lazy, Suspense, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import Index from "./pages/Index";
import Services from "./pages/Services";
import Book from "./pages/Book";
import Appointments from "./pages/Appointments";
import Confirmation from "./pages/Confirmation";
import BookingSuccess from '@/components/BookingSuccess';
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Register from "./pages/Register";
import StaffProfile from "./pages/StaffProfile";
import Shop from "./pages/Shop";
import Cart from "./pages/Cart";
import About from "./pages/About";
import AuthCallback from "./pages/AuthCallback";
import AuthExpired from "./pages/AuthExpired";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import GroomerDashboard from "./pages/GroomerDashboard";
import GroomerCalendar from "./pages/GroomerCalendar";
import GroomerSchedule from "./pages/GroomerSchedule";
import VetCalendar from "./pages/VetCalendar";
import StaffDashboard from "./pages/StaffDashboard";
import StaffAvailability from "./pages/StaffAvailability";
import StaffCalendar from "./pages/StaffCalendar";
import AdminActionCenter from "./pages/AdminActionCenter";
import AdminSettings from "./pages/AdminSettings";
import AdminEditLogs from "./pages/AdminEditLogs";
import AdminManualBooking from "./pages/AdminManualBooking";
import AdminAppointments from "./pages/AdminAppointments";
import StatusCenter from "./pages/StatusCenter";
import AdminAvailabilityManager from "./pages/AdminAvailabilityManager";
import AdminBookingPage from "./pages/AdminBookingPage";
import AdminDebugAvailability from "./pages/AdminDebugAvailability";
import AdminEditBooking from "./pages/AdminEditBooking";
import AdminClients from "./pages/AdminClients";
import AdminPets from "./pages/AdminPets";
import AdminBookingSuccess from "./pages/AdminBookingSuccess";
import AdminAgendaHoje from "./pages/AdminAgendaHoje";
import AdminStaffAvailability from "./pages/AdminStaffAvailability";
import AdminNotifications from "./pages/AdminNotifications";
import AdminActionLog from "./pages/AdminActionLog";
import EditServicePricing from "./pages/EditServicePricing";
import AdminPricing from "./pages/AdminPricing";
import AdminFinancials from "./pages/AdminFinancials";
import { AuthProvider } from "./hooks/useAuth";
import TestDataPage from "./pages/TestDataPage";
import GroomerAvailability from './pages/GroomerAvailability';
import Claim from "./pages/Claim";
import StaffClaim from "./pages/StaffClaim";
import FloatingWhatsappCTA from "@/components/cta/FloatingWhatsappCTA";
import ErrorBoundary from "@/components/ErrorBoundary";

// Lazy load heavy components for better performance on low-spec PCs
const Profile = lazy(() => import("./pages/Profile"));
const Pets = lazy(() => import("./pages/Pets"));
const PetFormPage = lazy(() => import('./pages/PetFormPage'));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Quick sanity asserts
console.log("[ENV] URL:", import.meta.env.VITE_SUPABASE_URL);
console.log("[ENV] Anon present:", !!import.meta.env.VITE_SUPABASE_ANON_KEY);

// Catch chunk-load failures (e.g., stale cache referencing a deleted hashed file)
const CHUNK_RELOAD_GUARD = 'vettale_chunk_reload_attempt';

function ChunkErrorCatcher() {
  useEffect(() => {
    const isChunkError = (reason: any) => {
      const msg = String(reason?.message || reason || '');
      return /Failed to fetch dynamically imported module|Importing a module script failed|module script: Expected a JavaScript module script but the server responded with a MIME type of "text\/html"|Unexpected token ['']?export['"]?|Cannot use import statement/i.test(msg);
    };

    // Guard: only reload once per session to prevent infinite loops when
    // the error is not actually caused by a stale chunk (e.g. a build bug).
    const tryReload = () => {
      try {
        if (!sessionStorage.getItem(CHUNK_RELOAD_GUARD)) {
          sessionStorage.setItem(CHUNK_RELOAD_GUARD, String(Date.now()));
          window.location.reload();
        }
      } catch {}
    };

    const onUnhandledRejection = (ev: PromiseRejectionEvent) => {
      if (isChunkError(ev?.reason)) {
        try { ev.preventDefault?.(); } catch {}
        tryReload();
      }
    };

    const onWindowError = (ev: ErrorEvent) => {
      if (isChunkError(ev?.error)) {
        tryReload();
      }
    };

    window.addEventListener('unhandledrejection', onUnhandledRejection as any);
    window.addEventListener('error', onWindowError);
    return () => {
      window.removeEventListener('unhandledrejection', onUnhandledRejection as any);
      window.removeEventListener('error', onWindowError);
    };
  }, []);
  return null;
}

// Early redirect for Supabase auth errors present in URL hash (avoid homepage flicker)
if (typeof window !== 'undefined') {
  const errorHash = window.location.hash || '';
  if (errorHash && /(error_code=otp_expired|error_description=.*expired|error=access_denied)/i.test(errorHash)) {
    console.warn('[GLOBAL_TOKEN_CATCHER] Expired/invalid auth link detected in URL hash; redirecting to /login');
    window.history.replaceState({}, document.title, '/login');
  }
}

// Wraps a lazy route in its own ErrorBoundary so a render crash in one page
// doesn't force a full-app reset via the root boundary.
const LazyRoute = ({ children }: { children: ReactNode }) => (
  <ErrorBoundary>
    <Suspense fallback={<LoadingSkeleton />}>{children}</Suspense>
  </ErrorBoundary>
);

// Loading skeleton for lazy components
const LoadingSkeleton = () => (
  <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#E7F0FF] via-white to-[#F1F5F9]">
    <div className="text-center space-y-6">
      <div className="animate-spin rounded-full h-12 w-12 border-3 border-[#6BAEDB] border-t-[#2B70B2] mx-auto"></div>
      <p className="text-lg font-medium text-[#1A4670]">Carregando...</p>
    </div>
  </div>
);

// ScrollToTop component to handle scroll restoration
function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    // Scroll to top when pathname changes
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

// Global token catcher for auth invite links
function GlobalTokenCatcher() {
  useEffect(() => {
    const processAuthFromUrl = async () => {
      try {
        const { search, hash, pathname } = window.location;

        // Hash-based error from Supabase (expired/invalid link)
        if (hash && /(error_code=otp_expired|error_description=.*expired|error=access_denied)/i.test(hash)) {
          console.warn('[GLOBAL_TOKEN_CATCHER] Hash error detected; redirecting to /login');
          window.history.replaceState({}, document.title, '/login');
          return;
        }

        // v2 OAuth code flow in query string
        const hasOAuthQuery = !!search && /[?&](code|state)=/.test(search);
        if (hasOAuthQuery && typeof (supabase.auth as any).exchangeCodeForSession === 'function') {
          console.log('🔗 [GLOBAL_TOKEN_CATCHER] OAuth code/state detected in URL search');
          const { error } = await (supabase.auth as any).exchangeCodeForSession(search);
          if (error) {
            console.warn('⚠️ [GLOBAL_TOKEN_CATCHER] exchangeCodeForSession error', error);
            const msg = String(error?.message || '').toLowerCase();
            if (msg.includes('expired') || msg.includes('invalid') || msg.includes('invalid_grant')) {
              // Clean URL and route to expired page
              window.history.replaceState({}, document.title, pathname);
              window.location.assign('/auth/expired');
              return;
            }
          } else {
            console.log('✅ [GLOBAL_TOKEN_CATCHER] Session established via exchangeCodeForSession');
          }
          // Clean query params (keep path only)
          window.history.replaceState({}, document.title, pathname);
          return;
        }

        // Legacy hash tokens (email links, older flows). Do not call removed v1 helper.
        const hasHashTokens = !!hash && /(access_token=|type=)/.test(hash);
        if (hasHashTokens) {
          console.log('🔗 [GLOBAL_TOKEN_CATCHER] Auth tokens detected in URL hash');
          // Avoid racing with the Claim page token handler; let /claim own the flow
          const onClaimRoute = pathname.startsWith('/claim');
          if (onClaimRoute) {
            console.log('⏩ [GLOBAL_TOKEN_CATCHER] On /claim — delegating token processing to Claim.tsx');
            return;
          }
          // For non-claim routes, clean hash to avoid leaking tokens in URL
          setTimeout(() => {
            window.history.replaceState({}, document.title, pathname + search);
            console.log('🧹 [GLOBAL_TOKEN_CATCHER] URL hash cleared');
          }, 0);
          return;
        }
      } catch (e) {
        console.error('[GLOBAL_TOKEN_CATCHER] processAuthFromUrl failed', e);
      }
    };

    processAuthFromUrl();
  }, []);

  return null;
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <BrowserRouter>
            <AuthProvider>
            <ScrollToTop />
            <ChunkErrorCatcher />
            <GlobalTokenCatcher />
            <FloatingWhatsappCTA />
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/about" element={<About />} />
              <Route path="/services" element={<Services />} />
              <Route path="/book" element={<Book />} />
              <Route path="/booking-success" element={<BookingSuccess />} />
              <Route path="/appointments" element={<Appointments />} />
              <Route path="/pets" element={<LazyRoute><Pets /></LazyRoute>} />
              <Route path="/pets/new" element={<LazyRoute><PetFormPage /></LazyRoute>} />
              <Route path="/pets/edit/:petId" element={<LazyRoute><PetFormPage /></LazyRoute>} />
              <Route path="/shop" element={<Shop />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/profile" element={<LazyRoute><Profile /></LazyRoute>} />
              <Route path="/staff-profile" element={<StaffProfile />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/confirmation" element={<Confirmation />} />
              <Route path="/claim" element={<Claim />} />
              <Route path="/staff/claim" element={<StaffClaim />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/auth/expired" element={<AuthExpired />} />
              <Route path="/groomer-dashboard" element={<GroomerDashboard />} />
              <Route path="/groomer-calendar" element={<GroomerCalendar />} />
              <Route path="/groomer-schedule" element={<GroomerSchedule />} />
              <Route path="/groomer-availability" element={<GroomerAvailability />} />
              <Route path="/vet-calendar" element={<VetCalendar />} />
              <Route path="/staff-dashboard" element={<StaffDashboard />} />
              <Route path="/staff-availability" element={<StaffAvailability />} />
              <Route path="/staff-calendar" element={<StaffCalendar />} />
              
              {/* Admin Routes - 3-Tiered Structure */}
              <Route path="/admin" element={<LazyRoute><AdminDashboard /></LazyRoute>} />
              <Route path="/admin/dashboard" element={<LazyRoute><AdminDashboard /></LazyRoute>} />
              <Route path="/admin/actions" element={<AdminActionCenter />} />
              <Route path="/admin/appointments" element={<AdminAppointments />} />
              <Route path="/admin/edit-booking/:appointmentId" element={<AdminEditBooking />} />
              <Route path="/admin/manual-booking" element={<AdminManualBooking />} />
              <Route path="/admin/booking-success" element={<AdminBookingSuccess />} />
              <Route path="/admin/settings" element={<AdminSettings />} />
              <Route path="/admin/pricing" element={<AdminPricing />} />
              {/* Redirect legacy path for pricing under settings to new route */}
              <Route path="/admin/settings/pricing" element={<AdminPricing />} />
              <Route path="/admin/services/:serviceId/edit-pricing" element={<EditServicePricing />} />
              {/* Remove redundant Staff Availability page; keep safe redirect */}
              <Route path="/admin/staff/:id/availability" element={<AdminAvailabilityManager />} />
              <Route path="/admin/staff-availability" element={<AdminAvailabilityManager />} />
              <Route path="/admin/clients" element={<AdminClients />} />
              <Route path="/admin/pets" element={<AdminPets />} />
              <Route path="/admin/edit-logs" element={<AdminEditLogs />} />
              <Route path="/admin/agenda-hoje" element={<AdminAgendaHoje />} />
              <Route path="/admin/notifications" element={<AdminNotifications />} />
              <Route path="/admin/action-log" element={<AdminActionLog />} />
              <Route path="/admin/financials" element={<AdminFinancials />} />
              <Route path="/admin/debug/availability/:providerId/:date" element={<AdminDebugAvailability />} />
              
              {/* Legacy Admin Routes (keeping for compatibility) */}
              <Route path="/admin/booking" element={<LazyRoute><AdminBookingPage /></LazyRoute>} />
              <Route path="/admin/availability" element={<AdminAvailabilityManager />} />
              <Route path="/status" element={<StatusCenter />} />
              <Route path="/test-data" element={<TestDataPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
