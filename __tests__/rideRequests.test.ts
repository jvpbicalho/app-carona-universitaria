import { describeDecisionError, describeRequestError, REFRESH_AFTER } from '../src/requests/requestErrors';
import {
  describeRequest,
  isActiveRequest,
  isRequestStatus,
  REQUEST_STATUSES,
  requestButtonLabel,
} from '../src/requests/requestStatus';

/**
 * Lado do app de "Solicitar vaga" (EP05). As regras de verdade (vaga, rota
 * ativa, duplicada, própria rota, concorrência) moram no banco e são testadas
 * em supabase/tests/request_seat.test.sql. Aqui: o que a tela mostra.
 */

const AGORA = new Date('2026-10-22T10:00:00');
const AMANHA = new Date('2026-10-23T08:00:00');
const ONTEM = new Date('2026-10-21T08:00:00');

describe('status', () => {
  it('são os quatro da história, espelho da constraint do banco', () => {
    expect(REQUEST_STATUSES).toEqual(['pendente', 'aceita', 'recusada', 'cancelada']);
  });

  it('isRequestStatus recusa os nomes antigos do EP03', () => {
    expect(isRequestStatus('pendente')).toBe(true);
    expect(isRequestStatus('aguardando')).toBe(false);
    expect(isRequestStatus('confirmada')).toBe(false);
    expect(isRequestStatus(null)).toBe(false);
  });

  it('pedido ativo = pendente ou aceita (é o que bloqueia pedir de novo)', () => {
    expect(isActiveRequest('pendente')).toBe(true);
    expect(isActiveRequest('aceita')).toBe(true);
    expect(isActiveRequest('recusada')).toBe(false);
    expect(isActiveRequest('cancelada')).toBe(false);
    expect(isActiveRequest(null)).toBe(false);
  });
});

describe('requestButtonLabel', () => {
  it.each([
    [null, 'Solicitar vaga'],
    ['cancelada', 'Solicitar vaga'],
    ['pendente', 'Solicitação pendente'],
    ['aceita', 'Vaga aceita'],
    ['recusada', 'Solicitação recusada'],
  ] as const)('%p → "%s"', (status, label) => {
    expect(requestButtonLabel(status)).toBe(label);
  });
});

describe('describeRequest', () => {
  const base = { routeStatus: 'publicada', departureAt: AMANHA };

  it('pendente diz que a vaga ainda não está reservada', () => {
    const d = describeRequest({ ...base, status: 'pendente' }, AGORA);
    expect(d.label).toBe('Pendente');
    expect(d.detail).toContain('ainda não está reservada');
  });

  it('aceita diz que a vaga está garantida', () => {
    expect(describeRequest({ ...base, status: 'aceita' }, AGORA).label).toBe('Aceita');
  });

  it('recusada oferece a saída: buscar outra carona', () => {
    const d = describeRequest({ ...base, status: 'recusada' }, AGORA);
    expect(d.label).toBe('Recusada');
    expect(d.detail).toContain('Busque outra carona');
  });

  it('rota cancelada prevalece sobre o status do pedido', () => {
    const d = describeRequest({ status: 'aceita', routeStatus: 'cancelada', departureAt: AMANHA }, AGORA);
    expect(d.label).toBe('Carona cancelada');
  });

  it('pendente de carona que já partiu vira "Sem resposta"', () => {
    expect(describeRequest({ ...base, status: 'pendente', departureAt: ONTEM }, AGORA).label).toBe('Sem resposta');
  });

  it('textos começam com maiúscula (regras de escrita do manual)', () => {
    for (const status of REQUEST_STATUSES) {
      const d = describeRequest({ ...base, status }, AGORA);
      expect(d.label[0]).toBe(d.label[0].toUpperCase());
      expect(d.detail[0]).toBe(d.detail[0].toUpperCase());
    }
  });
});

describe('describeRequestError', () => {
  it.each([
    ['already_requested', 'já pediu vaga'],
    ['no_seats', 'não tem mais vagas'],
    ['route_not_available', 'cancelada'],
    ['route_departed', 'já partiu'],
    ['own_route', 'é sua'],
    ['profile_incomplete', 'Complete seu perfil'],
    ['refused_before', 'já recusou seu pedido nesta carona'],
  ])('traduz o hint %s', (hint, trecho) => {
    expect(describeRequestError({ hint, message: 'erro do banco' })).toContain(trecho);
  });

  it('nunca mostra a mensagem crua do banco', () => {
    expect(describeRequestError({ message: 'duplicate key value violates unique constraint' })).toBe(
      'Não foi possível pedir a vaga agora. Tente de novo.',
    );
  });

  it('erro de rede vira mensagem de conexão', () => {
    expect(describeRequestError({ message: 'TypeError: Failed to fetch' })).toContain('Sem conexão');
  });

  it('recusado não é mandado buscar de novo a mesma rota: a lista não muda', () => {
    expect(REFRESH_AFTER.has('refused_before')).toBe(false);
  });

  it('recusas que mudam a lista disparam nova busca; duplicada não', () => {
    expect(REFRESH_AFTER.has('no_seats')).toBe(true);
    expect(REFRESH_AFTER.has('route_not_available')).toBe(true);
    expect(REFRESH_AFTER.has('already_requested')).toBe(false);
  });
});

describe('describeDecisionError (motorista aceitando ou recusando)', () => {
  it.each([
    ['not_route_driver', 'Só o motorista desta carona'],
    ['request_not_pending', 'já foi respondida'],
    ['no_seats', 'continua pendente'],
    ['route_not_available', 'cancelada'],
    ['route_departed', 'já partiu'],
  ])('traduz o hint %s', (hint, trecho) => {
    expect(describeDecisionError({ hint, message: 'erro do banco' })).toContain(trecho);
  });

  it('sem vaga diz o que fazer: a solicitação pode ser recusada', () => {
    expect(describeDecisionError({ hint: 'no_seats' })).toContain('você pode recusá-la');
  });

  it('nunca mostra a mensagem crua do banco', () => {
    expect(describeDecisionError({ message: 'permission denied for table ride_requests' })).toBe(
      'Não foi possível registrar a resposta agora. Tente de novo.',
    );
  });
});
