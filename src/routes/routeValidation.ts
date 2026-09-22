/**
 * Regras de rota: cadastro (EP03 / História 3) e edição/cancelamento
 * (EP03 / Cancelar ou editar rota).
 *
 * O critério de aceite pede que o horário no passado seja barrado ANTES de
 * salvar — é isso que `validateRouteForm` e `validateRouteEdit` fazem, sem
 * tocar na rede. O trigger `routes_validate` no Postgres repete a checagem
 * como backstop, porque a publishable key é pública e a API REST é chamável
 * direto.
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

// --------------------------------------------------------------------------
// Peças de validação. Cadastro e edição compõem as mesmas peças, para que
// "horário não pode ser no passado" seja uma regra só, e não duas cópias que
// divergem com o tempo.
// --------------------------------------------------------------------------

type Places = { origin?: GeoPoint | null; destination?: GeoPoint | null };

function isSameSpot(a: GeoPoint, b: GeoPoint): boolean {
  return (
    Math.abs(a.latitude - b.latitude) < 0.0001 && Math.abs(a.longitude - b.longitude) < 0.0001
  );
}

export function validatePlaces(route: Places): FieldError[] {
  const errors: FieldError[] = [];

  if (!route.origin) {
    errors.push({ field: 'origin', message: 'Busque e selecione o endereço de origem.' });
  }

  if (!route.destination) {
    errors.push({ field: 'destination', message: 'Busque e selecione o destino.' });
  }

  // Origem igual ao destino é erro de preenchimento, não uma carona de 0 km.
  if (route.origin && route.destination && isSameSpot(route.origin, route.destination)) {
    errors.push({ field: 'destination', message: 'O destino precisa ser diferente da origem.' });
  }

  return errors;
}

/** Regra de horário do cadastro, reaproveitada na edição. */
export function validateDeparture(
  departureAt: Date | null | undefined,
  now: Date = new Date(),
): FieldError[] {
  if (!departureAt) {
    return [{ field: 'departureAt', message: 'Escolha a data e o horário de saída.' }];
  }
  if (Number.isNaN(departureAt.getTime())) {
    return [{ field: 'departureAt', message: 'Data ou horário inválidos.' }];
  }
  if (isDepartureInPast(departureAt, now)) {
    return [{ field: 'departureAt', message: 'O horário de saída não pode ser no passado.' }];
  }
  if (isDepartureTooFarAhead(departureAt, now)) {
    return [
      {
        field: 'departureAt',
        message: `Publique caronas com no máximo ${MAX_DAYS_AHEAD} dias de antecedência.`,
      },
    ];
  }
  return [];
}

function validateSeats(
  seats: number | null | undefined,
  vehicleSeats: number | null | undefined,
): FieldError[] {
  if (seats === null || seats === undefined || Number.isNaN(seats)) {
    return [{ field: 'seatsTotal', message: 'Informe quantas vagas esta carona oferece.' }];
  }
  if (!Number.isInteger(seats) || seats < 1) {
    return [{ field: 'seatsTotal', message: 'A carona precisa oferecer ao menos 1 vaga.' }];
  }
  if (vehicleSeats === null || vehicleSeats === undefined) {
    return [{ field: 'seatsTotal', message: 'Cadastre seu veículo antes de publicar uma carona.' }];
  }
  if (seats > vehicleSeats) {
    return [
      {
        field: 'seatsTotal',
        message: `Seu veículo tem ${vehicleSeats} ${vehicleSeats === 1 ? 'vaga' : 'vagas'}.`,
      },
    ];
  }
  return [];
}

function validateNotes(notes: string | null | undefined): FieldError[] {
  if ((notes ?? '').length > MAX_NOTES_LENGTH) {
    return [{ field: 'notes', message: `Máximo de ${MAX_NOTES_LENGTH} caracteres.` }];
  }
  return [];
}

/**
 * Valida o formulário de cadastro inteiro antes de chamar o Supabase.
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
  return [
    ...validatePlaces(route),
    ...validateDeparture(route.departureAt, now),
    ...validateSeats(route.seatsTotal, vehicleSeats),
    ...validateNotes(route.notes),
  ];
}

// --------------------------------------------------------------------------
// Edição e cancelamento.
// --------------------------------------------------------------------------

export type RouteStatus = 'publicada' | 'cancelada' | 'concluida';

/** O mínimo de uma rota salva que as regras de edição/cancelamento precisam. */
export type ExistingRoute = {
  status: RouteStatus;
  departureAt: Date;
  origin: GeoPoint;
  destination: GeoPoint;
};

export type RouteEditDraft = {
  origin: GeoPoint | null;
  destination: GeoPoint | null;
  departureAt: Date | null;
};

export type RouteChange = 'origin' | 'destination' | 'departureAt';

/** Campo usado para erros que não pertencem a um input específico. */
export const FORM_FIELD = 'form';

