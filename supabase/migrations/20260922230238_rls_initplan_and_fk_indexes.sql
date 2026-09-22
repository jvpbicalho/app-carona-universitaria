-- Correção mecânica apontada pelo linter de desempenho do Supabase.
--
-- 1. auth_rls_initplan (WARN): as 8 policies dos Sprints 1–2 chamavam
--    auth.uid() direto, o que o planner reavalia por linha. Com
--    (select auth.uid()) vira um InitPlan avaliado uma vez por consulta.
--    `alter policy` troca só a expressão: nome, comando, roles (authenticated)
--    e o caráter PERMISSIVE ficam como estavam. Semântica idêntica.
--
-- 2. unindexed_foreign_keys (INFO): índices simples para as 3 FKs antigas.

-- profiles
alter policy profiles_select_own on public.profiles
  using ((select auth.uid()) = id);

alter policy profiles_update_own on public.profiles
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- vehicles
alter policy vehicles_select_own on public.vehicles
  using ((select auth.uid()) = owner_id);

alter policy vehicles_insert_own on public.vehicles
  with check ((select auth.uid()) = owner_id);

alter policy vehicles_update_own on public.vehicles
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

alter policy vehicles_delete_own on public.vehicles
  using ((select auth.uid()) = owner_id);

-- routes (routes_select_visible já usa a forma certa e não é tocada)
alter policy routes_insert_own on public.routes
  with check ((select auth.uid()) = driver_id);

alter policy routes_update_own on public.routes
  using ((select auth.uid()) = driver_id)
  with check ((select auth.uid()) = driver_id);

-- FKs sem índice
create index if not exists profiles_course_idx on public.profiles (course_id);
create index if not exists routes_vehicle_idx on public.routes (vehicle_id);
create index if not exists routes_destination_campus_idx on public.routes (destination_campus_id);
