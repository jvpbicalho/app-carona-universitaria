-- EP03 / Cancelar ou editar rota — base para "passageiros com vaga confirmada".
--
-- O critério de aceite pede avisar passageiros com vaga confirmada, mas quem
-- confirma vaga é o EP05, que ainda não existe. Para a notificação consultar
-- destinatários de verdade (e não um stub que o EP05 teria de reescrever), esta
-- migration cria a tabela de solicitações no formato MÍNIMO: rota, passageiro e
-- status. Os quatro status vêm do wireframe 5.3; nada aqui foi inventado.
--
-- O EP05 estende esta tabela (ponto de embarque, mensagem, motivo de recusa) e
-- cria as policies/funções de escrita. Hoje ela é só leitura para o app.

-- ---------------------------------------------------------------------------
-- Schema privado: funções auxiliares que as policies e triggers precisam, mas
-- que não devem virar /rest/v1/rpc/... O PostgREST expõe apenas `public`.
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon;
-- `authenticated` precisa de USAGE para as policies conseguirem chamar as
-- funções abaixo. Sem exposição pela API: o schema não está na lista do
-- PostgREST.
grant usage on schema private to authenticated, service_role;

create table if not exists public.ride_requests (
  id           uuid        primary key default gen_random_uuid(),
  route_id     uuid        not null references public.routes (id) on delete cascade,
  passenger_id uuid        not null references public.profiles (id) on delete cascade,
  status       text        not null default 'aguardando',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint ride_requests_status_check
    check (status in ('aguardando', 'confirmada', 'recusada', 'cancelada'))
);

comment on table public.ride_requests is
  'Solicitação de vaga de um passageiro numa rota. Formato mínimo criado junto '
  'com cancelar/editar rota, para a notificação consultar quem tem vaga '
  'confirmada. O EP05 estende (embarque, mensagem) e cria a escrita.';
comment on column public.ride_requests.status is
  'Estados do wireframe 5.3. Pedir vaga não é reservar: só `confirmada` ocupa '
  'vaga e só `confirmada` é avisada quando a rota muda ou é cancelada.';

-- Um pedido ativo por passageiro por rota. Recusado ou cancelado não bloqueia
-- pedir de novo — por isso índice parcial, e não unique simples.
create unique index if not exists ride_requests_one_active_per_passenger
  on public.ride_requests (route_id, passenger_id)
  where status in ('aguardando', 'confirmada');

create index if not exists ride_requests_route_status_idx
  on public.ride_requests (route_id, status);
create index if not exists ride_requests_passenger_idx
  on public.ride_requests (passenger_id);

drop trigger if exists ride_requests_touch_updated_at on public.ride_requests;
create trigger ride_requests_touch_updated_at
  before update on public.ride_requests
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Auxiliares de RLS.
--
-- routes precisa consultar ride_requests (passageiro vê a rota cancelada em
-- que tinha vaga) e ride_requests precisa consultar routes (motorista vê os
-- pedidos das suas rotas). Policies que se referenciam em ciclo dão "infinite
-- recursion detected in policy". Funções SECURITY DEFINER quebram o ciclo:
-- rodam como dono e não reavaliam RLS. Ambas só respondem sobre o próprio
-- usuário (auth.uid()), então não vazam nada sobre terceiros.
-- ---------------------------------------------------------------------------
create or replace function private.is_route_driver(p_route_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.routes r
    where r.id = p_route_id and r.driver_id = (select auth.uid())
  );
$$;

create or replace function private.has_request_on_route(p_route_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.ride_requests rr
    where rr.route_id = p_route_id and rr.passenger_id = (select auth.uid())
  );
$$;

revoke all on function private.is_route_driver(uuid)      from public, anon;
revoke all on function private.has_request_on_route(uuid) from public, anon;
grant execute on function private.is_route_driver(uuid)      to authenticated, service_role;
grant execute on function private.has_request_on_route(uuid) to authenticated, service_role;

alter table public.ride_requests enable row level security;

-- Passageiro vê os próprios pedidos; motorista vê os pedidos das suas rotas.
drop policy if exists "ride_requests_select_involved" on public.ride_requests;
create policy "ride_requests_select_involved"
  on public.ride_requests for select
  to authenticated
  using (
    passenger_id = (select auth.uid())
    or private.is_route_driver(route_id)
  );

-- Sem policies de insert/update/delete: a escrita é do EP05, que vai definir
-- as regras (só com vaga disponível, só o motorista aceita, etc.). Até lá, a
-- tabela é inerte para o app.
