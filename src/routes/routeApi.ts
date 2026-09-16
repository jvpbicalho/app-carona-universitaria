import { supabase } from '@/lib/supabase';
import type { RouteDraft } from '@/routes/routeValidation';

export type Route = {
  id: string;
  originLabel: string;
  destinationLabel: string;
  departureAt: Date;
  seatsTotal: number;
  seatsTaken: number;
  seatsAvailable: number;
  notes: string | null;
  status: 'publicada' | 'cancelada' | 'concluida';
};

type RouteRow = {
  id: string;
  origin_label: string;
  destination_label: string;
  departure_at: string;
  seats_total: number;
  seats_taken: number;
  seats_available: number;
  notes: string | null;
  status: string;
};

function toRoute(row: RouteRow): Route {
  return {
    id: row.id,
    originLabel: row.origin_label,
    destinationLabel: row.destination_label,
    departureAt: new Date(row.departure_at),
    seatsTotal: row.seats_total,
    seatsTaken: row.seats_taken,
    seatsAvailable: row.seats_available,
    notes: row.notes,
    status: row.status as Route['status'],
  };
}

const SELECT =
  'id, origin_label, destination_label, departure_at, seats_total, seats_taken, seats_available, notes, status';

/**
 * Mapeia os erros do trigger `routes_validate` para texto em pt-BR.
 *
 * Estes erros só aparecem se a validação do client for contornada — ela roda
 * antes e cobre os mesmos casos. Mas o usuário não pode ver SQL cru se
 * acontecer, e o `hint` é o que o trigger emite de propósito para isso.
 */
export function describeRouteError(error: { message?: string; hint?: string | null }): string {
  const hint = error.hint ?? '';
  const message = (error.message ?? '').toLowerCase();

  if (hint === 'departure_in_past' || message.includes('passado')) {
    return 'O horário de saída não pode ser no passado.';
  }
  if (hint === 'seats_exceed_vehicle' || message.includes('vagas')) {
    return 'A carona oferece mais vagas do que o veículo comporta.';
  }
  if (hint === 'profile_incomplete') {
    return 'Complete seu perfil antes de publicar uma carona.';
  }
  if (hint === 'vehicle_not_found' || hint === 'vehicle_not_owned') {
    return 'Cadastre seu veículo antes de publicar uma carona.';
  }
  return 'Não foi possível publicar a carona. Tente novamente.';
}

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
  return toRoute(data as RouteRow);
}

/** Caronas publicadas pelo motorista, da mais próxima para a mais distante. */
export async function fetchMyRoutes(driverId: string): Promise<Route[]> {
  const { data, error } = await supabase
    .from('routes')
    .select(SELECT)
    .eq('driver_id', driverId)
    .order('departure_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => toRoute(row as RouteRow));
}
