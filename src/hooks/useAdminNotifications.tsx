import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AdminNotification } from '@/types/supabase-extensions';

interface UseAdminNotificationsReturn {
  notifications: AdminNotification[];
  unreadCount: number;
  isLoading: boolean;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  refresh: () => Promise<void>;
}

const RECENT_LIMIT = 50;

export function useAdminNotifications(): UseAdminNotificationsReturn {
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_admin_notifications', {
        _limit: RECENT_LIMIT,
        _offset: 0,
      });
      if (error) throw error;
      const rows = (data ?? []) as AdminNotification[];
      setNotifications(rows);
      setUnreadCount(rows.filter((n) => n.read_at === null).length);
    } catch {
      // Non-admin sessions will get an RPC error — expected, fail silently.
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchAllRef = useRef(fetchAll);
  fetchAllRef.current = fetchAll;

  // Keep V1 stable: fetch once on mount and rely on explicit refreshes/read
  // actions instead of realtime subscriptions, which are brittle in dev
  // StrictMode and can crash the admin shell if double-subscribed.
  useEffect(() => {
    fetchAllRef.current();
  }, []);

  const markRead = useCallback(
    async (id: string) => {
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id && n.read_at === null
            ? { ...n, read_at: new Date().toISOString() }
            : n,
        ),
      );
      setUnreadCount((c) => Math.max(0, c - 1));

      try {
        const { error } = await supabase.rpc('mark_admin_notification_read', {
          _notification_id: id,
        });
        if (error) throw error;
      } catch {
        fetchAllRef.current();
      }
    },
    [],
  );

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => (n.read_at === null ? { ...n, read_at: now } : n)),
    );
    setUnreadCount(0);

    try {
      const { error } = await supabase.rpc('mark_all_admin_notifications_read');
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
