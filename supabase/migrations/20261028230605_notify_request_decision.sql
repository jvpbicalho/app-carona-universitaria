-- EP06 — Notificar o passageiro (solicitação aceita ou recusada).
--
-- O que já existia (20260922224533_notifications.sql, EP03): a tabela
-- public.notifications como fila de avisos — destinatário, tipo, título,
-- texto, rota, payload, delivery_status, read_at — com RLS de leitura da
-- própria linha e sem escrita pelo app. Recebia só avisos de rota
-- cancelada/alterada. Nenhuma tabela estava publicada no Realtime.
--
-- Esta migration ESTENDE a tabela (não cria outra):
--   1. referência opcional à solicitação (request_id) e os tipos de aceite e
--      recusa;
--   2. "marcar como lida": só a própria, só a coluna read_at;
--   3. o aviso nasce no servidor, na MESMA transação da decisão do motorista
--      (decide_request → private.notify_request_event);
--   4. publica a tabela no Realtime: o app recebe o INSERT por WebSocket,
--      filtrado pelo próprio recipient_id (a RLS de leitura vale no Realtime).

-- ---------------------------------------------------------------------------
-- 1. Referência à solicitação e tipos novos
-- ---------------------------------------------------------------------------
alter table public.notifications
  add column if not exists request_id uuid references public.ride_requests (id) on delete set null;

comment on column public.notifications.request_id is
  'Solicitação de vaga a que o aviso se refere (aceite, recusa). Null para avisos de rota.';

create index if not exists notifications_request_idx on public.notifications (request_id);

-- Um aviso por (solicitação, tipo): mesmo que algum caminho tente gravar duas
-- vezes, o passageiro não recebe aviso duplicado. (decide_request já recusa
-- decidir duas vezes; isto é a garantia no dado.)
create unique index if not exists notifications_one_per_request_kind
  on public.notifications (request_id, kind)
  where request_id is not null;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('rota_cancelada', 'rota_alterada', 'solicitacao_aceita', 'solicitacao_recusada'));

-- ---------------------------------------------------------------------------
-- 2. Ler e marcar como lida — só as próprias
--
-- Leitura: policy notifications_select_own (EP03), mantida.
-- Escrita pelo app: nenhuma, exceto read_at. Privilégio por coluna + policy de
-- UPDATE restrita ao destinatário. INSERT/DELETE continuam sem policy, e o
-- privilégio é revogado por garantia.
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;

drop policy if exists "notifications_update_own_read" on public.notifications;
create policy "notifications_update_own_read"
  on public.notifications for update
  to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

-- "Marcar como lidas": todas as não lidas, ou só as dos ids informados.
-- SECURITY INVOKER: a policy acima é quem garante "só as próprias".
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.notifications n
     set read_at = now()
   where n.recipient_id = (select auth.uid())
     and n.read_at is null
     and (p_ids is null or n.id = any (p_ids));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Aviso de solicitação — lugar único de quem recebe e com que texto
--
-- (notify_affected_passengers, do EP03, continua sendo o lugar dos avisos de
-- ROTA. Este é o dos avisos de SOLICITAÇÃO.)
-- Horários em America/Sao_Paulo, como os avisos de rota.
-- ---------------------------------------------------------------------------
create or replace function private.notify_request_event(p_request_id uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.ride_requests;
  v_route   public.routes;
  v_when    text;
  v_trip    text;
  v_title   text;
  v_body    text;
begin
  select * into v_request from public.ride_requests rr where rr.id = p_request_id;
  if not found then
    return;
  end if;
  select * into v_route from public.routes r where r.id = v_request.route_id;

  v_when := to_char(v_route.departure_at at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');
  v_trip := format('a carona de %s, de %s para %s', v_when, v_route.origin_label, v_route.destination_label);

  if p_kind = 'solicitacao_aceita' then
    v_title := 'Vaga aceita';
    v_body  := format('Sua solicitação para %s foi aceita. Sua vaga está garantida.', v_trip);
  elsif p_kind = 'solicitacao_recusada' then
    v_title := 'Solicitação recusada';
    v_body  := format('Sua solicitação para %s foi recusada. Busque outra carona.', v_trip);
  else
    raise exception 'Tipo de aviso de solicitação desconhecido: %', p_kind
      using errcode = 'invalid_parameter_value';
  end if;

  insert into public.notifications (recipient_id, kind, route_id, request_id, title, body, payload)
  values (
    v_request.passenger_id,
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
-- decide_request: grava o aviso na mesma transação da decisão.
--
-- Igual à versão de 20261028225910_close_requests_when_full.sql; o ponto de
-- extensão "avisar o passageiro da decisão" virou a chamada abaixo. Se o aviso
-- falhar, a decisão é revertida — não existe decisão sem aviso.
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

  -- Aviso ao passageiro (EP06), mesma transação.
  perform private.notify_request_event(
    p_request_id,
    case p_decision when 'aceita' then 'solicitacao_aceita' else 'solicitacao_recusada' end
  );

  -- Aceitou a última vaga: as pendentes desta rota são encerradas aqui, na
  -- mesma transação. Lugar único: private.close_pending_if_full.
  if p_decision = 'aceita' then
    perform private.close_pending_if_full(v_route_id);
  end if;

  return v_request;
end;
$$;

revoke all on function public.decide_request(uuid, text) from public, anon;
grant execute on function public.decide_request(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Realtime
--
-- O app assina INSERT em public.notifications com filtro
-- recipient_id=eq.<próprio id>. O Realtime aplica a RLS de SELECT ao
-- assinante: mesmo sem o filtro, ninguém recebe aviso de outra pessoa.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
