-- EP05 — Solicitar vaga.
--
-- O que já existia (20260922224519_ride_requests.sql, criada no EP03): a
-- tabela ride_requests no formato mínimo, um pedido ativo por passageiro por
-- rota (índice parcial) e RLS de leitura. Sem escrita nenhuma.
--
-- Esta migration:
--   1. renomeia os status para os da história: aguardando → pendente,
--      confirmada → aceita (critério de aceite: "status inicial pendente");
--   2. troca o contador routes.seats_taken por vaga DERIVADA das solicitações
--      aceitas, calculada num lugar só (public.seats_taken/seats_available);
--   3. aplica as regras de integridade no banco (trigger) e cria a RPC
--      transacional request_seat;
--   4. a busca passa a usar a vaga derivada e devolve o status do pedido de
--      quem busca; my_ride_requests lista os pedidos do passageiro.

-- ---------------------------------------------------------------------------
-- 1. Status
-- ---------------------------------------------------------------------------
drop index if exists public.ride_requests_one_active_per_passenger;
alter table public.ride_requests drop constraint if exists ride_requests_status_check;

update public.ride_requests
   set status = case status when 'aguardando' then 'pendente' when 'confirmada' then 'aceita' else status end
 where status in ('aguardando', 'confirmada');

alter table public.ride_requests alter column status set default 'pendente';

-- Check, e não enum: a próxima história (fechar pedidos quando a rota lota)
-- só amplia a lista, sem ALTER TYPE.
alter table public.ride_requests add constraint ride_requests_status_check
  check (status in ('pendente', 'aceita', 'recusada', 'cancelada'));

-- Um pedido ATIVO por passageiro por rota. Também é o que barra o clique duplo
-- mesmo se duas chamadas escaparem da trava da rota.
create unique index ride_requests_one_active_per_passenger
  on public.ride_requests (route_id, passenger_id)
  where status in ('pendente', 'aceita');

comment on column public.ride_requests.status is
  'pendente (inicial) → aceita | recusada (decisão do motorista) | cancelada. '
  'Só `aceita` ocupa vaga e só `aceita` é avisada quando a rota muda.';

-- ---------------------------------------------------------------------------
-- 2. Vagas: um lugar só
--
-- Vaga ocupada = solicitações aceitas. Vaga disponível = vagas da carona
-- (routes.seats_total, já limitada à capacidade do veículo) − ocupadas.
-- Pendentes NÃO consomem vaga.
--
-- Sem contador guardado: um contador precisaria ser mantido em toda transição
-- de status e poderia divergir. Contar é barato (índice route_id, status).
--
-- Funções com a linha de routes como argumento: o PostgREST as expõe como
-- "colunas computadas" (select=seats_taken,seats_available), então o app lê
-- os mesmos nomes de antes. SECURITY DEFINER porque o passageiro não enxerga
-- os pedidos dos outros pela RLS, e a contagem precisa de todos. Devolvem só
-- números.
--
-- A próxima história ("fechar solicitações quando as vagas acabarem") deve
-- reutilizar public.seats_available — não recalcular.
-- ---------------------------------------------------------------------------
create or replace function public.seats_taken(r public.routes)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.ride_requests rr
  where rr.route_id = r.id
    and rr.status = 'aceita';
$$;

create or replace function public.seats_available(r public.routes)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select r.seats_total - public.seats_taken(r);
$$;

comment on function public.seats_taken(public.routes) is
  'Vagas ocupadas = solicitações aceitas. Lugar único da regra de vagas (EP05).';
comment on function public.seats_available(public.routes) is
  'Vagas disponíveis = seats_total − seats_taken. Lugar único da regra (EP05).';

revoke all on function public.seats_taken(public.routes)     from public, anon;
revoke all on function public.seats_available(public.routes) from public, anon;
grant execute on function public.seats_taken(public.routes)     to authenticated, service_role;
grant execute on function public.seats_available(public.routes) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- validate_route, sem o contador.
--
-- Igual à versão de 20260922224557_route_edit_cancel.sql, menos as regras de
-- seats_taken (a coluna sai) e mais uma: reduzir as vagas da carona abaixo do
-- que já foi aceito é recusado.
-- ---------------------------------------------------------------------------
create or replace function public.validate_route()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_vehicle_seats integer;
  v_vehicle_owner uuid;
  v_is_complete   boolean;
  v_from_app      boolean := current_user = 'authenticated';
  v_editing       boolean := false;
  v_cancelling    boolean := false;
  v_taken         integer;
