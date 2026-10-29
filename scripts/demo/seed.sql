-- UniRota — seed do cenário de demonstração (vídeo e ensaio manual).
--
-- O QUE CRIA
--   4 contas já confirmadas, sem signUp (nenhum e-mail é enviado):
--     teste.motorista@exemplo.test   Davi Motorista Demo  (veículo, 2 vagas)
--     teste.passageira@exemplo.test  Ana Passageira Demo
--     teste.passageiro@exemplo.test  Bruno Passageiro Demo
--     teste.admin@exemplo.test       Carla Admin Demo     (promovida a admin)
--   Senha de todas: DemoUniRota2026!  (contas descartáveis, documentada de
--   propósito; não é senha de ninguém).
--   4 caronas do motorista, sempre no futuro (datas calculadas a partir de
--   now(), nunca fixas). Ver tabela no fim deste cabeçalho.
--
-- MARCADOR: e-mail @exemplo.test E id na faixa de0de000-…-0000000000xx.
-- cleanup.sql apaga só o que tem os dois.
--
-- DOMÍNIO INSTITUCIONAL: o trigger de auth.users e a Edge Function auth-login
-- só aceitam domínios de public.allowed_email_domains. O seed insere a linha
-- `exemplo.test` (rótulo "DEMO …") e o cleanup a remove. Nenhum código muda:
-- o app continua só aceitando cadastro @pucsp.edu.br (o client valida pelo
-- .env), e .test é um domínio reservado, que não recebe e-mail — ninguém
-- consegue confirmar uma conta nova nele enquanto a linha existir.
--
-- IDEMPOTENTE: pode rodar quantas vezes quiser. Contas, perfis e veículo são
-- upsert; as caronas e tudo que depende delas (solicitações, avisos) são
-- apagados e recriados, então cada execução devolve o cenário inicial.
--
-- FOTOS: avatar_url aponta para avatars/<id>/avatar-demo.png. O arquivo é
-- enviado por `python scripts/demo/demo.py avatars` (com o token da própria
-- conta, sem service_role). Sem esse passo o perfil fica "completo" no banco,
-- mas a foto não aparece.
--
-- CARONAS (horário de São Paulo; D = hoje):
--   A  MASP (Av. Paulista)  → PUC Perdizes  D+2 07:30  2 vagas  aparece na busca
--   B  Praça da Sé          → PUC Perdizes  D+2 07:40  2 vagas  2,46 km da origem
--                                                      da busca: fora do raio de
--                                                      2 km, entra com 3 km ou mais
--   C  Rua Augusta, 1500    → PUC Consolação D+3 18:30           para cancelar (cena 3)
--   D  Estação Santana      → PUC Perdizes  D+4 07:00            para recusar (cena 7)
--   Origem da busca do passageiro: "avenida paulista 900" → sugestão
--   "Faculdade Cásper Líbero" (-23.5654358, -46.6512009). A fica a 653 m dela.

begin;

-- 1. Domínio DEMO (temporário; cleanup.sql remove) --------------------------
insert into public.allowed_email_domains (domain, label, include_subdomains, is_active)
values ('exemplo.test', 'DEMO — contas de teste de scripts/demo (remover com cleanup.sql)', false, true)
on conflict (domain) do update set is_active = true, label = excluded.label;

-- 2. Contas ------------------------------------------------------------------
-- Colunas de token preenchidas com '': o GoTrue as lê como string não-anulável
-- e NULL faz o login falhar com "invalid credentials" (armadilha do CLAUDE.md).
with demo(id, email, full_name) as (
  values
    ('de0de000-0000-4000-8000-000000000001'::uuid, 'teste.motorista@exemplo.test',  'Davi Motorista Demo'),
    ('de0de000-0000-4000-8000-000000000002'::uuid, 'teste.passageira@exemplo.test', 'Ana Passageira Demo'),
    ('de0de000-0000-4000-8000-000000000003'::uuid, 'teste.passageiro@exemplo.test', 'Bruno Passageiro Demo'),
    ('de0de000-0000-4000-8000-000000000004'::uuid, 'teste.admin@exemplo.test',      'Carla Admin Demo')
)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new,
  email_change_token_current, email_change, phone_change,
  phone_change_token, reauthentication_token
)
select
  '00000000-0000-0000-0000-000000000000', d.id, 'authenticated', 'authenticated',
  d.email, extensions.crypt('DemoUniRota2026!', extensions.gen_salt('bf')),
  -- Só email_confirmed_at: confirmed_at é coluna gerada.
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', d.full_name),
  '', '', '', '', '', '', '', ''
