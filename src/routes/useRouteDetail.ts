import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { fetchPendingRequests, type PendingRequest } from '@/requests/requestApi';
import {
  fetchConfirmedPassengers,
  fetchRoute,
  type ConfirmedPassenger,
  type Route,
} from '@/routes/routeApi';

type RouteDetail = {
  route: Route | null;
  /** Os que serão avisados se a rota for editada ou cancelada. */
  passengers: ConfirmedPassenger[];
  /** Pedidos esperando o motorista aceitar ou recusar (EP05). */
  pending: PendingRequest[];
  loading: boolean;
  error: string | null;
  notFound: boolean;
  reload: () => Promise<void>;
};

/**
 * Carrega rota e passageiros confirmados para detalhe, edição e cancelamento.
 *
 * Recarrega ao ganhar foco: voltar da edição para o detalhe tem de mostrar a
 * rota já alterada, e voltar do cancelamento, o estado "cancelada".
 */
export function useRouteDetail(routeId: string | undefined): RouteDetail {
  const [route, setRoute] = useState<Route | null>(null);
  const [passengers, setPassengers] = useState<ConfirmedPassenger[]>([]);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const reload = useCallback(async () => {
    if (!routeId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setError(null);
    try {
      // A RLS só devolve pedidos ao motorista da rota; para os demais, vazio.
      const [nextRoute, nextPassengers, nextPending] = await Promise.all([
        fetchRoute(routeId),
        fetchConfirmedPassengers(routeId),
        fetchPendingRequests(routeId),
      ]);
      setRoute(nextRoute);
      setPassengers(nextPassengers);
      setPending(nextPending);
      setNotFound(nextRoute === null);
    } catch {
      setError('Não foi possível carregar a carona.');
    } finally {
      setLoading(false);
    }
  }, [routeId]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { route, passengers, pending, loading, error, notFound, reload };
}

/** "1 passageiro com vaga aceita será avisado" / "2 passageiros com vaga aceita serão avisados". */
export function affectedPassengersText(count: number, what: string): string {
  if (count === 0) return 'Nenhum passageiro com vaga aceita ainda, então ninguém precisa ser avisado.';
  if (count === 1) return `1 passageiro com vaga aceita será avisado ${what}.`;
  return `${count} passageiros com vaga aceita serão avisados ${what}.`;
}
