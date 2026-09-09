// Edge Function `auth-login` — História 2 (login + bloqueio temporário).
//
// Por que o login passa por aqui em vez de o app chamar signInWithPassword direto:
// o critério "3 tentativas inválidas bloqueiam a conta temporariamente" precisa de
// um contador que o usuário não consiga zerar. Contador no dispositivo cai com
// reinstalar o app; e o app não pode escrever em `login_attempts` (RLS sem policy,
// e as RPCs são revogadas de anon/authenticated). Esta função é o único ponto com
// service_role, então é o único lugar onde o contador é confiável.
//
// Deploy com verify_jwt = false: é o endpoint de login, o JWT ainda não existe.
// A função implementa a própria autenticação (delega ao GoTrue) e o bloqueio por
// e-mail é justamente o que protege esse endpoint público de força bruta.

import { createClient } from "jsr:@supabase/supabase-js@2";

const MAX_ATTEMPTS = 3;
const LOCK_MINUTES = 15;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type LockState = {
  is_locked: boolean;
  retry_after_seconds: number;
  failed_count: number;
  attempts_left?: number;
  locked_until: string | null;
};

function json(body: unknown, status: number, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS, ...extraHeaders },
  });
}

// Cliente com service_role: usado só para as RPCs de contagem de tentativas.
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let email: string;
  let password: string;
  try {
    const body = await req.json();
    email = String(body?.email ?? "").trim().toLowerCase();
    password = String(body?.password ?? "");
  } catch {
    return json({ error: "invalid_body", message: "Corpo da requisição inválido." }, 400);
  }

  if (!email || !password) {
    return json(
      { error: "missing_credentials", message: "Informe e-mail e senha." },
      400,
    );
  }

  // Domínio não institucional não pode ter conta neste app: recusa direto, sem
  // gastar tentativa e sem tocar no GoTrue.
  const { data: isInstitutional, error: domainError } = await admin.rpc(
    "is_institutional_email",
    { p_email: email },
  );
  if (domainError) {
    console.error("is_institutional_email falhou", domainError);
    return json({ error: "internal_error", message: "Erro interno. Tente novamente." }, 500);
  }
  if (!isInstitutional) {
    return json(
      {
        error: "institutional_email_required",
        message: "Use seu e-mail institucional para entrar.",
      },
      400,
    );
  }

  // 1) A conta já está bloqueada? Não tenta autenticar — economiza chamada ao
  //    GoTrue e impede que o atacante continue "testando" durante o bloqueio.
  const { data: statusRaw, error: statusError } = await admin.rpc("login_lock_status", {
    p_email: email,
  });
  if (statusError) {
    console.error("login_lock_status falhou", statusError);
    return json({ error: "internal_error", message: "Erro interno. Tente novamente." }, 500);
  }
  const status = statusRaw as LockState;

  if (status.is_locked) {
    return json(
      {
        error: "account_locked",
        message: "Conta temporariamente bloqueada por tentativas inválidas.",
        retry_after_seconds: status.retry_after_seconds,
        locked_until: status.locked_until,
      },
      423,
      { "Retry-After": String(status.retry_after_seconds) },
    );
  }

  // 2) Tenta autenticar. Cliente anon, sem sessão persistida: esta função é
  //    stateless e devolve os tokens para o app guardar no SecureStore.
  const authClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: signIn, error: signInError } = await authClient.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    // Senha correta mas e-mail não confirmado: não é chute de credencial, então
    // não consome tentativa. Revela que a conta existe — é o comportamento
    // padrão do GoTrue, e aqui o ganho de UX ("confirme seu e-mail") compensa.
    if (signInError.code === "email_not_confirmed") {
      return json(
        {
          error: "email_not_confirmed",
          message: "Confirme seu e-mail pelo link que enviamos antes de entrar.",
        },
        403,
      );
    }

    const { data: afterRaw, error: registerError } = await admin.rpc("register_failed_login", {
      p_email: email,
      p_max_attempts: MAX_ATTEMPTS,
      p_lock_minutes: LOCK_MINUTES,
    });
    if (registerError) {
      console.error("register_failed_login falhou", registerError);
      return json({ error: "internal_error", message: "Erro interno. Tente novamente." }, 500);
    }
    const after = afterRaw as LockState;

    if (after.is_locked) {
      return json(
        {
          error: "account_locked",
          message: `Conta bloqueada por ${LOCK_MINUTES} minutos após ${MAX_ATTEMPTS} tentativas inválidas.`,
          retry_after_seconds: after.retry_after_seconds,
          locked_until: after.locked_until,
        },
        423,
        { "Retry-After": String(after.retry_after_seconds) },
      );
    }

    // Mensagem genérica: não distingue "e-mail não existe" de "senha errada".
    return json(
      {
        error: "invalid_credentials",
        message: "E-mail ou senha incorretos.",
        attempts_left: after.attempts_left ?? 0,
      },
      401,
    );
  }

  // 3) Sucesso: zera o histórico de falhas e devolve a sessão.
  const { error: clearError } = await admin.rpc("clear_failed_logins", { p_email: email });
  if (clearError) {
    // Não falha o login por causa disso — apenas registra.
    console.error("clear_failed_logins falhou", clearError);
  }

  return json({ session: signIn.session, user: signIn.user }, 200);
});
