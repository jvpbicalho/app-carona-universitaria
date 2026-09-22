/**
 * Tradução dos erros de rota do Postgres para pt-BR.
 *
 * Módulo puro (sem Supabase) para poder ser testado. Os erros vêm do trigger
 * `routes_validate` e das constraints de `routes`; quase todos só aparecem se
 * a validação do app for contornada, mas o usuário nunca pode ver SQL cru
 * (padrão P.3 do wireframe). O `hint` é o que o trigger emite de propósito
 * para isto.
 */

export type RouteDbError = { message?: string; hint?: string | null; code?: string };

const BY_HINT: Record<string, string> = {
  departure_in_past: 'O horário de saída não pode ser no passado.',
  seats_exceed_vehicle: 'A carona oferece mais vagas do que o veículo comporta.',
  profile_incomplete: 'Complete seu perfil antes de publicar uma carona.',
  vehicle_not_found: 'Cadastre seu veículo antes de publicar uma carona.',
  vehicle_not_owned: 'Cadastre seu veículo antes de publicar uma carona.',
  route_not_editable: 'Esta carona já foi cancelada ou concluída e não pode mais ser alterada.',
  route_already_departed: 'Esta carona já partiu e não pode mais ser alterada.',
  cancel_with_changes: 'Cancele ou edite a carona, não os dois ao mesmo tempo.',
  status_transition_forbidden: 'Essa mudança de situação da carona não é permitida.',
  seats_taken_managed: 'As vagas ocupadas mudam só quando uma solicitação é confirmada.',
};

export function describeRouteError(
  error: RouteDbError,
  fallback = 'Não foi possível publicar a carona. Tente novamente.',
): string {
  const hint = error.hint ?? '';
  if (BY_HINT[hint]) return BY_HINT[hint];

  const message = (error.message ?? '').toLowerCase();

  // Constraints não carregam hint; o nome delas vem na mensagem.
  if (message.includes('routes_cancellation_reason')) {
    return 'Informe o motivo do cancelamento.';
  }
  if (message.includes('passado')) {
    return BY_HINT.departure_in_past;
  }
  if (message.includes('vagas')) {
    return BY_HINT.seats_exceed_vehicle;
  }
  return fallback;
}
