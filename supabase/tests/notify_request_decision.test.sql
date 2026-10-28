-- Teste de "Notificar o passageiro (aceita ou recusada)" — EP06.
--
-- Padrão dos outros: fixtures + asserções num DO block, dentro de
-- BEGIN … ROLLBACK. Sem erro = passou; falha = "FALHOU: ...".
--
-- Cobre: aceitar e recusar gravam um aviso para o passageiro certo, na mesma
-- transação; o encerrado por vagas esgotadas não recebe aviso de decisão;
-- B não lê o aviso de A; ninguém insere pelo app; só read_at é editável; marcar
-- como lida (e marcar de novo não conta); B não marca o de A; decidir de novo
-- não duplica (nem chamando o gravador duas vezes); a tabela está no Realtime.
--
-- O tempo de entrega (< 5 s) é medido no app, com dois usuários — ver
-- docs/notificacoes.md.

begin;

do $$
declare
  v_driver  uuid := '00000000-0000-4000-8000-0000000e1001';
  v_a       uuid := '00000000-0000-4000-8000-0000000e1002';
  v_b       uuid := '00000000-0000-4000-8000-0000000e1003';
  v_c       uuid := '00000000-0000-4000-8000-0000000e1004';
  v_vehicle uuid;
  v_t       timestamptz := date_trunc('hour', now()) + interval '2 days';
  v_route uuid; v_ra uuid; v_rb uuid; v_rc uuid;
  v_n     integer;
  r       record;
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
  from (values (v_driver, 'teste.aviso.motorista@pucsp.edu.br', 'Motorista Aviso'),
               (v_a,      'teste.aviso.a@pucsp.edu.br',        'Passageiro A'),
               (v_b,      'teste.aviso.b@pucsp.edu.br',        'Passageiro B'),
               (v_c,      'teste.aviso.c@pucsp.edu.br',        'Passageiro C')) as u(id, email, name);

  update public.profiles
     set avatar_url = 'avatars/teste.jpg',
         course_id  = (select id from public.courses limit 1),
         campus_id  = (select id from public.campuses limit 1)
   where id in (v_driver, v_a, v_b, v_c);

  insert into public.vehicles (owner_id, make_model, color, plate, seats)
  values (v_driver, 'Honda Fit', 'Prata', 'TST9J99', 4) returning id into v_vehicle;

  -- 1 vaga: A é aceito (esgota), B é recusado antes, C fica pendente e é encerrado.
  insert into public.routes (driver_id, vehicle_id, origin_label, origin_latitude, origin_longitude,
                             destination_label, destination_latitude, destination_longitude, departure_at, seats_total)
  values (v_driver, v_vehicle, 'Av. Paulista', -23.5614, -46.6558, 'PUC', -23.53796, -46.67124, v_t, 1)
  returning id into v_route;

  insert into public.ride_requests (route_id, passenger_id) values (v_route, v_a) returning id into v_ra;
  insert into public.ride_requests (route_id, passenger_id) values (v_route, v_b) returning id into v_rb;
  insert into public.ride_requests (route_id, passenger_id) values (v_route, v_c) returning id into v_rc;

  -- ------------------------------------------------------------ motorista
  perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_driver::text, true);
  execute 'set local role authenticated';

  perform public.decide_request(v_rb, 'recusada');
  perform public.decide_request(v_ra, 'aceita');

  -- Decidir de novo falha (e não grava aviso novo).
  begin
    perform public.decide_request(v_ra, 'aceita');
    raise exception 'FALHOU: decidiu duas vezes';
  exception when check_violation then null;
  end;

  -- O motorista não lê os avisos dos passageiros.
  if exists (select 1 from public.notifications) then
    raise exception 'FALHOU: motorista leu avisos de passageiros';
  end if;

  execute 'reset role';

  -- 1) Um aviso de aceite para A e um de recusa para B, com referência.
  select count(*) into v_n from public.notifications where recipient_id = v_a and kind = 'solicitacao_aceita' and request_id = v_ra and route_id = v_route;
  if v_n <> 1 then raise exception 'FALHOU: A deveria ter 1 aviso de aceite, tem %', v_n; end if;
  select count(*) into v_n from public.notifications where recipient_id = v_b and kind = 'solicitacao_recusada' and request_id = v_rb;
  if v_n <> 1 then raise exception 'FALHOU: B deveria ter 1 aviso de recusa, tem %', v_n; end if;
  select * into r from public.notifications where request_id = v_ra;
  if r.read_at is not null or r.title <> 'Vaga aceita' or r.body not like 'Sua solicitação para a carona de % foi aceita.%' then
    raise exception 'FALHOU: aviso de aceite com conteúdo inesperado: %', r;
  end if;

  -- 2) C foi encerrado (vagas esgotadas) e não recebe aviso de decisão.
  if (select status from public.ride_requests where id = v_rc) <> 'encerrada' then
    raise exception 'FALHOU: C deveria estar encerrado';
  end if;
  if exists (select 1 from public.notifications where recipient_id = v_c) then
    raise exception 'FALHOU: encerrado recebeu aviso de decisão';
  end if;

  -- 3) Sem duplicata mesmo chamando o gravador de novo.
  perform private.notify_request_event(v_ra, 'solicitacao_aceita');
  select count(*) into v_n from public.notifications where request_id = v_ra;
  if v_n <> 1 then raise exception 'FALHOU: aviso duplicado (% linhas)', v_n; end if;

  -- 4) A só lê os próprios.
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_a::text, true);
  execute 'set local role authenticated';

  select count(*) into v_n from public.notifications;
  if v_n <> 1 then raise exception 'FALHOU: A deveria ler só 1 aviso, leu %', v_n; end if;

  -- 5) Ninguém insere pelo app nem mexe em outra coluna.
  begin
    insert into public.notifications (recipient_id, kind, title, body) values (v_a, 'solicitacao_aceita', 'x', 'y');
    raise exception 'FALHOU: app inseriu aviso';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.notifications set title = 'alterado' where request_id = v_ra;
    raise exception 'FALHOU: app alterou o título do aviso';
  exception when insufficient_privilege then null;
  end;

  -- 6) Marcar como lida: conta 1, depois 0.
  v_n := public.mark_notifications_read();
  if v_n <> 1 then raise exception 'FALHOU: marcar como lidas deveria marcar 1, marcou %', v_n; end if;
  v_n := public.mark_notifications_read();
  if v_n <> 0 then raise exception 'FALHOU: marcar de novo deveria marcar 0, marcou %', v_n; end if;
  if (select read_at from public.notifications where request_id = v_ra) is null then
    raise exception 'FALHOU: read_at não foi gravado';
  end if;

  -- 7) B não lê nem marca o de A.
  execute 'reset role';
  update public.notifications set read_at = null where request_id = v_ra;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_b::text, true);
  execute 'set local role authenticated';

  if exists (select 1 from public.notifications where recipient_id = v_a) then
    raise exception 'FALHOU: B leu aviso de A';
  end if;
  v_n := public.mark_notifications_read(array[(select id from public.notifications where request_id = v_rb)]);
  update public.notifications set read_at = now() where request_id = v_ra;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FALHOU: B marcou aviso de A como lido'; end if;

  execute 'reset role';
  if (select read_at from public.notifications where request_id = v_ra) is not null then
    raise exception 'FALHOU: aviso de A foi marcado por B';
  end if;

  -- 8) Tabela publicada no Realtime.
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    raise exception 'FALHOU: notifications não está na publicação do Realtime';
  end if;
end;
$$;

select 'notify_request_decision: todas as asserções passaram' as resultado;

rollback;
