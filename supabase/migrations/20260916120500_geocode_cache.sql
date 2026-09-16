-- EP03 — cache de geocodificação.
--
-- A política de uso do Nominatim pede no máximo 1 requisição por segundo e
-- desencoraja tráfego repetido. Numa turma inteira buscando "PUC Perdizes" o
-- cache é o que torna o uso viável e educado — e ainda deixa a busca
-- instantânea na segunda vez.

create table if not exists public.geocode_cache (
  query        text        primary key,
  results      jsonb       not null,
  hit_count    integer     not null default 0,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

comment on table public.geocode_cache is
  'Respostas do Nominatim por termo de busca normalizado. Escrito apenas pela Edge Function `geocode` (service_role).';
comment on column public.geocode_cache.query is
  'Termo normalizado: minúsculo, sem espaços duplicados.';

create index if not exists geocode_cache_last_used_idx on public.geocode_cache (last_used_at);

alter table public.geocode_cache enable row level security;
-- Sem policies: deny-all para anon e authenticated. Só a Edge Function acessa.

create or replace function public.touch_geocode_cache(p_query text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.geocode_cache
     set hit_count = hit_count + 1,
         last_used_at = now()
   where query = p_query;
$$;

revoke all on function public.touch_geocode_cache(text) from public, anon, authenticated;
grant execute on function public.touch_geocode_cache(text) to service_role;
