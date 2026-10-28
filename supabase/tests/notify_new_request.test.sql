-- Teste de "Notificar o motorista (nova solicitação)" — EP06.
--
-- Padrão dos outros: fixtures + asserções num DO block, dentro de
-- BEGIN … ROLLBACK. Sem erro = passou; falha = "FALHOU: ...".
--
-- Cobre: pedido novo grava aviso só para o motorista da rota (não para o
-- passageiro, nem para outro motorista); pedido repetido não duplica; a
-- contagem do badge (my_pending_requests_summary) depois de solicitar, aceitar,
-- recusar e encerrar por vagas esgotadas; motorista A não vê pendências de B;
-- o destino do badge (rota única ou lista).
--
-- O tempo até o badge atualizar (< 5 s) é medido no app — docs/notificacoes.md.

begin;

do $$
declare
  v_a   uuid := '00000000-0000-4000-8000-0000000e2001';  -- motorista A
  v_b   uuid := '00000000-0000-4000-8000-0000000e2002';  -- motorista B
  v_p   uuid := '00000000-0000-4000-8000-0000000e2003';
  v_q   uuid := '00000000-0000-4000-8000-0000000e2004';
  v_s   uuid := '00000000-0000-4000-8000-0000000e2005';
  v_veh_a uuid; v_veh_b uuid;
  v_t   timestamptz := date_trunc('hour', now()) + interval '2 days';
  v_one uuid; v_two uuid; v_rb uuid;
  v_req public.ride_requests; v_p_one uuid; v_s_two uuid;
  v_n   integer;
  r     record;
