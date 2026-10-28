/**
 * Erros de solicitação de vaga traduzidos. O banco (request_seat e o trigger
 * ride_requests_validate) manda um `hint` estável por motivo de recusa; a
 * mensagem crua nunca vai para a tela.
 */
const BY_HINT: Record<string, string> = {
  already_requested: 'Você já pediu vaga nesta carona. Acompanhe em Minhas solicitações.',
  no_seats: 'As vagas desta carona se esgotaram. Busque outra carona.',
  route_not_available: 'Esta carona foi cancelada pelo motorista. Busque outra carona.',
  route_departed: 'Esta carona já partiu. Busque outro horário.',
  own_route: 'Esta carona é sua. Não dá para pedir vaga nela.',
  profile_incomplete: 'Complete seu perfil (nome, foto, curso e campus) antes de pedir vaga.',
  route_not_found: 'Não encontramos esta carona. Ela pode ter sido removida.',
  not_authenticated: 'Sua sessão expirou. Entre de novo para pedir vaga.',
  refused_before: 'O motorista já recusou seu pedido nesta carona. Busque outra carona.',
};

/** Recusas que mudam a lista: depois delas, vale buscar de novo. */
export const REFRESH_AFTER: ReadonlySet<string> = new Set(['no_seats', 'route_not_available', 'route_departed', 'route_not_found']);

function isNetworkError(error: { message?: string } | null): boolean {
  const message = (error?.message ?? '').toLowerCase();
  return message.includes('network') || message.includes('fetch') || message.includes('failed to');
}

export function describeRequestError(error: { message?: string; hint?: string | null } | null): string {
  const hint = error?.hint ?? '';
  if (BY_HINT[hint]) return BY_HINT[hint];
  if (isNetworkError(error)) return 'Sem conexão. Verifique sua internet e tente de novo.';
  return 'Não foi possível pedir a vaga agora. Tente de novo.';
}

/**
 * Erros de decide_request (aceitar/recusar), para o motorista. Mesma ideia:
 * hint estável do banco → frase que diz o que houve e o que fazer.
 */
const DECISION_BY_HINT: Record<string, string> = {
  not_route_driver: 'Só o motorista desta carona pode responder às solicitações.',
  request_not_pending: 'Esta solicitação já foi respondida. A lista foi atualizada.',
  request_closed_full: 'As vagas se esgotaram e esta solicitação foi encerrada. A lista foi atualizada.',
  no_seats: 'As vagas desta carona acabaram. A solicitação continua pendente; você pode recusá-la.',
  route_not_available: 'Esta carona foi cancelada. Não há mais o que responder.',
  route_departed: 'Esta carona já partiu. Não dá mais para aceitar passageiros.',
  request_not_found: 'Não encontramos esta solicitação. A lista foi atualizada.',
  invalid_decision: 'Não foi possível registrar a resposta. Tente de novo.',
  not_authenticated: 'Sua sessão expirou. Entre de novo para responder.',
};

export function describeDecisionError(error: { message?: string; hint?: string | null } | null): string {
  const hint = error?.hint ?? '';
  if (DECISION_BY_HINT[hint]) return DECISION_BY_HINT[hint];
  if (isNetworkError(error)) return 'Sem conexão. Verifique sua internet e tente de novo.';
  return 'Não foi possível registrar a resposta agora. Tente de novo.';
}