from demo d
on conflict (id) do update
set encrypted_password = excluded.encrypted_password,
    email_confirmed_at = coalesce(auth.users.email_confirmed_at, now()),
    banned_until       = null,
    updated_at         = now();

-- Identidade "email", como o GoTrue cria no cadastro normal.
insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now(), now()
from auth.users u
where u.id::text like 'de0de000-0000-4000-8000-0000000000%'
on conflict (provider_id, provider) do nothing;

-- Tentativas de login de ensaios anteriores não podem deixar conta bloqueada.
delete from public.login_attempts where email like '%@exemplo.test';

-- 3. Perfis completos (o trigger handle_new_user já criou a linha) ----------
update public.profiles p
set full_name   = v.full_name,
    avatar_url  = p.id::text || '/avatar-demo.png',
    course_id   = (select id from public.courses where name = v.course),
    campus_id   = (select id from public.campuses where name = v.campus),
    phone       = null,
    bio         = v.bio,
    active_role = 'passageiro',
    updated_at  = now()
from (values
  ('de0de000-0000-4000-8000-000000000001'::uuid, 'Davi Motorista Demo',   'Ciência da Computação', 'Consolação (Marquês de Paranaguá)', 'Conta de demonstração.'),
  ('de0de000-0000-4000-8000-000000000002'::uuid, 'Ana Passageira Demo',   'Psicologia',            'Perdizes (Monte Alegre)',           'Conta de demonstração.'),
  ('de0de000-0000-4000-8000-000000000003'::uuid, 'Bruno Passageiro Demo', 'Direito',               'Perdizes (Monte Alegre)',           'Conta de demonstração.'),
  ('de0de000-0000-4000-8000-000000000004'::uuid, 'Carla Admin Demo',      'Administração',         'Perdizes (Monte Alegre)',           'Conta de demonstração.')
) as v(id, full_name, course, campus, bio)
where p.id = v.id;

-- 4. Veículo do motorista: 2 vagas -------------------------------------------
-- As caronas antigas saem antes (routes.vehicle_id é RESTRICT); cascata leva
-- solicitações. Avisos de rota ficam com route_id nulo e saem logo abaixo.
delete from public.routes where driver_id = 'de0de000-0000-4000-8000-000000000001';
delete from public.notifications where recipient_id::text like 'de0de000-0000-4000-8000-0000000000%';

insert into public.vehicles (owner_id, make_model, color, plate, seats)
values ('de0de000-0000-4000-8000-000000000001', 'Fiat Argo', 'Prata', 'DEM2A26', 2)
on conflict (owner_id) do update
set make_model = excluded.make_model, color = excluded.color,
    plate = excluded.plate, seats = excluded.seats, updated_at = now();

update public.profiles set active_role = 'motorista'
where id = 'de0de000-0000-4000-8000-000000000001';

-- 5. Admin -------------------------------------------------------------------
insert into public.app_admins (user_id)
values ('de0de000-0000-4000-8000-000000000004')
on conflict (user_id) do nothing;

-- Tolerâncias no padrão: a cena 8 parte de 2 km / ± 30 min.
update public.matching_settings
set radius_km = 2.0, time_window_minutes = 30, updated_at = now(), updated_by = null
where id and (radius_km <> 2.0 or time_window_minutes <> 30);

