/**
 * Avisos do app (EP06) — parte pura, sem Supabase, para poder ser testada.
 *
 * A mesma linha de public.notifications chega por dois caminhos: a consulta
 * (lista, ao abrir o app) e o Realtime (payload.new de um INSERT, ao vivo).
 * `parseNotificationRow` normaliza os dois e descarta o que não for um aviso
 * válido — um payload estranho nunca derruba a tela.
 */

export type NotificationKind =
  | 'solicitacao_aceita'
  | 'solicitacao_recusada'
  | 'solicitacao_recebida'
  | 'rota_cancelada'
  | 'rota_alterada';

export type AppNotification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  routeId: string | null;
  requestId: string | null;
  readAt: Date | null;
  createdAt: Date;
};

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Linha do banco (snake_case) → aviso do app. Null se faltar o essencial. */
export function parseNotificationRow(raw: unknown): AppNotification | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;

  const id = asString(row.id);
  const kind = asString(row.kind);
  const title = asString(row.title);
  const body = asString(row.body);
  const createdAt = asDate(row.created_at);
  if (!id || !kind || !title || !body || !createdAt) return null;

  return {
    id,
    kind,
    title,
    body,
    routeId: asString(row.route_id),
    requestId: asString(row.request_id),
    readAt: asDate(row.read_at),
    createdAt,
  };
}

/**
 * Junta avisos novos aos que já estão na tela: sem duplicar (o mesmo aviso
 * pode chegar pelo Realtime e pela recarga depois de uma reconexão) e do mais
 * recente para o mais antigo. Se o mesmo id vier de novo, vale a versão mais
 * nova (ex.: marcado como lido).
 */
export function mergeNotifications(current: AppNotification[], incoming: AppNotification[]): AppNotification[] {
  const byId = new Map<string, AppNotification>();
  for (const item of current) byId.set(item.id, item);
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function unreadCount(items: AppNotification[]): number {
  return items.filter((item) => item.readAt === null).length;
}

/** Rótulo acessível do contador: o número sozinho não diz nada ao leitor de tela. */
export function unreadLabel(count: number): string {
  if (count === 0) return 'Nenhum aviso novo';
  return count === 1 ? '1 aviso não lido' : `${count} avisos não lidos`;
}

/** Destino de navegação, no formato que o expo-router aceita. */
export type NotificationDestination = '/requests' | { pathname: '/routes/[id]'; params: { id: string } };

/**
 * Para onde o toque no aviso leva.
 *  - aceite/recusa e avisos de rota são do passageiro → "Minhas solicitações";
 *  - solicitação recebida é do motorista → detalhe da carona, onde estão as
 *    pendentes.
 */
export function destinationFor(notification: AppNotification): NotificationDestination {
  if (notification.kind === 'solicitacao_recebida' && notification.routeId) {
    return { pathname: '/routes/[id]', params: { id: notification.routeId } };
  }
  return '/requests';
}
