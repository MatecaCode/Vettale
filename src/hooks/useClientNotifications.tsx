import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { ClientNotification } from '@/types/supabase-extensions';

interface UseClientNotificationsReturn {
  notifications: ClientNotification[];
  unreadCount: number;
  isLoading: boolean;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  refresh: () => Promise<void>;
}

const RECENT_LIMIT = 50;

export function useClientNotifications(): UseClientNotificationsReturn {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<ClientNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setIsLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase.rpc('get_client_notifications', {
        _limit: RECENT_LIMIT,
        _offset: 0,
      });
      if (error) throw error;
      const rows = (data ?? []) as ClientNotification[];
      setNotifications(rows);
      setUnreadCount(rows.filter((n) => n.read_at === null).length);
    } catch {
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const fetchAllRef = useRef(fetchAll);
  fetchAllRef.current = fetchAll;

  useEffect(() => {
    fetchAllRef.current();
  }, [user?.id]);

  // Real-time: refresh when a new client_notification row is inserted for this client.
  // Depend on user.id (stable primitive) — not the user object — to avoid resubscribing
  // on every auth-context re-render, which would leak Supabase channels over time.
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`client-notifications-realtime-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'client_notifications',
        },
        () => {
          fetchAllRef.current();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const markRead = useCallback(async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id && n.read_at === null
          ? { ...n, read_at: new Date().toISOString() }
          : n,
      ),
    );
    setUnreadCount((c) => Math.max(0, c - 1));

    try {
      const { error } = await supabase.rpc('mark_client_notification_read', {
        _notification_id: id,
      });
      if (error) throw error;
    } catch {
      fetchAllRef.current();
    }
  }, []);

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => (n.read_at === null ? { ...n, read_at: now } : n)),
    );
    setUnreadCount(0);

    try {
      const { error } = await supabase.rpc('mark_all_client_notifications_read');
      if (error) throw error;
    } catch {
      fetchAllRef.current();
    }
  }, []);

  return {
    notifications,
    unreadCount,
    isLoading,
    markRead,
    markAllRead,
    refresh: fetchAll,
  };
}
