import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

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
      const [nextRoute, nextPassengers] = await Promise.all([
        fetchRoute(routeId),
        fetchConfirmedPassengers(routeId),
      ]);
      setRoute(nextRoute);
      setPassengers(nextPassengers);
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

  return { route, passengers, loading, error, notFound, reload };
}

/** "1 passageiro confirmado será avisado" / "2 passageiros confirmados serão avisados". */
export function affectedPassengersText(count: number, what: string): string {
  if (count === 0) return 'Nenhum passageiro confirmado ainda, então ninguém precisa ser avisado.';
  if (count === 1) return `1 passageiro confirmado será avisado ${what}.`;
  return `${count} passageiros confirmados serão avisados ${what}.`;
}
