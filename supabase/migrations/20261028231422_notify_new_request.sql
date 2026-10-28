-- EP06 — Notificar o motorista (nova solicitação).
--
-- O que já existia: a tabela notifications no Realtime e o lugar único dos
-- avisos de solicitação (private.notify_request_event, migration
-- notify_request_decision); em request_seat, o comentário "PONTO DE EXTENSÃO
-- EP06: avisar o motorista".
--
-- Esta migration:
--   1. aviso `solicitacao_recebida` para o MOTORISTA da rota, gravado na mesma
--      transação do pedido (request_seat);
--   2. contagem de pendências do motorista para o badge da tela inicial,
--      DERIVADA das solicitações pendentes (nada de contador guardado).

-- ---------------------------------------------------------------------------
-- 1. Tipo novo + texto
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('rota_cancelada', 'rota_alterada', 'solicitacao_aceita', 'solicitacao_recusada', 'solicitacao_recebida'));

-- Igual à versão de 20261028230605_notify_request_decision.sql, mais o ramo
-- `solicitacao_recebida`, cujo destinatário é o motorista da rota.
create or replace function private.notify_request_event(p_request_id uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request   public.ride_requests;
  v_route     public.routes;
  v_recipient uuid;
  v_name      text;
  v_when      text;
  v_trip      text;
  v_title     text;
  v_body      text;
begin
  select * into v_request from public.ride_requests rr where rr.id = p_request_id;
  if not found then
    return;
  end if;
  select * into v_route from public.routes r where r.id = v_request.route_id;

  v_when := to_char(v_route.departure_at at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');
  v_trip := format('a carona de %s, de %s para %s', v_when, v_route.origin_label, v_route.destination_label);

  if p_kind = 'solicitacao_aceita' then
    v_recipient := v_request.passenger_id;
    v_title := 'Vaga aceita';
    v_body  := format('Sua solicitação para %s foi aceita. Sua vaga está garantida.', v_trip);
  elsif p_kind = 'solicitacao_recusada' then
    v_recipient := v_request.passenger_id;
    v_title := 'Solicitação recusada';
    v_body  := format('Sua solicitação para %s foi recusada. Busque outra carona.', v_trip);
  elsif p_kind = 'solicitacao_recebida' then
    v_recipient := v_route.driver_id;
    select coalesce(nullif(trim(p.full_name), ''), 'Um passageiro') into v_name
      from public.profiles p where p.id = v_request.passenger_id;
    v_title := 'Nova solicitação de vaga';
    v_body  := format('%s pediu vaga n%s. Responda em Minhas caronas.', coalesce(v_name, 'Um passageiro'), v_trip);
  else
    raise exception 'Tipo de aviso de solicitação desconhecido: %', p_kind
      using errcode = 'invalid_parameter_value';
  end if;

  insert into public.notifications (recipient_id, kind, route_id, request_id, title, body, payload)
  values (
    v_recipient,
    p_kind,
    v_route.id,
    v_request.id,
    v_title,
    v_body,
    jsonb_build_object('route_id', v_route.id, 'request_id', v_request.id)
  )
  on conflict (request_id, kind) where request_id is not null do nothing;
end;
$$;

revoke all on function private.notify_request_event(uuid, text) from public, anon, authenticated;
grant execute on function private.notify_request_event(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- request_seat: o ponto de extensão vira a chamada ao aviso.
-- Igual à versão de 20261021232157_request_seat.sql, mais essa linha.
-- ---------------------------------------------------------------------------
create or replace function public.request_seat(p_route_id uuid)
returns public.ride_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.ride_requests;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta para pedir vaga.'
      using errcode = 'insufficient_privilege', hint = 'not_authenticated';
  end if;

  perform 1 from public.routes r where r.id = p_route_id for update;
  if not found then
    raise exception 'Carona não encontrada.'
      using errcode = 'no_data_found', hint = 'route_not_found';
  end if;

  if exists (
    select 1 from public.ride_requests rr
    where rr.route_id = p_route_id
      and rr.passenger_id = v_uid
      and rr.status in ('pendente', 'aceita')
  ) then
    raise exception 'Você já pediu vaga nesta carona.'
      using errcode = 'unique_violation', hint = 'already_requested';
  end if;

  begin
    insert into public.ride_requests (route_id, passenger_id)
    values (p_route_id, v_uid)
    returning * into v_row;
  exception when unique_violation then
    raise exception 'Você já pediu vaga nesta carona.'
      using errcode = 'unique_violation', hint = 'already_requested';
  end;

  -- Aviso ao motorista (EP06), mesma transação: não existe pedido sem aviso.
  perform private.notify_request_event(v_row.id, 'solicitacao_recebida');

  return v_row;
end;
$$;

revoke all on function public.request_seat(uuid) from public, anon;
grant execute on function public.request_seat(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Contagem do badge
--
-- Derivada a cada chamada das solicitações `pendente` nas rotas do motorista
-- que ainda valem (publicadas e futuras: pedido de carona que já partiu não é
-- mais algo a responder). SECURITY INVOKER: a RLS de ride_requests já
-- restringe o motorista aos pedidos das rotas dele; o filtro driver_id é a
-- intenção explícita ("as MINHAS pendências").
--
-- Também devolve para onde o badge leva: se todas as pendências estão numa
-- rota só, direto para ela; senão, para a lista de caronas.
-- ---------------------------------------------------------------------------
create or replace function public.my_pending_requests_summary()
returns table (pending_count integer, routes_with_pending integer, single_route_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(*)::integer,
    count(distinct r.id)::integer,
    case when count(distinct r.id) = 1 then (array_agg(r.id))[1] end
  from public.ride_requests rr
  join public.routes r on r.id = rr.route_id
  where r.driver_id = (select auth.uid())
    and r.status = 'publicada'
    and r.departure_at > now()
    and rr.status = 'pendente';
$$;

revoke all on function public.my_pending_requests_summary() from public, anon;
grant execute on function public.my_pending_requests_summary() to authenticated, service_role;
