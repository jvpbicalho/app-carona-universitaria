import { supabase } from '@/lib/supabase';
import type { GeoPoint, RouteDraft, RouteEditDraft, RouteStatus } from '@/routes/routeValidation';

// Mantido exportado daqui para as telas que já importavam de routeApi.
export { describeRouteError } from '@/routes/routeErrors';

export type Route = {
  id: string;
  driverId: string;
  origin: GeoPoint;
  destination: GeoPoint;
  /** Atalhos de exibição; iguais a origin.label / destination.label. */
  originLabel: string;
  destinationLabel: string;
  departureAt: Date;
  seatsTotal: number;
  seatsTaken: number;
  seatsAvailable: number;
  notes: string | null;
  status: RouteStatus;
  cancellationReason: string | null;
  cancelledAt: Date | null;
};

type RouteRow = {
  id: string;
  driver_id: string;
  origin_label: string;
  origin_latitude: number;
  origin_longitude: number;
  destination_label: string;
  destination_latitude: number;
  destination_longitude: number;
  departure_at: string;
  seats_total: number;
  seats_taken: number;
  seats_available: number;
  notes: string | null;
  status: string;
  cancellation_reason: string | null;
  cancelled_at: string | null;
};

function toRoute(row: RouteRow): Route {
  return {
    id: row.id,
    driverId: row.driver_id,
    origin: {
      label: row.origin_label,
      latitude: row.origin_latitude,
      longitude: row.origin_longitude,
    },
    destination: {
      label: row.destination_label,
      latitude: row.destination_latitude,
      longitude: row.destination_longitude,
    },
    originLabel: row.origin_label,
    destinationLabel: row.destination_label,
    departureAt: new Date(row.departure_at),
    seatsTotal: row.seats_total,
    seatsTaken: row.seats_taken,
    seatsAvailable: row.seats_available,
    notes: row.notes,
    status: row.status as RouteStatus,
    cancellationReason: row.cancellation_reason,
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at) : null,
  };
}

const SELECT = [
  'id',
  'driver_id',
  'origin_label',
  'origin_latitude',
  'origin_longitude',
  'destination_label',
  'destination_latitude',
  'destination_longitude',
  'departure_at',
  'seats_total',
  'seats_taken',
  'seats_available',
  'notes',
  'status',
  'cancellation_reason',
  'cancelled_at',
].join(', ');

export async function createRoute(
  driverId: string,
  vehicleId: string,
  draft: RouteDraft,
  destinationCampusId?: string | null,
): Promise<Route> {
  if (!draft.origin || !draft.destination || !draft.departureAt) {
    // Chamador não validou: erro de programação, não de usuário.
    throw new Error('createRoute exige origem, destino e horário já validados.');
  }

  const { data, error } = await supabase
    .from('routes')
    .insert({
      driver_id: driverId,
      vehicle_id: vehicleId,
      origin_label: draft.origin.label,
      origin_latitude: draft.origin.latitude,
      origin_longitude: draft.origin.longitude,
      destination_label: draft.destination.label,
      destination_latitude: draft.destination.latitude,
      destination_longitude: draft.destination.longitude,
      destination_campus_id: destinationCampusId ?? null,
      departure_at: draft.departureAt.toISOString(),
      seats_total: draft.seatsTotal,
      notes: draft.notes?.trim() || null,
    })
    .select(SELECT)
    .single();

  if (error) throw error;
  return toRoute(data as unknown as RouteRow);
}

/** Caronas publicadas pelo motorista, da mais próxima para a mais distante. */
export async function fetchMyRoutes(driverId: string): Promise<Route[]> {
  const { data, error } = await supabase
    .from('routes')
    .select(SELECT)
    .eq('driver_id', driverId)
    .order('departure_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => toRoute(row as unknown as RouteRow));
}

/** Null quando a rota não existe ou a RLS não deixa o usuário vê-la. */
export async function fetchRoute(routeId: string): Promise<Route | null> {
  const { data, error } = await supabase
    .from('routes')
    .select(SELECT)
    .eq('id', routeId)
    .maybeSingle();

  if (error) throw error;
  return data ? toRoute(data as unknown as RouteRow) : null;
}

/**
 * Edita origem, destino e horário.
 *
 * O aviso aos passageiros confirmados NÃO é disparado daqui: o trigger
 * `routes_notify_passengers` grava o aviso na mesma transação deste UPDATE.
 * Assim não existe edição sem aviso — nem se o app fechar logo depois, nem se
 * alguém editar pela API REST direto.
 */
export async function updateRoute(routeId: string, draft: RouteEditDraft): Promise<Route> {
  if (!draft.origin || !draft.destination || !draft.departureAt) {
    throw new Error('updateRoute exige origem, destino e horário já validados.');
  }

  const { data, error } = await supabase
    .from('routes')
    .update({
      origin_label: draft.origin.label,
      origin_latitude: draft.origin.latitude,
      origin_longitude: draft.origin.longitude,
      destination_label: draft.destination.label,
      destination_latitude: draft.destination.latitude,
      destination_longitude: draft.destination.longitude,
      departure_at: draft.departureAt.toISOString(),
    })
    .eq('id', routeId)
    .select(SELECT)
    .single();

  if (error) throw error;
  return toRoute(data as unknown as RouteRow);
}

/**
 * Cancela a rota. Soft delete: a linha fica, com status 'cancelada', o motivo
 * e o instante (este preenchido pelo trigger). Mesmo esquema de aviso da
 * edição — o trigger avisa os passageiros confirmados na mesma transação.
 */
export async function cancelRoute(routeId: string, reason: string): Promise<Route> {
  const { data, error } = await supabase
    .from('routes')
    .update({ status: 'cancelada', cancellation_reason: reason })
    .eq('id', routeId)
    .select(SELECT)
    .single();

  if (error) throw error;
  return toRoute(data as unknown as RouteRow);
}

export type ConfirmedPassenger = {
  requestId: string;
  passengerId: string;
  fullName: string | null;
  avatarUrl: string | null;
  courseName: string | null;
};

/**
 * Passageiros com vaga confirmada — os que serão avisados de uma edição ou
 * cancelamento. Hoje a lista é sempre vazia: quem confirma vaga é o EP05.
 *
 * Duas consultas em vez de embed porque public_profiles é view, e o PostgREST
 * não infere relacionamento por FK através dela.
 */
export async function fetchConfirmedPassengers(routeId: string): Promise<ConfirmedPassenger[]> {
  const { data: requests, error } = await supabase
    .from('ride_requests')
    .select('id, passenger_id')
    .eq('route_id', routeId)
    .eq('status', 'confirmada');

  if (error) throw error;
  if (!requests || requests.length === 0) return [];

  const ids = requests.map((request) => request.passenger_id as string);
  const { data: profiles, error: profilesError } = await supabase
    .from('public_profiles')
    .select('id, full_name, avatar_url, course_name')
    .in('id', ids);

  if (profilesError) throw profilesError;

  const byId = new Map((profiles ?? []).map((profile) => [profile.id as string, profile]));

  return requests.map((request) => {
    const profile = byId.get(request.passenger_id as string);
    return {
      requestId: request.id as string,
      passengerId: request.passenger_id as string,
      fullName: (profile?.full_name as string | null) ?? null,
      avatarUrl: (profile?.avatar_url as string | null) ?? null,
      courseName: (profile?.course_name as string | null) ?? null,
    };
  });
}
