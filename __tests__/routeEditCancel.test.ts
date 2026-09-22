import { describeRouteError } from '../src/routes/routeErrors';
import {
  canModifyRoute,
  cancellationReasonText,
  FORM_FIELD,
  routeChanges,
  validateCancellation,
  validateRouteEdit,
  type ExistingRoute,
  type GeoPoint,
  type RouteEditDraft,
} from '../src/routes/routeValidation';

// Instante fixo, pelo mesmo motivo dos testes de cadastro.
const AGORA = new Date('2026-09-22T10:00:00');

const PAULISTA: GeoPoint = { label: 'Av. Paulista, 900', latitude: -23.5614, longitude: -46.6558 };
const PERDIZES: GeoPoint = { label: 'PUC Perdizes', latitude: -23.53796, longitude: -46.67124 };
const VILA_MARIANA: GeoPoint = { label: 'Metrô Vila Mariana', latitude: -23.5893, longitude: -46.6346 };

const ROTA: ExistingRoute = {
  status: 'publicada',
  departureAt: new Date('2026-09-25T07:30:00'),
  origin: PAULISTA,
  destination: PERDIZES,
};

/** Rascunho idêntico à rota salva — ponto de partida de cada teste. */
function semMudancas(): RouteEditDraft {
  return {
    origin: { ...ROTA.origin },
    destination: { ...ROTA.destination },
    departureAt: new Date(ROTA.departureAt),
  };
}

describe('canModifyRoute', () => {
  it('permite rota publicada que ainda não partiu', () => {
    expect(canModifyRoute(ROTA, AGORA)).toEqual({ ok: true });
  });

  it('bloqueia rota cancelada', () => {
    const result = canModifyRoute({ ...ROTA, status: 'cancelada' }, AGORA);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('cancelada');
  });

  it('bloqueia rota concluída', () => {
    expect(canModifyRoute({ ...ROTA, status: 'concluida' }, AGORA).ok).toBe(false);
  });

  it('bloqueia rota que já partiu', () => {
    const result = canModifyRoute({ ...ROTA, departureAt: new Date('2026-09-22T09:00:00') }, AGORA);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('já partiu');
  });

  it('bloqueia no exato instante da partida', () => {
    expect(canModifyRoute({ ...ROTA, departureAt: AGORA }, AGORA).ok).toBe(false);
  });
});

describe('routeChanges', () => {
  it('não detecta mudança num rascunho idêntico', () => {
    expect(routeChanges(ROTA, semMudancas())).toEqual([]);
  });

  it('detecta troca de horário', () => {
    const draft = { ...semMudancas(), departureAt: new Date('2026-09-25T08:00:00') };
    expect(routeChanges(ROTA, draft)).toEqual(['departureAt']);
  });

  it('detecta troca de origem e destino, na ordem do formulário', () => {
    const draft = { ...semMudancas(), origin: VILA_MARIANA, destination: PAULISTA };
    expect(routeChanges(ROTA, draft)).toEqual(['origin', 'destination']);
  });

  it('trata mesmo rótulo com coordenada diferente como mudança', () => {
    const draft = { ...semMudancas(), origin: { ...PAULISTA, latitude: -23.57 } };
    expect(routeChanges(ROTA, draft)).toEqual(['origin']);
  });
});

describe('validateRouteEdit', () => {
  it('aceita troca de horário para o futuro', () => {
    const draft = { ...semMudancas(), departureAt: new Date('2026-09-26T07:30:00') };
    expect(validateRouteEdit(ROTA, draft, AGORA)).toEqual([]);
  });

  // Mesma regra do cadastro, reaproveitada.
  it('barra novo horário no passado', () => {
    const draft = { ...semMudancas(), departureAt: new Date('2026-09-21T07:30:00') };
    const errors = validateRouteEdit(ROTA, draft, AGORA);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('departureAt');
    expect(errors[0].message).toContain('passado');
  });

  it('usa a mesma mensagem de horário passado do cadastro', () => {
    const draft = { ...semMudancas(), departureAt: new Date('2026-09-21T07:30:00') };
    expect(validateRouteEdit(ROTA, draft, AGORA)[0].message).toBe(
      'O horário de saída não pode ser no passado.',
    );
  });

  it('não reclama do horário quando só a origem mudou', () => {
    // A rota sai em 1 minuto: o horário é futuro, mas quase. Mudar só a origem
    // não pode gerar erro sobre um horário que o motorista nem tocou.
    const quaseSaindo = { ...ROTA, departureAt: new Date('2026-09-22T10:01:00') };
    const draft = {
      origin: VILA_MARIANA,
      destination: { ...PERDIZES },
      departureAt: new Date(quaseSaindo.departureAt),
    };
    expect(validateRouteEdit(quaseSaindo, draft, AGORA)).toEqual([]);
  });

  it('avisa quando não há nada para salvar', () => {
    const errors = validateRouteEdit(ROTA, semMudancas(), AGORA);
    expect(errors).toEqual([{ field: FORM_FIELD, message: 'Nenhuma alteração para salvar.' }]);
  });

  it('exige origem e destino selecionados', () => {
    const draft = { ...semMudancas(), origin: null, destination: null };
    expect(validateRouteEdit(ROTA, draft, AGORA).map((e) => e.field)).toEqual([
      'origin',
      'destination',
    ]);
  });

  it('barra destino igual à origem', () => {
    const draft = { ...semMudancas(), destination: { ...PAULISTA } };
    expect(validateRouteEdit(ROTA, draft, AGORA).map((e) => e.field)).toEqual(['destination']);
  });

  it('recusa editar rota cancelada, com erro de formulário', () => {
    const draft = { ...semMudancas(), departureAt: new Date('2026-09-26T07:30:00') };
    const errors = validateRouteEdit({ ...ROTA, status: 'cancelada' }, draft, AGORA);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe(FORM_FIELD);
  });

  it('recusa editar rota que já partiu antes de olhar o resto', () => {
    const partiu = { ...ROTA, departureAt: new Date('2026-09-22T09:00:00') };
    const errors = validateRouteEdit(partiu, { ...semMudancas(), origin: null }, AGORA);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('já partiu');
  });
});

