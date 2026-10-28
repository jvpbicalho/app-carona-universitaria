import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { useAuth } from '@/auth/AuthContext';
import {
  fetchNotifications,
  markNotificationsRead,
  subscribeToNotifications,
  type RealtimeStatus,
} from '@/notifications/notificationApi';
import { mergeNotifications, unreadCount, type AppNotification } from '@/notifications/notificationModel';

type NotificationsContextValue = {
  items: AppNotification[];
  unread: number;
  loading: boolean;
  /** Último aviso que chegou ao vivo, para o aviso flutuante. Null = nada a mostrar. */
  live: AppNotification | null;
  dismissLive: () => void;
  markAllRead: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  reload: () => Promise<void>;
  /**
   * Para ouvir avisos que chegam ao vivo (ex.: o badge do motorista recontar
   * quando chega "nova solicitação"). Devolve a função de cancelar.
   */
  onLive: (listener: (notification: AppNotification) => void) => () => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

/**
 * Avisos em tempo real (EP06).
 *
 * - Ao entrar: carrega do banco (inclui o que chegou offline) e assina o
 *   Realtime filtrado pelo próprio id.
 * - Reconexão: o cliente do Supabase reconecta o WebSocket sozinho. Quando o
 *   canal volta a SUBSCRIBED depois de ter caído, recarrega a lista — o
 *   Realtime não reenvia o que se perdeu no meio.
 * - App volta ao primeiro plano (celular) ou aba volta a ficar visível (web):
 *   recarrega também, pelo mesmo motivo.
 * - Logout: o layout de (app) desmonta este provider, e a inscrição é
 *   cancelada no cleanup. Troca de usuário idem (o efeito depende do id).
 */
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState<AppNotification | null>(null);
  const listeners = useRef(new Set<(notification: AppNotification) => void>());

  const reload = useCallback(async () => {
    if (!userId) return;
    try {
      const fresh = await fetchNotifications();
      setItems((current) => mergeNotifications(current, fresh));
    } catch {
      // Sem rede: a lista fica como está; a próxima reconexão recarrega.
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      setLive(null);
      return;
    }

    void reload();

    let wasDisconnected = false;
    const unsubscribe = subscribeToNotifications(userId, {
      onInsert: (notification) => {
        setItems((current) => mergeNotifications(current, [notification]));
        setLive(notification);
        listeners.current.forEach((listener) => listener(notification));
      },
      onStatus: (status: RealtimeStatus) => {
        if (status === 'SUBSCRIBED') {
          if (wasDisconnected) void reload();
          wasDisconnected = false;
        } else {
          wasDisconnected = true;
        }
      },
    });

    // Voltar ao app: recarrega o que pode ter chegado sem o socket ativo.
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void reload();
    });
    let onVisibility: (() => void) | null = null;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      onVisibility = () => {
        if (document.visibilityState === 'visible') void reload();
      };
      document.addEventListener('visibilitychange', onVisibility);
    }

    return () => {
      unsubscribe();
      appState.remove();
      if (onVisibility) document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [userId, reload]);

  const markAllRead = useCallback(async () => {
    const now = new Date();
    setItems((current) => current.map((item) => (item.readAt ? item : { ...item, readAt: now })));
    try {
      await markNotificationsRead();
    } catch {
      void reload();
    }
  }, [reload]);

  const markRead = useCallback(
    async (id: string) => {
      const now = new Date();
      setItems((current) => current.map((item) => (item.id === id && !item.readAt ? { ...item, readAt: now } : item)));
      try {
        await markNotificationsRead([id]);
      } catch {
        void reload();
      }
    },
    [reload],
  );

  const onLive = useCallback((listener: (notification: AppNotification) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      items,
      unread: unreadCount(items),
      loading,
      live,
      dismissLive: () => setLive(null),
      markAllRead,
      markRead,
      reload,
      onLive,
    }),
    [items, loading, live, markAllRead, markRead, reload, onLive],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsContextValue {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error('useNotifications precisa estar dentro de <NotificationsProvider>.');
  return context;
}
