-- Teste de "Aceitar ou recusar solicitação" (decide_request) — EP05.
--
-- Mesmo padrão dos outros: fixtures + asserções num DO block, dentro de
-- BEGIN … ROLLBACK. Sem erro = passou; falha = "FALHOU: ...".
--
-- Cobre: outro motorista não decide; passageiro não decide; decidir duas vezes
-- falha; aceitar sem vaga falha e o pedido continua pendente; aceitar
-- desconta a vaga na busca; recusar registra data e libera o passageiro para
-- OUTRAS rotas, mas não para pedir de novo na mesma; decisão inválida; rota
-- cancelada e rota que já partiu; UPDATE direto pela API não passa.
--
-- Dois "Aceitar" simultâneos para a última vaga: verificado pela API com
-- chamadas em paralelo (docs/solicitar-vaga.md).

begin;

do $$
declare
  v_driver  uuid := '00000000-0000-4000-8000-00000000e001';
  v_other   uuid := '00000000-0000-4000-8000-00000000e002';
  v_p1      uuid := '00000000-0000-4000-8000-00000000e003';
  v_p2      uuid := '00000000-0000-4000-8000-00000000e004';
  v_p3      uuid := '00000000-0000-4000-8000-00000000e005';
  v_vehicle uuid;
  v_t       timestamptz := date_trunc('hour', now()) + interval '2 days';

  v_one uuid; v_two uuid; v_cancel uuid; v_gone uuid;
  v_req_p1_one uuid; v_req_p2_one uuid; v_req_p2_two uuid; v_req_p3_cancel uuid; v_req_p3_gone uuid;
  v_req   public.ride_requests;
  v_n     integer;
  v_hint  text;
  v_seats integer;
