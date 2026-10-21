-- Teste da busca de caronas (public.search_rides) — EP04.
--
-- Por que SQL e não Jest: a filtragem e a ordenação moram no banco (é o que usa
-- os índices e garante < 3 s). Testar uma cópia da fórmula em TypeScript
-- deixaria passar um SQL errado. Este teste roda o SQL real.
--
-- Como rodar: execute o arquivo inteiro contra o banco (SQL Editor do
-- Supabase, psql, ou execute_sql do MCP). Tudo acontece dentro de uma
-- transação que termina em ROLLBACK: nenhum dado de teste fica no banco.
-- Sem erro = passou. Qualquer asserção falha com "FALHOU: ...".
--
-- Limites assumidos (search_limits): raio 2 km, janela ±30 min, teto 120 min,
-- pesos iguais — fixados no início do teste (matching_settings), para o teste
-- não depender do que o admin configurou no banco.

begin;

do $$
declare
  -- Passageiro que busca. Também é motorista, para testar "não vê a própria rota".
  v_passenger uuid := '00000000-0000-4000-8000-00000000a001';
  v_driver    uuid := '00000000-0000-4000-8000-00000000a002';
  v_vehicle_p uuid;
  v_vehicle_d uuid;

  -- Ponto de busca: Av. Paulista -> PUC Perdizes, daqui a 2 dias, hora cheia.
  v_o   extensions.geography := extensions.st_setsrid(extensions.st_makepoint(-46.6558, -23.5614), 4326)::extensions.geography;
  v_d   extensions.geography := extensions.st_setsrid(extensions.st_makepoint(-46.67124, -23.53796), 4326)::extensions.geography;
  v_t   timestamptz := date_trunc('hour', now()) + interval '2 days';

  -- Pontos a distâncias exatas da origem/destino (azimute 0 = norte).
  v_o_1500 extensions.geometry := extensions.st_project(v_o, 1500, 0)::extensions.geometry;
  v_o_3000 extensions.geometry := extensions.st_project(v_o, 3000, 0)::extensions.geometry;
  v_d_3000 extensions.geometry := extensions.st_project(v_d, 3000, 0)::extensions.geometry;

  v_ids  uuid[];
  v_cost double precision[];
  v_n    integer;
  v_c    double precision;
  r      record;

  v_best uuid; v_tie_a uuid; v_tie_b uuid; v_time uuid; v_far uuid;
  v_out_radius uuid; v_out_dest uuid; v_out_window uuid;
  v_cancelled uuid; v_full uuid; v_own uuid; v_past uuid;
