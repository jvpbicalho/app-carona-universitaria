import {
  destinationFor,
  mergeNotifications,
  parseNotificationRow,
  unreadCount,
  unreadLabel,
  type AppNotification,
} from '../src/notifications/notificationModel';

/**
 * Lado do app dos avisos (EP06). Quem grava o aviso, para quem e sem
 * duplicar é o banco — testado em supabase/tests/notify_request_decision.test.sql.
 * Aqui: o payload que chega pelo Realtime e pela lista, e o que a tela faz com ele.
 */

/** Formato de `payload.new` num INSERT do Realtime (linha crua, snake_case). */
const ROW = {
  id: 'n1',
  recipient_id: 'u-passageiro',
  kind: 'solicitacao_aceita',
  route_id: 'r1',
  request_id: 'q1',
  title: 'Vaga aceita',
  body: 'Sua solicitação para a carona de 30/10 às 20:00, de A para B, foi aceita. Sua vaga está garantida.',
  payload: { route_id: 'r1', request_id: 'q1' },
  delivery_status: 'pendente',
  delivered_at: null,
  read_at: null,
  created_at: '2026-10-28T23:10:00.000Z',
};

function make(id: string, createdAt: string, readAt: string | null = null): AppNotification {
  return parseNotificationRow({ ...ROW, id, created_at: createdAt, read_at: readAt }) as AppNotification;
}

describe('parseNotificationRow (payload do Realtime e linha da lista)', () => {
  it('converte a linha crua do INSERT', () => {
    expect(parseNotificationRow(ROW)).toEqual({
      id: 'n1',
      kind: 'solicitacao_aceita',
      title: 'Vaga aceita',
      body: ROW.body,
      routeId: 'r1',
      requestId: 'q1',
      readAt: null,
      createdAt: new Date('2026-10-28T23:10:00.000Z'),
    });
  });

  it('ignora colunas que a tela não usa (recipient_id, delivery_status, payload)', () => {
    const parsed = parseNotificationRow(ROW) as unknown as Record<string, unknown>;
    expect(parsed).not.toHaveProperty('recipient_id');
    expect(parsed).not.toHaveProperty('delivery_status');
  });

  it('aceita aviso de rota, sem solicitação', () => {
    const parsed = parseNotificationRow({ ...ROW, kind: 'rota_cancelada', request_id: null });
    expect(parsed?.requestId).toBeNull();
  });

  it('lê read_at quando o aviso já foi lido', () => {
    expect(parseNotificationRow({ ...ROW, read_at: '2026-10-28T23:20:00.000Z' })?.readAt).toEqual(
      new Date('2026-10-28T23:20:00.000Z'),
    );
  });

  it.each([
    ['nulo', null],
    ['texto', 'aviso'],
    ['sem id', { ...ROW, id: undefined }],
    ['sem título', { ...ROW, title: '' }],
    ['sem mensagem', { ...ROW, body: null }],
    ['data inválida', { ...ROW, created_at: 'ontem' }],
  ])('descarta payload inválido (%s) em vez de quebrar a tela', (_nome, raw) => {
    expect(parseNotificationRow(raw)).toBeNull();
  });
});

describe('mergeNotifications', () => {
  it('não duplica o aviso que chega pelo Realtime e depois pela recarga', () => {
    const live = make('n1', '2026-10-28T23:10:00.000Z');
    const merged = mergeNotifications([live], [make('n1', '2026-10-28T23:10:00.000Z')]);
    expect(merged).toHaveLength(1);
  });

  it('a versão mais nova vence (ex.: veio marcado como lido na recarga)', () => {
    const merged = mergeNotifications(
      [make('n1', '2026-10-28T23:10:00.000Z')],
      [make('n1', '2026-10-28T23:10:00.000Z', '2026-10-28T23:30:00.000Z')],
    );
    expect(merged[0].readAt).not.toBeNull();
  });

  it('ordena do mais recente para o mais antigo', () => {
    const merged = mergeNotifications(
      [make('antigo', '2026-10-27T10:00:00.000Z')],
      [make('novo', '2026-10-28T10:00:00.000Z'), make('meio', '2026-10-27T20:00:00.000Z')],
    );
    expect(merged.map((n) => n.id)).toEqual(['novo', 'meio', 'antigo']);
  });
});

describe('não lidos', () => {
  it('conta só os sem read_at', () => {
    const items = [
      make('a', '2026-10-28T10:00:00.000Z'),
      make('b', '2026-10-28T11:00:00.000Z', '2026-10-28T12:00:00.000Z'),
      make('c', '2026-10-28T12:00:00.000Z'),
    ];
    expect(unreadCount(items)).toBe(2);
  });

  it('rótulo acessível diz o número por extenso no contexto', () => {
    expect(unreadLabel(0)).toBe('Nenhum aviso novo');
    expect(unreadLabel(1)).toBe('1 aviso não lido');
    expect(unreadLabel(3)).toBe('3 avisos não lidos');
  });
});

describe('destinationFor', () => {
  it('aceite e recusa levam o passageiro a Minhas solicitações', () => {
    expect(destinationFor(make('a', '2026-10-28T10:00:00.000Z'))).toBe('/requests');
    expect(destinationFor({ ...make('b', '2026-10-28T10:00:00.000Z'), kind: 'solicitacao_recusada' })).toBe('/requests');
  });

  it('solicitação recebida leva o motorista ao detalhe da carona (pendentes)', () => {
    const n = { ...make('c', '2026-10-28T10:00:00.000Z'), kind: 'solicitacao_recebida' };
    expect(destinationFor(n)).toEqual({ pathname: '/routes/[id]', params: { id: 'r1' } });
  });
});
