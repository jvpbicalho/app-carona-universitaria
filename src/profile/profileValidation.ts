/**
 * Regras de completude do perfil (EP02 / História 1).
 *
 * Funções puras, sem React e sem Supabase: é isto que as telas chamam ANTES de
 * qualquer requisição, e é isto que os testes exercitam.
 *
 * A mesma regra existe como coluna gerada `profiles.is_complete` no Postgres.
 * Esta versão é UX (avisa e bloqueia o botão); a do banco é a autoridade, e o
 * trigger de `routes` a consulta para impedir publicar carona com perfil
 * incompleto. Ao mudar os campos obrigatórios aqui, mude lá também.
 */

/** Campos obrigatórios, na ordem em que aparecem no formulário. */
export const REQUIRED_PROFILE_FIELDS = ['fullName', 'avatar', 'course', 'campus'] as const;

export type RequiredProfileField = (typeof REQUIRED_PROFILE_FIELDS)[number];

/** Rótulo de cada campo, para montar a mensagem do aviso. */
const FIELD_LABELS: Record<RequiredProfileField, string> = {
  fullName: 'nome',
  avatar: 'foto',
  course: 'curso',
  campus: 'campus',
};

export type ProfileDraft = {
  fullName?: string | null;
  avatarUrl?: string | null;
  courseId?: string | null;
  campusId?: string | null;
  phone?: string | null;
  bio?: string | null;
};

function isFilled(value?: string | null): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Campos obrigatórios ainda em branco. Vazio = perfil completo. */
export function missingProfileFields(profile: ProfileDraft): RequiredProfileField[] {
  const missing: RequiredProfileField[] = [];

  if (!isFilled(profile.fullName)) missing.push('fullName');
  if (!isFilled(profile.avatarUrl)) missing.push('avatar');
  if (!isFilled(profile.courseId)) missing.push('course');
  if (!isFilled(profile.campusId)) missing.push('campus');

  return missing;
}

export function isProfileComplete(profile: ProfileDraft): boolean {
  return missingProfileFields(profile).length === 0;
}

/**
 * Aviso de perfil incompleto — o critério de aceite pede que ele exista.
 * Nomear o que falta evita o clássico "seu perfil está incompleto" que não diz
 * o que fazer. Retorna null quando não há nada a avisar.
 */
export function profileIncompleteWarning(profile: ProfileDraft): string | null {
  const missing = missingProfileFields(profile);
  if (missing.length === 0) return null;

  const labels = missing.map((field) => FIELD_LABELS[field]);
  const list =
    labels.length === 1
      ? labels[0]
      : `${labels.slice(0, -1).join(', ')} e ${labels[labels.length - 1]}`;

  return `Complete seu perfil para usar o app: falta ${list}.`;
}

// --------------------------------------------------------------------------
// Validação campo a campo, usada no submit do formulário.
// --------------------------------------------------------------------------

export const MIN_FULL_NAME_LENGTH = 3;
export const MAX_BIO_LENGTH = 280;

export type FieldError = { field: string; message: string };

/**
 * Telefone brasileiro: 10 dígitos (fixo) ou 11 (celular com 9). Validado só
 * quando preenchido — é opcional.
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function isValidPhone(phone: string): boolean {
  const digits = normalizePhone(phone);
  if (digits.length !== 10 && digits.length !== 11) return false;
  // DDD brasileiro começa em 11.
  if (Number(digits.slice(0, 2)) < 11) return false;
  // Celular de 11 dígitos sempre tem 9 na terceira posição.
  if (digits.length === 11 && digits[2] !== '9') return false;
  return true;
}

/** Formata para exibição: (11) 90000-0000. */
export function formatPhone(phone: string): string {
  const d = normalizePhone(phone).slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/**
 * Valida o formulário inteiro antes de chamar o Supabase.
 * Lista vazia = pode enviar.
 */
export function validateProfileForm(profile: ProfileDraft): FieldError[] {
  const errors: FieldError[] = [];

  const name = (profile.fullName ?? '').trim();
  if (name.length === 0) {
    errors.push({ field: 'fullName', message: 'Informe seu nome completo.' });
  } else if (name.length < MIN_FULL_NAME_LENGTH) {
    errors.push({ field: 'fullName', message: 'Nome muito curto.' });
  }

  if (!isFilled(profile.avatarUrl)) {
    errors.push({ field: 'avatar', message: 'Escolha uma foto de perfil.' });
  }

  if (!isFilled(profile.courseId)) {
    errors.push({ field: 'course', message: 'Selecione seu curso.' });
  }

  if (!isFilled(profile.campusId)) {
    errors.push({ field: 'campus', message: 'Selecione seu campus.' });
  }

  // Opcionais: só reclamam se preenchidos e inválidos.
  if (isFilled(profile.phone) && !isValidPhone(profile.phone!)) {
    errors.push({ field: 'phone', message: 'Telefone inválido. Use DDD + número.' });
  }

  if ((profile.bio ?? '').length > MAX_BIO_LENGTH) {
    errors.push({ field: 'bio', message: `Máximo de ${MAX_BIO_LENGTH} caracteres.` });
  }

  return errors;
}