/**
 * Pode editar ou cancelar? Só rota publicada que ainda não partiu. Espelha o
 * trigger routes_validate (route_not_editable / route_already_departed).
 */
export function canModifyRoute(
  route: Pick<ExistingRoute, 'status' | 'departureAt'>,
  now: Date = new Date(),
): { ok: true } | { ok: false; message: string } {
  if (route.status === 'cancelada') {
    return { ok: false, message: 'Esta carona foi cancelada e não pode mais ser alterada.' };
  }
  if (route.status === 'concluida') {
    return { ok: false, message: 'Esta carona já foi concluída.' };
  }
  if (route.departureAt.getTime() <= now.getTime()) {
    return { ok: false, message: 'Esta carona já partiu e não pode mais ser alterada.' };
  }
  return { ok: true };
}

function samePoint(a: GeoPoint | null, b: GeoPoint): boolean {
  return (
    a !== null && a.label === b.label && a.latitude === b.latitude && a.longitude === b.longitude
  );
}

/** O que a edição muda em relação à rota salva, na ordem do formulário. */
export function routeChanges(original: ExistingRoute, draft: RouteEditDraft): RouteChange[] {
  const changes: RouteChange[] = [];
  if (!samePoint(draft.origin, original.origin)) changes.push('origin');
  if (!samePoint(draft.destination, original.destination)) changes.push('destination');
  if (!draft.departureAt || draft.departureAt.getTime() !== original.departureAt.getTime()) {
    changes.push('departureAt');
  }
  return changes;
}

/**
 * Valida a edição antes de chamar o Supabase.
 *
 * O horário só é revalidado se mudou: quem edita apenas a origem de uma carona
 * que sai daqui a 2 minutos não deve ler "o horário não pode ser no passado"
 * sobre um horário que nem tocou. A proteção contra editar carona que já
 * partiu vem antes, de canModifyRoute, com a mensagem certa.
 */
export function validateRouteEdit(
  original: ExistingRoute,
  draft: RouteEditDraft,
  now: Date = new Date(),
): FieldError[] {
  const allowed = canModifyRoute(original, now);
  if (!allowed.ok) return [{ field: FORM_FIELD, message: allowed.message }];

  const changes = routeChanges(original, draft);

  const errors = [
    ...validatePlaces(draft),
    ...(changes.includes('departureAt') ? validateDeparture(draft.departureAt, now) : []),
  ];
  if (errors.length > 0) return errors;

  if (changes.length === 0) {
    return [{ field: FORM_FIELD, message: 'Nenhuma alteração para salvar.' }];
  }
  return [];
}

/**
 * Motivos do cancelamento. Obrigatório porque vai no aviso ao passageiro
 * (wireframe 3.5: "motivo é obrigatório porque entra na notificação").
 * Lista fechada com "outro", para o aviso não virar texto vazio ou "asdf".
 */
export const CANCELLATION_REASONS = [
  { value: 'imprevisto', label: 'Imprevisto pessoal' },
  { value: 'veiculo', label: 'Problema com o veículo' },
  { value: 'compromisso', label: 'Mudança de compromisso ou horário' },
  { value: 'transito', label: 'Trânsito ou condições do tempo' },
  { value: 'outro', label: 'Outro motivo' },
] as const;

export type CancellationReasonCode = (typeof CANCELLATION_REASONS)[number]['value'];

export const MIN_OTHER_REASON_LENGTH = 3;
export const MAX_OTHER_REASON_LENGTH = 200;

/** Texto final gravado na rota e enviado ao passageiro. */
export function cancellationReasonText(
  code: CancellationReasonCode,
  otherText: string | null | undefined,
): string {
  if (code === 'outro') return (otherText ?? '').trim();
  return CANCELLATION_REASONS.find((reason) => reason.value === code)?.label ?? '';
}

export function validateCancellation(
  route: Pick<ExistingRoute, 'status' | 'departureAt'>,
  code: CancellationReasonCode | null | undefined,
  otherText: string | null | undefined,
  now: Date = new Date(),
): FieldError[] {
  const allowed = canModifyRoute(route, now);
  if (!allowed.ok) return [{ field: FORM_FIELD, message: allowed.message }];

  if (!code) {
    return [{ field: 'reason', message: 'Selecione o motivo do cancelamento.' }];
  }

  if (code === 'outro') {
    const text = (otherText ?? '').trim();
    if (text.length < MIN_OTHER_REASON_LENGTH) {
      return [{ field: 'otherReason', message: 'Descreva o motivo em poucas palavras.' }];
    }
    if (text.length > MAX_OTHER_REASON_LENGTH) {
      return [
        { field: 'otherReason', message: `Máximo de ${MAX_OTHER_REASON_LENGTH} caracteres.` },
      ];
    }
  }

  return [];
}
