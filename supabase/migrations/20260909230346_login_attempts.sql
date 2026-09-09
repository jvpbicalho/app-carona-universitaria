-- História 2 — bloqueio temporário da conta após 3 tentativas inválidas.
--
-- O estado do bloqueio mora no banco, não no dispositivo: contador no client é
-- burlável reinstalando o app ou limpando o storage. O rate limiting nativo do
-- Supabase Auth também não serve para este critério — ele é por IP, e num campus
-- atrás de NAT centenas de alunos compartilham o mesmo IP, o que bloquearia
-- gente inocente sem nunca bloquear "a conta".
--
-- Só a Edge Function `auth-login` (service_role) escreve aqui.

create table if not exists public.login_attempts (
  email          text        primary key,
  failed_count   integer     not null default 0,
  locked_until   timestamptz,
  last_failed_at timestamptz,
  updated_at     timestamptz not null default now()
);

comment on table  public.login_attempts is
  'Tentativas de login malsucedidas por e-mail. Escrito exclusivamente pela Edge Function auth-login.';
comment on column public.login_attempts.email is
  'E-mail normalizado (lower + trim). Registrado mesmo para contas inexistentes, para não vazar quais e-mails existem.';

create index if not exists login_attempts_locked_until_idx
  on public.login_attempts (locked_until)
  where locked_until is not null;

alter table public.login_attempts enable row level security;
-- Nenhuma policy, de propósito: anon e authenticated não leem nem escrevem.
-- service_role ignora RLS, e é o único caminho de acesso.

-- ---------------------------------------------------------------------------
-- Estado do bloqueio, sem efeito colateral. Chamado antes de tentar o login.
-- ---------------------------------------------------------------------------
create or replace function public.login_lock_status(p_email text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'is_locked',           coalesce(la.locked_until > now(), false),
    'retry_after_seconds', greatest(0, ceil(extract(epoch from (la.locked_until - now())))::int),
    'failed_count',        coalesce(la.failed_count, 0),
    'locked_until',        la.locked_until
  )
  from (select 1) dummy
  left join public.login_attempts la
    on la.email = lower(trim(coalesce(p_email, '')));
$$;

-- ---------------------------------------------------------------------------
-- Registra uma falha e aplica o bloqueio ao atingir o limite.
-- Atômico: o upsert e o update de locked_until rodam na mesma transação, então
-- dois pedidos simultâneos não conseguem "gastar" a mesma tentativa duas vezes.
-- ---------------------------------------------------------------------------
create or replace function public.register_failed_login(
  p_email        text,
  p_max_attempts integer default 3,
  p_lock_minutes integer default 15
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_row   public.login_attempts;
begin
  if v_email = '' then
    raise exception 'e-mail obrigatório' using errcode = '22023';
  end if;

  insert into public.login_attempts as la (email, failed_count, last_failed_at, updated_at)
  values (v_email, 1, now(), now())
  on conflict (email) do update
    set failed_count = case
          -- bloqueio anterior já expirou: o ciclo recomeça nesta tentativa
          when la.locked_until is not null and la.locked_until <= now() then 1
          else la.failed_count + 1
        end,
        locked_until = case
          when la.locked_until is not null and la.locked_until <= now() then null
          else la.locked_until
        end,
        last_failed_at = now(),
        updated_at     = now()
  returning * into v_row;

  if v_row.failed_count >= p_max_attempts
     and (v_row.locked_until is null or v_row.locked_until <= now()) then
    update public.login_attempts
       set locked_until = now() + make_interval(mins => p_lock_minutes),
           updated_at   = now()
     where email = v_email
    returning * into v_row;
  end if;

  return jsonb_build_object(
    'is_locked',           coalesce(v_row.locked_until > now(), false),
    'retry_after_seconds', greatest(0, ceil(extract(epoch from (v_row.locked_until - now())))::int),
    'failed_count',        v_row.failed_count,
    'attempts_left',       greatest(0, p_max_attempts - v_row.failed_count),
    'locked_until',        v_row.locked_until
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Login bem-sucedido zera o histórico.
-- ---------------------------------------------------------------------------
create or replace function public.clear_failed_logins(p_email text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.login_attempts
   where email = lower(trim(coalesce(p_email, '')));
$$;

-- Estas três funções são security definer e mexem em dados de controle de
-- acesso: revogar de anon/authenticated é obrigatório, senão qualquer client
-- com a anon key poderia zerar o próprio bloqueio via RPC.
revoke all on function public.login_lock_status(text)                       from public, anon, authenticated;
revoke all on function public.register_failed_login(text, integer, integer)  from public, anon, authenticated;
revoke all on function public.clear_failed_logins(text)                      from public, anon, authenticated;

grant execute on function public.login_lock_status(text)                      to service_role;
grant execute on function public.register_failed_login(text, integer, integer) to service_role;
grant execute on function public.clear_failed_logins(text)                     to service_role;