begin
  -- ---------------------------------------------------------------- fixtures
  -- Desde a migration matching_settings, raio e janela são configuráveis pelo
  -- admin. Este teste fixa os valores que as penalidades abaixo assumem.
  update public.matching_settings set radius_km = 2.0, time_window_minutes = 30 where id;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data,
                          confirmation_token, recovery_token, email_change_token_new,
                          email_change_token_current, email_change, phone_change,
                          phone_change_token, reauthentication_token)
  select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
         u.email, 'x', now(), now(), now(),
         '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', u.name),
         '', '', '', '', '', '', '', ''
  from (values (v_passenger, 'teste.busca.passageiro@pucsp.edu.br', 'Passageiro Teste'),
               (v_driver,    'teste.busca.motorista@pucsp.edu.br',  'Motorista Teste')) as u(id, email, name);

  update public.profiles
     set avatar_url = 'avatars/teste.jpg',
         course_id  = (select id from public.courses limit 1),
         campus_id  = (select id from public.campuses limit 1)
   where id in (v_passenger, v_driver);

  insert into public.vehicles (owner_id, make_model, color, plate, seats)
  values (v_driver, 'Honda Fit', 'Prata', 'TST1A11', 4) returning id into v_vehicle_d;
  insert into public.vehicles (owner_id, make_model, color, plate, seats)
  values (v_passenger, 'Fiat Uno', 'Branco', 'TST2B22', 4) returning id into v_vehicle_p;

  -- Helper local: insere rota do motorista a partir de pontos e horário.
  -- (Inline em cada insert para não criar função no banco.)

  -- Penalidade 0: mesma origem, mesmo destino, mesmo horário.
  insert into public.routes (driver_id, vehicle_id, origin_label, origin_latitude, origin_longitude,
                             destination_label, destination_latitude, destination_longitude, departure_at, seats_total)
  values (v_driver, v_vehicle_d, 'melhor', -23.5614, -46.6558, 'PUC', -23.53796, -46.67124, v_t, 3)
  returning id into v_best;

  -- Empate (0,111 cada): 10 min antes e 10 min depois. Desempate = mais cedo.
  insert into public.routes (driver_id, vehicle_id, origin_label, origin_latitude, origin_longitude,
                             destination_label, destination_latitude, destination_longitude, departure_at, seats_total)
  values (v_driver, v_vehicle_d, 'empate-antes', -23.5614, -46.6558, 'PUC', -23.53796, -46.67124, v_t - interval '10 min', 3)
  returning id into v_tie_a;
  insert into public.routes (driver_id, vehicle_id, origin_label, origin_latitude, origin_longitude,
                             destination_label, destination_latitude, destination_longitude, departure_at, seats_total)
  values (v_driver, v_vehicle_d, 'empate-depois', -23.5614, -46.6558, 'PUC', -23.53796, -46.67124, v_t + interval '10 min', 3)
  returning id into v_tie_b;

  -- 0,222: 20 min depois.
  insert into public.routes (driver_id, vehicle_id, origin_label, origin_latitude, origin_longitude,
                             destination_label, destination_latitude, destination_longitude, departure_at, seats_total)
  values (v_driver, v_vehicle_d, 'horario+20', -23.5614, -46.6558, 'PUC', -23.53796, -46.67124, v_t + interval '20 min', 3)
  returning id into v_time;

  -- 0,25: origem a 1,5 km (0,75 do raio de 2 km, peso 1/3).
  insert into public.routes (driver_id, vehicle_id, origin_label, origin_latitude, origin_longitude,
                             destination_label, destination_latitude, destination_longitude, departure_at, seats_total)
  values (v_driver, v_vehicle_d, 'origem-1500m', extensions.st_y(v_o_1500), extensions.st_x(v_o_1500),
          'PUC', -23.53796, -46.67124, v_t, 3)
  returning id into v_far;

  -- ---- As que NÃO podem aparecer ----
  -- Origem a 3 km (fora do raio de 2 km).
  insert into public.routes (driver_id, vehicle_id, origin_label, origin_latitude, origin_longitude,
                             destination_label, destination_latitude, destination_longitude, departure_at, seats_total)
  values (v_driver, v_vehicle_d, 'fora-raio-origem', extensions.st_y(v_o_3000), extensions.st_x(v_o_3000),
          'PUC', -23.53796, -46.67124, v_t, 3)
  returning id into v_out_radius;

  -- Destino a 3 km (origem perfeita: prova que o destino também é filtrado).
  insert into public.routes (driver_id, vehicle_id, origin_label, origin_latitude, origin_longitude,
                             destination_label, destination_latitude, destination_longitude, departure_at, seats_total)
  values (v_driver, v_vehicle_d, 'fora-raio-destino', -23.5614, -46.6558,
          'longe', extensions.st_y(v_d_3000), extensions.st_x(v_d_3000), v_t, 3)
  returning id into v_out_dest;

  -- 45 min depois: fora da janela de ±30, dentro da ampliada de ±60.
  insert into public.routes (driver_id, vehicle_id, origin_label, origin_latitude, origin_longitude,
                             destination_label, destination_latitude, destination_longitude, departure_at, seats_total)
  values (v_driver, v_vehicle_d, 'fora-janela', -23.5614, -46.6558, 'PUC', -23.53796, -46.67124, v_t + interval '45 min', 3)
  returning id into v_out_window;

  -- Cancelada (soft delete).
  insert into public.routes (driver_id, vehicle_id, origin_label, origin_latitude, origin_longitude,
                             destination_label, destination_latitude, destination_longitude, departure_at, seats_total)
  values (v_driver, v_vehicle_d, 'cancelada', -23.5614, -46.6558, 'PUC', -23.53796, -46.67124, v_t, 3)
  returning id into v_cancelled;
  update public.routes set status = 'cancelada', cancellation_reason = 'teste' where id = v_cancelled;

  -- Lotada: 1 vaga e 1 solicitação aceita (vaga derivada, EP05). Nasce
  -- pendente pelo trigger e vira aceita aqui, como postgres.
  insert into public.routes (driver_id, vehicle_id, origin_label, origin_latitude, origin_longitude,
                             destination_label, destination_latitude, destination_longitude, departure_at, seats_total)
  values (v_driver, v_vehicle_d, 'lotada', -23.5614, -46.6558, 'PUC', -23.53796, -46.67124, v_t, 1)
  returning id into v_full;
  insert into public.ride_requests (route_id, passenger_id) values (v_full, v_passenger);
  update public.ride_requests set status = 'aceita', decided_at = now() where route_id = v_full;

  -- Do próprio passageiro, perfeita em tudo.
  insert into public.routes (driver_id, vehicle_id, origin_label, origin_latitude, origin_longitude,
                             destination_label, destination_latitude, destination_longitude, departure_at, seats_total)
  values (v_passenger, v_vehicle_p, 'propria', -23.5614, -46.6558, 'PUC', -23.53796, -46.67124, v_t, 3)
  returning id into v_own;

  -- Já partiu e continua 'publicada' (nada marca 'concluida' sozinho). O
  -- trigger barra inserir no passado, então é desligado só para esta linha,
  -- dentro desta transação.
  alter table public.routes disable trigger routes_validate;
  insert into public.routes (driver_id, vehicle_id, origin_label, origin_latitude, origin_longitude,
                             destination_label, destination_latitude, destination_longitude, departure_at, seats_total)
  values (v_driver, v_vehicle_d, 'passada', -23.5614, -46.6558, 'PUC', -23.53796, -46.67124, now() - interval '1 hour', 3)
  returning id into v_past;
  alter table public.routes enable trigger routes_validate;

  -- --------------------------------------------- busca como o passageiro
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_passenger, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_passenger::text, true);
  execute 'set local role authenticated';

  select array_agg(route_id order by ord), array_agg(relevance_cost order by ord)
    into v_ids, v_cost
  from (
    select s.route_id, s.relevance_cost, row_number() over () as ord
    from public.search_rides(-23.5614, -46.6558, -23.53796, -46.67124, v_t) s
  ) x;

  -- ---- 1) Só as cinco elegíveis, na ordem de relevância ----
  if coalesce(array_length(v_ids, 1), 0) <> 5 then
    raise exception 'FALHOU: esperava 5 resultados, veio %', coalesce(array_length(v_ids, 1), 0);
  end if;
  if v_ids <> array[v_best, v_tie_a, v_tie_b, v_time, v_far] then
    raise exception 'FALHOU: ordem errada. Veio %', v_ids;
  end if;

  -- ---- 2) Penalidades exatas pela fórmula ----
  if abs(v_cost[1] - 0) > 0.001
     or abs(v_cost[2] - (1.0/3) * (10.0/30)) > 0.001
     or abs(v_cost[4] - (1.0/3) * (20.0/30)) > 0.001
     or abs(v_cost[5] - (1.0/3) * (1500.0/2000)) > 0.005 then
    raise exception 'FALHOU: penalidades fora do esperado: %', v_cost;
  end if;

  -- ---- 3) Excluídas, uma a uma (mensagem diz qual regra quebrou) ----
  if v_out_radius = any(v_ids) then raise exception 'FALHOU: rota com origem fora do raio apareceu'; end if;
  if v_out_dest   = any(v_ids) then raise exception 'FALHOU: rota com destino fora do raio apareceu'; end if;
  if v_out_window = any(v_ids) then raise exception 'FALHOU: rota fora da janela apareceu'; end if;
  if v_cancelled  = any(v_ids) then raise exception 'FALHOU: rota cancelada apareceu'; end if;
  if v_full       = any(v_ids) then raise exception 'FALHOU: rota lotada apareceu'; end if;
  if v_own        = any(v_ids) then raise exception 'FALHOU: rota do próprio passageiro apareceu'; end if;
  if v_past       = any(v_ids) then raise exception 'FALHOU: rota que já partiu apareceu'; end if;

  -- ---- 4) Campos devolvidos ----
  select * into r from public.search_rides(-23.5614, -46.6558, -23.53796, -46.67124, v_t) limit 1;
  if r.origin_distance_km <> 0 or r.time_difference_minutes <> 0 or r.seats_available <> 3
     or r.driver_name <> 'Motorista Teste' or r.vehicle_make_model <> 'Honda Fit' then
    raise exception 'FALHOU: campos do melhor resultado: %', r;
  end if;

  select time_difference_minutes into v_n
  from public.search_rides(-23.5614, -46.6558, -23.53796, -46.67124, v_t) where route_id = v_tie_a;
  if v_n <> -10 then
    raise exception 'FALHOU: diferença de horário deveria ser -10 (sai antes), veio %', v_n;
  end if;

  -- ---- 5) "Ampliar": janela de 60 inclui a rota de +45 min ----
  if not exists (select 1 from public.search_rides(-23.5614, -46.6558, -23.53796, -46.67124, v_t, 60)
                 where route_id = v_out_window) then
    raise exception 'FALHOU: janela ampliada para 60 min não incluiu a rota de +45 min';
  end if;

  -- ---- 6) Teto: pedir 999 min vale 120. Rota de +45 min continua dentro,
  --          e a penalidade de horário dela é 45/120, não 45/999. ----
  select relevance_cost into v_c
  from public.search_rides(-23.5614, -46.6558, -23.53796, -46.67124, v_t, 999) where route_id = v_out_window;
  if v_c is null or abs(v_c - (1.0/3) * (45.0/120)) > 0.001 then
    raise exception 'FALHOU: janela não foi limitada ao teto de 120 (penalidade %)', v_c;
  end if;

  -- ---- 7) Sem nada por perto: lista vazia, sem erro ----
  if exists (select 1 from public.search_rides(-22.9, -43.2, -22.95, -43.25, v_t)) then
    raise exception 'FALHOU: busca no Rio de Janeiro devolveu resultados de São Paulo';
  end if;

  execute 'reset role';
end;
$$;

select 'search_rides: todas as asserções passaram' as resultado;

rollback;
