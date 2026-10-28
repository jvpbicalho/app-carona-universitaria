-- Teste de "Fechar solicitações quando as vagas esgotarem" — EP05.
--
-- Padrão dos outros: fixtures + asserções num DO block, dentro de
-- BEGIN … ROLLBACK. Sem erro = passou; falha = "FALHOU: ...".
--
-- Cobre: aceitar a última vaga esgota a rota (vaga derivada = 0); as pendentes
-- dela viram `encerrada` (não `recusada`) e as de outras rotas não mudam; a
-- busca não devolve a rota; pedido novo é recusado; decidir pedido encerrado
-- dá `request_closed_full`; reduzir vagas até as aceitas também encerra; o
-- passageiro vê `encerrada` na lista dele.
--
-- Duas aceitações simultâneas para a última vaga: a trava da rota serializa;
-- verificado pela API com chamadas em paralelo (docs/solicitar-vaga.md).

begin;

do $$
declare
  v_driver  uuid := '00000000-0000-4000-8000-00000000f001';
  v_p1      uuid := '00000000-0000-4000-8000-00000000f002';
  v_p2      uuid := '00000000-0000-4000-8000-00000000f003';
  v_p3      uuid := '00000000-0000-4000-8000-00000000f004';
  v_p4      uuid := '00000000-0000-4000-8000-00000000f005';
  v_vehicle uuid;
  v_t       timestamptz := date_trunc('hour', now()) + interval '2 days';

  v_two uuid; v_other uuid; v_shrink uuid;
  r1 uuid; r2 uuid; r3 uuid; r3_other uuid; s1 uuid; s2 uuid;
  v_n     integer;
  v_hint  text;
  v_status text;
