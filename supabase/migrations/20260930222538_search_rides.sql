-- EP04 — Buscar caronas.
--
-- Filtragem e ordenação moram no banco, e não no app: é aqui que os índices
-- (GiST de origem/destino, parcial de horário) são usados, e é o que garante o
-- critério de < 3 s mesmo com milhares de rotas. O app só chama a RPC.

-- ---------------------------------------------------------------------------
-- LUGAR ÚNICO dos limites da busca.
--
-- A próxima história do EP04 torna raio e janela configuráveis pelo admin.
-- Para isso, basta trocar o corpo desta função por uma leitura da tabela de
-- parâmetros (e `immutable` por `stable`) — search_rides e o app já leem
-- tudo daqui e não mudam.
--
-- Valores iniciais escolhidos pelo gerente do projeto (30/09/2026):
--   raio 2 km  — o mesmo do wireframe 4.4 ("distância máxima do embarque");
--   janela ±30 min — idem 4.4; "Ampliar" (wireframe 4.6) dobra até o teto.
-- Pesos da relevância: três partes iguais (ver search_rides).
-- ---------------------------------------------------------------------------
create or replace function public.search_limits()
returns table (
  radius_km               double precision,
  time_window_minutes     integer,
  max_time_window_minutes integer,
  weight_origin           double precision,
  weight_destination      double precision,
  weight_time             double precision
)
language sql
immutable
set search_path = public
as $$
  select
    2.0::double precision,   -- raio, vale para origem E destino
    30,                      -- janela padrão: ± minutos em torno do horário desejado
    120,                     -- teto da janela quando o passageiro pede "Ampliar"
    1.0 / 3,                 -- peso: distância entre as origens
    1.0 / 3,                 -- peso: distância entre os destinos
    1.0 / 3;                 -- peso: diferença de horário
$$;

comment on function public.search_limits() is
  'Lugar único dos limites e pesos da busca de caronas (EP04). A história de '
  'tolerâncias configuráveis troca o corpo por uma leitura da tabela do admin.';

revoke all on function public.search_limits() from public, anon;
grant execute on function public.search_limits() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- A busca.
--
-- Filtros (todos obrigatórios):
--   - status 'publicada' (cancelada é soft delete e fica de fora);
--   - saída no futuro (nada marca 'concluida' sozinho: rota que já partiu
--     continua 'publicada', então o filtro de horário é indispensável);
--   - saída dentro da janela em torno do horário desejado;
--   - com vaga (seats_available > 0 — rota lotada some da busca, wireframe 5.4);
--   - de outro motorista (quem busca não vê as próprias rotas);
--   - origem da rota a até R km da origem do passageiro, E destino da rota a
--     até R km do destino dele.
--
-- Relevância, em linguagem simples: cada carona recebe uma penalidade de 0 a 1,
-- somando três partes de mesmo peso — distância entre as origens, distância
-- entre os destinos e diferença de horário —, cada uma medida em relação ao
-- seu limite (1 km num raio de 2 km conta 0,5). Menor penalidade primeiro;
-- empate vai para quem sai mais cedo. Não é exibida como nota nem percentual:
-- score explicável é Fase 2 (wireframe 4.3).
--
-- VAGAS — ponto de extensão do EP05: a busca usa só `seats_available`
-- (seats_total - seats_taken). Quando o EP05 confirmar vagas e manter
-- seats_taken, os resultados passam a refletir isso sem mudar esta função.
--
-- SECURITY INVOKER: roda com a RLS de quem busca. Dados do motorista e do carro
-- vêm das views públicas (sem e-mail, telefone ou placa).
-- ---------------------------------------------------------------------------
create or replace function public.search_rides(
  p_origin_latitude       double precision,
  p_origin_longitude      double precision,
  p_destination_latitude  double precision,
  p_destination_longitude double precision,
  p_desired_at            timestamptz,
  -- null = janela padrão. Maior que o teto é reduzida ao teto.
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
  -- Com sinal: positivo = sai depois do horário desejado.
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
  -- 0 = combinação perfeita, 1 = no limite de tudo. Só para ordenar.
  relevance_cost          double precision
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
      r.seats_available,
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
      and r.seats_available > 0
      and r.driver_id <> (select auth.uid())
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
    )::double precision as relevance_cost
  from candidates c
  left join public.public_profiles pp on pp.id = c.driver_id
  left join public.public_vehicles pv on pv.id = c.vehicle_id
  order by relevance_cost asc, c.departure_at asc
  limit least(greatest(coalesce(p_limit, 30), 1), 50);
end;
$$;

comment on function public.search_rides(double precision, double precision, double precision, double precision, timestamptz, integer, integer) is
  'Busca de caronas (EP04): filtra por raio e janela de search_limits() e ordena '
  'por relevância (distância nas origens + nos destinos + diferença de horário, '
  'pesos iguais). Vagas: seats_available — ponto de extensão do EP05.';

revoke all on function public.search_rides(double precision, double precision, double precision, double precision, timestamptz, integer, integer)
  from public, anon;
grant execute on function public.search_rides(double precision, double precision, double precision, double precision, timestamptz, integer, integer)
  to authenticated, service_role;
