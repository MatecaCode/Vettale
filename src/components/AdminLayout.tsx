import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { 
  Users, 
  Settings, 
  AlertCircle, 
  LogOut,
  Home,
  PawPrint,
  Calendar,
  UserCheck,
  BarChart3,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  FileText,
  DollarSign,
  ClipboardList
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import AdminNotificationBell from '@/components/AdminNotificationBell';

interface AdminLayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  title: string;
  href: string;
  icon: React.ReactNode;
  badge?: number;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ children }) => {
  const { user, signOut, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<string[]>(['appointments', 'staff', 'clients']);

  // Redirect if not admin
  React.useEffect(() => {
    if (user && !isAdmin) {
      navigate('/');
    }
  }, [user, isAdmin, navigate]);

  const toggleSection = (sectionTitle: string) => {
    setExpandedSections(prev => 
      prev.includes(sectionTitle) 
        ? prev.filter(s => s !== sectionTitle)
        : [...prev, sectionTitle]
    );
  };

  const navigationSections: NavSection[] = [
    {
      title: 'Appointments',
      items: [
        { title: 'Dashboard', href: '/admin', icon: <Home className="h-5 w-5" /> },
        { title: 'View Appointments', href: '/admin/appointments', icon: <Calendar className="h-5 w-5" /> },
        { title: 'Action Center', href: '/admin/actions', icon: <AlertCircle className="h-5 w-5" /> },
        { title: 'Today\'s Agenda', href: '/admin/agenda-hoje', icon: <Calendar className="h-5 w-5" /> },
        { title: 'Manual Booking', href: '/admin/manual-booking', icon: <Calendar className="h-5 w-5" /> },
      ]
    },
    {
      title: 'Staff Management',
      items: [
        { title: 'Gerenciar Contas Staff', href: '/admin/settings', icon: <Settings className="h-5 w-5" /> },
        { title: 'Availability Manager', href: '/admin/availability', icon: <UserCheck className="h-5 w-5" /> },
      ]
    },
    {
      title: 'Ajuste de Preços',
      items: [
        { title: 'Serviços & Preços', href: '/admin/pricing', icon: <DollarSign className="h-5 w-5" /> },
      ]
    },
    {
      title: 'Clients & Pets',
      items: [
        { title: 'View Clients', href: '/admin/clients', icon: <Users className="h-5 w-5" /> },
        { title: 'View Pets', href: '/admin/pets', icon: <PawPrint className="h-5 w-5" /> },
      ]
    },
    {
      title: 'System',
      items: [
        { title: 'Log de Ações', href: '/admin/action-log', icon: <ClipboardList className="h-5 w-5" /> },
        { title: 'Histórico de Edições', href: '/admin/edit-logs', icon: <FileText className="h-5 w-5" /> },
        { title: 'System Settings', href: '/admin/settings', icon: <Settings className="h-5 w-5" /> },
      ]
    }
  ];

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Acesso Negado</h1>
          <p className="text-gray-600 mb-4">Você não tem permissão para acessar esta área.</p>
          <Button onClick={() => navigate('/')} className="bg-brand-blue hover:bg-brand-dark-blue">
            Voltar ao Início
          </Button>
        </div>
      </div>
    );
  }

  const isActiveLink = (href: string) => {
    if (href === '/admin') {
      return location.pathname === '/admin';
    }
    return location.pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Header */}
      <header className="lg:hidden bg-white shadow-sm border-b">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <Link to="/admin" className="flex items-center gap-2 text-xl font-bold text-gray-900">
              <Home className="h-6 w-6 text-brand-blue" />
              <span>VetTale Admin</span>
            </Link>
            
            <div className="flex items-center gap-1">
              <AdminNotificationBell />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar Navigation */}
        <aside className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          {/* Desktop Header */}
          <div className="hidden lg:flex items-center justify-between px-6 py-6 border-b border-gray-200">
            <Link to="/admin" className="flex items-center gap-3 text-xl font-bold text-gray-900">
              <div className="h-10 w-10 bg-brand-blue/10 rounded-xl flex items-center justify-center">
                <Home className="h-6 w-6 text-brand-blue" />
              </div>
              <span>VetTale Admin</span>
            </Link>
            <AdminNotificationBell />
          </div>

          {/* Navigation */}
          <nav className="px-4 py-6 space-y-6">
            {navigationSections.map((section) => (
              <div key={section.title} className="space-y-2">
                <button
                  onClick={() => toggleSection(section.title)}
                  className="flex items-center justify-between w-full px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <span className="uppercase tracking-wide">{section.title}</span>
                  {expandedSections.includes(section.title) ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
                
                {expandedSections.includes(section.title) && (
                  <div className="ml-4 space-y-1">
                    {section.items.map((item) => (
                      <Link
                        key={item.href}
                        to={item.href}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors",
                          isActiveLink(item.href)
                            ? "bg-brand-blue text-white shadow-sm"
                            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                        )}
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        {item.icon}
                        <span>{item.title}</span>
                        {item.badge && (
                          <span className="ml-auto bg-red-100 text-red-800 text-xs font-medium px-2 py-1 rounded-full">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>

          {/* User Info */}
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 bg-brand-blue/10 rounded-lg flex items-center justify-center">
                  <Users className="h-4 w-4 text-brand-blue" />
                </div>
                <div className="text-sm">
                  <p className="font-medium text-gray-900 truncate">{user.email}</p>
                  <p className="text-xs text-brand-blue font-medium">Administrator</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => signOut()}
                className="text-gray-500 hover:text-gray-700"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </aside>

        {/* Mobile Overlay */}
        {mobileMenuOpen && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 lg:ml-0">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AdminLayout; 