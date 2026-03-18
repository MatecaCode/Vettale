import React, { useCallback } from 'react';
import { Bell, Calendar, User, CheckCheck, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useAdminNotifications } from '@/hooks/useAdminNotifications';
import { cn } from '@/lib/utils';
import type { AdminNotification } from '@/types/supabase-extensions';

const PANEL_LIMIT = 10;

function formatRelativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${diffMin}m atrás`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h atrás`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d atrás`;
}

function typeIcon(type: string) {
  if (type === 'booking_created_by_client')
    return <Calendar className="h-4 w-4 text-brand-blue" />;
  if (type === 'client_account_claimed')
    return <User className="h-4 w-4 text-green-600" />;
  return <Bell className="h-4 w-4 text-gray-400" />;
}

const NotificationItem: React.FC<{
  notification: AdminNotification;
  onRead: (id: string, deepLink: string) => void;
}> = ({ notification, onRead }) => {
  const isUnread = notification.read_at === null;

  return (
    <button
      onClick={() => onRead(notification.id, notification.deep_link)}
      className={cn(
        'w-full text-left flex items-start gap-3 px-4 py-3.5 border-b border-gray-100 last:border-0 transition-colors',
        isUnread ? 'bg-blue-50/60 hover:bg-blue-50' : 'bg-white hover:bg-gray-50',
      )}
    >
      {/* Type icon bubble */}
      <div
        className={cn(
          'flex-shrink-0 mt-0.5 h-8 w-8 rounded-full flex items-center justify-center',
          isUnread ? 'bg-white shadow-sm ring-1 ring-gray-200' : 'bg-gray-100',
        )}
      >
        {typeIcon(notification.type)}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'text-sm leading-snug',
            isUnread ? 'font-semibold text-gray-900' : 'font-medium text-gray-600',
          )}
        >
          {notification.title}
        </p>
        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notification.body}</p>
        <p className="text-xs text-gray-400 mt-1">{formatRelativeTime(notification.created_at)}</p>
      </div>

      {/* Unread dot */}
      {isUnread && (
        <span className="flex-shrink-0 mt-2 h-2 w-2 rounded-full bg-brand-blue" />
      )}
    </button>
  );
};

const AdminNotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const { notifications, unreadCount, isLoading, markRead, markAllRead } =
    useAdminNotifications();

  const recent = notifications.slice(0, PANEL_LIMIT);
  const badgeLabel = unreadCount > 99 ? '99+' : unreadCount > 0 ? String(unreadCount) : null;

  const handleRead = useCallback(
    async (id: string, deepLink: string) => {
      await markRead(id);
      navigate(deepLink);
    },
    [markRead, navigate],
  );

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Notificações"
          className="relative text-gray-500 hover:text-gray-800 hover:bg-gray-100"
        >
          <Bell className="h-5 w-5" />
          {badgeLabel && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white leading-none">
              {badgeLabel}
            </span>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className="w-full sm:max-w-sm p-0 flex flex-col"
      >
        {/* Header */}
        <SheetHeader className="px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <Bell className="h-4 w-4 text-brand-blue" />
              Notificações
              {unreadCount > 0 && (
                <span className="text-xs font-medium text-gray-400">
                  ({unreadCount} não {unreadCount === 1 ? 'lida' : 'lidas'})
                </span>
              )}
            </SheetTitle>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-xs text-brand-blue hover:underline font-medium"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Marcar tudo como lido
              </button>
            )}
          </div>
        </SheetHeader>

        {/* Notification list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="py-16 text-center">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-brand-blue border-t-transparent mx-auto" />
              <p className="text-xs text-gray-400 mt-2">Carregando…</p>
            </div>
          ) : recent.length === 0 ? (
            <div className="py-16 text-center px-4">
              <Bell className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-500">Nenhuma notificação</p>
              <p className="text-xs text-gray-400 mt-1">
                Novos agendamentos e eventos aparecerão aqui.
              </p>
            </div>
          ) : (
            <div>
              {recent.map((n) => (
                <NotificationItem key={n.id} notification={n} onRead={handleRead} />
              ))}
            </div>
          )}
        </div>

        {/* Footer — "Mostrar todos" */}
        <div className="flex-shrink-0 border-t border-gray-100 bg-gray-50 px-5 py-3">
          <button
            onClick={() => navigate('/admin/notifications')}
            className="w-full flex items-center justify-center gap-2 text-sm font-medium text-brand-blue hover:underline py-1"
          >
            Mostrar todos
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default AdminNotificationBell;
