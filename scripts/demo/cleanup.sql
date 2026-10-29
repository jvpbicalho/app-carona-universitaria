-- UniRota — limpeza do cenário de demonstração.
--
-- Apaga SÓ os dados de teste. O marcador é duplo e os dois precisam bater:
--   * e-mail terminado em @exemplo.test (domínio reservado, RFC 2606: não
--     existe caixa de correio real nele);
--   * id na faixa fixa de0de000-0000-4000-8000-0000000000xx (ver seed.sql).
-- Nenhuma linha de usuário real é tocada.
--
-- Também desfaz o que o seed liga fora das contas:
--   * a linha DEMO `exemplo.test` em allowed_email_domains;
--   * as tolerâncias da busca voltam ao padrão do projeto (2 km / ± 30 min),
--     porque a cena 8 do vídeo as altera pela tela do admin.
--
-- As fotos (bucket avatars) não saem por SQL: o Supabase barra DELETE direto
-- em storage.objects. Quem apaga é `python scripts/demo/demo.py cleanup`
-- (com o token de cada conta de teste, antes de rodar este arquivo).
--
-- Idempotente: rodar duas vezes não dá erro.

begin;

-- Rotas primeiro: routes.vehicle_id é ON DELETE RESTRICT, e a cascata a
-- partir do usuário poderia tentar apagar o veículo antes da rota.
delete from public.routes r
using auth.users u
where r.driver_id = u.id
  and u.email like '%@exemplo.test'
  and u.id::text like 'de0de000-0000-4000-8000-0000000000%';

-- Cascata: profiles, vehicles, ride_requests, notifications, app_admins.
delete from auth.users
where email like '%@exemplo.test'
  and id::text like 'de0de000-0000-4000-8000-0000000000%';

delete from public.login_attempts where email like '%@exemplo.test';

delete from public.allowed_email_domains where domain = 'exemplo.test';

update public.matching_settings
set radius_km = 2.0, time_window_minutes = 30, updated_at = now(), updated_by = null
where id and (radius_km <> 2.0 or time_window_minutes <> 30);

commit;

select
  (select count(*) from auth.users where email like '%@exemplo.test') as contas_demo_restantes,
  (select count(*) from public.allowed_email_domains where domain = 'exemplo.test') as dominio_demo,
  (select radius_km || ' km / ' || time_window_minutes || ' min' from public.matching_settings) as tolerancias;
