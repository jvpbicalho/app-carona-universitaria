import {
  attemptsLeftMessage,
  describeSignUpError,
  formatDuration,
  lockedMessage,
} from '../src/auth/authErrors';

describe('formatDuration', () => {
  // Tupla tipada de propósito: sem isso o it.each infere number|string e a
  // chamada de formatDuration não compila.
  const cases: Array<[number, string]> = [
    [900, '15 minutos'],
    [60, '1 minuto'],
    [90, '1 minuto e 30 segundos'],
    [270, '4 minutos e 30 segundos'],
    [45, '45 segundos'],
    [1, '1 segundo'],
    [0, '0 segundos'],
  ];

  it.each(cases)('formata %i segundos como "%s"', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });

  it('trata valor negativo como zero', () => {
    expect(formatDuration(-10)).toBe('0 segundos');
  });
});

describe('lockedMessage', () => {
  it('inclui o tempo restante', () => {
    expect(lockedMessage(900)).toContain('15 minutos');
  });
});

describe('attemptsLeftMessage', () => {
  it('avisa de forma enfática na última tentativa', () => {
    expect(attemptsLeftMessage(1)).toContain('mais uma tentativa');
  });

  it('informa a quantidade quando há mais de uma', () => {
    expect(attemptsLeftMessage(2)).toContain('2 tentativas');
  });

  it('não exibe nada quando não há tentativas restantes', () => {
    expect(attemptsLeftMessage(0)).toBeNull();
  });
});

describe('describeSignUpError', () => {
  it('reconhece e-mail já cadastrado', () => {
    const message = describeSignUpError({ code: 'user_already_exists' });
    expect(message).toContain('Já existe uma conta');
  });

  it('reconhece o bloqueio do trigger de domínio institucional', () => {
    const message = describeSignUpError({
      message: 'Database error saving new user',
    });
    expect(message).toContain('institucional');
  });

  it('reconhece rate limit de envio de e-mail', () => {
    const message = describeSignUpError({ code: 'over_email_send_rate_limit' });
    expect(message).toContain('Aguarde');
  });

  it('tem mensagem padrão para erro desconhecido', () => {
    expect(describeSignUpError(null)).toContain('Não foi possível');
  });
});