begin
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
  from (values (v_a, 'teste.badge.a@pucsp.edu.br', 'Motorista A'),
               (v_b, 'teste.badge.b@pucsp.edu.br', 'Motorista B'),
               (v_p, 'teste.badge.p@pucsp.edu.br', 'Paula Passageira'),
               (v_q, 'teste.badge.q@pucsp.edu.br', 'Quim Passageiro'),
               (v_s, 'teste.badge.s@pucsp.edu.br', 'Sara Passageira')) as u(id, email, name);

  update public.profiles
     set avatar_url = 'avatars/teste.jpg',
         course_id  = (select id from public.courses limit 1),
         campus_id  = (select id from public.campuses limit 1)
   where id in (v_a, v_b, v_p, v_q, v_s);

  insert into public.vehicles (owner_id, make_model, color, plate, seats) values (v_a, 'Honda Fit', 'Prata', 'TST1A01', 4) returning id into v_veh_a;
  insert into public.vehicles (owner_id, make_model, color, plate, seats) values (v_b, 'Fiat Argo', 'Branco', 'TST2B02', 4) returning id into v_veh_b;

  insert into public.routes (driver_id, vehicle_id, origin_label, origin_latitude, origin_longitude,
                             destination_label, destination_latitude, destination_longitude, departure_at, seats_total)
  values (v_a, v_veh_a, 'Av. Paulista', -23.5614, -46.6558, 'PUC', -23.53796, -46.67124, v_t, 1) returning id into v_one;
  insert into public.routes (driver_id, vehicle_id, origin_label, origin_latitude, origin_longitude,
                             destination_label, destination_latitude, destination_longitude, departure_at, seats_total)
  values (v_a, v_veh_a, 'Rua Augusta', -23.5614, -46.6558, 'PUC', -23.53796, -46.67124, v_t + interval '1 hour', 2) returning id into v_two;
  insert into public.routes (driver_id, vehicle_id, origin_label, origin_latitude, origin_longitude,
                             destination_label, destination_latitude, destination_longitude, departure_at, seats_total)
  values (v_b, v_veh_b, 'Rua da Consolação', -23.5614, -46.6558, 'PUC', -23.53796, -46.67124, v_t, 2) returning id into v_rb;

  -- ---------------------------------------------- P pede vaga na rota de A
  perform set_config('request.jwt.claims', json_build_object('sub', v_p, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_p::text, true);
  execute 'set local role authenticated';
  v_req := public.request_seat(v_one);
  v_p_one := v_req.id;
  -- P também pede na rota de B (para o teste de isolamento).
  perform public.request_seat(v_rb);
  -- Pedido repetido falha e não gera aviso novo.
  begin
    perform public.request_seat(v_one);
    raise exception 'FALHOU: pedido duplicado passou';
  exception when unique_violation then null;
  end;
  -- O passageiro não recebe o aviso de "nova solicitação" (é do motorista).
  if exists (select 1 from public.notifications) then
    raise exception 'FALHOU: passageiro recebeu aviso de nova solicitação';
  end if;
  execute 'reset role';

  -- 1) Aviso só para o motorista certo.
  select count(*) into v_n from public.notifications where kind = 'solicitacao_recebida' and request_id = v_p_one;
  if v_n <> 1 then raise exception 'FALHOU: pedido deveria gerar 1 aviso, gerou %', v_n; end if;
  select * into r from public.notifications where request_id = v_p_one;
  if r.recipient_id <> v_a or r.route_id <> v_one or r.title <> 'Nova solicitação de vaga'
     or r.body not like 'Paula Passageira pediu vaga na carona de %' then
    raise exception 'FALHOU: aviso de nova solicitação inesperado: %', r;
  end if;
  if exists (select 1 from public.notifications where recipient_id = v_b and route_id = v_one) then
    raise exception 'FALHOU: motorista B recebeu aviso de rota de A';
  end if;

  -- Q também pede na rota de uma vaga; S pede na de duas.
  perform set_config('request.jwt.claims', json_build_object('sub', v_q, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_q::text, true);
  execute 'set local role authenticated';
  perform public.request_seat(v_one);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_s, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_s::text, true);
  execute 'set local role authenticated';
  v_req := public.request_seat(v_two);
  v_s_two := v_req.id;
  execute 'reset role';

  -- ------------------------------------------------- contagem do motorista A
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_a::text, true);
  execute 'set local role authenticated';

  -- 2) Depois de solicitar: 3 pendências em 2 rotas (e não vê a de B).
  select * into r from public.my_pending_requests_summary();
  if r.pending_count <> 3 or r.routes_with_pending <> 2 or r.single_route_id is not null then
    raise exception 'FALHOU: depois de solicitar, esperava 3 em 2 rotas, veio %', r;
  end if;
  select count(*) into v_n from public.notifications where kind = 'solicitacao_recebida';
  if v_n <> 3 then raise exception 'FALHOU: A deveria ter 3 avisos de nova solicitação, tem %', v_n; end if;

  -- 3) Aceitar P na rota de uma vaga: Q é encerrado (vagas esgotadas).
  --    Sobra 1 pendência (S), numa rota só → o badge leva direto a ela.
  perform public.decide_request(v_p_one, 'aceita');
  select * into r from public.my_pending_requests_summary();
  if r.pending_count <> 1 or r.single_route_id <> v_two then
    raise exception 'FALHOU: depois de aceitar e encerrar, esperava 1 na rota de duas vagas, veio %', r;
  end if;

  -- 4) Recusar S: zero.
  perform public.decide_request(v_s_two, 'recusada');
  select * into r from public.my_pending_requests_summary();
  if r.pending_count <> 0 or r.single_route_id is not null then
    raise exception 'FALHOU: depois de recusar, esperava 0, veio %', r;
  end if;

  execute 'reset role';

  -- ------------------------------------------------- motorista B, isolado
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_b::text, true);
  execute 'set local role authenticated';

  -- 5) B vê só a pendência dele, e só o aviso dele.
  select * into r from public.my_pending_requests_summary();
  if r.pending_count <> 1 or r.single_route_id <> v_rb then
    raise exception 'FALHOU: B deveria ver 1 pendência na rota dele, veio %', r;
  end if;
  select count(*) into v_n from public.notifications;
  if v_n <> 1 then raise exception 'FALHOU: B deveria ler só 1 aviso, leu %', v_n; end if;

  execute 'reset role';

  -- 6) Passageiro sem rotas: contagem zero (o badge não aparece).
  perform set_config('request.jwt.claims', json_build_object('sub', v_q, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_q::text, true);
  execute 'set local role authenticated';
  select * into r from public.my_pending_requests_summary();
  if r.pending_count <> 0 then raise exception 'FALHOU: quem não tem rota deveria ter 0 pendências'; end if;
  execute 'reset role';
end;
$$;

select 'notify_new_request: todas as asserções passaram' as resultado;

rollback;
