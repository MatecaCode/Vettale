import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Calendar, User } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { useAdminNotifications } from '@/hooks/useAdminNotifications';
import { cn } from '@/lib/utils';
import type { AdminNotification } from '@/types/supabase-extensions';

function formatDateTime(isoString: string): string {
  return new Date(isoString).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function notificationIcon(type: string) {
  if (type === 'booking_created_by_client') {
    return <Calendar className="h-5 w-5 text-brand-blue" />;
  }
  if (type === 'client_account_claimed') {
    return <User className="h-5 w-5 text-green-600" />;
  }
  return <Bell className="h-5 w-5 text-gray-400" />;
}

const NotificationRow: React.FC<{
  notification: AdminNotification;
  onRead: (id: string, deepLink: string) => void;
}> = ({ notification, onRead }) => {
  const isUnread = notification.read_at === null;

  return (
    <button
      onClick={() => onRead(notification.id, notification.deep_link)}
      className={cn(
        'w-full text-left flex items-start gap-4 px-5 py-4 border-b border-gray-100 transition-colors',
        isUnread
          ? 'bg-blue-50/50 hover:bg-blue-50'
          : 'bg-white hover:bg-gray-50',
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          'flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center',
          isUnread ? 'bg-brand-blue/10' : 'bg-gray-100',
        )}
      >
        {notificationIcon(notification.type)}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p
            className={cn(
              'text-sm leading-snug',
              isUnread ? 'font-semibold text-gray-900' : 'font-medium text-gray-700',
            )}
          >
            {notification.title}
          </p>
          <time className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0 mt-0.5">
            {formatDateTime(notification.created_at)}
          </time>
        </div>
        <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{notification.body}</p>
      </div>

      {/* Unread dot */}
      {isUnread && (
        <span className="flex-shrink-0 mt-2 h-2 w-2 rounded-full bg-brand-blue" />
      )}
    </button>
  );
};

const AdminNotifications: React.FC = () => {
  const navigate = useNavigate();
  const { notifications, unreadCount, isLoading, markRead, markAllRead } =
    useAdminNotifications();

  const handleRead = async (id: string, deepLink: string) => {
    await markRead(id);
    navigate(deepLink);
  };

  return (
    <AdminLayout>
      <div className="p-6 max-w-3xl mx-auto">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Bell className="h-6 w-6 text-brand-blue" />
              Notificações
            </h1>
            {unreadCount > 0 && (
              <p className="text-sm text-gray-500 mt-1">
                {unreadCount} não{unreadCount === 1 ? ' lida' : ' lidas'}
              </p>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={markAllRead}
              className="flex items-center gap-2 text-brand-blue border-brand-blue hover:bg-brand-blue/5"
            >
              <CheckCheck className="h-4 w-4" />
              Marcar tudo como lido
            </Button>
          )}
        </div>

        {/* Notification List */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="py-16 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-blue border-t-transparent mx-auto" />
              <p className="text-sm text-gray-400 mt-3">Carregando notificações…</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-16 text-center">
              <Bell className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-500">Nenhuma notificação ainda</p>
              <p className="text-xs text-gray-400 mt-1">
                As notificações aparecerão aqui quando clientes fizerem agendamentos ou vincularem suas contas.
              </p>
            </div>
          ) : (
            <div>
              {notifications.map((n) => (
                <NotificationRow key={n.id} notification={n} onRead={handleRead} />
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminNotifications;