begin
  update public.matching_settings set radius_km = 2.0, time_window_minutes = 30 where id;

  -- ---------------------------------------------------------------- fixtures
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
  from (values (v_driver, 'teste.decide.motorista@pucsp.edu.br', 'Motorista Decide'),
               (v_other,  'teste.decide.outro@pucsp.edu.br',     'Outro Motorista'),
               (v_p1,     'teste.decide.p1@pucsp.edu.br',        'Passageiro Um'),
               (v_p2,     'teste.decide.p2@pucsp.edu.br',        'Passageiro Dois'),
               (v_p3,     'teste.decide.p3@pucsp.edu.br',        'Passageiro Tres')) as u(id, email, name);

  update public.profiles
     set avatar_url = 'avatars/teste.jpg',
         course_id  = (select id from public.courses limit 1),
         campus_id  = (select id from public.campuses limit 1)
   where id in (v_driver, v_other, v_p1, v_p2, v_p3);

  insert into public.vehicles (owner_id, make_model, color, plate, seats)
  values (v_driver, 'Honda Fit', 'Prata', 'TST6F66', 4) returning id into v_vehicle;

  -- Uma vaga só: é aqui que o "aceitar sem vaga" acontece.
  insert into public.routes (driver_id, vehicle_id, origin_label, origin_latitude, origin_longitude,
                             destination_label, destination_latitude, destination_longitude, departure_at, seats_total)
  values (v_driver, v_vehicle, 'uma-vaga', -23.5614, -46.6558, 'PUC', -23.53796, -46.67124, v_t, 1)
  returning id into v_one;

  insert into public.routes (driver_id, vehicle_id, origin_label, origin_latitude, origin_longitude,
                             destination_label, destination_latitude, destination_longitude, departure_at, seats_total)
  values (v_driver, v_vehicle, 'duas-vagas', -23.5614, -46.6558, 'PUC', -23.53796, -46.67124, v_t + interval '5 min', 2)
  returning id into v_two;

  insert into public.routes (driver_id, vehicle_id, origin_label, origin_latitude, origin_longitude,
                             destination_label, destination_latitude, destination_longitude, departure_at, seats_total)
  values (v_driver, v_vehicle, 'vai-cancelar', -23.5614, -46.6558, 'PUC', -23.53796, -46.67124, v_t, 2)
  returning id into v_cancel;

  insert into public.routes (driver_id, vehicle_id, origin_label, origin_latitude, origin_longitude,
                             destination_label, destination_latitude, destination_longitude, departure_at, seats_total)
  values (v_driver, v_vehicle, 'vai-partir', -23.5614, -46.6558, 'PUC', -23.53796, -46.67124, v_t, 2)
  returning id into v_gone;

  insert into public.ride_requests (route_id, passenger_id) values (v_one, v_p1) returning id into v_req_p1_one;
  insert into public.ride_requests (route_id, passenger_id) values (v_one, v_p2) returning id into v_req_p2_one;
  insert into public.ride_requests (route_id, passenger_id) values (v_cancel, v_p3) returning id into v_req_p3_cancel;
  insert into public.ride_requests (route_id, passenger_id) values (v_gone, v_p3) returning id into v_req_p3_gone;

  -- A rota "vai-partir" passa a ter saído (o trigger barra horário passado;
  -- desligado só para esta linha, dentro da transação).
  alter table public.routes disable trigger routes_validate;
  update public.routes set departure_at = now() - interval '1 hour' where id = v_gone;
  alter table public.routes enable trigger routes_validate;

  -- ------------------------------------------- outro motorista não decide
  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_other::text, true);
  execute 'set local role authenticated';

  begin
    perform public.decide_request(v_req_p1_one, 'aceita');
    raise exception 'FALHOU: outro motorista aceitou pedido de rota alheia';
  exception when insufficient_privilege then
    get stacked diagnostics v_hint = pg_exception_hint;
    if v_hint <> 'not_route_driver' then raise exception 'FALHOU: outro motorista com hint %', v_hint; end if;
  end;

  -- E não enxerga os pedidos da rota alheia.
  if exists (select 1 from public.ride_requests where route_id = v_one) then
    raise exception 'FALHOU: outro motorista leu pedidos de rota alheia';
  end if;

  -- --------------------------------------------- passageiro não decide
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_p1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_p1::text, true);
  execute 'set local role authenticated';

  begin
    perform public.decide_request(v_req_p1_one, 'aceita');
    raise exception 'FALHOU: passageiro aceitou o próprio pedido';
  exception when insufficient_privilege then null;
  end;

  -- ----------------------------------------------------------- motorista
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_driver::text, true);
  execute 'set local role authenticated';

  -- UPDATE direto pela API: sem policy de update, nada muda.
  update public.ride_requests set status = 'aceita', decided_at = now() where id = v_req_p1_one;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FALHOU: motorista aceitou por UPDATE direto'; end if;

  -- Decisão inválida.
  begin
    perform public.decide_request(v_req_p1_one, 'talvez');
    raise exception 'FALHOU: aceitou decisão inválida';
  exception when invalid_parameter_value then null;
  end;

  -- 1) aceitar: status, data e vaga descontada
  v_req := public.decide_request(v_req_p1_one, 'aceita');
  if v_req.status <> 'aceita' or v_req.decided_at is null then
    raise exception 'FALHOU: aceitar devolveu %', v_req;
  end if;
  select public.seats_available(rt) into v_seats from public.routes rt where rt.id = v_one;
  if v_seats <> 0 then raise exception 'FALHOU: depois de aceitar, a vaga deveria ser 0, veio %', v_seats; end if;

  -- 2) decidir duas vezes falha
  begin
    perform public.decide_request(v_req_p1_one, 'recusada');
    raise exception 'FALHOU: decidiu duas vezes o mesmo pedido';
  exception when check_violation then
    get stacked diagnostics v_hint = pg_exception_hint;
    if v_hint <> 'request_not_pending' then raise exception 'FALHOU: segunda decisão com hint %', v_hint; end if;
  end;

  -- 3) aceitar sem vaga falha, e o pedido continua pendente
  begin
    perform public.decide_request(v_req_p2_one, 'aceita');
    raise exception 'FALHOU: aceitou sem vaga';
  exception when check_violation then
    get stacked diagnostics v_hint = pg_exception_hint;
    if v_hint <> 'no_seats' then raise exception 'FALHOU: aceitar sem vaga com hint %', v_hint; end if;
  end;
  if (select status from public.ride_requests where id = v_req_p2_one) <> 'pendente' then
    raise exception 'FALHOU: pedido sem vaga deveria continuar pendente';
  end if;

  -- 4) recusar: status e data
  v_req := public.decide_request(v_req_p2_one, 'recusada');
  if v_req.status <> 'recusada' or v_req.decided_at is null then
    raise exception 'FALHOU: recusar devolveu %', v_req;
  end if;

  -- 5) rota cancelada: o pedido pendente foi fechado, não há o que decidir
  update public.routes set status = 'cancelada', cancellation_reason = 'Imprevisto' where id = v_cancel;
  begin
    perform public.decide_request(v_req_p3_cancel, 'aceita');
    raise exception 'FALHOU: aceitou pedido de rota cancelada';
  exception when check_violation then null;
  end;

  -- 6) rota que já partiu: não dá para aceitar
  begin
    perform public.decide_request(v_req_p3_gone, 'aceita');
    raise exception 'FALHOU: aceitou pedido de rota que já partiu';
  exception when check_violation then
    get stacked diagnostics v_hint = pg_exception_hint;
    if v_hint <> 'route_departed' then raise exception 'FALHOU: rota partida com hint %', v_hint; end if;
  end;

  -- ------------------------------------- passageiro recusado (P2)
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_p2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_p2::text, true);
  execute 'set local role authenticated';

  -- Vê a recusa na lista dele.
  if (select status from public.my_ride_requests() where route_id = v_one) <> 'recusada' then
    raise exception 'FALHOU: passageiro não viu a recusa em my_ride_requests';
  end if;

  -- Não pode pedir de novo na MESMA rota (decisão da história).
  begin
    perform public.request_seat(v_one);
    raise exception 'FALHOU: recusado pediu de novo na mesma rota';
  exception when check_violation then
    get stacked diagnostics v_hint = pg_exception_hint;
    if v_hint <> 'refused_before' then raise exception 'FALHOU: novo pedido após recusa com hint %', v_hint; end if;
  end;

  -- Mas está livre para OUTRA rota (recusar libera o passageiro).
  v_req := public.request_seat(v_two);
  v_req_p2_two := v_req.id;
  if v_req.status <> 'pendente' then raise exception 'FALHOU: recusado não conseguiu pedir outra rota'; end if;

  -- ------------------------- aceitar atualiza a vaga mostrada na busca
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_p3, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_p3::text, true);
  execute 'set local role authenticated';

  select seats_available into v_seats
  from public.search_rides(-23.5614, -46.6558, -23.53796, -46.67124, v_t) where route_id = v_two;
  if v_seats <> 2 then raise exception 'FALHOU: antes do aceite, a busca deveria mostrar 2 vagas, mostrou %', v_seats; end if;
  if exists (select 1 from public.search_rides(-23.5614, -46.6558, -23.53796, -46.67124, v_t) where route_id = v_one) then
    raise exception 'FALHOU: rota com a única vaga aceita apareceu na busca';
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_driver::text, true);
  execute 'set local role authenticated';
  perform public.decide_request(v_req_p2_two, 'aceita');

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_p3, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_p3::text, true);
  execute 'set local role authenticated';

  select seats_available into v_seats
  from public.search_rides(-23.5614, -46.6558, -23.53796, -46.67124, v_t) where route_id = v_two;
  if v_seats <> 1 then raise exception 'FALHOU: depois do aceite, a busca deveria mostrar 1 vaga, mostrou %', v_seats; end if;

  execute 'reset role';

  -- Constraint: aceita/recusada sempre com data.
  begin
    update public.ride_requests set status = 'aceita', decided_at = null where id = v_req_p3_gone;
    raise exception 'FALHOU: constraint aceitou "aceita" sem data de decisão';
  exception when check_violation then null;
  end;
end;
$$;

select 'decide_request: todas as asserções passaram' as resultado;

rollback;
