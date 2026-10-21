import { SUPABASE_KEY, SUPABASE_URL, supabase } from '@/lib/supabase';
import type { GeoPoint } from '@/routes/routeValidation';

/**
 * Busca de endereço, via Edge Function `geocode` (que faz proxy do Nominatim).
 *
 * O app nunca fala com o Nominatim direto: ver o comentário no topo de
 * supabase/functions/geocode/index.ts.
 */

export type GeocodeSuggestion = GeoPoint & {
  city: string | null;
  state: string | null;
};

export class GeocodeError extends Error {}

export async function searchAddress(
  query: string,
  signal?: AbortSignal,
): Promise<GeocodeSuggestion[]> {
  // A função exige JWT de usuário: a publishable key sozinha é recusada.
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  if (!accessToken) {
    throw new GeocodeError('Entre na sua conta para buscar endereços.');
  }

  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/geocode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ query }),
      signal,
    });
  } catch (error) {
    // Busca cancelada porque o usuário continuou digitando não é falha:
    // propaga para quem chamou distinguir e simplesmente ignorar.
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new GeocodeError('Sem conexão. Verifique sua internet e tente de novo.');
  }

  let payload: { results?: GeocodeSuggestion[]; error?: string; message?: string };
  try {
    payload = await response.json();
  } catch {
    throw new GeocodeError('A busca de endereços não respondeu como esperado. Tente de novo em instantes.');
  }

  if (!response.ok) {
    // A mensagem do servidor só vai para a tela quando foi escrita para o
    // usuário. `invalid_body` ("Corpo da requisição inválido") é falha do
    // app, não de quem digita — vira a mensagem genérica.
    const userFacing = payload.error !== 'invalid_body' ? payload.message : undefined;
    throw new GeocodeError(userFacing ?? 'Não foi possível buscar endereços agora. Tente de novo em instantes.');
  }

  return payload.results ?? [];
}