-- 6. Caronas, sempre no futuro ----------------------------------------------
-- Dia D = hoje em São Paulo. (data local + hora) at time zone → timestamptz.
with base as (
  select (now() at time zone 'America/Sao_Paulo')::date as d
),
v as (
  select id from public.vehicles where owner_id = 'de0de000-0000-4000-8000-000000000001'
),
perdizes as (select id, latitude, longitude from public.campuses where name = 'Perdizes (Monte Alegre)'),
consolacao as (select id, latitude, longitude from public.campuses where name = 'Consolação (Marquês de Paranaguá)')
insert into public.routes (
  id, driver_id, vehicle_id,
  origin_label, origin_latitude, origin_longitude,
  destination_label, destination_latitude, destination_longitude, destination_campus_id,
  departure_at, seats_total, notes
)
select x.id, 'de0de000-0000-4000-8000-000000000001', v.id,
       x.o_label, x.o_lat, x.o_lng,
       x.d_label, x.d_lat, x.d_lng, x.campus_id,
       ((base.d + x.day_offset) + x.at_time) at time zone 'America/Sao_Paulo',
       x.seats, x.notes
from base, v, (
  select 'de0de000-0000-4000-8000-0000000000a1'::uuid as id,
         'MASP · Avenida Paulista, 1578 · Bela Vista · São Paulo' as o_label, -23.561414 as o_lat, -46.655881 as o_lng,
         'PUC-SP Perdizes · Rua Monte Alegre, 984 · São Paulo' as d_label, p.latitude as d_lat, p.longitude as d_lng, p.id as campus_id,
         2 as day_offset, time '07:30' as at_time, 2 as seats, 'Saio pontualmente. Vou pela Rua Cardeal Arcoverde.' as notes
  from perdizes p
  union all
  select 'de0de000-0000-4000-8000-0000000000a2', 'Praça da Sé · Sé · São Paulo', -23.55052, -46.63331,
         'PUC-SP Perdizes · Rua Monte Alegre, 984 · São Paulo', p.latitude, p.longitude, p.id,
         2, time '07:40', 2, null
  from perdizes p
  union all
  select 'de0de000-0000-4000-8000-0000000000a3', 'Rua Augusta, 1500 · Consolação · São Paulo', -23.557610, -46.658700,
         'PUC-SP Consolação · Rua Marquês de Paranaguá, 111 · São Paulo', c.latitude, c.longitude, c.id,
         3, time '18:30', 2, null
  from consolacao c
  union all
  select 'de0de000-0000-4000-8000-0000000000a4', 'Estação Santana · Santana · São Paulo', -23.502500, -46.625000,
         'PUC-SP Perdizes · Rua Monte Alegre, 984 · São Paulo', p.latitude, p.longitude, p.id,
         4, time '07:00', 2, null
  from perdizes p
) x;

-- 7. Endereço do roteiro no cache de geocodificação -------------------------
-- Em 28/10/2026 o Nominatim passou a responder 403 à Edge Function `geocode`
-- (ver docs/demo/roteiro-video.md, "Plano B"). A função consulta o cache
-- ANTES do Nominatim, com validade de 30 dias. Aqui o seed garante a única
-- busca de endereço usada no roteiro, com coordenadas reais: se a linha já
-- existe, só renova a data (mantém o resultado); se não existe (banco local
-- novo), grava o resultado abaixo. Não é dado de teste — é cache legítimo —,
-- por isso cleanup.sql não o apaga.
insert into public.geocode_cache (query, results, created_at, last_used_at)
values (
  'avenida paulista 900',
  '[{"city": "São Paulo", "label": "Faculdade Cásper Líbero · Morro dos Ingleses · São Paulo", "state": "São Paulo", "latitude": -23.5654358, "longitude": -46.6512009},
    {"city": "São Paulo", "label": "Avenida Paulista, 900 · Bela Vista · São Paulo", "state": "São Paulo", "latitude": -23.5652, "longitude": -46.6515}]'::jsonb,
  now(), now()
)
on conflict (query) do update set created_at = now(), last_used_at = now();

commit;

-- Conferência ----------------------------------------------------------------
select r.id, left(r.origin_label, 28) as origem,
       to_char(r.departure_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as saida,
       public.seats_available(r) as vagas, r.status
from public.routes r
where r.driver_id = 'de0de000-0000-4000-8000-000000000001'
order by r.departure_at;