begin
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
  from (values (v_driver, 'teste.lota.motorista@pucsp.edu.br', 'Motorista Lota'),
               (v_p1,     'teste.lota.p1@pucsp.edu.br',        'Passageiro Um'),
               (v_p2,     'teste.lota.p2@pucsp.edu.br',        'Passageiro Dois'),
               (v_p3,     'teste.lota.p3@pucsp.edu.br',        'Passageiro Tres'),
               (v_p4,     'teste.lota.p4@pucsp.edu.br',        'Passageiro Quatro')) as u(id, email, name);

  update public.profiles
     set avatar_url = 'avatars/teste.jpg',
         course_id  = (select id from public.courses limit 1),
         campus_id  = (select id from public.campuses limit 1)
   where id in (v_driver, v_p1, v_p2, v_p3, v_p4);

  insert into public.vehicles (owner_id, make_model, color, plate, seats)
  values (v_driver, 'Honda Fit', 'Prata', 'TST7G77', 4) returning id into v_vehicle;

  -- Rota de 2 vagas com 3 pendentes; outra rota com um pendente do p3.
  insert into public.routes (driver_id, vehicle_id, origin_label, origin_latitude, origin_longitude,
                             destination_label, destination_latitude, destination_longitude, departure_at, seats_total)
  values (v_driver, v_vehicle, 'duas-vagas', -23.5614, -46.6558, 'PUC', -23.53796, -46.67124, v_t, 2)
  returning id into v_two;
  insert into public.routes (driver_id, vehicle_id, origin_label, origin_latitude, origin_longitude,
                             destination_label, destination_latitude, destination_longitude, departure_at, seats_total)
  values (v_driver, v_vehicle, 'outra', -23.5614, -46.6558, 'PUC', -23.53796, -46.67124, v_t + interval '5 min', 3)
  returning id into v_other;
  insert into public.routes (driver_id, vehicle_id, origin_label, origin_latitude, origin_longitude,
                             destination_label, destination_latitude, destination_longitude, departure_at, seats_total)
  values (v_driver, v_vehicle, 'vai-encolher', -23.5614, -46.6558, 'PUC', -23.53796, -46.67124, v_t + interval '10 min', 3)
  returning id into v_shrink;

  insert into public.ride_requests (route_id, passenger_id) values (v_two, v_p1) returning id into r1;
  insert into public.ride_requests (route_id, passenger_id) values (v_two, v_p2) returning id into r2;
  insert into public.ride_requests (route_id, passenger_id) values (v_two, v_p3) returning id into r3;
  insert into public.ride_requests (route_id, passenger_id) values (v_other, v_p3) returning id into r3_other;
  insert into public.ride_requests (route_id, passenger_id) values (v_shrink, v_p1) returning id into s1;
  insert into public.ride_requests (route_id, passenger_id) values (v_shrink, v_p2) returning id into s2;

  -- ------------------------------------------------------------ motorista
  perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_driver::text, true);
  execute 'set local role authenticated';

  -- 1) Primeira vaga: a rota ainda tem 1, ninguém é encerrado.
  perform public.decide_request(r1, 'aceita');
  if (select count(*) from public.ride_requests where route_id = v_two and status = 'pendente') <> 2 then
    raise exception 'FALHOU: com vaga sobrando, pendentes não deveriam ser encerradas';
  end if;

  -- 2) Última vaga: esgota e encerra as pendentes, na mesma transação.
  perform public.decide_request(r2, 'aceita');

  if (select public.seats_available(rt) from public.routes rt where rt.id = v_two) <> 0 then
    raise exception 'FALHOU: depois da última aceitação a vaga deveria ser 0';
  end if;
  select status into v_status from public.ride_requests where id = r3;
  if v_status <> 'encerrada' then
    raise exception 'FALHOU: pendente da rota esgotada deveria ser encerrada, ficou %', v_status;
  end if;
  if (select decided_at from public.ride_requests where id = r3) is not null then
    raise exception 'FALHOU: encerrada não é decisão do motorista e não deveria ter decided_at';
  end if;

  -- 3) Pendente de OUTRA rota não muda.
  if (select status from public.ride_requests where id = r3_other) <> 'pendente' then
    raise exception 'FALHOU: pendente de outra rota foi encerrada';
  end if;

  -- 4) Decidir pedido encerrado: mensagem própria (não "já respondida").
  begin
    perform public.decide_request(r3, 'aceita');
    raise exception 'FALHOU: aceitou pedido encerrado';
  exception when check_violation then
    get stacked diagnostics v_hint = pg_exception_hint;
    if v_hint <> 'request_closed_full' then raise exception 'FALHOU: pedido encerrado com hint %', v_hint; end if;
  end;

  -- 5) Reduzir vagas até as aceitas também esgota e encerra.
  perform public.decide_request(s1, 'aceita');
  update public.routes set seats_total = 1 where id = v_shrink;
  if (select status from public.ride_requests where id = s2) <> 'encerrada' then
    raise exception 'FALHOU: reduzir vagas até as aceitas deveria encerrar as pendentes';
  end if;

  -- ------------------------------------------------- passageiro de fora (p4)
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_p4, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_p4::text, true);
  execute 'set local role authenticated';

  -- 6) A busca não devolve a rota esgotada, mas devolve a outra.
  if exists (select 1 from public.search_rides(-23.5614, -46.6558, -23.53796, -46.67124, v_t) where route_id = v_two) then
    raise exception 'FALHOU: rota esgotada apareceu na busca';
  end if;
  if not exists (select 1 from public.search_rides(-23.5614, -46.6558, -23.53796, -46.67124, v_t) where route_id = v_other) then
    raise exception 'FALHOU: rota com vaga sumiu da busca';
  end if;

  -- 7) Pedido novo na rota esgotada é recusado com mensagem clara.
  begin
    perform public.request_seat(v_two);
    raise exception 'FALHOU: aceitou pedido em rota esgotada';
  exception when check_violation then
    get stacked diagnostics v_hint = pg_exception_hint;
    if v_hint <> 'no_seats' then raise exception 'FALHOU: rota esgotada com hint %', v_hint; end if;
  end;

  -- ---------------------------------------------- passageiro encerrado (p3)
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_p3, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_p3::text, true);
  execute 'set local role authenticated';

  -- 8) Vê `encerrada` (e não `recusada`) na lista dele.
  select status into v_status from public.my_ride_requests() where request_id = r3;
  if v_status <> 'encerrada' then
    raise exception 'FALHOU: passageiro deveria ver encerrada, viu %', v_status;
  end if;

  execute 'reset role';

  -- 9) A constraint aceita o status novo e continua recusando lixo.
  begin
    update public.ride_requests set status = 'lotada' where id = r3;
    raise exception 'FALHOU: constraint aceitou status inventado';
  exception when check_violation then null;
  end;
end;
$$;

select 'close_when_full: todas as asserções passaram' as resultado;

rollback;
