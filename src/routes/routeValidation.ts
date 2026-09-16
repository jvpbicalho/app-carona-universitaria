/**
 * Regras do cadastro de rota (EP03 / História 3).
 *
 * O critério de aceite pede que o horário no passado seja barrado ANTES de
 * salvar — é isso que `validateRouteForm` faz, sem tocar na rede. O trigger
 * `routes_validate` no Postgres repete a checagem como backstop, porque a
 * publishable key é pública e a API REST é chamável direto.
 */

import type { FieldError } from '@/profile/profileValidation';

export type GeoPoint = {
  label: string;
  latitude: number;
  longitude: number;
};

export type RouteDraft = {
  origin?: GeoPoint | null;
  destination?: GeoPoint | null;
  departureAt?: Date | null;
  seatsTotal?: number | null;
  notes?: string | null;
};

export const MAX_NOTES_LENGTH = 200;

/**
 * Até onde no futuro se pode publicar. Sem teto, um erro de digitação no ano
 * cria uma carona para 2126 que fica parada na busca para sempre.
 */
export const MAX_DAYS_AHEAD = 180;

/** Combina a data escolhida no calendário com a hora escolhida no relógio. */
export function combineDateAndTime(date: Date, time: Date): Date {
  const combined = new Date(date);
  combined.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return combined;
}

/**
 * `now` é parâmetro em vez de `new Date()` interno para o teste poder fixar o
 * instante — senão o teste de "é passado" fica dependente do relógio.
 */
export function isDepartureInPast(departureAt: Date, now: Date = new Date()): boolean {
  return departureAt.getTime() <= now.getTime();
}

export function isDepartureTooFarAhead(departureAt: Date, now: Date = new Date()): boolean {
  const limit = new Date(now);
  limit.setDate(limit.getDate() + MAX_DAYS_AHEAD);
  return departureAt.getTime() > limit.getTime();
}

/** Formata a partida como "12/09/2026 às 07:30". */
export function formatDeparture(departureAt: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${pad(departureAt.getDate())}/${pad(departureAt.getMonth() + 1)}/${departureAt.getFullYear()}`;
  const time = `${pad(departureAt.getHours())}:${pad(departureAt.getMinutes())}`;
  return `${date} às ${time}`;
}

/**
 * Valida o formulário inteiro antes de chamar o Supabase.
 *
 * `vehicleSeats` é a capacidade do veículo cadastrado: é o teto de vagas desta
 * carona, conforme o critério de aceite da História 2. `now` é injetável pelo
 * mesmo motivo de isDepartureInPast.
 */
export function validateRouteForm(
  route: RouteDraft,
  vehicleSeats: number | null | undefined,
  now: Date = new Date(),
): FieldError[] {
  const errors: FieldError[] = [];

  if (!route.origin) {
    errors.push({ field: 'origin', message: 'Busque e selecione o endereço de origem.' });
  }

  if (!route.destination) {
    errors.push({ field: 'destination', message: 'Busque e selecione o destino.' });
  }

  // Origem igual ao destino é erro de preenchimento, não uma carona de 0 km.
  if (route.origin && route.destination) {
    const sameSpot =
      Math.abs(route.origin.latitude - route.destination.latitude) < 0.0001 &&
      Math.abs(route.origin.longitude - route.destination.longitude) < 0.0001;
    if (sameSpot) {
      errors.push({ field: 'destination', message: 'O destino precisa ser diferente da origem.' });
    }
  }

  if (!route.departureAt) {
    errors.push({ field: 'departureAt', message: 'Escolha a data e o horário de saída.' });
  } else if (Number.isNaN(route.departureAt.getTime())) {
    errors.push({ field: 'departureAt', message: 'Data ou horário inválidos.' });
  } else if (isDepartureInPast(route.departureAt, now)) {
    errors.push({
      field: 'departureAt',
      message: 'O horário de saída não pode ser no passado.',
    });
  } else if (isDepartureTooFarAhead(route.departureAt, now)) {
    errors.push({
      field: 'departureAt',
      message: `Publique caronas com no máximo ${MAX_DAYS_AHEAD} dias de antecedência.`,
    });
  }

  const seats = route.seatsTotal;
  if (seats === null || seats === undefined || Number.isNaN(seats)) {
    errors.push({ field: 'seatsTotal', message: 'Informe quantas vagas esta carona oferece.' });
  } else if (!Number.isInteger(seats) || seats < 1) {
    errors.push({ field: 'seatsTotal', message: 'A carona precisa oferecer ao menos 1 vaga.' });
  } else if (vehicleSeats === null || vehicleSeats === undefined) {
    errors.push({
      field: 'seatsTotal',
      message: 'Cadastre seu veículo antes de publicar uma carona.',
    });
  } else if (seats > vehicleSeats) {
    errors.push({
      field: 'seatsTotal',
      message: `Seu veículo tem ${vehicleSeats} ${vehicleSeats === 1 ? 'vaga' : 'vagas'}.`,
    });
  }

  if ((route.notes ?? '').length > MAX_NOTES_LENGTH) {
    errors.push({ field: 'notes', message: `Máximo de ${MAX_NOTES_LENGTH} caracteres.` });
  }

  return errors;
}
