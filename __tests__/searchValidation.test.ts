import { describeSearchError } from '../src/search/searchErrors';
import {
  defaultDesiredAt,
  formatDistance,
  formatTimeDifference,
  formatWindowRange,
  validateSearchForm,
  widenedWindowMinutes,
  type SearchDraft,
  type SearchLimits,
} from '../src/search/searchValidation';

/**
 * Lado do app da busca (EP04). Filtro e ordenação estão no SQL e são testados
 * em supabase/tests/search_rides.test.sql, contra o banco real.
 */

const AGORA = new Date('2026-09-30T10:00:00');

const PAULISTA = { label: 'Av. Paulista, 900', latitude: -23.5614, longitude: -46.6558 };
const PERDIZES = { label: 'PUC Perdizes', latitude: -23.53796, longitude: -46.67124 };

const VALIDA: SearchDraft = {
  origin: PAULISTA,
  destination: PERDIZES,
  desiredAt: new Date('2026-10-01T07:00:00'),
};

// Os valores iniciais de search_limits() no banco.
const LIMITES: SearchLimits = { radiusKm: 2, timeWindowMinutes: 30, maxTimeWindowMinutes: 120 };

describe('validateSearchForm', () => {
  it('aceita uma busca completa', () => {
    expect(validateSearchForm(VALIDA, AGORA)).toEqual([]);
  });

  it('exige origem, destino e horário', () => {
    const errors = validateSearchForm({ origin: null, destination: null, desiredAt: null }, AGORA);
    expect(errors.map((e) => e.field)).toEqual(['origin', 'destination', 'desiredAt']);
  });

  // Mesma regra do cadastro de rota (validatePlaces), reaproveitada.
  it('recusa destino igual à origem', () => {
    const errors = validateSearchForm({ ...VALIDA, destination: { ...PAULISTA } }, AGORA);
    expect(errors.map((e) => e.field)).toEqual(['destination']);
  });

  it('aceita "agora", com a folga de alguns minutos', () => {
    const quaseAgora = new Date(AGORA.getTime() - 3 * 60_000);
    expect(validateSearchForm({ ...VALIDA, desiredAt: quaseAgora }, AGORA)).toEqual([]);
  });

  it('recusa horário claramente no passado', () => {
    const ontem = new Date('2026-09-29T07:00:00');
    const errors = validateSearchForm({ ...VALIDA, desiredAt: ontem }, AGORA);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('já passou');
  });

  it('recusa data longe demais', () => {
    const errors = validateSearchForm({ ...VALIDA, desiredAt: new Date('2027-09-30T07:00:00') }, AGORA);
    expect(errors.map((e) => e.field)).toEqual(['desiredAt']);
  });

  it('recusa data inválida', () => {
    const errors = validateSearchForm({ ...VALIDA, desiredAt: new Date('x') }, AGORA);
    expect(errors[0].message).toContain('inválidos');
  });
});

describe('widenedWindowMinutes ("Ampliar")', () => {
  it('dobra a janela padrão', () => {
    expect(widenedWindowMinutes(30, LIMITES)).toBe(60);
  });

  it('para no teto', () => {
    expect(widenedWindowMinutes(60, LIMITES)).toBe(120);
    expect(widenedWindowMinutes(90, LIMITES)).toBe(120);
  });

  it('não oferece ampliar quem já está no teto', () => {
    expect(widenedWindowMinutes(120, LIMITES)).toBeNull();
  });

  it('segue os limites que vierem do banco, não constantes do app', () => {
    const outros: SearchLimits = { radiusKm: 5, timeWindowMinutes: 15, maxTimeWindowMinutes: 45 };
    expect(widenedWindowMinutes(15, outros)).toBe(30);
    expect(widenedWindowMinutes(30, outros)).toBe(45);
    expect(widenedWindowMinutes(45, outros)).toBeNull();
  });
});

describe('formatWindowRange', () => {
  it('mostra o intervalo coberto', () => {
    expect(formatWindowRange(new Date('2026-10-01T07:00:00'), 30)).toBe('06:30 — 07:30');
  });

  it('atravessa a meia-noite', () => {
    expect(formatWindowRange(new Date('2026-10-01T23:30:00'), 60)).toBe('22:30 — 00:30');
  });
});

describe('formatDistance', () => {
  it.each([
    [0, 'no mesmo ponto'],
    [0.04, 'no mesmo ponto'],
    [0.35, '350 m'],
    [0.537, '540 m'],
    [1, '1,0 km'],
    [1.46, '1,5 km'],
  ])('formata %p km como "%s"', (km, esperado) => {
    expect(formatDistance(km as number)).toBe(esperado);
  });
});

describe('formatTimeDifference', () => {
  it.each([
    [0, 'no horário'],
    [12, '12 min depois'],
    [-10, '10 min antes'],
    [60, '1 h depois'],
    [-75, '1 h 15 min antes'],
  ])('formata %p minutos como "%s"', (minutos, esperado) => {
    expect(formatTimeDifference(minutos as number)).toBe(esperado);
  });
});

describe('defaultDesiredAt', () => {
  it('sugere o próximo quarto de hora', () => {
    const sugerido = defaultDesiredAt(new Date('2026-09-30T10:07:42'));
    expect(sugerido.getHours()).toBe(10);
    expect(sugerido.getMinutes()).toBe(15);
    expect(sugerido.getSeconds()).toBe(0);
  });

  it('pula para o próximo quando já está num quarto exato', () => {
    const sugerido = defaultDesiredAt(new Date('2026-09-30T10:15:00'));
    expect(sugerido.getMinutes()).toBe(30);
  });

  it('vira a hora', () => {
    const sugerido = defaultDesiredAt(new Date('2026-09-30T10:50:00'));
    expect(sugerido.getHours()).toBe(11);
    expect(sugerido.getMinutes()).toBe(0);
  });

  it('nunca cai no passado', () => {
    const agora = new Date('2026-09-30T10:59:59');
    expect(defaultDesiredAt(agora).getTime()).toBeGreaterThan(agora.getTime());
  });
});

describe('describeSearchError', () => {
  it('traduz parâmetros faltando', () => {
    expect(describeSearchError({ hint: 'search_missing_params' })).toContain('origem, destino e horário');
  });

  it('traduz coordenada inválida', () => {
    expect(describeSearchError({ hint: 'search_invalid_coordinates' })).toContain('escolha-o de novo');
  });

  it('reconhece falha de rede', () => {
    expect(describeSearchError({ message: 'TypeError: Network request failed' })).toContain('Sem conexão');
  });

  it('nunca devolve SQL cru', () => {
    const msg = describeSearchError({ message: 'function public.search_rides does not exist' });
    expect(msg).not.toContain('search_rides');
  });

  it('aguenta erro nulo', () => {
    expect(describeSearchError(null)).toContain('Não foi possível');
  });
});
