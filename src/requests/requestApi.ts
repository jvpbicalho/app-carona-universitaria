import { supabase } from '@/lib/supabase';
import { isRequestStatus, type RequestStatus } from '@/requests/requestStatus';

/**
 * Pede vaga numa carona pela RPC transacional request_seat. Todas as regras
 * (vaga disponível, rota ativa e futura, não é do próprio motorista, um pedido
 * ativo por rota) são checadas no banco, de uma vez, com a rota travada.
 */
export async function requestSeat(routeId: string): Promise<RequestStatus> {
  const { data, error } = await supabase.rpc('request_seat', { p_route_id: routeId });
  if (error) throw error;
  const status = (data as { status?: unknown } | null)?.status;
  return isRequestStatus(status) ? status : 'pendente';
}

/**
 * Motorista aceita ou recusa um pedido pendente (RPC transacional
 * decide_request): só o dono da rota decide, só pendente pode ser decidida, e
 * aceitar revalida a vaga com a rota travada.
 */
export async function decideRequest(requestId: string, decision: 'aceita' | 'recusada'): Promise<void> {
  const { error } = await supabase.rpc('decide_request', {
    p_request_id: requestId,
    p_decision: decision,
  });
  if (error) throw error;
}

/** Pedido pendente com o que o motorista precisa para decidir. */
export type PendingRequest = {
  requestId: string;
  passengerId: string;
  createdAt: Date;
  fullName: string | null;
  avatarUrl: string | null;
  courseName: string | null;
  campusName: string | null;
};

/**
 * Pedidos pendentes de uma rota do motorista, do mais antigo para o mais
 * novo (quem pediu primeiro aparece primeiro). A RLS só devolve pedidos das
 * rotas dele. Duas consultas porque public_profiles é view, e o PostgREST não
 * infere relação por FK através dela.
 */
export async function fetchPendingRequests(routeId: string): Promise<PendingRequest[]> {
  const { data: requests, error } = await supabase
    .from('ride_requests')
    .select('id, passenger_id, created_at')
    .eq('route_id', routeId)
    .eq('status', 'pendente')
    .order('created_at', { ascending: true });

  if (error) throw error;
  if (!requests || requests.length === 0) return [];

  const ids = requests.map((request) => request.passenger_id as string);
  const { data: profiles, error: profilesError } = await supabase
    .from('public_profiles')
    .select('id, full_name, avatar_url, course_name, campus_name')
    .in('id', ids);
  if (profilesError) throw profilesError;

  const byId = new Map((profiles ?? []).map((profile) => [profile.id as string, profile]));
  return requests.map((request) => {
    const profile = byId.get(request.passenger_id as string);
    return {
      requestId: request.id as string,
      passengerId: request.passenger_id as string,
      createdAt: new Date(request.created_at as string),
      fullName: (profile?.full_name as string | null) ?? null,
      avatarUrl: (profile?.avatar_url as string | null) ?? null,
      courseName: (profile?.course_name as string | null) ?? null,
      campusName: (profile?.campus_name as string | null) ?? null,
    };
  });
}

/** Quantos pedidos pendentes cada rota tem (lista "Minhas caronas"). */
export async function fetchPendingCounts(routeIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (routeIds.length === 0) return counts;

  const { data, error } = await supabase
    .from('ride_requests')
    .select('route_id')
    .in('route_id', routeIds)
    .eq('status', 'pendente');
  if (error) throw error;

  for (const row of data ?? []) {
    const id = row.route_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export type MyRequest = {
  requestId: string;
  status: RequestStatus;
  createdAt: Date;
  routeId: string;
  routeStatus: string;
  departureAt: Date;
  originLabel: string;
  destinationLabel: string;
  driverName: string | null;
  driverAvatarUrl: string | null;
  vehicleMakeModel: string | null;
  vehicleColor: string | null;
  seatsAvailable: number;
};

type MyRequestRow = {
  request_id: string;
  status: string;
  created_at: string;
  route_id: string;
  route_status: string;
  departure_at: string;
  origin_label: string;
  destination_label: string;
  driver_name: string | null;
  driver_avatar_url: string | null;
  vehicle_make_model: string | null;
  vehicle_color: string | null;
  seats_available: number;
};

/** Pedidos do passageiro, do mais recente para o mais antigo (RPC my_ride_requests). */
export async function fetchMyRequests(): Promise<MyRequest[]> {
  const { data, error } = await supabase.rpc('my_ride_requests');
  if (error) throw error;

  return ((data ?? []) as MyRequestRow[])
    .filter((row) => isRequestStatus(row.status))
    .map((row) => ({
      requestId: row.request_id,
      status: row.status as RequestStatus,
      createdAt: new Date(row.created_at),
      routeId: row.route_id,
      routeStatus: row.route_status,
      departureAt: new Date(row.departure_at),
      originLabel: row.origin_label,
      destinationLabel: row.destination_label,
      driverName: row.driver_name,
      driverAvatarUrl: row.driver_avatar_url,
      vehicleMakeModel: row.vehicle_make_model,
      vehicleColor: row.vehicle_color,
      seatsAvailable: row.seats_available,
    }));
}
