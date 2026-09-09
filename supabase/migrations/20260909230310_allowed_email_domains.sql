-- EP01 — Cadastro e Autenticação Universitária
-- Fonte de verdade dos domínios de e-mail institucionais aceitos no cadastro.
-- Mantido em tabela (e não hardcoded) para que a coordenação possa adicionar
-- um subdomínio novo sem exigir release do app.

create table if not exists public.allowed_email_domains (
  domain              text        primary key,
  label               text        not null,
  include_subdomains  boolean     not null default false,
  is_active           boolean     not null default true,
  created_at          timestamptz not null default now()
);

comment on table  public.allowed_email_domains is
  'Domínios de e-mail que comprovam vínculo institucional. Consultado pelo app (cache) e pelo trigger de backstop em auth.users.';
comment on column public.allowed_email_domains.include_subdomains is
  'Quando true, aceita também subdomínios (ex.: aluno.pucsp.edu.br). Mantenha false por padrão: subdomínio curinga amplia a superfície de cadastro.';

insert into public.allowed_email_domains (domain, label, include_subdomains)
values ('pucsp.edu.br', 'PUC-SP', false)
on conflict (domain) do nothing;

-- Normaliza o domínio de um e-mail: minúsculo, sem espaços, parte após o "@".
-- Retorna '' quando não há "@", o que reprova a validação adiante.
create or replace function public.email_domain(p_email text)
returns text
language sql
immutable
as $$
  select lower(split_part(trim(coalesce(p_email, '')), '@', 2));
$$;

-- Predicado central de vínculo institucional. Usado pelo trigger em auth.users
-- e pela Edge Function auth-login. O EXECUTE de anon/authenticated é revogado
-- na migration 20260909231542_harden_auth_functions.sql.
create or replace function public.is_institutional_email(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.allowed_email_domains d
    where d.is_active
      and (
        public.email_domain(p_email) = d.domain
        or (d.include_subdomains and public.email_domain(p_email) like '%.' || d.domain)
      )
  );
$$;

alter table public.allowed_email_domains enable row level security;

-- Leitura liberada: o app precisa da lista para montar a mensagem de erro e o
-- placeholder do campo de e-mail. São dados públicos, não sensíveis.
drop policy if exists "allowed_email_domains_select_active" on public.allowed_email_domains;
create policy "allowed_email_domains_select_active"
  on public.allowed_email_domains
  for select
  to anon, authenticated
  using (is_active);

-- Sem policies de insert/update/delete: alteração apenas por service_role
-- (dashboard ou migration), nunca pelo client.