begin
  if tg_op = 'INSERT' then
    if v_from_app and new.status <> 'publicada' then
      raise exception 'Uma carona nova começa publicada.'
        using errcode = 'check_violation', hint = 'invalid_initial_state';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    -- Cancelada e concluída são estados terminais.
    if old.status <> 'publicada' then
      raise exception 'Esta carona está % e não pode mais ser alterada.', old.status
        using errcode = 'check_violation', hint = 'route_not_editable';
    end if;

    if new.driver_id is distinct from old.driver_id then
      raise exception 'O motorista de uma carona não pode ser trocado.'
        using errcode = 'check_violation', hint = 'driver_immutable';
    end if;

    v_editing :=
         new.origin_label          is distinct from old.origin_label
      or new.origin_latitude       is distinct from old.origin_latitude
      or new.origin_longitude      is distinct from old.origin_longitude
      or new.destination_label     is distinct from old.destination_label
      or new.destination_latitude  is distinct from old.destination_latitude
      or new.destination_longitude is distinct from old.destination_longitude
      or new.departure_at          is distinct from old.departure_at;

    v_cancelling := new.status = 'cancelada';

    if v_from_app then
      -- Pelo app, a única transição de status permitida é cancelar.
      if new.status not in ('publicada', 'cancelada') then
        raise exception 'Transição de status não permitida.'
          using errcode = 'check_violation', hint = 'status_transition_forbidden';
      end if;
    end if;

    -- Cancelar e editar na mesma operação deixaria ambíguo o aviso ao
    -- passageiro ("cancelada" ou "alterada"?).
    if v_cancelling and v_editing then
      raise exception 'Cancele ou edite a carona, não os dois ao mesmo tempo.'
        using errcode = 'check_violation', hint = 'cancel_with_changes';
    end if;

    if (v_editing or v_cancelling) and old.departure_at <= now() then
      raise exception 'Esta carona já partiu e não pode mais ser alterada.'
        using errcode = 'check_violation', hint = 'route_already_departed';
    end if;

    -- Vagas da carona nunca abaixo das já aceitas.
    if new.seats_total is distinct from old.seats_total then
      v_taken := public.seats_taken(new);
      if new.seats_total < v_taken then
        raise exception 'A carona já tem % vaga(s) aceita(s); não dá para oferecer menos.', v_taken
          using errcode = 'check_violation', hint = 'seats_below_accepted';
      end if;
    end if;

    if v_cancelling then
      new.cancelled_at := now();
    end if;
  end if;

  -- Mesma regra do cadastro, reaproveitada na edição: só quando o horário muda.
  if tg_op = 'INSERT' or new.departure_at is distinct from old.departure_at then
    if new.departure_at <= now() - interval '1 minute' then
      raise exception 'A partida não pode ser no passado.'
        using errcode = 'check_violation', hint = 'departure_in_past';
    end if;
  end if;

  if tg_op = 'INSERT'
     or new.vehicle_id  is distinct from old.vehicle_id
     or new.seats_total is distinct from old.seats_total then
    select v.seats, v.owner_id into v_vehicle_seats, v_vehicle_owner
    from public.vehicles v where v.id = new.vehicle_id;

    if v_vehicle_seats is null then
      raise exception 'Veículo não encontrado.'
        using errcode = 'foreign_key_violation', hint = 'vehicle_not_found';
    end if;

    if v_vehicle_owner <> new.driver_id then
      raise exception 'O veículo informado não pertence a este motorista.'
        using errcode = 'check_violation', hint = 'vehicle_not_owned';
    end if;

    if new.seats_total > v_vehicle_seats then
      raise exception 'A carona não pode oferecer % vagas: o veículo tem %.',
        new.seats_total, v_vehicle_seats
        using errcode = 'check_violation', hint = 'seats_exceed_vehicle';
    end if;
  end if;

  -- Perfil completo é condição para PUBLICAR, não para cancelar.
  if tg_op = 'INSERT' then
    select p.is_complete into v_is_complete
    from public.profiles p where p.id = new.driver_id;

    if not coalesce(v_is_complete, false) then
      raise exception 'Complete seu perfil antes de publicar uma carona.'
        using errcode = 'check_violation', hint = 'profile_incomplete';
    end if;
  end if;

  return new;
end;
$$;

