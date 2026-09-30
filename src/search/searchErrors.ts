/**
 * Erros da busca de caronas em pt-BR. Módulo puro, para ser testável.
 * Padrão P.3 do wireframe: diz o que houve e nunca mostra SQL cru.
 */

export type SearchDbError = { message?: string; hint?: string | null; code?: string };

export function describeSearchError(error: SearchDbError | null | undefined): string {
  const hint = error?.hint ?? '';
  const message = (error?.message ?? '').toLowerCase();

  if (hint === 'search_missing_params') {
    return 'Informe origem, destino e horário para buscar.';
  }
  if (hint === 'search_invalid_coordinates') {
    return 'Não conseguimos localizar um dos endereços. Busque e escolha-o de novo na lista.';
  }
  if (message.includes('network') || message.includes('fetch') || message.includes('failed to')) {
    return 'Sem conexão. Verifique sua internet e tente de novo.';
  }
  return 'Não foi possível buscar caronas agora. Tente de novo.';
}
