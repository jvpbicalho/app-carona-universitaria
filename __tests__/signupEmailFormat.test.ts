import { describeSignUpError } from '../src/auth/authErrors';
import { validateInstitutionalEmail } from '../src/auth/institutionalEmail';

/**
 * Regressão do bug de cadastro de 23/09/2026: o app aceitava e-mails que o
 * Supabase Auth recusa ("Unable to validate email address: invalid format"),
 * e o usuário via só "Não foi possível concluir o cadastro".
 *
 * Os casos "recusa" abaixo foram confirmados contra o servidor real: todos
 * devolvem 400 validation_failed. A validação do app tem de barrar antes.
 */

const DOMAINS = ['pucsp.edu.br'];

describe('parte local alinhada ao Supabase Auth', () => {
  it.each([
    ['acento', 'joão.teste@pucsp.edu.br'],
    ['cedilha', 'gonçalo.teste@pucsp.edu.br'],
    ['vírgula', 'joao,teste@pucsp.edu.br'],
    ['parênteses', 'joao(teste)@pucsp.edu.br'],
    ['aspas duplas', 'joao"teste@pucsp.edu.br'],
    ['dois-pontos', 'joao:teste@pucsp.edu.br'],
  ])('recusa %s antes de chamar o servidor', (_label, email) => {
    const result = validateInstitutionalEmail(email, DOMAINS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('malformed');
  });

  // O servidor aceita estes caracteres; recusá-los no app barraria alunos com
  // e-mail válido. Ser igual ao servidor, não mais restrito.
  it.each([
    ['sinal de mais', 'maria+carona@pucsp.edu.br'],
    ['apóstrofo', "d'avila@pucsp.edu.br"],
    ['hífen e sublinhado', 'ana-maria_silva@pucsp.edu.br'],
    ['dígitos', 'ra00123456@pucsp.edu.br'],
  ])('aceita %s, que o Supabase também aceita', (_label, email) => {
    expect(validateInstitutionalEmail(email, DOMAINS).ok).toBe(true);
  });

  it('diz exatamente o que corrigir quando há acento', () => {
    const result = validateInstitutionalEmail('joão.teste@pucsp.edu.br', DOMAINS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('sem acentos');
  });

  it('mantém a mensagem genérica de formato para outros caracteres', () => {
    const result = validateInstitutionalEmail('joao,teste@pucsp.edu.br', DOMAINS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe('E-mail inválido. Verifique o que você digitou.');
  });

  it('continua checando o domínio depois do formato', () => {
    const result = validateInstitutionalEmail('joao.teste@gmail.com', DOMAINS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('domain_not_allowed');
  });
});

describe('describeSignUpError: formato recusado pelo servidor', () => {
  it('traduz validation_failed em vez de cair na mensagem genérica', () => {
    const message = describeSignUpError({
      code: 'validation_failed',
      message: 'Unable to validate email address: invalid format',
    });
    expect(message).toContain('E-mail inválido');
    expect(message).not.toContain('Não foi possível concluir');
  });

  it('reconhece pela mensagem quando o código não vem', () => {
    const message = describeSignUpError({ message: 'Unable to validate email address: invalid format' });
    expect(message).toContain('E-mail inválido');
  });

  it('não confunde senha fraca com e-mail inválido', () => {
    expect(describeSignUpError({ code: 'weak_password' })).toContain('Senha');
  });
});
