/**
 * Status de uma solicitação de vaga (EP05). Espelha a constraint
 * ride_requests_status_check; a próxima história (fechar pedidos quando a rota
 * lota) só amplia esta lista.
 */
export type RequestStatus = 'pendente' | 'aceita' | 'recusada' | 'cancelada';

export const REQUEST_STATUSES: RequestStatus[] = ['pendente', 'aceita', 'recusada', 'cancelada'];

export function isRequestStatus(value: unknown): value is RequestStatus {
  return typeof value === 'string' && (REQUEST_STATUSES as string[]).includes(value);
}

/** Pedido que ainda ocupa o passageiro nesta rota (bloqueia pedir de novo). */
export function isActiveRequest(status: RequestStatus | null): boolean {
  return status === 'pendente' || status === 'aceita';
}

export type RequestDescription = {
  /** Etiqueta curta: "Pendente", "Aceita"… */
  label: string;
  /** Uma frase do que isso significa para o passageiro, e o que fazer. */
  detail: string;
};

/**
 * O que mostrar ao passageiro sobre um pedido. Leva em conta a rota: um
 * pedido aceito numa carona cancelada não é "Aceita" para quem lê.
 */
export function describeRequest(
  request: { status: RequestStatus; routeStatus: string; departureAt: Date },
  now: Date = new Date(),
): RequestDescription {
  const departed = request.departureAt.getTime() <= now.getTime();

  if (request.routeStatus === 'cancelada') {
    return {
      label: 'Carona cancelada',
      detail: 'O motorista cancelou esta carona. Busque outra para o mesmo horário.',
    };
  }

  switch (request.status) {
    case 'pendente':
      return departed
        ? { label: 'Sem resposta', detail: 'A carona partiu antes de o motorista responder.' }
        : { label: 'Pendente', detail: 'Aguardando o motorista aceitar. A vaga ainda não está reservada.' };
    case 'aceita':
      return departed
        ? { label: 'Viagem realizada', detail: 'Esta carona já partiu.' }
        : { label: 'Aceita', detail: 'Sua vaga está garantida. Esteja no ponto no horário.' };
    case 'recusada':
      return { label: 'Recusada', detail: 'O motorista não aceitou. Busque outra carona.' };
    case 'cancelada':
      return { label: 'Cancelada', detail: 'Esta solicitação foi encerrada.' };
  }
}

/** Texto do botão no cartão da busca, conforme o pedido que já existe. */
export function requestButtonLabel(status: RequestStatus | null): string {
  switch (status) {
    case 'pendente':
      return 'Solicitação pendente';
    case 'aceita':
      return 'Vaga aceita';
    case 'recusada':
      return 'Solicitação recusada';
    default:
      return 'Solicitar vaga';
  }
}
