-- EP03 / História 3 — cadastro de rota (carona).

-- PostGIS fica no schema `extensions`, não em `public`: instalar no public
-- despeja centenas de funções no schema exposto pela API REST.
create extension if not exists postgis with schema extensions;

create table if not exists public.routes (
  id            uuid        primary key default gen_random_uuid(),
  driver_id     uuid        not null references public.profiles (id) on delete cascade,
  vehicle_id    uuid        not null references public.vehicles (id) on delete restrict,

  -- Endereço como o usuário viu na busca. Guardado junto das coordenadas
  -- porque o rótulo é o que aparece na tela; recalcular pelo reverse geocode
  -- daria um texto diferente do que a pessoa escolheu.
  origin_label       text             not null,
  origin_latitude    double precision not null,
  origin_longitude   double precision not null,

  destination_label     text             not null,
  destination_latitude  double precision not null,
  destination_longitude double precision not null,
  -- Preenchido quando o destino é o campus do perfil (wireframe 3.1).
  destination_campus_id uuid references public.campuses (id) on delete set null,

  departure_at  timestamptz not null,
  seats_total   integer     not null,
  -- Afordância para EP04/EP05: a reserva de vaga incrementa aqui.
  -- Critério da História 2 — o limite tem que estar acessível para essas
  -- histórias usarem depois.
  seats_taken   integer     not null default 0,
  notes         text,
  status        text        not null default 'publicada',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint routes_status_check check (status in ('publicada', 'cancelada', 'concluida')),
  constraint routes_seats_total_range check (seats_total between 1 and 7),
  constraint routes_seats_taken_range check (seats_taken >= 0 and seats_taken <= seats_total),
  constraint routes_labels_not_blank check (
    length(trim(origin_label)) > 0 and length(trim(destination_label)) > 0
  ),
  constraint routes_latitude_range check (
    origin_latitude between -90 and 90 and destination_latitude between -90 and 90
  ),
  constraint routes_longitude_range check (
    origin_longitude between -180 and 180 and destination_longitude between -180 and 180
  )
);

comment on table public.routes is
  'Carona publicada por um motorista. Uma linha = uma viagem específica; '
  'recorrência é Fase 2 (wireframe 3.2).';
comment on column public.routes.seats_total is
  'Vagas nesta carona. Limitado por vehicles.seats pelo trigger '
  'routes_validate_seats — critério de aceite da História 2.';
comment on column public.routes.seats_taken is
  'Vagas já confirmadas. EP05 incrementa; lotada quando iguala seats_total.';

-- Vagas ainda livres, derivada para EP04 não precisar recalcular.
alter table public.routes
  drop column if exists seats_available;
alter table public.routes
  add column seats_available integer
  generated always as (seats_total - seats_taken) stored;

-- Ponto geográfico derivado de lat/lng: o client escreve só os dois números e
-- o índice espacial do EP04 já existe, sem o app saber o que é PostGIS.
alter table public.routes
  drop column if exists origin_geog;
alter table public.routes
  add column origin_geog extensions.geography(Point, 4326)
  generated always as (
    extensions.st_setsrid(extensions.st_makepoint(origin_longitude, origin_latitude), 4326)::extensions.geography
  ) stored;

alter table public.routes
  drop column if exists destination_geog;
alter table public.routes
  add column destination_geog extensions.geography(Point, 4326)
  generated always as (
    extensions.st_setsrid(extensions.st_makepoint(destination_longitude, destination_latitude), 4326)::extensions.geography
  ) stored;

create index if not exists routes_origin_geog_idx      on public.routes using gist (origin_geog);
create index if not exists routes_destination_geog_idx on public.routes using gist (destination_geog);
create index if not exists routes_driver_idx           on public.routes (driver_id);
-- Índice da busca do EP04: caronas publicadas que ainda não partiram.
create index if not exists routes_open_departure_idx
  on public.routes (departure_at)
  where status = 'publicada';

-- --------------------------------------------------------------------------
-- Backstop do critério "o horário não pode ser no passado".
--
-- Não dá para ser CHECK: now() não é immutable. E a validação do app não basta
-- sozinha — qualquer um com a publishable key chama a API REST direto, mesmo
-- padrão do EP01.
--
-- Tolerância de 1 minuto para não punir quem escolheu "daqui a pouco" e levou
-- alguns segundos preenchendo o resto do formulário.
-- --------------------------------------------------------------------------
create or replace function public.validate_route()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_vehicle_seats integer;
  v_vehicle_owner uuid;
  v_is_complete   boolean;
begin
  if tg_op = 'INSERT' or new.departure_at is distinct from old.departure_at then
    if new.departure_at <= now() - interval '1 minute' then
      raise exception 'A partida não pode ser no passado.'
        using errcode = 'check_violation', hint = 'departure_in_past';
    end if;
  end if;

  select v.seats, v.owner_id into v_vehicle_seats, v_vehicle_owner
  from public.vehicles v
  where v.id = new.vehicle_id;

  if v_vehicle_seats is null then
    raise exception 'Veículo não encontrado.'
      using errcode = 'foreign_key_violation', hint = 'vehicle_not_found';
  end if;

  if v_vehicle_owner <> new.driver_id then
    raise exception 'O veículo informado não pertence a este motorista.'
      using errcode = 'check_violation', hint = 'vehicle_not_owned';
  end if;

  if new.seats_total > v_vehicle_seats then
    raise exception 'A carona não pode oferecer % vagas: o veículo tem %.',
      new.seats_total, v_vehicle_seats
      using errcode = 'check_violation', hint = 'seats_exceed_vehicle';
  end if;

  -- Publicar carona expõe o motorista a passageiros; perfil incompleto não
  -- permite que ninguém o reconheça, que é o propósito da História 1.
  select p.is_complete into v_is_complete
  from public.profiles p
  where p.id = new.driver_id;

  if not coalesce(v_is_complete, false) then
    raise exception 'Complete seu perfil antes de publicar uma carona.'
      using errcode = 'check_violation', hint = 'profile_incomplete';
  end if;

  return new;
end;
$$;

drop trigger if exists routes_validate on public.routes;
create trigger routes_validate
  before insert or update on public.routes
  for each row execute function public.validate_route();

drop trigger if exists routes_touch_updated_at on public.routes;
create trigger routes_touch_updated_at
  before update on public.routes
  for each row execute function public.touch_updated_at();

alter table public.routes enable row level security;

-- Buscar caronas (EP04) exige ler rotas de outros motoristas. Rota cancelada
-- não interessa a ninguém além do dono.
drop policy if exists "routes_select_published" on public.routes;
create policy "routes_select_published"
  on public.routes for select
  to authenticated
  using (status <> 'cancelada' or driver_id = auth.uid());

drop policy if exists "routes_insert_own" on public.routes;
create policy "routes_insert_own"
  on public.routes for insert
  to authenticated
  with check (auth.uid() = driver_id);

drop policy if exists "routes_update_own" on public.routes;
create policy "routes_update_own"
  on public.routes for update
  to authenticated
  using (auth.uid() = driver_id)
  with check (auth.uid() = driver_id);

-- Sem policy de delete: cancelar é mudança de status, para o histórico e as
-- notificações do EP06 continuarem fazendo sentido.
