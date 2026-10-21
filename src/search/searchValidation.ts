/**
 * Regras da busca de caronas (EP04 — Buscar caronas) que rodam no app.
 *
 * Filtro e ordenação NÃO estão aqui: moram na função SQL `search_rides`, que é
 * o que usa os índices (e é testada em supabase/tests/search_rides.test.sql).
 * Aqui fica o que acontece antes e depois da chamada: validar o formulário
 * sem tocar na rede, decidir se dá para "ampliar" a janela e formatar os
 * resultados.
 *
 * Os limites (raio, janela, teto) NÃO são constantes deste arquivo: vêm do
 * banco, por search_limits(), o lugar único que a próxima história vai tornar
 * configurável. As funções abaixo os recebem por parâmetro.
 */

import type { FieldError } from '@/profile/profileValidation';
import {
  isDepartureTooFarAhead,
  MAX_DAYS_AHEAD,
  validatePlaces,
  type GeoPoint,
} from '@/routes/routeValidation';

export type SearchLimits = {
  radiusKm: number;
  timeWindowMinutes: number;
  maxTimeWindowMinutes: number;
};

export type SearchDraft = {
  origin: GeoPoint | null;
  destination: GeoPoint | null;
  desiredAt: Date | null;
};

/**
 * Folga para "agora": quem escolhe o horário atual e leva um minuto
 * preenchendo o resto do formulário não deve ler "já passou".
 */
export const PAST_GRACE_MINUTES = 5;

/**
 * Valida a busca antes da rede. Origem e destino usam a MESMA regra do
 * cadastro de rota (validatePlaces): selecionados da lista e diferentes.
 */
export function validateSearchForm(draft: SearchDraft, now: Date = new Date()): FieldError[] {
  const errors = validatePlaces(draft);

  if (!draft.desiredAt) {
    errors.push({ field: 'desiredAt', message: 'Escolha a data e o horário em que quer sair.' });
  } else if (Number.isNaN(draft.desiredAt.getTime())) {
    errors.push({ field: 'desiredAt', message: 'Data ou horário inválidos. Escolha de novo nos dois campos.' });
  } else if (draft.desiredAt.getTime() < now.getTime() - PAST_GRACE_MINUTES * 60_000) {
    errors.push({ field: 'desiredAt', message: 'Esse horário já passou. Escolha um horário futuro.' });
  } else if (isDepartureTooFarAhead(draft.desiredAt, now)) {
    errors.push({
      field: 'desiredAt',
      message: `Busque caronas com no máximo ${MAX_DAYS_AHEAD} dias de antecedência.`,
    });
  }

  return errors;
}

/**
 * "Ampliar" do estado vazio (wireframe 4.6): dobra a janela, até o teto.
 * Null quando já está no teto — aí o botão não aparece.
 */
export function widenedWindowMinutes(current: number, limits: SearchLimits): number | null {
  if (current >= limits.maxTimeWindowMinutes) return null;
  return Math.min(current * 2, limits.maxTimeWindowMinutes);
}

/** Intervalo coberto pela busca: horário desejado ± janela. */
export function searchWindowRange(desiredAt: Date, windowMinutes: number): { from: Date; to: Date } {
  const ms = windowMinutes * 60_000;
  return { from: new Date(desiredAt.getTime() - ms), to: new Date(desiredAt.getTime() + ms) };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatClock(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "06:30 — 07:30", para o botão "Ampliar para ...". */
export function formatWindowRange(desiredAt: Date, windowMinutes: number): string {
  const { from, to } = searchWindowRange(desiredAt, windowMinutes);
  return `${formatClock(from)} — ${formatClock(to)}`;
}

/**
 * Distância para exibição: metros abaixo de 1 km, uma casa decimal acima.
 * Até 50 m conta como "no mesmo lugar" — é abaixo da precisão do endereço
 * geocodificado.
 */
export function formatDistance(km: number): string {
  if (km < 0.05) return 'no mesmo ponto';
  if (km < 1) return `${Math.round((km * 1000) / 10) * 10} m`;
  return `${km.toFixed(1).replace('.', ',')} km`;
}

/**
 * Diferença entre a saída da carona e o horário desejado.
 * Positivo = a carona sai depois; negativo = antes.
 */
export function formatTimeDifference(minutes: number): string {
  const abs = Math.abs(Math.round(minutes));
  // Vai sozinho numa etiqueta: começa com maiúscula (regras de escrita do manual).
  if (abs === 0) return 'No horário';

  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const amount = h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
  return minutes > 0 ? `${amount} depois` : `${amount} antes`;
}

/**
 * Horário sugerido ao abrir a busca: o próximo quarto de hora. "Agora" exato
 * cairia no passado segundos depois; e com hora já preenchida a busca funciona
 * até onde o seletor de data não abre (web).
 */
export function defaultDesiredAt(now: Date = new Date()): Date {
  const next = new Date(now);
  next.setSeconds(0, 0);
  const minutes = next.getMinutes();
  next.setMinutes(minutes + (15 - (minutes % 15)));
  return next;
}
