-- Teste das tolerâncias configuráveis (matching_settings + search_limits) — EP04.
--
-- Mesmo padrão de search_rides.test.sql: fixtures + asserções num DO block,
-- tudo dentro de BEGIN … ROLLBACK. Sem erro = passou; falha = "FALHOU: ...".
--
-- Cobre:
--   - bordas do raio: rota a 1999 m, 2000 m (no limite) e 2001 m. O limite é
--     inclusivo, mas "exatamente" vale até a precisão do ponto flutuante:
--     a 3000 m, st_dwithin(…, 3000) dá falso por um erro sub-milimétrico. Por
--     isso o caso de borda usa 2000 m, verificado como dentro;
--   - bordas da janela: 29, 30 (no limite) e 31 min, antes e depois;
--   - admin altera raio e janela → a busca seguinte muda, sem redeploy;
--   - teto do "Ampliar" acompanha a janela (4 ×, até 240);
--   - usuário comum não consegue escrever (RPC dá erro; UPDATE direto não altera);
--   - valores fora de 0,5–50 km e 5–240 min são recusados (RPC e constraint);
--   - a linha é única e registra quem alterou.

begin;

do $$
declare
  v_admin     uuid := '00000000-0000-4000-8000-00000000b001';
  v_user      uuid := '00000000-0000-4000-8000-00000000b002';
  v_driver    uuid := '00000000-0000-4000-8000-00000000b003';
  v_vehicle   uuid;

  -- Busca: Av. Paulista -> PUC Perdizes, daqui a 2 dias, hora cheia.
  v_o   extensions.geography := extensions.st_setsrid(extensions.st_makepoint(-46.6558, -23.5614), 4326)::extensions.geography;
  v_t   timestamptz := date_trunc('hour', now()) + interval '2 days';

  v_ids   uuid[];
  v_lim   record;
  v_row   public.matching_settings;
  v_n     integer;
  v_state text;
  v_hint  text;

  -- Rotas indexadas pelo rótulo (para mensagens legíveis).
  v_r1999 uuid; v_r2000 uuid; v_r2001 uuid; v_r3000 uuid;
  v_tp29 uuid; v_tp30 uuid; v_tp31 uuid; v_tm30 uuid; v_tm31 uuid; v_tp45 uuid;
