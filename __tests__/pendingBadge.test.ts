import {
  EMPTY_SUMMARY,
  parsePendingSummary,
  pendingBadgeDestination,
  pendingBadgeLabel,
  shouldShowPendingBadge,
} from '../src/requests/pendingBadge';

/**
 * Badge de pendências do motorista (EP06). A contagem em si (depois de
 * solicitar, aceitar, recusar e encerrar; A não vê as de B) é do banco —
 * supabase/tests/notify_new_request.test.sql. Aqui: o que o app faz com ela.
 */

describe('parsePendingSummary (resposta da RPC my_pending_requests_summary)', () => {
  it('lê a linha que a RPC devolve (array de uma linha)', () => {
    expect(
      parsePendingSummary([{ pending_count: 3, routes_with_pending: 2, single_route_id: null }]),
    ).toEqual({ pendingCount: 3, routesWithPending: 2, singleRouteId: null });
  });

  it('lê a rota única quando todas as pendências estão nela', () => {
    expect(parsePendingSummary({ pending_count: 2, routes_with_pending: 1, single_route_id: 'r1' }).singleRouteId).toBe('r1');
  });

  it.each([
    ['vazio', []],
    ['nulo', null],
    ['contagem estranha', [{ pending_count: 'muitas', routes_with_pending: 1 }]],
    ['negativo', [{ pending_count: -1, routes_with_pending: 0 }]],
  ])('resposta inválida (%s) vira zero, e o badge some', (_nome, raw) => {
    const summary = parsePendingSummary(raw);
    expect(summary.pendingCount).toBe(0);
    expect(shouldShowPendingBadge(summary)).toBe(false);
  });
});

describe('quando o badge aparece', () => {
  it('some quando é zero (inclui quem não tem rotas)', () => {
    expect(shouldShowPendingBadge(EMPTY_SUMMARY)).toBe(false);
  });

  it('aparece com uma pendência ou mais', () => {
    expect(shouldShowPendingBadge({ pendingCount: 1, routesWithPending: 1, singleRouteId: 'r1' })).toBe(true);
  });
});

describe('pendingBadgeLabel (rótulo acessível)', () => {
  it('diz o número com o que ele conta', () => {
    expect(pendingBadgeLabel(1)).toBe('1 solicitação pendente');
    expect(pendingBadgeLabel(3)).toBe('3 solicitações pendentes');
  });
});

describe('pendingBadgeDestination', () => {
  it('pendências numa rota só: direto para o detalhe dela (onde se aceita/recusa)', () => {
    expect(pendingBadgeDestination({ pendingCount: 2, routesWithPending: 1, singleRouteId: 'r1' })).toEqual({
      pathname: '/routes/[id]',
      params: { id: 'r1' },
    });
  });

  it('pendências em várias rotas: Minhas caronas, que mostra a contagem de cada uma', () => {
    expect(pendingBadgeDestination({ pendingCount: 3, routesWithPending: 2, singleRouteId: null })).toBe('/routes');
  });
});
