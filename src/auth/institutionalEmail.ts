/**
 * Validação de vínculo institucional pelo domínio do e-mail.
 *
 * Roda no client, ANTES de chamar supabase.auth.signUp — é o requisito da
 * História 1: "cadastro com e-mail fora do domínio institucional é bloqueado
 * antes de enviar qualquer confirmação". Como a chamada nem acontece, o GoTrue
 * não cria usuário nem dispara e-mail.
 *
 * Isto é a primeira camada, não a única. A autoridade é o servidor:
 * public.allowed_email_domains + o trigger enforce_institutional_email em
 * auth.users. Ao adicionar um domínio, atualize os dois lugares.
 */

const FALLBACK_DOMAINS = ['pucsp.edu.br'];

/** Domínios aceitos, lidos de EXPO_PUBLIC_INSTITUTIONAL_EMAIL_DOMAINS. */
export function allowedDomains(): string[] {
  const raw = process.env.EXPO_PUBLIC_INSTITUTIONAL_EMAIL_DOMAINS ?? '';
  const parsed = raw
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : FALLBACK_DOMAINS;
}

/**
 * Formato de e-mail. Deliberadamente conservador em vez de "RFC-completo":
 * exige exatamente um "@", parte local não vazia, e um domínio com pelo menos
 * um ponto e sem hifens/pontos nas bordas de cada rótulo.
 */
const EMAIL_RE = /^[^\s@]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

export type EmailRejection =
  | 'empty'
  | 'malformed'
  | 'domain_not_allowed';

export type EmailValidation =
  | { ok: true; normalized: string; domain: string }
  | { ok: false; reason: EmailRejection; message: string };

/** Normaliza para comparação e armazenamento: sem espaços, minúsculo. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Domínio normalizado do e-mail, ou '' se não houver "@". */
export function emailDomain(email: string): string {
  const at = normalizeEmail(email).lastIndexOf('@');
  return at === -1 ? '' : normalizeEmail(email).slice(at + 1);
}

function domainsLabel(domains: string[]): string {
  const withAt = domains.map((d) => `@${d}`);
  if (withAt.length === 1) return withAt[0];
  return `${withAt.slice(0, -1).join(', ')} ou ${withAt[withAt.length - 1]}`;
}

/**
 * Valida e-mail para cadastro. Comparação por igualdade exata de domínio —
 * nunca por `endsWith`, que aceitaria `aluno@pucsp.edu.br.invasor.com`.
 */
export function validateInstitutionalEmail(
  email: string,
  domains: string[] = allowedDomains(),
): EmailValidation {
  const normalized = normalizeEmail(email);

  if (normalized.length === 0) {
    return { ok: false, reason: 'empty', message: 'Informe seu e-mail institucional.' };
  }

  if (!EMAIL_RE.test(normalized)) {
    return { ok: false, reason: 'malformed', message: 'E-mail inválido. Verifique o que você digitou.' };
  }

  const domain = emailDomain(normalized);
  if (!domains.includes(domain)) {
    return {
      ok: false,
      reason: 'domain_not_allowed',
      message: `Cadastro permitido apenas com e-mail ${domainsLabel(domains)}. O domínio @${domain} não comprova vínculo com a universidade.`,
    };
  }

  return { ok: true, normalized, domain };
}

/** Requisito mínimo de senha, alinhado ao default do Supabase Auth (6). */
export const MIN_PASSWORD_LENGTH = 8;

export function validatePassword(password: string): { ok: true } | { ok: false; message: string } {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: `A senha precisa de pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return { ok: false, message: 'A senha precisa combinar letras e números.' };
  }
  return { ok: true };
}