-- Agora sim, sai o contador. seats_available (gerada) depende de seats_taken.
alter table public.routes drop column if exists seats_available;
alter table public.routes drop constraint if exists routes_seats_taken_range;
alter table public.routes drop column if exists seats_taken;

-- ---------------------------------------------------------------------------
-- Avisos do EP03: destinatários passam a ser as solicitações `aceita`.
-- Texto e regras iguais aos de 20260922224533_notifications.sql.
-- ---------------------------------------------------------------------------
create or replace function private.notify_affected_passengers(
  p_route_id uuid,
  p_kind     text,
  p_reason   text  default null,
  p_details  jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_route   public.routes;
  v_when    text;
  v_title   text;
  v_body    text;
  v_count   integer;
begin
  select * into v_route from public.routes where id = p_route_id;
  if not found then
    return 0;
  end if;

  v_when := to_char(v_route.departure_at at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');

  if p_kind = 'rota_cancelada' then
    v_title := 'Carona cancelada';
    v_body  := format('A carona de %s para %s foi cancelada. Motivo: %s',
                      v_when, v_route.destination_label, coalesce(p_reason, 'não informado'));
  elsif p_kind = 'rota_alterada' then
    v_title := 'Carona alterada';
    v_body  := format('O motorista alterou %s da sua carona. Agora: saída %s, de %s para %s.',
                      coalesce(p_details ->> 'changed_summary', 'os dados'),
                      v_when, v_route.origin_label, v_route.destination_label);
  else
    raise exception 'Tipo de aviso desconhecido: %', p_kind
      using errcode = 'invalid_parameter_value';
  end if;

  insert into public.notifications (recipient_id, kind, route_id, title, body, payload)
  select
    rr.passenger_id,
    p_kind,
    p_route_id,
    v_title,
    v_body,
    jsonb_build_object('route_id', p_route_id, 'reason', p_reason) || coalesce(p_details, '{}'::jsonb)
  from public.ride_requests rr
  where rr.route_id = p_route_id
    and rr.status = 'aceita';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Rota cancelada: além de avisar os aceitos (como antes), fecha os pedidos
-- pendentes — senão o passageiro veria "pendente" para sempre numa carona que
-- não existe mais. Aceitos ficam `aceita`: a rota cancelada já diz o que houve.
create or replace function private.on_route_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed text[] := '{}';
  v_summary text;
begin
  -- array_append, e não `v_changed || 'texto'` ("malformed array literal").
  if new.status = 'cancelada' and old.status <> 'cancelada' then
    perform private.notify_affected_passengers(new.id, 'rota_cancelada', new.cancellation_reason);

    update public.ride_requests
       set status = 'cancelada'
     where route_id = new.id
       and status = 'pendente';

    return null;
  end if;

  if new.departure_at is distinct from old.departure_at then
    v_changed := array_append(v_changed, 'o horário');
  end if;
  if (new.origin_label, new.origin_latitude, new.origin_longitude)
     is distinct from (old.origin_label, old.origin_latitude, old.origin_longitude) then
    v_changed := array_append(v_changed, 'a origem');
  end if;
  if (new.destination_label, new.destination_latitude, new.destination_longitude)
     is distinct from (old.destination_label, old.destination_latitude, old.destination_longitude) then
    v_changed := array_append(v_changed, 'o destino');
  end if;

  if cardinality(v_changed) = 0 then
    return null;
  end if;

  v_summary := case cardinality(v_changed)
    when 1 then v_changed[1]
    else array_to_string(v_changed[1:cardinality(v_changed) - 1], ', ')
         || ' e ' || v_changed[cardinality(v_changed)]
  end;

  perform private.notify_affected_passengers(
    new.id,
    'rota_alterada',
    null,
    jsonb_build_object(
      'changed_summary', v_summary,
      'previous', jsonb_build_object(
        'departure_at',      old.departure_at,
        'origin_label',      old.origin_label,
        'destination_label', old.destination_label
      )
    )
  );

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Regras de integridade de uma solicitação nova (qualquer caminho:
--    RPC, dashboard, service_role).
--
-- Trava a linha da rota (FOR UPDATE): pedidos e decisões sobre a mesma rota
-- acontecem um de cada vez, então "tem vaga?" não muda entre a checagem e o
-- fim da transação.
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

  if public.seats_available(v_route) <= 0 then
    raise exception 'Esta carona não tem mais vagas.'
      using errcode = 'check_violation', hint = 'no_seats';
  end if;

  -- O motorista decide olhando nome, foto, curso e campus (história de
  -- aceitar/recusar). Sem perfil completo não há o que mostrar.
  select p.is_complete into v_complete from public.profiles p where p.id = new.passenger_id;
  if not coalesce(v_complete, false) then
    raise exception 'Complete seu perfil antes de pedir vaga.'
      using errcode = 'check_violation', hint = 'profile_incomplete';
  end if;

  return new;
end;
$$;

drop trigger if exists ride_requests_validate on public.ride_requests;
create trigger ride_requests_validate
  before insert on public.ride_requests
  for each row execute function private.validate_ride_request();

-- ---------------------------------------------------------------------------
-- RPC transacional: o app pede vaga por aqui.
--
-- RLS: não existe policy de INSERT em ride_requests — escrita direta pela API
-- é recusada. O passageiro "cria apenas as próprias" porque a RPC usa sempre
-- auth.uid() como passageiro; não há parâmetro para isso. Leitura continua
-- com a policy ride_requests_select_involved (passageiro: as próprias;
-- motorista: as das rotas dele).
--
-- Clique duplo / duas abas: a trava da rota serializa as chamadas, a segunda
-- vê o pedido da primeira e recebe `already_requested`. Se ainda assim duas
-- inserções competirem, o índice único parcial recusa a segunda.
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

  -- PONTO DE EXTENSÃO EP06: avisar o motorista de que há uma solicitação nova
  -- (tipo 'solicitacao_recebida' em notifications). Não implementado aqui.

  return v_row;
end;
$$;

revoke all on function public.request_seat(uuid) from public, anon;
grant execute on function public.request_seat(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4a. Busca: vaga derivada + status do pedido de quem busca.
--
-- Mesmos filtros, ordem e pesos de 20260930222538_search_rides.sql (raio e
-- janela de search_limits/matching_settings). Mudam:
--   - vaga: public.seats_available(r) (aceitas descontadas; pendentes não);
--   - nova coluna my_request_status: o pedido mais recente de quem busca nesta
--     rota (null = nunca pediu). A tela usa para mostrar "Solicitação
--     pendente" e desabilitar o botão.
-- O tipo de retorno mudou, por isso DROP + CREATE.
-- ---------------------------------------------------------------------------
drop function if exists public.search_rides(double precision, double precision, double precision, double precision, timestamptz, integer, integer);

create function public.search_rides(
  p_origin_latitude       double precision,
  p_origin_longitude      double precision,
  p_destination_latitude  double precision,
  p_destination_longitude double precision,
  p_desired_at            timestamptz,
  p_time_window_minutes   integer default null,
  p_limit                 integer default 30
)
returns table (
  route_id                uuid,
  departure_at            timestamptz,
  origin_label            text,
  destination_label       text,
  origin_distance_km      double precision,
  destination_distance_km double precision,
  time_difference_minutes integer,
  seats_available         integer,
  seats_total             integer,
  notes                   text,
  driver_id               uuid,
  driver_name             text,
  driver_avatar_url       text,
  driver_course           text,
  vehicle_make_model      text,
  vehicle_color           text,
  relevance_cost          double precision,
  my_request_status       text
)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_limits      record;
  v_window      integer;
  v_radius_m    double precision;
  v_origin      extensions.geography;
  v_destination extensions.geography;
  v_uid         uuid := (select auth.uid());
begin
  if p_origin_latitude is null or p_origin_longitude is null
     or p_destination_latitude is null or p_destination_longitude is null
     or p_desired_at is null then
    raise exception 'Origem, destino e horário são obrigatórios.'
      using errcode = 'invalid_parameter_value', hint = 'search_missing_params';
  end if;

  if p_origin_latitude not between -90 and 90 or p_destination_latitude not between -90 and 90
     or p_origin_longitude not between -180 and 180 or p_destination_longitude not between -180 and 180 then
    raise exception 'Coordenadas inválidas.'
      using errcode = 'invalid_parameter_value', hint = 'search_invalid_coordinates';
  end if;

  select * into v_limits from public.search_limits();

  v_window := least(
    greatest(coalesce(p_time_window_minutes, v_limits.time_window_minutes), 1),
    v_limits.max_time_window_minutes
  );
  v_radius_m    := v_limits.radius_km * 1000;
  v_origin      := st_setsrid(st_makepoint(p_origin_longitude, p_origin_latitude), 4326)::geography;
  v_destination := st_setsrid(st_makepoint(p_destination_longitude, p_destination_latitude), 4326)::geography;

  return query
  with candidates as (
    select
      r.id,
      r.departure_at,
      r.origin_label,
      r.destination_label,
      public.seats_available(r) as seats_available,
      r.seats_total,
      r.notes,
      r.driver_id,
      r.vehicle_id,
      st_distance(r.origin_geog, v_origin)           as origin_m,
      st_distance(r.destination_geog, v_destination) as destination_m,
      extract(epoch from (r.departure_at - p_desired_at)) / 60.0 as diff_min
    from public.routes r
    where r.status = 'publicada'
      and r.departure_at > now()
      and r.departure_at between p_desired_at - make_interval(mins => v_window)
                             and p_desired_at + make_interval(mins => v_window)
      and r.driver_id <> v_uid
      and st_dwithin(r.origin_geog, v_origin, v_radius_m)
      and st_dwithin(r.destination_geog, v_destination, v_radius_m)
  )
  select
    c.id,
    c.departure_at,
    c.origin_label,
    c.destination_label,
    round((c.origin_m / 1000)::numeric, 2)::double precision,
    round((c.destination_m / 1000)::numeric, 2)::double precision,
    round(c.diff_min)::integer,
    c.seats_available,
    c.seats_total,
    c.notes,
    c.driver_id,
    pp.full_name,
    pp.avatar_url,
    pp.course_name,
    pv.make_model,
    pv.color,
    (  v_limits.weight_origin      * (c.origin_m / v_radius_m)
     + v_limits.weight_destination * (c.destination_m / v_radius_m)
     + v_limits.weight_time        * (abs(c.diff_min) / v_window)
    )::double precision as relevance_cost,
    (select rr.status from public.ride_requests rr
      where rr.route_id = c.id and rr.passenger_id = v_uid
      order by rr.created_at desc limit 1)
  from candidates c
  left join public.public_profiles pp on pp.id = c.driver_id
  left join public.public_vehicles pv on pv.id = c.vehicle_id
  -- Só com vaga. Filtrado depois do raio/janela: a contagem roda só para as
  -- poucas candidatas que os índices já selecionaram.
  where c.seats_available > 0
  order by relevance_cost asc, c.departure_at asc
  limit least(greatest(coalesce(p_limit, 30), 1), 50);
end;
$$;

comment on function public.search_rides(double precision, double precision, double precision, double precision, timestamptz, integer, integer) is
  'Busca de caronas (EP04): raio e janela de search_limits(), relevância por '
  'distância + horário. Vaga = public.seats_available (EP05). my_request_status = '
  'pedido mais recente de quem busca nesta rota.';

revoke all on function public.search_rides(double precision, double precision, double precision, double precision, timestamptz, integer, integer)
  from public, anon;
grant execute on function public.search_rides(double precision, double precision, double precision, double precision, timestamptz, integer, integer)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4b. "Minhas solicitações": lista simples do passageiro (o histórico
--     completo é da EP09). SECURITY INVOKER: a RLS limita aos pedidos dele e
--     às rotas que ele pode ver (inclusive canceladas em que pediu vaga).
-- ---------------------------------------------------------------------------
create or replace function public.my_ride_requests()
returns table (
  request_id         uuid,
  status             text,
  created_at         timestamptz,
  updated_at         timestamptz,
  route_id           uuid,
  route_status       text,
  departure_at       timestamptz,
  origin_label       text,
  destination_label  text,
  driver_name        text,
  driver_avatar_url  text,
  vehicle_make_model text,
  vehicle_color      text,
  seats_available    integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    rr.id,
    rr.status,
    rr.created_at,
    rr.updated_at,
    r.id,
    r.status,
    r.departure_at,
    r.origin_label,
    r.destination_label,
    pp.full_name,
    pp.avatar_url,
    pv.make_model,
    pv.color,
    public.seats_available(r)
  from public.ride_requests rr
  join public.routes r on r.id = rr.route_id
  left join public.public_profiles pp on pp.id = r.driver_id
  left join public.public_vehicles pv on pv.id = r.vehicle_id
  where rr.passenger_id = (select auth.uid())
  order by rr.created_at desc
  limit 100;
$$;

revoke all on function public.my_ride_requests() from public, anon;
grant execute on function public.my_ride_requests() to authenticated, service_role;
