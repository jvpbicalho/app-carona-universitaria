-- EP01 — backstop server-side da validação de domínio institucional.
--
-- A validação primária roda no app, ANTES de chamar signUp (requisito da
-- história: cadastro fora do domínio é bloqueado antes de qualquer envio de
-- confirmação). Este trigger existe porque a validação do client é apenas UX:
-- qualquer pessoa pode chamar POST /auth/v1/signup direto com a anon key, que
-- é pública por natureza. Com o trigger, o INSERT falha dentro da transação do
-- GoTrue e nenhum e-mail de confirmação chega a ser disparado.

create or replace function public.enforce_institutional_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Cadastros sem e-mail (telefone, anônimo) não se aplicam a esta regra.
  if new.email is null or trim(new.email) = '' then
    return new;
  end if;

  if not public.is_institutional_email(new.email) then
    raise exception
      'Cadastro permitido apenas com e-mail institucional. Domínio recusado: %',
      public.email_domain(new.email)
      using errcode = 'check_violation',
            hint    = 'institutional_email_required';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_institutional_email on auth.users;
create trigger enforce_institutional_email
  before insert on auth.users
  for each row execute function public.enforce_institutional_email();
