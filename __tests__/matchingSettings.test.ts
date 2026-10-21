import { describeMatchingError } from '../src/admin/matchingErrors';
import {
  formatKm,
  MAX_RADIUS_KM,
  MAX_TIME_WINDOW_MINUTES,
  MIN_RADIUS_KM,
  MIN_TIME_WINDOW_MINUTES,
  parseDecimal,
  parseInteger,
  validateMatchingSettings,
} from '../src/admin/matchingValidation';

/**
 * Lado do app das tolerâncias configuráveis (EP04). A autoridade são as
 * constraints de matching_settings, testadas no banco em
 * supabase/tests/matching_settings.test.sql; aqui é a validação antes da rede.
 */

function errorsFor(radiusKm: string, timeWindowMinutes: string): string[] {
  const result = validateMatchingSettings({ radiusKm, timeWindowMinutes });
  return result.ok ? [] : result.errors.map((e) => e.field);
}

describe('limites (espelho das constraints do banco)', () => {
  it('são 0,5–50 km e 5–240 min', () => {
    expect([MIN_RADIUS_KM, MAX_RADIUS_KM, MIN_TIME_WINDOW_MINUTES, MAX_TIME_WINDOW_MINUTES]).toEqual([
      0.5, 50, 5, 240,
    ]);
  });
});

describe('validateMatchingSettings — raio', () => {
  it.each([
    ['0,5', 'exatamente no mínimo'],
    ['0.6', 'logo acima do mínimo'],
    ['2', 'o padrão'],
    ['49,9', 'logo abaixo do máximo'],
    ['50', 'exatamente no máximo'],
    ['1,1', 'uma casa decimal (sem cair no erro de ponto flutuante)'],
  ])('aceita %s (%s)', (radius) => {
    expect(errorsFor(radius, '30')).toEqual([]);
  });

  it.each([
    ['0,4', 'logo abaixo do mínimo'],
    ['50,1', 'logo acima do máximo'],
    ['0', 'zero'],
    ['', 'vazio'],
    ['dois', 'texto'],
    ['-2', 'negativo'],
    ['1,25', 'duas casas decimais'],
  ])('recusa %s (%s)', (radius) => {
    expect(errorsFor(radius, '30')).toEqual(['radiusKm']);
  });

  it('devolve o valor convertido, com vírgula ou ponto', () => {
    expect(validateMatchingSettings({ radiusKm: '1,5', timeWindowMinutes: '45' })).toEqual({
      ok: true,
      value: { radiusKm: 1.5, timeWindowMinutes: 45 },
    });
    expect(validateMatchingSettings({ radiusKm: ' 3.5 ', timeWindowMinutes: '30' })).toEqual({
      ok: true,
      value: { radiusKm: 3.5, timeWindowMinutes: 30 },
    });
  });
});

describe('validateMatchingSettings — janela', () => {
  it.each(['5', '6', '30', '239', '240'])('aceita %s min', (window) => {
    expect(errorsFor('2', window)).toEqual([]);
  });

  it.each(['4', '241', '0', '', '30,5', 'meia hora'])('recusa "%s"', (window) => {
    expect(errorsFor('2', window)).toEqual(['timeWindowMinutes']);
  });

  it('aponta os dois campos quando os dois estão errados', () => {
    expect(errorsFor('99', '999')).toEqual(['radiusKm', 'timeWindowMinutes']);
  });

  it('a mensagem diz o intervalo aceito', () => {
    const result = validateMatchingSettings({ radiusKm: '0,1', timeWindowMinutes: '1' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].message).toBe('O raio precisa estar entre 0,5 e 50 km.');
      expect(result.errors[1].message).toBe('A janela precisa estar entre 5 e 240 minutos.');
    }
  });
});

describe('parse e formatação', () => {
  it('parseDecimal aceita vírgula e ponto, recusa o resto', () => {
    expect(parseDecimal('1,5')).toBe(1.5);
    expect(parseDecimal('2')).toBe(2);
    expect(parseDecimal('1,5 km')).toBeNull();
    expect(parseDecimal('')).toBeNull();
  });

  it('parseInteger só aceita inteiros', () => {
    expect(parseInteger('45')).toBe(45);
    expect(parseInteger('4.5')).toBeNull();
  });

  it('formatKm usa vírgula e omite ",0"', () => {
    expect(formatKm(2)).toBe('2');
    expect(formatKm(1.5)).toBe('1,5');
    expect(formatKm(0.5)).toBe('0,5');
  });
});

describe('describeMatchingError', () => {
  it('traduz o hint de quem não é admin', () => {
    expect(describeMatchingError({ message: 'x', hint: 'matching_not_admin' })).toContain(
      'Só administradores',
    );
  });

  it('traduz os hints de limite', () => {
    expect(describeMatchingError({ hint: 'matching_radius_range' })).toBe('O raio precisa estar entre 0,5 e 50 km.');
    expect(describeMatchingError({ hint: 'matching_window_range' })).toBe(
      'A janela precisa estar entre 5 e 240 minutos.',
    );
  });

  it('erro de rede vira mensagem de conexão, e o resto vira genérica', () => {
    expect(describeMatchingError({ message: 'TypeError: Failed to fetch' })).toContain('Sem conexão');
    expect(describeMatchingError({ message: 'new row violates check constraint' })).toBe(
      'Não foi possível salvar as regras agora. Tente de novo.',
    );
  });
});
