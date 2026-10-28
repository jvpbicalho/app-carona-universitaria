-- EP05 — Fechar solicitações quando as vagas esgotarem.
--
-- O que já existia: vaga derivada num lugar só (public.seats_available), a
-- busca escondendo rota com 0 vagas, request_seat recusando rota sem vaga e
-- decide_request revalidando a vaga com a rota travada.
--
-- Esta migration:
--   1. amplia os status de ride_requests com `encerrada` (pedido pendente
--      fechado pelo SISTEMA porque as vagas acabaram — não é recusa do
--      motorista);
--   2. cria o lugar único que encerra as pendentes de uma rota sem vaga
--      (private.close_pending_if_full), chamado na MESMA transação do aceite e
--      de qualquer redução de vagas da carona;
--   3. decide_request passa a chamá-lo e responde com clareza quando o pedido
--      já foi encerrado.
--
-- "Vagas esgotadas" NÃO é um status guardado em routes: é derivado de
-- public.seats_available(r) = 0 (com a rota publicada). Um status persistido
-- teria de ser mantido em toda mudança de vaga e poderia divergir.

-- ---------------------------------------------------------------------------
-- 1. Status `encerrada`
-- ---------------------------------------------------------------------------
alter table public.ride_requests drop constraint if exists ride_requests_status_check;
alter table public.ride_requests add constraint ride_requests_status_check
  check (status in ('pendente', 'aceita', 'recusada', 'cancelada', 'encerrada'));

comment on column public.ride_requests.status is
  'pendente (inicial) → aceita | recusada (decisão do motorista) | cancelada '
  '(rota cancelada) | encerrada (vagas esgotaram antes da decisão). Só `aceita` '
  'ocupa vaga e só `aceita` é avisada quando a rota muda.';

-- ---------------------------------------------------------------------------
-- 2. Lugar único: encerrar pendentes quando a rota fica sem vaga
--
-- Reutiliza public.seats_available — não há segundo cálculo de vaga. Quem
-- chama já tem a rota travada (FOR UPDATE), então não existe janela entre
-- "lotou" e "encerrou".
-- Devolve quantos pedidos foram encerrados.
-- ---------------------------------------------------------------------------
create or replace function private.close_pending_if_full(p_route_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_route public.routes;
  v_count integer;
begin
  select * into v_route from public.routes r where r.id = p_route_id;
  if not found or public.seats_available(v_route) > 0 then
    return 0;
  end if;

  update public.ride_requests
     set status = 'encerrada'
   where route_id = p_route_id
     and status = 'pendente';

  get diagnostics v_count = row_count;

  -- PONTO DE EXTENSÃO EP06: avisar os passageiros encerrados ("as vagas desta
  -- carona se esgotaram"). Não faz parte das histórias atuais.

  return v_count;
end;
$$;

revoke all on function private.close_pending_if_full(uuid) from public, anon, authenticated;
grant execute on function private.close_pending_if_full(uuid) to service_role;

-- Vagas da carona reduzidas até o número de aceitas também esgotam a rota.
-- (O app não edita vagas hoje, mas a API permite ao motorista; a regra vale
-- para qualquer caminho.)
create or replace function private.on_route_seats_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.close_pending_if_full(new.id);
  return null;
end;
$$;

revoke all on function private.on_route_seats_changed() from public, anon, authenticated;

drop trigger if exists routes_close_pending_when_full on public.routes;
create trigger routes_close_pending_when_full
  after update of seats_total on public.routes
  for each row
  when (new.seats_total < old.seats_total)
  execute function private.on_route_seats_changed();

-- ---------------------------------------------------------------------------
-- 3. decide_request: encerra as pendentes ao preencher a última vaga
--
-- Igual à versão de 20261021233055_decide_request.sql, mais:
--   - depois de um aceite, private.close_pending_if_full (mesma transação);
--   - pedido já encerrado responde `request_closed_full`, não "já respondida".
-- ---------------------------------------------------------------------------
create or replace function public.decide_request(p_request_id uuid, p_decision text)
returns public.ride_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_route_id uuid;
  v_route    public.routes;
  v_request  public.ride_requests;
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

  if v_route.driver_id <> v_uid then
    raise exception 'Só o motorista desta carona pode responder a solicitação.'
      using errcode = 'insufficient_privilege', hint = 'not_route_driver';
  end if;

  if v_request.status = 'encerrada' then
    raise exception 'As vagas desta carona se esgotaram e esta solicitação foi encerrada.'
      using errcode = 'check_violation', hint = 'request_closed_full';
  end if;

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

  -- Aceitou a última vaga: as pendentes desta rota são encerradas aqui, na
  -- mesma transação. Lugar único: private.close_pending_if_full.
  if p_decision = 'aceita' then
    perform private.close_pending_if_full(v_route_id);
  end if;

  -- PONTO DE EXTENSÃO EP06: avisar o passageiro da decisão
  -- (notifications.kind 'solicitacao_aceita' / 'solicitacao_recusada').

  return v_request;
end;
$$;

revoke all on function public.decide_request(uuid, text) from public, anon;
grant execute on function public.decide_request(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Pedido novo em rota esgotada: mensagem clara
--
-- validate_ride_request igual à de 20261021233055_decide_request.sql; só o
-- texto da recusa por falta de vaga muda (o hint `no_seats` continua).
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
    raise exception 'As vagas desta carona se esgotaram.'
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
