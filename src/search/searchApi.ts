import { supabase } from '@/lib/supabase';
import type { RequestStatus } from '@/requests/requestStatus';
import type { GeoPoint } from '@/routes/routeValidation';
import type { SearchLimits } from '@/search/searchValidation';

/**
 * Uma carona encontrada. Espelha o retorno de public.search_rides.
 * Sem score/percentual: compatibilidade explicável é Fase 2 (wireframe 4.3).
 */
export type RideResult = {
  routeId: string;
  departureAt: Date;
  originLabel: string;
  destinationLabel: string;
  originDistanceKm: number;
  destinationDistanceKm: number;
  /** Positivo = sai depois do horário desejado. */
  timeDifferenceMinutes: number;
  /**
   * Vagas livres = vagas da carona − solicitações aceitas (public.seats_available,
   * EP05). Pendentes não descontam.
   */
  seatsAvailable: number;
  seatsTotal: number;
  notes: string | null;
  driverName: string | null;
  driverAvatarUrl: string | null;
  driverCourse: string | null;
  vehicleMakeModel: string | null;
  vehicleColor: string | null;
  /** Pedido mais recente de quem busca nesta carona; null = nunca pediu. */
  myRequestStatus: RequestStatus | null;
};

type RideRow = {
  route_id: string;
  departure_at: string;
  origin_label: string;
  destination_label: string;
  origin_distance_km: number;
  destination_distance_km: number;
  time_difference_minutes: number;
  seats_available: number;
  seats_total: number;
  notes: string | null;
  driver_name: string | null;
  driver_avatar_url: string | null;
  driver_course: string | null;
  vehicle_make_model: string | null;
  vehicle_color: string | null;
  my_request_status: RequestStatus | null;
};

function toRide(row: RideRow): RideResult {
  return {
    routeId: row.route_id,
    departureAt: new Date(row.departure_at),
    originLabel: row.origin_label,
    destinationLabel: row.destination_label,
    originDistanceKm: row.origin_distance_km,
    destinationDistanceKm: row.destination_distance_km,
    timeDifferenceMinutes: row.time_difference_minutes,
    seatsAvailable: row.seats_available,
    seatsTotal: row.seats_total,
    notes: row.notes,
    driverName: row.driver_name,
    driverAvatarUrl: row.driver_avatar_url,
    driverCourse: row.driver_course,
    vehicleMakeModel: row.vehicle_make_model,
    vehicleColor: row.vehicle_color,
    myRequestStatus: row.my_request_status,
  };
}

export type SearchParams = {
  origin: GeoPoint;
  destination: GeoPoint;
  desiredAt: Date;
  /** Omitido = janela padrão de search_limits(). */
  timeWindowMinutes?: number;
};

/**
 * Chama a RPC. Filtro e ordenação acontecem no banco; a lista chega pronta,
 * da mais relevante para a menos.
 */
export async function searchRides(params: SearchParams): Promise<RideResult[]> {
  const { data, error } = await supabase.rpc('search_rides', {
    p_origin_latitude: params.origin.latitude,
    p_origin_longitude: params.origin.longitude,
    p_destination_latitude: params.destination.latitude,
    p_destination_longitude: params.destination.longitude,
    p_desired_at: params.desiredAt.toISOString(),
    p_time_window_minutes: params.timeWindowMinutes ?? null,
  });

  if (error) throw error;
  return ((data ?? []) as RideRow[]).map(toRide);
}

/**
 * Limites da busca, lidos do lugar único no banco (search_limits →
 * matching_settings, configurável pelo admin). Sem cache: cada busca relê,
 * então uma mudança do admin vale já na busca seguinte. É uma chamada leve,
 * feita uma vez por tela de resultados.
 */
export async function fetchSearchLimits(): Promise<SearchLimits> {
  const { data, error } = await supabase.rpc('search_limits');
  if (error) throw error;

  const row = (Array.isArray(data) ? data[0] : data) as {
    radius_km: number;
    time_window_minutes: number;
    max_time_window_minutes: number;
  };

  return {
    radiusKm: row.radius_km,
    timeWindowMinutes: row.time_window_minutes,
    maxTimeWindowMinutes: row.max_time_window_minutes,
  };
}
