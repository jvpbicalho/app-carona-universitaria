-- EP02 / História 1 — preenchimento do perfil.
--
-- Estende public.profiles (criada no Sprint 1 com o mínimo do cadastro) com os
-- campos do wireframe 2.1: foto, telefone, curso, campus e "sobre mim".

alter table public.profiles
  add column if not exists avatar_url  text,
  add column if not exists phone       text,
  add column if not exists course_id   uuid references public.courses  (id) on delete restrict,
  add column if not exists campus_id   uuid references public.campuses (id) on delete restrict,
  add column if not exists bio         text;

comment on column public.profiles.avatar_url is
  'Caminho do objeto no bucket `avatars` do Storage, não URL assinada.';
comment on column public.profiles.phone is
  'Telefone/WhatsApp. Canal de contato até o chat existir (Fase 2). Só fica '
  'visível para a contraparte depois da vaga confirmada (EP05).';

-- Modo ativo da interface. NÃO é a permissão de dirigir: essa é derivada de
-- ter veículo cadastrado (ver public.can_drive). Guardar aqui só faz o modo
-- escolhido sobreviver a reinstalar o app.
alter table public.profiles
  add column if not exists active_role text not null default 'passageiro';

alter table public.profiles
  drop constraint if exists profiles_active_role_check;
alter table public.profiles
  add constraint profiles_active_role_check
  check (active_role in ('passageiro', 'motorista'));

comment on column public.profiles.active_role is
  'Modo ativo da UI. Não confere permissão: motorista sem veículo cadastrado '
  'não publica rota (o trigger de routes barra).';

-- Autoridade sobre "perfil completo". O app tem a mesma regra em
-- src/profile/profileValidation.ts para validar antes da chamada de rede; esta
-- coluna é a versão que não dá para burlar e a que o resto do schema consulta.
--
-- Coluna gerada em vez de trigger: não há como ficar dessincronizada.
alter table public.profiles
  drop column if exists is_complete;
alter table public.profiles
  add column is_complete boolean
  generated always as (
    nullif(trim(coalesce(full_name, '')), '') is not null
    and nullif(trim(coalesce(avatar_url, '')), '') is not null
    and course_id is not null
    and campus_id is not null
  ) stored;

comment on column public.profiles.is_complete is
  'Gerada. Campos obrigatórios da História 1: nome, foto, curso e campus. '
  'Telefone e bio são opcionais e não entram na conta.';

create index if not exists profiles_campus_idx on public.profiles (campus_id);

-- --------------------------------------------------------------------------
-- Leitura entre usuários.
--
-- A História 1 existe para que "outros usuários me reconheçam e confiem em
-- mim": o perfil precisa ser legível por terceiros. Mas não inteiro — e-mail e
-- telefone são contato, e só aparecem depois de vaga confirmada (EP05).
--
-- Liberar a tabela com `using (true)` NÃO funciona: public.profiles é exposta
-- por PostgREST, então qualquer cliente faria GET /rest/v1/profiles e leria os
-- e-mails de todo mundo, view ou não. O desenho correto é o inverso:
--   - tabela  -> RLS restringe à própria linha;
--   - view    -> security definer, expõe só as colunas seguras de todos.
-- --------------------------------------------------------------------------
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop view if exists public.public_profiles;

create view public.public_profiles
with (security_invoker = false, security_barrier = true) as
  select
    p.id,
    p.full_name,
    p.avatar_url,
    p.bio,
    p.is_complete,
    c.name  as course_name,
    cp.name as campus_name,
    cp.city as campus_city
  from public.profiles p
  left join public.courses  c  on c.id  = p.course_id
  left join public.campuses cp on cp.id = p.campus_id;

comment on view public.public_profiles is
  'Perfil visível para outros usuários: nome, foto, bio, curso e campus. '
  'Sem e-mail e sem telefone — contato só após confirmação de vaga (EP05).';

revoke all on public.public_profiles from anon;
grant select on public.public_profiles to authenticated;
