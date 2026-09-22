-- Contador de uso do cache de geocodificação. Só a Edge Function `geocode`
-- (service_role) chama.

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
