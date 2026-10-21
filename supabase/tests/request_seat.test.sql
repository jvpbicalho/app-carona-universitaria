-- Teste de "Solicitar vaga" (request_seat + regras de ride_requests) — EP05.
--
-- Mesmo padrão dos outros: fixtures + asserções num DO block, dentro de
-- BEGIN … ROLLBACK. Sem erro = passou; falha = "FALHOU: ...".
--
-- Cobre: solicitação válida (pendente), sem vaga, duplicada, na própria rota,
-- em rota cancelada, em rota que já partiu, perfil incompleto, escrita direta
-- pela API (RLS), pendentes não consomem vaga (dois pedidos para a última
-- vaga entram como pendentes), busca com vaga derivada e my_request_status,
-- "minhas solicitações", cancelamento da rota fechando pendentes, e vagas da
-- carona não podem cair abaixo das aceitas.
--
-- Concorrência real (duas chamadas ao mesmo tempo) não cabe numa sessão SQL;
-- foi verificada pela API com chamadas em paralelo (ver docs/solicitar-vaga.md).

begin;

do $$
declare
  v_driver  uuid := '00000000-0000-4000-8000-00000000d001';
  v_p1      uuid := '00000000-0000-4000-8000-00000000d002';
  v_p2      uuid := '00000000-0000-4000-8000-00000000d003';
  v_p3      uuid := '00000000-0000-4000-8000-00000000d004';
  v_incomp  uuid := '00000000-0000-4000-8000-00000000d005';
  v_vehicle uuid;
  v_t       timestamptz := date_trunc('hour', now()) + interval '2 days';

  v_open uuid; v_last uuid; v_full uuid; v_two uuid; v_cancel uuid; v_past uuid;
  v_req   public.ride_requests;
  v_n     integer;
  v_hint  text;
  v_found boolean;
  r       record;
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
  from (values (v_driver, 'teste.vaga.motorista@pucsp.edu.br', 'Motorista Vaga'),
               (v_p1,     'teste.vaga.p1@pucsp.edu.br',        'Passageiro Um'),
               (v_p2,     'teste.vaga.p2@pucsp.edu.br',        'Passageiro Dois'),
               (v_p3,     'teste.vaga.p3@pucsp.edu.br',        'Passageiro Tres'),
               (v_incomp, 'teste.vaga.incompleto@pucsp.edu.br','Sem Foto')) as u(id, email, name);

  update public.profiles
     set avatar_url = 'avatars/teste.jpg',
         course_id  = (select id from public.courses limit 1),
         campus_id  = (select id from public.campuses limit 1)
   where id in (v_driver, v_p1, v_p2, v_p3);

  insert into public.vehicles (owner_id, make_model, color, plate, seats)
  values (v_driver, 'Honda Fit', 'Prata', 'TST5E55', 4) returning id into v_vehicle;

  insert into public.routes (driver_id, vehicle_id, origin_label, origin_latitude, origin_longitude,
                             destination_label, destination_latitude, destination_longitude, departure_at, seats_total)
  values (v_driver, v_vehicle, 'aberta', -23.5614, -46.6558, 'PUC', -23.53796, -46.67124, v_t, 2)
  returning id into v_open;

  insert into public.routes (driver_id, vehicle_id, origin_label, origin_latitude, origin_longitude,
                             destination_label, destination_latitude, destination_longitude, departure_at, seats_total)
  values (v_driver, v_vehicle, 'ultima-vaga', -23.5614, -46.6558, 'PUC', -23.53796, -46.67124, v_t + interval '5 min', 1)
  returning id into v_last;

  insert into public.routes (driver_id, vehicle_id, origin_label, origin_latitude, origin_longitude,
                             destination_label, destination_latitude, destination_longitude, departure_at, seats_total)
  values (v_driver, v_vehicle, 'lotada', -23.5614, -46.6558, 'PUC', -23.53796, -46.67124, v_t + interval '10 min', 1)
  returning id into v_full;

  insert into public.routes (driver_id, vehicle_id, origin_label, origin_latitude, origin_longitude,
                             destination_label, destination_latitude, destination_longitude, departure_at, seats_total)
  values (v_driver, v_vehicle, 'duas-aceitas', -23.5614, -46.6558, 'PUC', -23.53796, -46.67124, v_t + interval '15 min', 2)
  returning id into v_two;

  insert into public.routes (driver_id, vehicle_id, origin_label, origin_latitude, origin_longitude,
                             destination_label, destination_latitude, destination_longitude, departure_at, seats_total)
  values (v_driver, v_vehicle, 'cancelada', -23.5614, -46.6558, 'PUC', -23.53796, -46.67124, v_t, 3)
  returning id into v_cancel;
  update public.routes set status = 'cancelada', cancellation_reason = 'teste' where id = v_cancel;

  alter table public.routes disable trigger routes_validate;
  insert into public.routes (driver_id, vehicle_id, origin_label, origin_latitude, origin_longitude,
                             destination_label, destination_latitude, destination_longitude, departure_at, seats_total)
  values (v_driver, v_vehicle, 'passada', -23.5614, -46.6558, 'PUC', -23.53796, -46.67124, now() - interval '1 hour', 3)
  returning id into v_past;
  alter table public.routes enable trigger routes_validate;

  -- Aceitas (como postgres: nascem pendentes pelo trigger e viram aceitas —
  -- a decisão do motorista é a história seguinte).
  insert into public.ride_requests (route_id, passenger_id) values (v_full, v_p3);
  insert into public.ride_requests (route_id, passenger_id) values (v_two, v_p2), (v_two, v_p3);
  update public.ride_requests set status = 'aceita', decided_at = now() where route_id in (v_full, v_two);

  -- Vaga derivada, num lugar só.
  if (select public.seats_available(rt) from public.routes rt where rt.id = v_full) <> 0
     or (select public.seats_taken(rt) from public.routes rt where rt.id = v_two) <> 2
     or (select public.seats_available(rt) from public.routes rt where rt.id = v_open) <> 2 then
    raise exception 'FALHOU: contagem de vagas derivada errada';
  end if;

  -- ------------------------------------------------------- como passageiro 1
  perform set_config('request.jwt.claims', json_build_object('sub', v_p1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_p1::text, true);
  execute 'set local role authenticated';

  -- 1) válida
  v_req := public.request_seat(v_open);
  if v_req.status <> 'pendente' or v_req.passenger_id <> v_p1 or v_req.route_id <> v_open then
    raise exception 'FALHOU: solicitação válida devolveu %', v_req;
  end if;

  -- Pendente não consome vaga.
  if (select public.seats_available(rt) from public.routes rt where rt.id = v_open) <> 2 then
    raise exception 'FALHOU: pedido pendente consumiu vaga';
  end if;

  -- 2) duplicada (o "clique duplo")
  begin
    perform public.request_seat(v_open);
    raise exception 'FALHOU: aceitou solicitação duplicada';
  exception when unique_violation then
    get stacked diagnostics v_hint = pg_exception_hint;
    if v_hint <> 'already_requested' then raise exception 'FALHOU: duplicada com hint %', v_hint; end if;
  end;

  -- 3) sem vaga
  begin
    perform public.request_seat(v_full);
    raise exception 'FALHOU: aceitou solicitação em rota lotada';
  exception when check_violation then
    get stacked diagnostics v_hint = pg_exception_hint;
    if v_hint <> 'no_seats' then raise exception 'FALHOU: lotada com hint %', v_hint; end if;
  end;

  -- 4) cancelada
  begin
    perform public.request_seat(v_cancel);
    raise exception 'FALHOU: aceitou solicitação em rota cancelada';
  exception when check_violation then
    get stacked diagnostics v_hint = pg_exception_hint;
    if v_hint <> 'route_not_available' then raise exception 'FALHOU: cancelada com hint %', v_hint; end if;
  end;

  -- 5) já partiu
  begin
    perform public.request_seat(v_past);
    raise exception 'FALHOU: aceitou solicitação em rota que já partiu';
  exception when check_violation then
    get stacked diagnostics v_hint = pg_exception_hint;
    if v_hint <> 'route_departed' then raise exception 'FALHOU: passada com hint %', v_hint; end if;
  end;

  -- 6) rota inexistente
  begin
    perform public.request_seat(gen_random_uuid());
    raise exception 'FALHOU: aceitou rota inexistente';
  exception when no_data_found then null;
  end;

  -- 7) escrita direta pela API: não existe policy de insert/update/delete.
  begin
    insert into public.ride_requests (route_id, passenger_id) values (v_last, v_p1);
    raise exception 'FALHOU: INSERT direto em ride_requests passou';
  exception when insufficient_privilege then null;
  end;
  update public.ride_requests set status = 'aceita' where passenger_id = v_p1;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FALHOU: passageiro aceitou o próprio pedido por UPDATE direto'; end if;
  delete from public.ride_requests where passenger_id = v_p1;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FALHOU: passageiro apagou pedido por DELETE direto'; end if;

  -- 8) busca: vaga derivada e status do próprio pedido
  select * into r from public.search_rides(-23.5614, -46.6558, -23.53796, -46.67124, v_t) where route_id = v_open;
  if r is null or r.seats_available <> 2 or r.my_request_status <> 'pendente' then
    raise exception 'FALHOU: busca do passageiro 1 na rota aberta: %', r;
  end if;
  if exists (select 1 from public.search_rides(-23.5614, -46.6558, -23.53796, -46.67124, v_t) where route_id in (v_full, v_two)) then
    raise exception 'FALHOU: rota sem vaga (aceitas = total) apareceu na busca';
  end if;

  -- 9) minhas solicitações
  select count(*) into v_n from public.my_ride_requests();
  if v_n <> 1 then raise exception 'FALHOU: my_ride_requests deveria ter 1 linha, veio %', v_n; end if;
  select * into r from public.my_ride_requests() limit 1;
  if r.status <> 'pendente' or r.route_id <> v_open or r.driver_name <> 'Motorista Vaga' or r.seats_available <> 2 then
    raise exception 'FALHOU: my_ride_requests devolveu %', r;
  end if;

  -- 10) última vaga: dois passageiros pedem, os dois ficam pendentes
  --     (pendente não reserva; quem decide é o motorista, na próxima história)
  v_req := public.request_seat(v_last);

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_p2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_p2::text, true);
  execute 'set local role authenticated';

  v_req := public.request_seat(v_last);
  if v_req.status <> 'pendente' then raise exception 'FALHOU: segundo pedido da última vaga: %', v_req; end if;

  -- O passageiro 2 não enxerga o pedido do passageiro 1.
  if exists (select 1 from public.ride_requests where passenger_id = v_p1) then
    raise exception 'FALHOU: passageiro 2 leu pedido do passageiro 1';
  end if;
  select * into r from public.search_rides(-23.5614, -46.6558, -23.53796, -46.67124, v_t) where route_id = v_open;
  if r.my_request_status is not null then
    raise exception 'FALHOU: passageiro 2 viu status de pedido que não é dele (%)', r.my_request_status;
  end if;

  -- ------------------------------------------------- perfil incompleto
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_incomp, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_incomp::text, true);
  execute 'set local role authenticated';
  begin
    perform public.request_seat(v_open);
    raise exception 'FALHOU: perfil incompleto pediu vaga';
  exception when check_violation then
    get stacked diagnostics v_hint = pg_exception_hint;
    if v_hint <> 'profile_incomplete' then raise exception 'FALHOU: perfil incompleto com hint %', v_hint; end if;
  end;

  -- ------------------------------------------------------- como motorista
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_driver::text, true);
  execute 'set local role authenticated';

  -- 11) na própria rota
  begin
    perform public.request_seat(v_open);
    raise exception 'FALHOU: motorista pediu vaga na própria rota';
  exception when check_violation then
    get stacked diagnostics v_hint = pg_exception_hint;
    if v_hint <> 'own_route' then raise exception 'FALHOU: própria rota com hint %', v_hint; end if;
  end;

  -- 12) motorista lê os pedidos das rotas dele
  select count(*) into v_n from public.ride_requests where route_id = v_last;
  if v_n <> 2 then raise exception 'FALHOU: motorista deveria ver 2 pedidos na última vaga, viu %', v_n; end if;

  -- 13) vagas da carona não caem abaixo das aceitas
  begin
    update public.routes set seats_total = 1 where id = v_two;
    raise exception 'FALHOU: reduziu vagas abaixo das aceitas';
  exception when check_violation then
    get stacked diagnostics v_hint = pg_exception_hint;
    if v_hint <> 'seats_below_accepted' then raise exception 'FALHOU: redução com hint %', v_hint; end if;
  end;

  -- 14) cancelar a rota fecha os pendentes (e avisa só os aceitos)
  update public.routes set status = 'cancelada', cancellation_reason = 'Imprevisto' where id = v_last;

  execute 'reset role';
  if exists (select 1 from public.ride_requests where route_id = v_last and status <> 'cancelada') then
    raise exception 'FALHOU: pendentes de rota cancelada não foram fechados';
  end if;
  if exists (select 1 from public.notifications where route_id = v_last) then
    raise exception 'FALHOU: pendente recebeu aviso de cancelamento (só aceitos são avisados)';
  end if;

  update public.routes set status = 'cancelada', cancellation_reason = 'Imprevisto' where id = v_two;
  select count(*) into v_n from public.notifications where route_id = v_two and kind = 'rota_cancelada';
  if v_n <> 2 then raise exception 'FALHOU: as 2 aceitas deveriam ser avisadas, foram %', v_n; end if;
end;
$$;

select 'request_seat: todas as asserções passaram' as resultado;

rollback;
