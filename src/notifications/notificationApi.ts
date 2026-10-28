import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import { parseNotificationRow, type AppNotification } from '@/notifications/notificationModel';

const COLUMNS = 'id, kind, title, body, route_id, request_id, read_at, created_at';

/**
 * Avisos do usuário, mais recentes primeiro. A RLS só devolve os próprios.
 * É também o que "recupera" o que chegou com o app fechado ou offline: o
 * Realtime não reenvia eventos perdidos, então a lista sempre vem do banco.
 */
export async function fetchNotifications(limit = 50): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(parseNotificationRow).filter((item): item is AppNotification => item !== null);
}

/** Marca como lidas (todas, ou só os ids). O banco só deixa mexer nas próprias. */
export async function markNotificationsRead(ids?: string[]): Promise<number> {
  const { data, error } = await supabase.rpc('mark_notifications_read', { p_ids: ids ?? null });
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

export type RealtimeStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR';

/**
 * Assina, por WebSocket, os avisos novos do usuário.
 *
 * Filtro `recipient_id=eq.<id>` reduz o tráfego; quem garante a privacidade é
 * a RLS de SELECT, que o Realtime aplica ao assinante. `onStatus` informa a
 * reconexão (o cliente do Supabase reconecta sozinho): ao voltar a
 * SUBSCRIBED, quem chamou recarrega a lista para pegar o que se perdeu.
 *
 * Devolve a função que cancela a inscrição (logout, troca de usuário).
 */
export function subscribeToNotifications(
  userId: string,
  handlers: {
    onInsert: (notification: AppNotification) => void;
    onStatus?: (status: RealtimeStatus) => void;
  },
): () => void {
  const channel: RealtimeChannel = supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` },
      (payload) => {
        const notification = parseNotificationRow(payload.new);
        if (notification) handlers.onInsert(notification);
      },
    )
    .subscribe((status) => handlers.onStatus?.(status as RealtimeStatus));

  return () => {
    void supabase.removeChannel(channel);
  };
}
