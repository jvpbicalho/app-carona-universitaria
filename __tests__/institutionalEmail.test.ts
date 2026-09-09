import {
  emailDomain,
  normalizeEmail,
  validateInstitutionalEmail,
  validatePassword,
} from '../src/auth/institutionalEmail';

const DOMAINS = ['pucsp.edu.br'];

describe('validateInstitutionalEmail', () => {
  it('aceita e-mail no domínio institucional', () => {
    const result = validateInstitutionalEmail('maria.silva@pucsp.edu.br', DOMAINS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized).toBe('maria.silva@pucsp.edu.br');
      expect(result.domain).toBe('pucsp.edu.br');
    }
  });

  it('normaliza caixa e espaços antes de comparar', () => {
    const result = validateInstitutionalEmail('  Maria.Silva@PUCSP.EDU.BR  ', DOMAINS);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.normalized).toBe('maria.silva@pucsp.edu.br');
  });

  it.each([
    ['gmail.com', 'maria@gmail.com'],
    ['hotmail.com', 'maria@hotmail.com'],
    ['usp.br', 'maria@usp.br'],
  ])('bloqueia domínio externo %s', (_label, email) => {
    const result = validateInstitutionalEmail(email, DOMAINS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('domain_not_allowed');
  });

  // Estes três são o motivo de a comparação ser por igualdade e não endsWith/includes.
  it('bloqueia domínio institucional usado como prefixo de outro', () => {
    const result = validateInstitutionalEmail('maria@pucsp.edu.br.invasor.com', DOMAINS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('domain_not_allowed');
  });

  it('bloqueia domínio institucional usado como sufixo de outro', () => {
    const result = validateInstitutionalEmail('maria@naopucsp.edu.br', DOMAINS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('domain_not_allowed');
  });

  it('bloqueia subdomínio não cadastrado', () => {
    const result = validateInstitutionalEmail('maria@aluno.pucsp.edu.br', DOMAINS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('domain_not_allowed');
  });

  it('bloqueia o domínio dentro da parte local', () => {
    const result = validateInstitutionalEmail('pucsp.edu.br@gmail.com', DOMAINS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('domain_not_allowed');
  });

  it.each([
    ['sem arroba', 'maria.pucsp.edu.br'],
    ['sem domínio', 'maria@'],
    ['sem parte local', '@pucsp.edu.br'],
    ['domínio sem ponto', 'maria@pucsp'],
    ['com espaço no meio', 'maria silva@pucsp.edu.br'],
  ])('recusa e-mail malformado (%s)', (_label, email) => {
    const result = validateInstitutionalEmail(email, DOMAINS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('malformed');
  });

  it('recusa entrada vazia com motivo próprio', () => {
    const result = validateInstitutionalEmail('   ', DOMAINS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('empty');
  });

  it('aceita qualquer domínio da lista quando há mais de um', () => {
    const domains = ['pucsp.edu.br', 'aluno.pucsp.edu.br'];
    expect(validateInstitutionalEmail('a@pucsp.edu.br', domains).ok).toBe(true);
    expect(validateInstitutionalEmail('a@aluno.pucsp.edu.br', domains).ok).toBe(true);
    expect(validateInstitutionalEmail('a@prof.pucsp.edu.br', domains).ok).toBe(false);
  });

  it('cita os domínios aceitos na mensagem de erro', () => {
    const result = validateInstitutionalEmail('maria@gmail.com', DOMAINS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('@pucsp.edu.br');
  });
});

describe('emailDomain', () => {
  it('extrai o domínio normalizado', () => {
    expect(emailDomain(' Maria@PUCSP.edu.br ')).toBe('pucsp.edu.br');
  });

  it('usa o último arroba quando há mais de um', () => {
    expect(emailDomain('a@b@pucsp.edu.br')).toBe('pucsp.edu.br');
  });

  it('devolve vazio sem arroba', () => {
    expect(emailDomain('maria')).toBe('');
  });
});

describe('normalizeEmail', () => {
  it('remove espaços das bordas e baixa a caixa', () => {
    expect(normalizeEmail('  MARIA@PUCSP.EDU.BR ')).toBe('maria@pucsp.edu.br');
  });
});

describe('validatePassword', () => {
  it('aceita senha com letras e números e tamanho mínimo', () => {
    expect(validatePassword('carona2026').ok).toBe(true);
  });

  it('recusa senha curta', () => {
    const result = validatePassword('ab12');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('8 caracteres');
  });

  it('recusa senha só com letras', () => {
    expect(validatePassword('caronauniversitaria').ok).toBe(false);
  });

  it('recusa senha só com números', () => {
    expect(validatePassword('12345678').ok).toBe(false);
  });
});
