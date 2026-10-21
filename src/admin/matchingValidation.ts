import type { FieldError } from '@/profile/profileValidation';

/**
 * Limites aceitos para as tolerâncias do matching (EP04).
 *
 * A autoridade são as constraints de public.matching_settings
 * (migration 20261021230424_matching_settings.sql): estas constantes só
 * permitem validar antes da rede, com mensagem clara. Mudou lá, mude aqui.
 * Valores decididos pelo gerente do projeto em 21/10/2026.
 */
export const MIN_RADIUS_KM = 0.5;
export const MAX_RADIUS_KM = 50;
export const MIN_TIME_WINDOW_MINUTES = 5;
export const MAX_TIME_WINDOW_MINUTES = 240;

export type MatchingSettings = {
  radiusKm: number;
  timeWindowMinutes: number;
};

export type MatchingDraft = {
  /** Como digitado: aceita vírgula ("1,5") e ponto ("1.5"). */
  radiusKm: string;
  timeWindowMinutes: string;
};

/** "1,5" → 1.5. Vazio ou não numérico → null. */
export function parseDecimal(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** "45" → 45. Só inteiros: a janela é em minutos inteiros. */
export function parseInteger(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

/** 1.5 → "1,5"; 2 → "2". Para preencher o campo e para textos. */
export function formatKm(value: number): string {
  return String(Math.round(value * 10) / 10).replace('.', ',');
}

/**
 * Valida o formulário do admin antes de chamar o banco. Devolve os valores já
 * convertidos quando está tudo certo.
 */
export function validateMatchingSettings(
  draft: MatchingDraft,
): { ok: true; value: MatchingSettings } | { ok: false; errors: FieldError[] } {
  const errors: FieldError[] = [];

  const radius = parseDecimal(draft.radiusKm);
  if (draft.radiusKm.trim().length === 0) {
    errors.push({ field: 'radiusKm', message: 'Informe o raio em km.' });
  } else if (radius === null) {
    errors.push({ field: 'radiusKm', message: 'Use só números, como 2 ou 1,5.' });
  } else if (radius < MIN_RADIUS_KM || radius > MAX_RADIUS_KM) {
    errors.push({
      field: 'radiusKm',
      message: `O raio precisa estar entre ${formatKm(MIN_RADIUS_KM)} e ${formatKm(MAX_RADIUS_KM)} km.`,
    });
  } else if (!/^\d+([.,]\d)?$/.test(draft.radiusKm.trim())) {
    // Pela string, não pelo número: 1,1 × 10 em ponto flutuante não é 11.
    errors.push({ field: 'radiusKm', message: 'Use no máximo uma casa decimal, como 1,5.' });
  }

  const windowMinutes = parseInteger(draft.timeWindowMinutes);
  if (draft.timeWindowMinutes.trim().length === 0) {
    errors.push({ field: 'timeWindowMinutes', message: 'Informe a janela em minutos.' });
  } else if (windowMinutes === null) {
    errors.push({ field: 'timeWindowMinutes', message: 'Use só minutos inteiros, como 30.' });
  } else if (windowMinutes < MIN_TIME_WINDOW_MINUTES || windowMinutes > MAX_TIME_WINDOW_MINUTES) {
    errors.push({
      field: 'timeWindowMinutes',
      message: `A janela precisa estar entre ${MIN_TIME_WINDOW_MINUTES} e ${MAX_TIME_WINDOW_MINUTES} minutos.`,
    });
  }

  if (errors.length > 0 || radius === null || windowMinutes === null) return { ok: false, errors };
  return { ok: true, value: { radiusKm: radius, timeWindowMinutes: windowMinutes } };
}
