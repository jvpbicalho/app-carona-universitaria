-- Correções apontadas pelo database linter do Supabase (get_advisors/security).

-- 1) search_path fixo: sem isso, um schema à frente no search_path do chamador
--    poderia sombrear objetos usados pela função.
create or replace function public.email_domain(p_email text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select lower(split_part(trim(coalesce(p_email, '')), '@', 2));
$$;

-- 2) Funções de trigger não devem ser chamáveis via /rest/v1/rpc.
--    Verificado em ambiente: o trigger continua disparando após a revogação,
--    porque o privilégio EXECUTE não é reavaliado no contexto do trigger.
revoke all on function public.enforce_institutional_email() from public, anon, authenticated;
revoke all on function public.handle_new_user()             from public, anon, authenticated;
revoke all on function public.touch_updated_at()            from public, anon, authenticated;

-- 3) is_institutional_email é SECURITY DEFINER porque o trigger roda como
--    supabase_auth_admin, que não tem SELECT em public.allowed_email_domains.
--    O app não precisa dela: valida com a lista local e, se quiser a lista
--    autoritativa, lê a tabela direto (há policy de SELECT).
revoke all on function public.is_institutional_email(text) from public, anon, authenticated;
grant execute on function public.is_institutional_email(text) to service_role;

-- Nota sobre o lint `rls_enabled_no_policy` em public.login_attempts:
-- a ausência de policy é intencional. RLS ligado + zero policies = deny-all
-- para anon e authenticated. Só service_role (que ignora RLS), usado pela
-- Edge Function auth-login, acessa a tabela.
