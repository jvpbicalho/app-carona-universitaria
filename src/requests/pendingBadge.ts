/**
 * Badge de solicitações pendentes do motorista (EP06) — parte pura, testável.
 *
 * O número vem sempre do banco (public.my_pending_requests_summary, derivado
 * das solicitações `pendente` nas rotas dele); aqui só se decide o que
 * mostrar e para onde o toque leva.
 */

export type PendingSummary = {
  pendingCount: number;
  routesWithPending: number;
  /** Preenchido quando todas as pendências estão numa rota só. */
  singleRouteId: string | null;
};

export const EMPTY_SUMMARY: PendingSummary = { pendingCount: 0, routesWithPending: 0, singleRouteId: null };

/** Linha da RPC → resumo. Valores estranhos viram zero (o badge some). */
export function parsePendingSummary(raw: unknown): PendingSummary {
  const row = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | null | undefined;
  if (!row || typeof row !== 'object') return EMPTY_SUMMARY;
  const count = Number(row.pending_count);
  const routes = Number(row.routes_with_pending);
  return {
    pendingCount: Number.isFinite(count) && count > 0 ? Math.floor(count) : 0,
    routesWithPending: Number.isFinite(routes) && routes > 0 ? Math.floor(routes) : 0,
    singleRouteId: typeof row.single_route_id === 'string' ? row.single_route_id : null,
  };
}

/** Só aparece com pendência: quem não tem rota (ou tem tudo respondido) não vê. */
export function shouldShowPendingBadge(summary: PendingSummary): boolean {
  return summary.pendingCount > 0;
}

/** Rótulo acessível: "3 solicitações pendentes", não só "3". */
export function pendingBadgeLabel(count: number): string {
  return count === 1 ? '1 solicitação pendente' : `${count} solicitações pendentes`;
}

export type PendingDestination = '/routes' | { pathname: '/routes/[id]'; params: { id: string } };

/**
 * Toque no badge: direto para a carona quando as pendências estão numa só
 * (onde ficam "Aceitar" e "Recusar"); senão, "Minhas caronas", que mostra
 * quantas esperam resposta em cada uma.
 */
export function pendingBadgeDestination(summary: PendingSummary): PendingDestination {
  if (summary.singleRouteId) return { pathname: '/routes/[id]', params: { id: summary.singleRouteId } };
  return '/routes';
}
