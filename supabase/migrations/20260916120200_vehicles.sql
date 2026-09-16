-- EP02 / História 2 — dados do veículo do motorista.

create table if not exists public.vehicles (
  id           uuid        primary key default gen_random_uuid(),
  owner_id     uuid        not null references public.profiles (id) on delete cascade,
  make_model   text        not null,
  color        text        not null,
  -- Normalizada: maiúscula, sem hífen. Aceita Mercosul (ABC1D23) e o padrão
  -- antigo (ABC1234), porque os dois circulam.
  plate        text        not null,
  seats        integer     not null,
  -- EP08 / Fase 2: alimenta a divisão estimada de custo. Sem UI por enquanto,
  -- a coluna existe para não exigir migration depois.
  consumption_kml numeric(4,1),
  -- Pendência de Sprint Planning (registrada no próprio wireframe): exigir CNH
  -- no cadastro do veículo ou só na 1ª publicação? Nullable até a equipe
  -- decidir — não está nos critérios de aceite da História 2.
  cnh_document_path text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- Um veículo por motorista: o wireframe fala em "Meu veículo", singular.
  -- Frota por motorista, se vier a ser necessária, é mudança de escopo.
  constraint vehicles_one_per_owner unique (owner_id),

  constraint vehicles_plate_format check (
    plate ~ '^[A-Z]{3}[0-9][A-Z][0-9]{2}$'   -- Mercosul
    or plate ~ '^[A-Z]{3}[0-9]{4}$'          -- antigo
  ),
  -- 1 a 7 passageiros: o motorista não ocupa vaga, e acima disso deixa de ser
  -- carro de passeio.
  constraint vehicles_seats_range check (seats between 1 and 7),
  constraint vehicles_make_model_not_blank check (length(trim(make_model)) >= 2),
  constraint vehicles_consumption_positive check (
    consumption_kml is null or consumption_kml > 0
  )
);

comment on table public.vehicles is
  'Veículo do motorista. `seats` é o teto de vagas de qualquer rota dele.';
comment on column public.vehicles.seats is
  'Capacidade de passageiros (motorista não conta). Limita routes.seats_total '
  '— critério de aceite da História 2.';
comment on column public.vehicles.plate is
  'Sempre maiúscula e sem hífen. Normalizada pelo trigger vehicles_normalize.';

-- Placa não é única globalmente de propósito: irmãos que dividem o mesmo carro
-- é caso real numa comunidade universitária.

create index if not exists vehicles_owner_idx on public.vehicles (owner_id);

-- Normaliza a placa antes de validar, para o usuário poder digitar "abc-1d23".
create or replace function public.normalize_vehicle()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.plate := upper(regexp_replace(coalesce(new.plate, ''), '[^A-Za-z0-9]', '', 'g'));
  new.make_model := trim(new.make_model);
  return new;
end;
$$;

drop trigger if exists vehicles_normalize on public.vehicles;
create trigger vehicles_normalize
  before insert or update on public.vehicles
  for each row execute function public.normalize_vehicle();

drop trigger if exists vehicles_touch_updated_at on public.vehicles;
create trigger vehicles_touch_updated_at
  before update on public.vehicles
  for each row execute function public.touch_updated_at();

-- --------------------------------------------------------------------------
-- "Pode dirigir" é derivado de ter veículo, nunca de um campo que o usuário
-- marca. Decisão do wireframe 2.3: "sem veículo salvo, o modo motorista fica
-- indisponível". Assim não existe estado inconsistente para sincronizar.
-- --------------------------------------------------------------------------
create or replace function public.can_drive(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.vehicles v where v.owner_id = p_profile_id);
$$;

revoke all on function public.can_drive(uuid) from public, anon;
grant execute on function public.can_drive(uuid) to authenticated, service_role;

alter table public.vehicles enable row level security;

-- O dono gerencia o próprio veículo.
drop policy if exists "vehicles_select_own" on public.vehicles;
create policy "vehicles_select_own"
  on public.vehicles for select
  to authenticated
  using (auth.uid() = owner_id);

drop policy if exists "vehicles_insert_own" on public.vehicles;
create policy "vehicles_insert_own"
  on public.vehicles for insert
  to authenticated
  with check (auth.uid() = owner_id);

drop policy if exists "vehicles_update_own" on public.vehicles;
create policy "vehicles_update_own"
  on public.vehicles for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "vehicles_delete_own" on public.vehicles;
create policy "vehicles_delete_own"
  on public.vehicles for delete
  to authenticated
  using (auth.uid() = owner_id);

-- A view public_vehicles é criada na migration
-- 20260916120600_restrict_public_vehicle_data.sql, que define qual subconjunto
-- de colunas pode ser visto por outros usuários.
