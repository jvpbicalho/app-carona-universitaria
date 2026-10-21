-- EP05 — Aceitar ou recusar solicitação.
--
-- O que já existia: ride_requests com status pendente/aceita/recusada/cancelada,
-- a vaga derivada (public.seats_taken/seats_available, migration request_seat)
-- e a leitura do motorista pelas policies. Faltava a decisão.
--
-- Esta migration:
--   1. registra QUANDO a decisão aconteceu (decided_at);
--   2. cria a RPC transacional decide_request (só o motorista dono, só pedido
--      pendente, revalida a vaga dentro da transação ao aceitar);
--   3. impede pedir de novo na MESMA rota depois de uma recusa (outras rotas
--      continuam livres).
--
-- Vaga continua derivada: aceitar é só mudar o status para `aceita`, e
-- seats_available passa a descontá-la na mesma transação. Não há contador.

-- ---------------------------------------------------------------------------
-- 1. Data da decisão
-- ---------------------------------------------------------------------------
alter table public.ride_requests add column if not exists decided_at timestamptz;

comment on column public.ride_requests.decided_at is
  'Quando o motorista aceitou ou recusou. Preenchido por decide_request.';

-- Aceita ou recusada sempre tem data. (Só nessa direção: um pedido aceito que
-- for cancelado depois — Fase 2 — mantém a data da decisão.)
alter table public.ride_requests drop constraint if exists ride_requests_decided_at_consistency;
alter table public.ride_requests add constraint ride_requests_decided_at_consistency
  check (status not in ('aceita', 'recusada') or decided_at is not null);

-- ---------------------------------------------------------------------------
-- 2. A decisão
--
-- SECURITY DEFINER: o motorista não tem (nem deve ter) policy de UPDATE em
-- ride_requests; toda mudança de status passa por aqui, com as regras juntas.
--
-- Ordem das travas igual à de request_seat (rota primeiro): pedidos e
-- decisões sobre a mesma rota acontecem um de cada vez. Dois "Aceitar"
-- simultâneos para a última vaga: o segundo espera o primeiro terminar, conta
-- de novo e recebe `no_seats` — e o pedido dele continua pendente.
-- ---------------------------------------------------------------------------
create or replace function public.decide_request(p_request_id uuid, p_decision text)
returns public.ride_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_route_id uuid;
  v_route   public.routes;
  v_request public.ride_requests;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta para responder solicitações.'
      using errcode = 'insufficient_privilege', hint = 'not_authenticated';
  end if;

  if p_decision is null or p_decision not in ('aceita', 'recusada') then
    raise exception 'Decisão inválida.'
      using errcode = 'invalid_parameter_value', hint = 'invalid_decision';
  end if;

  select rr.route_id into v_route_id from public.ride_requests rr where rr.id = p_request_id;
  if not found then
    raise exception 'Solicitação não encontrada.'
      using errcode = 'no_data_found', hint = 'request_not_found';
  end if;

  -- Trava a rota, depois o pedido (mesma ordem de request_seat: sem deadlock).
  select * into v_route from public.routes r where r.id = v_route_id for update;
  select * into v_request from public.ride_requests rr where rr.id = p_request_id for update;

  -- Só o motorista dono da rota decide.
  if v_route.driver_id <> v_uid then
    raise exception 'Só o motorista desta carona pode responder a solicitação.'
      using errcode = 'insufficient_privilege', hint = 'not_route_driver';
  end if;

  -- Só pendente pode ser decidida: decidir duas vezes falha.
  if v_request.status <> 'pendente' then
    raise exception 'Esta solicitação já foi respondida.'
      using errcode = 'check_violation', hint = 'request_not_pending';
  end if;

  if v_route.status <> 'publicada' then
    raise exception 'Esta carona foi cancelada.'
      using errcode = 'check_violation', hint = 'route_not_available';
  end if;

  if p_decision = 'aceita' then
    if v_route.departure_at <= now() then
      raise exception 'Esta carona já partiu.'
        using errcode = 'check_violation', hint = 'route_departed';
    end if;

    -- Revalida a vaga AQUI, com a rota travada: entre o pedido e a decisão,
    -- outro passageiro pode ter sido aceito. Lugar único da regra: seats_available.
    if public.seats_available(v_route) <= 0 then
      raise exception 'As vagas desta carona acabaram. A solicitação continua pendente.'
        using errcode = 'check_violation', hint = 'no_seats';
    end if;
  end if;

  update public.ride_requests
     set status = p_decision,
         decided_at = now()
   where id = p_request_id
  returning * into v_request;

  -- PONTO DE EXTENSÃO EP06: avisar o passageiro da decisão
  -- (notifications.kind 'solicitacao_aceita' / 'solicitacao_recusada', via
  -- private.notify_*). Não implementado aqui.

  -- PRÓXIMA HISTÓRIA (fechar solicitações quando as vagas se esgotarem):
  -- depois de um aceite, se public.seats_available(v_route) = 0, encerrar os
  -- pendentes desta rota. Reutilizar seats_available — não recalcular.

  return v_request;
end;
$$;

revoke all on function public.decide_request(uuid, text) from public, anon;
grant execute on function public.decide_request(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Nova tentativa depois de recusa
--
-- Decisão (21/10/2026): recusado NÃO pode pedir de novo na mesma rota — a
-- resposta do motorista vale para aquela viagem, e sem isso o passageiro
-- poderia insistir. Em OUTRAS rotas, inclusive do mesmo motorista, nada muda.
-- Cancelado (ex.: rota cancelada fechou o pedido) não bloqueia.
--
-- validate_ride_request igual à de 20261021232157_request_seat.sql, mais essa
-- regra.
-- ---------------------------------------------------------------------------
create or replace function private.validate_ride_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_route    public.routes;
  v_complete boolean;
begin
  select * into v_route from public.routes r where r.id = new.route_id for update;

  if not found then
    raise exception 'Carona não encontrada.'
      using errcode = 'no_data_found', hint = 'route_not_found';
  end if;

  if new.status <> 'pendente' then
    raise exception 'Uma solicitação nova começa pendente.'
      using errcode = 'check_violation', hint = 'invalid_initial_state';
  end if;

  if v_route.driver_id = new.passenger_id then
    raise exception 'Você não pode pedir vaga na sua própria carona.'
      using errcode = 'check_violation', hint = 'own_route';
  end if;

  if v_route.status <> 'publicada' then
    raise exception 'Esta carona foi cancelada.'
      using errcode = 'check_violation', hint = 'route_not_available';
  end if;

  if v_route.departure_at <= now() then
    raise exception 'Esta carona já partiu.'
      using errcode = 'check_violation', hint = 'route_departed';
  end if;

  if exists (
    select 1 from public.ride_requests rr
    where rr.route_id = new.route_id
      and rr.passenger_id = new.passenger_id
      and rr.status = 'recusada'
  ) then
    raise exception 'O motorista já recusou seu pedido nesta carona.'
      using errcode = 'check_violation', hint = 'refused_before';
  end if;

  if public.seats_available(v_route) <= 0 then
    raise exception 'Esta carona não tem mais vagas.'
      using errcode = 'check_violation', hint = 'no_seats';
  end if;

  select p.is_complete into v_complete from public.profiles p where p.id = new.passenger_id;
  if not coalesce(v_complete, false) then
    raise exception 'Complete seu perfil antes de pedir vaga.'
      using errcode = 'check_violation', hint = 'profile_incomplete';
  end if;

  return new;
end;
$$;