begin
  -- ---------------------------------------------------------------- fixtures
  -- Comportamento de partida conhecido, qualquer que seja o valor no banco.
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
  from (values (v_admin,  'teste.regras.admin@pucsp.edu.br',     'Admin Teste'),
               (v_user,   'teste.regras.comum@pucsp.edu.br',     'Comum Teste'),
               (v_driver, 'teste.regras.motorista@pucsp.edu.br', 'Motorista Teste')) as u(id, email, name);

  update public.profiles
     set avatar_url = 'avatars/teste.jpg',
         course_id  = (select id from public.courses limit 1),
         campus_id  = (select id from public.campuses limit 1)
   where id = v_driver;

  insert into public.app_admins (user_id) values (v_admin);

  insert into public.vehicles (owner_id, make_model, color, plate, seats)
  values (v_driver, 'Honda Fit', 'Prata', 'TST3C33', 4) returning id into v_vehicle;

  -- Raio: origens a distâncias exatas, ao norte da origem da busca. Destino e
  -- horário perfeitos, para só o raio decidir.
  insert into public.routes (driver_id, vehicle_id, origin_label, origin_latitude, origin_longitude,
                             destination_label, destination_latitude, destination_longitude, departure_at, seats_total)
  select v_driver, v_vehicle, 'origem-' || d || 'm',
         extensions.st_y(extensions.st_project(v_o, d, 0)::extensions.geometry),
         extensions.st_x(extensions.st_project(v_o, d, 0)::extensions.geometry),
         'PUC', -23.53796, -46.67124, v_t, 3
  from (values (1999), (2000), (2001), (3000)) as x(d);

  select id into v_r1999 from public.routes where origin_label = 'origem-1999m' and driver_id = v_driver;
  select id into v_r2000 from public.routes where origin_label = 'origem-2000m' and driver_id = v_driver;
  select id into v_r2001 from public.routes where origin_label = 'origem-2001m' and driver_id = v_driver;
  select id into v_r3000 from public.routes where origin_label = 'origem-3000m' and driver_id = v_driver;

  -- Janela: mesmo lugar, horários a ±29, ±30 (no limite), ±31 e +45 min.
  insert into public.routes (driver_id, vehicle_id, origin_label, origin_latitude, origin_longitude,
                             destination_label, destination_latitude, destination_longitude, departure_at, seats_total)
  select v_driver, v_vehicle, 'horario' || m, -23.5614, -46.6558, 'PUC', -23.53796, -46.67124,
         v_t + make_interval(mins => m), 3
  from (values (29), (30), (31), (-30), (-31), (45)) as x(m);

  select id into v_tp29 from public.routes where origin_label = 'horario29'  and driver_id = v_driver;
  select id into v_tp30 from public.routes where origin_label = 'horario30'  and driver_id = v_driver;
  select id into v_tp31 from public.routes where origin_label = 'horario31'  and driver_id = v_driver;
  select id into v_tm30 from public.routes where origin_label = 'horario-30' and driver_id = v_driver;
  select id into v_tm31 from public.routes where origin_label = 'horario-31' and driver_id = v_driver;
  select id into v_tp45 from public.routes where origin_label = 'horario45'  and driver_id = v_driver;

  -- ------------------------------------------- 1) padrão: 2 km e ±30 min
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  execute 'set local role authenticated';

  select * into v_lim from public.search_limits();
  if v_lim.radius_km <> 2.0 or v_lim.time_window_minutes <> 30 or v_lim.max_time_window_minutes <> 120 then
    raise exception 'FALHOU: limites padrão deveriam ser 2 km / 30 / teto 120, vieram %', v_lim;
  end if;

  select array_agg(route_id) into v_ids
  from public.search_rides(-23.5614, -46.6558, -23.53796, -46.67124, v_t);

  if not (v_r1999 = any(v_ids)) then raise exception 'FALHOU: 1999 m (abaixo do raio) não apareceu'; end if;
  if not (v_r2000 = any(v_ids)) then raise exception 'FALHOU: 2000 m (exatamente no raio) não apareceu'; end if;
  if v_r2001 = any(v_ids)       then raise exception 'FALHOU: 2001 m (acima do raio) apareceu'; end if;
  if v_r3000 = any(v_ids)       then raise exception 'FALHOU: 3000 m apareceu com raio de 2 km'; end if;

  if not (v_tp29 = any(v_ids)) then raise exception 'FALHOU: +29 min (dentro da janela) não apareceu'; end if;
  if not (v_tp30 = any(v_ids)) then raise exception 'FALHOU: +30 min (exatamente no limite) não apareceu'; end if;
  if not (v_tm30 = any(v_ids)) then raise exception 'FALHOU: -30 min (exatamente no limite) não apareceu'; end if;
  if v_tp31 = any(v_ids)       then raise exception 'FALHOU: +31 min (fora da janela) apareceu'; end if;
  if v_tm31 = any(v_ids)       then raise exception 'FALHOU: -31 min (fora da janela) apareceu'; end if;
  if v_tp45 = any(v_ids)       then raise exception 'FALHOU: +45 min apareceu com janela de 30'; end if;

  -- ------------------------------- 2) usuário comum não consegue escrever
  begin
    perform public.update_matching_settings(5.0, 60);
    raise exception 'FALHOU: usuário comum alterou as regras pela RPC';
  exception when insufficient_privilege then
    get stacked diagnostics v_hint = pg_exception_hint;
    if v_hint <> 'matching_not_admin' then
      raise exception 'FALHOU: hint esperado matching_not_admin, veio %', v_hint;
    end if;
  end;

  -- UPDATE direto pela API: a RLS filtra, 0 linhas, nada muda.
  update public.matching_settings set radius_km = 5.0 where id;
  get diagnostics v_n = row_count;
  if v_n <> 0 then
    raise exception 'FALHOU: UPDATE direto de usuário comum afetou % linha(s)', v_n;
  end if;

  -- Nem inserir uma segunda linha, nem apagar a única.
  begin
    insert into public.matching_settings (id, radius_km, time_window_minutes) values (true, 9, 9);
    raise exception 'FALHOU: usuário comum inseriu em matching_settings';
  exception when insufficient_privilege or unique_violation then null;
  end;
  delete from public.matching_settings;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FALHOU: usuário comum apagou a configuração'; end if;

  if (select radius_km from public.matching_settings) <> 2.0 then
    raise exception 'FALHOU: raio mudou depois das tentativas do usuário comum';
  end if;

  -- O comum não enxerga a lista de admins.
  if exists (select 1 from public.app_admins) then
    raise exception 'FALHOU: usuário comum leu app_admins';
  end if;

  -- --------------------------------------------------- 3) admin altera
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  execute 'set local role authenticated';

  -- Admin enxerga a própria linha (é assim que o app mostra a tela).
  if not exists (select 1 from public.app_admins where user_id = v_admin) then
    raise exception 'FALHOU: admin não leu a própria linha em app_admins';
  end if;

  -- Fora dos limites: recusado pela RPC, com hint para o app traduzir.
  foreach v_state in array array['0.4|30', '50.1|30', '2|4', '2|241'] loop
    begin
      perform public.update_matching_settings(split_part(v_state, '|', 1)::numeric, split_part(v_state, '|', 2)::integer);
      raise exception 'FALHOU: RPC aceitou valores fora do limite (%)', v_state;
    exception when check_violation then null;
    end;
  end loop;

  -- Fora dos limites por UPDATE direto: a constraint é a autoridade.
  begin
    update public.matching_settings set radius_km = 60 where id;
    raise exception 'FALHOU: constraint aceitou raio de 60 km';
  exception when check_violation then null;
  end;
  begin
    update public.matching_settings set time_window_minutes = 2 where id;
    raise exception 'FALHOU: constraint aceitou janela de 2 min';
  exception when check_violation then null;
  end;

  -- Limites exatos são aceitos.
  perform public.update_matching_settings(0.5, 5);
  perform public.update_matching_settings(50, 240);
  select * into v_lim from public.search_limits();
  if v_lim.max_time_window_minutes <> 240 then
    raise exception 'FALHOU: com janela 240 o teto deveria ser 240, veio %', v_lim.max_time_window_minutes;
  end if;

  -- Novo valor de trabalho: 3,5 km e ±45 min.
  v_row := public.update_matching_settings(3.5, 45);
  if v_row.radius_km <> 3.5 or v_row.time_window_minutes <> 45 or v_row.updated_by <> v_admin then
    raise exception 'FALHOU: RPC devolveu %', v_row;
  end if;

  -- ------------------------------ 4) a busca SEGUINTE já usa os novos valores
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  execute 'set local role authenticated';

  select * into v_lim from public.search_limits();
  if v_lim.radius_km <> 3.5 or v_lim.time_window_minutes <> 45 or v_lim.max_time_window_minutes <> 180 then
    raise exception 'FALHOU: limites depois da alteração deveriam ser 3,5 / 45 / 180, vieram %', v_lim;
  end if;

  select array_agg(route_id) into v_ids
  from public.search_rides(-23.5614, -46.6558, -23.53796, -46.67124, v_t);

  if not (v_r2001 = any(v_ids)) then raise exception 'FALHOU: 2001 m deveria entrar com raio de 3,5 km'; end if;
  if not (v_r3000 = any(v_ids)) then raise exception 'FALHOU: 3000 m deveria entrar com raio de 3,5 km'; end if;
  if not (v_tp45 = any(v_ids))  then raise exception 'FALHOU: +45 min deveria entrar com janela de 45'; end if;
  if not (v_tp31 = any(v_ids))  then raise exception 'FALHOU: +31 min deveria entrar com janela de 45'; end if;

  -- E o caminho inverso: apertar volta a esconder.
  execute 'reset role';
  update public.matching_settings set radius_km = 1.0, time_window_minutes = 10 where id;
  execute 'set local role authenticated';

  select array_agg(route_id) into v_ids
  from public.search_rides(-23.5614, -46.6558, -23.53796, -46.67124, v_t);

  if v_r1999 = any(v_ids) then raise exception 'FALHOU: 1999 m apareceu com raio de 1 km'; end if;
  if v_tp29 = any(v_ids)  then raise exception 'FALHOU: +29 min apareceu com janela de 10'; end if;

  execute 'reset role';
end;
$$;

select 'matching_settings: todas as asserções passaram' as resultado;

rollback;
