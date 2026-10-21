-- EP04 — Regras de tolerância geográfica e de horário configuráveis pelo admin.
--
-- A busca (20260930222538_search_rides.sql) já lia raio e janela de um lugar
-- só, public.search_limits(). Esta migration:
--   1. cria o papel mínimo de administrador (não existia nenhum);
--   2. guarda raio e janela numa tabela de linha única, com os MESMOS valores
--      que a busca usava (2 km, ±30 min) — o comportamento não muda;
--   3. troca o corpo de search_limits() por uma leitura dessa tabela.
-- search_rides e o app não mudam: continuam lendo search_limits().

-- ---------------------------------------------------------------------------
-- 1. Administradores
--
-- Tabela própria, e não coluna em profiles: profiles tem policy de UPDATE da
-- própria linha, e uma coluna `is_admin` ali exigiria trigger para impedir o
-- usuário de se promover. Aqui não existe policy de escrita nenhuma — só SQL
-- (dashboard/MCP) ou service_role promovem alguém. A moderação completa, com
-- tela de gestão de admins, é da EP10.
-- ---------------------------------------------------------------------------
create table public.app_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.app_admins is
  'Administradores do app (mínimo para a EP04). Sem policy de escrita: promover '
  'é por SQL. A EP10 (moderação) amplia.';

alter table public.app_admins enable row level security;

-- Cada um só descobre se ELE é admin (o app usa isso para mostrar a tela).
-- A lista de admins não é pública.
create policy "app_admins: ler a própria linha"
  on public.app_admins for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Usado nas policies e nas funções. SECURITY DEFINER para não depender da RLS
-- de app_admins; no schema private, não vira RPC.
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_admins a where a.user_id = (select auth.uid()));
$$;

revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Parâmetros do matching (linha única)
--
-- Limites aceitos (decididos pelo gerente do projeto em 21/10/2026):
--   raio   0,5 a 50 km   — do bairro até intermunicipal;
--   janela 5 a 240 min   — de 5 minutos até 4 horas de tolerância.
-- Espelhados em src/admin/matchingValidation.ts (validação antes da rede);
-- mudou aqui, mude lá.
-- ---------------------------------------------------------------------------
create table public.matching_settings (
  -- Sempre true: impede uma segunda linha.
  id                  boolean primary key default true,
  radius_km           numeric(4, 1) not null default 2.0,
  time_window_minutes integer       not null default 30,
  updated_at          timestamptz   not null default now(),
  updated_by          uuid references auth.users (id) on delete set null,

  constraint matching_settings_single_row  check (id),
  constraint matching_settings_radius_range check (radius_km between 0.5 and 50),
  constraint matching_settings_window_range check (time_window_minutes between 5 and 240)
);

comment on table public.matching_settings is
  'Tolerâncias do matching (EP04): raio em km (origem E destino) e janela em ± '
  'minutos. Linha única. Lida por search_limits(); escrita só por admin.';

create index matching_settings_updated_by_idx on public.matching_settings (updated_by);

-- Valores de hoje: nada muda para quem busca.
insert into public.matching_settings (id, radius_km, time_window_minutes) values (true, 2.0, 30);

alter table public.matching_settings enable row level security;

create policy "matching_settings: autenticado lê"
  on public.matching_settings for select
  to authenticated
  using (true);

create policy "matching_settings: admin altera"
  on public.matching_settings for update
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- Sem policy de insert nem delete: a linha é única e permanente.

-- Quem e quando: o app não manda esses campos, o banco preenche.
create or replace function private.stamp_matching_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

create trigger matching_settings_stamp
  before update on public.matching_settings
  for each row execute function private.stamp_matching_settings();

-- ---------------------------------------------------------------------------
-- 3. Escrita pelo app
--
-- RPC em vez de UPDATE direto: um UPDATE de não-admin passa pela RLS e afeta 0
-- linhas, sem erro — o app diria "salvo" sem ter salvo. Aqui o não-admin
-- recebe um erro explícito. SECURITY INVOKER: a policy de UPDATE continua
-- valendo por baixo (defesa em profundidade).
-- ---------------------------------------------------------------------------
create or replace function public.update_matching_settings(
  p_radius_km           numeric,
  p_time_window_minutes integer
)
returns public.matching_settings
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.matching_settings;
begin
  if not (select private.is_admin()) then
    raise exception 'Só administradores podem alterar as regras da busca.'
      using errcode = 'insufficient_privilege', hint = 'matching_not_admin';
  end if;

  -- As constraints da tabela são a autoridade; estas mensagens só tornam o
  -- erro legível.
  if p_radius_km is null or p_radius_km < 0.5 or p_radius_km > 50 then
    raise exception 'O raio precisa estar entre 0,5 e 50 km.'
      using errcode = 'check_violation', hint = 'matching_radius_range';
  end if;
  if p_time_window_minutes is null or p_time_window_minutes < 5 or p_time_window_minutes > 240 then
    raise exception 'A janela precisa estar entre 5 e 240 minutos.'
      using errcode = 'check_violation', hint = 'matching_window_range';
  end if;

  update public.matching_settings
     set radius_km = round(p_radius_km, 1),
         time_window_minutes = p_time_window_minutes
   where id
  returning * into v_row;

  if not found then
    raise exception 'Não foi possível salvar as regras da busca.'
      using errcode = 'insufficient_privilege', hint = 'matching_not_admin';
  end if;

  return v_row;
end;
$$;

revoke all on function public.update_matching_settings(numeric, integer) from public, anon;
grant execute on function public.update_matching_settings(numeric, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. search_limits() passa a ler a tabela
--
-- Mesma assinatura e mesmas colunas: search_rides e o app não mudam.
-- `stable` (não mais `immutable`): o valor muda quando o admin salva, e a
-- busca seguinte já usa o novo — sem redeploy, sem cache.
--
-- Teto do "Ampliar" (wireframe 4.6) = 4 × janela, até 240 min (o máximo
-- aceito para a janela). Com a janela de hoje (30) dá 120, o valor anterior.
-- Assim o admin controla um campo só, e o teto acompanha.
-- ---------------------------------------------------------------------------
create or replace function public.search_limits()
returns table (
  radius_km               double precision,
  time_window_minutes     integer,
  max_time_window_minutes integer,
  weight_origin           double precision,
  weight_destination      double precision,
  weight_time             double precision
)
language sql
stable
set search_path = public
as $$
  select
    s.radius_km::double precision,
    s.time_window_minutes,
    least(240, s.time_window_minutes * 4),
    1.0 / 3,
    1.0 / 3,
    1.0 / 3
  from public.matching_settings s
  where s.id;
$$;

comment on function public.search_limits() is
  'Lugar único dos limites e pesos da busca de caronas (EP04). Raio e janela '
  'vêm de matching_settings (configurável pelo admin); teto = 4 × janela, até 240.';

-- ---------------------------------------------------------------------------
-- Primeiro admin: nenhum (decisão de 21/10/2026). Para promover alguém:
--
--   insert into public.app_admins (user_id)
--   select id from auth.users where email = 'nome@pucsp.edu.br';
-- ---------------------------------------------------------------------------
