/**
 * Erros da RPC update_matching_settings traduzidos para o admin. O banco manda
 * um `hint` estável; a mensagem crua nunca vai para a tela.
 */
export function describeMatchingError(error: { message?: string; hint?: string | null } | null): string {
  const hint = error?.hint ?? '';
  const message = (error?.message ?? '').toLowerCase();

  if (hint === 'matching_not_admin') {
    return 'Só administradores podem alterar as regras da busca. Se você deveria ter acesso, fale com o gerente do projeto.';
  }
  if (hint === 'matching_radius_range') return 'O raio precisa estar entre 0,5 e 50 km.';
  if (hint === 'matching_window_range') return 'A janela precisa estar entre 5 e 240 minutos.';
  if (message.includes('network') || message.includes('fetch') || message.includes('failed to')) {
    return 'Sem conexão. Verifique sua internet e tente de novo.';
  }
  return 'Não foi possível salvar as regras agora. Tente de novo.';
}