describe('cancellationReasonText', () => {
  it('usa o rótulo do motivo da lista', () => {
    expect(cancellationReasonText('veiculo', null)).toBe('Problema com o veículo');
  });

  it('usa o texto digitado quando o motivo é "outro"', () => {
    expect(cancellationReasonText('outro', '  Greve do metrô  ')).toBe('Greve do metrô');
  });

  it('ignora texto digitado quando o motivo é da lista', () => {
    expect(cancellationReasonText('imprevisto', 'texto sobrando')).toBe('Imprevisto pessoal');
  });
});

describe('validateCancellation', () => {
  it('aceita motivo da lista', () => {
    expect(validateCancellation(ROTA, 'transito', null, AGORA)).toEqual([]);
  });

  it('exige motivo', () => {
    const errors = validateCancellation(ROTA, null, null, AGORA);
    expect(errors).toEqual([{ field: 'reason', message: 'Selecione o motivo do cancelamento.' }]);
  });

  it('exige descrição quando o motivo é "outro"', () => {
    expect(validateCancellation(ROTA, 'outro', '  ', AGORA).map((e) => e.field)).toEqual([
      'otherReason',
    ]);
  });

  it('aceita "outro" com descrição', () => {
    expect(validateCancellation(ROTA, 'outro', 'Greve do metrô', AGORA)).toEqual([]);
  });

  it('recusa descrição longa demais', () => {
    expect(validateCancellation(ROTA, 'outro', 'x'.repeat(201), AGORA).map((e) => e.field)).toEqual([
      'otherReason',
    ]);
  });

  it('recusa cancelar rota já cancelada', () => {
    const errors = validateCancellation({ ...ROTA, status: 'cancelada' }, 'imprevisto', null, AGORA);
    expect(errors[0].field).toBe(FORM_FIELD);
  });

  it('recusa cancelar rota que já partiu', () => {
    const partiu = { ...ROTA, departureAt: new Date('2026-09-22T09:00:00') };
    expect(validateCancellation(partiu, 'imprevisto', null, AGORA)[0].message).toContain('já partiu');
  });
});

describe('describeRouteError', () => {
  it.each([
    ['route_not_editable', 'não pode mais ser alterada'],
    ['route_already_departed', 'já partiu'],
    ['cancel_with_changes', 'não os dois'],
    ['seats_taken_managed', 'solicitação é confirmada'],
    ['departure_in_past', 'passado'],
    ['profile_incomplete', 'Complete seu perfil'],
  ])('traduz o hint %s', (hint, trecho) => {
    expect(describeRouteError({ hint, message: 'qualquer' })).toContain(trecho);
  });

  it('traduz a constraint de motivo obrigatório, que não tem hint', () => {
    const error = {
      message: 'new row for relation "routes" violates check constraint "routes_cancellation_reason_consistency"',
      hint: null,
    };
    expect(describeRouteError(error)).toBe('Informe o motivo do cancelamento.');
  });

  it('nunca devolve SQL cru', () => {
    const error = { message: 'relation "routes" does not exist', hint: null };
    expect(describeRouteError(error)).not.toContain('relation');
  });

  it('usa o fallback de quem chamou', () => {
    expect(describeRouteError({ message: 'erro estranho' }, 'Não foi possível cancelar.')).toBe(
      'Não foi possível cancelar.',
    );
  });
});
