import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';

import { SUPABASE_KEY, SUPABASE_URL, supabase } from '@/lib/supabase';
import { describeSignUpError, lockedMessage, type LoginFailure } from '@/auth/authErrors';
import { normalizeEmail, validateInstitutionalEmail, validatePassword } from '@/auth/institutionalEmail';

type SignUpArgs = { fullName: string; email: string; password: string };
type SignInArgs = { email: string; password: string };

export type SignUpResult =
  | { ok: true; email: string; needsConfirmation: boolean }
  | { ok: false; message: string; field?: 'fullName' | 'email' | 'password' };

export type SignInResult = { ok: true } | ({ ok: false } & LoginFailure);

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  /** true até o SDK terminar de ler a sessão persistida do SecureStore. */
  initializing: boolean;
  signUp: (args: SignUpArgs) => Promise<SignUpResult>;
  signIn: (args: SignInArgs) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  resendConfirmation: (email: string) => Promise<{ ok: boolean; message: string }>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** URL de retorno do link de confirmação: abre o app de volta em /sign-in. */
function emailRedirectTo(): string {
  return Linking.createURL('/sign-in');
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setInitializing(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  /**
   * História 1 — cadastro.
   * A validação de domínio acontece aqui, antes de qualquer chamada de rede:
   * e-mail fora do domínio institucional retorna erro sem que o Supabase seja
   * acionado, logo nenhum e-mail de confirmação é enviado.
   */
  const signUp = useCallback(async ({ fullName, email, password }: SignUpArgs): Promise<SignUpResult> => {
    const trimmedName = fullName.trim();
    if (trimmedName.length < 3) {
      return { ok: false, field: 'fullName', message: 'Informe seu nome completo.' };
    }

    const emailCheck = validateInstitutionalEmail(email);
    if (!emailCheck.ok) {
      return { ok: false, field: 'email', message: emailCheck.message };
    }

    const passwordCheck = validatePassword(password);
    if (!passwordCheck.ok) {
      return { ok: false, field: 'password', message: passwordCheck.message };
    }

    // Só aqui a rede é tocada.
    const { data, error } = await supabase.auth.signUp({
      email: emailCheck.normalized,
      password,
      options: {
        data: { full_name: trimmedName },
        emailRedirectTo: emailRedirectTo(),
      },
    });

    if (error) {
      return { ok: false, message: describeSignUpError(error) };
    }

    return {
      ok: true,
      email: emailCheck.normalized,
      // Com confirmação de e-mail ligada, o signUp devolve user sem session.
      needsConfirmation: data.session === null,
    };
  }, []);

  /**
   * História 2 — login.
   * Passa pela Edge Function auth-login em vez de signInWithPassword direto,
   * porque é lá que vive o contador de tentativas por conta (ver comentário no
   * início de supabase/functions/auth-login/index.ts). Em caso de sucesso, os
   * tokens devolvidos são instalados no SDK com setSession, e daí para frente
   * o refresh automático funciona normalmente.
   */
  const signIn = useCallback(async ({ email, password }: SignInArgs): Promise<SignInResult> => {
    const normalized = normalizeEmail(email);

    // Falha de rede e resposta ilegível são erros distintos: a primeira é
    // problema do aluno, a segunda é problema nosso. Misturar as duas manda o
    // usuário conferir o wi-fi quando a função caiu.
    let response: Response;
    try {
      response = await fetch(`${SUPABASE_URL}/functions/v1/auth-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({ email: normalized, password }),
      });
    } catch {
      return { ok: false, kind: 'network', message: 'Sem conexão. Verifique sua internet e tente novamente.' };
    }

    let payload: Record<string, unknown>;
    try {
      payload = (await response.json()) as Record<string, unknown>;
    } catch {
      return {
        ok: false,
        kind: 'unknown',
        message: 'O servidor respondeu de forma inesperada. Tente novamente em instantes.',
      };
    }

    const session = payload.session as { access_token: string; refresh_token: string } | undefined;

    if (response.ok && session) {
      const { error } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      if (error) {
        return { ok: false, kind: 'unknown', message: 'Não foi possível iniciar a sessão. Tente novamente.' };
      }
      return { ok: true };
    }

    const errorCode = typeof payload.error === 'string' ? payload.error : '';

    switch (errorCode) {
      case 'account_locked': {
        const retryAfterSeconds = Number(payload.retry_after_seconds ?? 0);
        return {
          ok: false,
          kind: 'account_locked',
          retryAfterSeconds,
          message: lockedMessage(retryAfterSeconds),
        };
      }
      case 'invalid_credentials':
        return {
          ok: false,
          kind: 'invalid_credentials',
          attemptsLeft: Number(payload.attempts_left ?? 0),
          message: 'E-mail ou senha incorretos.',
        };
      case 'email_not_confirmed':
        return {
          ok: false,
          kind: 'email_not_confirmed',
          message: 'Confirme seu e-mail pelo link que enviamos antes de entrar.',
        };
      case 'institutional_email_required':
        return {
          ok: false,
          kind: 'institutional_email_required',
          message: 'Use seu e-mail institucional para entrar.',
        };
      case 'missing_credentials':
        return { ok: false, kind: 'unknown', message: 'Informe e-mail e senha.' };
      default:
        return { ok: false, kind: 'unknown', message: 'Não foi possível entrar. Tente novamente.' };
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const resendConfirmation = useCallback(async (email: string) => {
    const check = validateInstitutionalEmail(email);
    if (!check.ok) return { ok: false, message: check.message };

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: check.normalized,
      options: { emailRedirectTo: emailRedirectTo() },
    });
    if (error) {
      return { ok: false, message: 'Não foi possível reenviar agora. Aguarde alguns minutos.' };
    }
    return { ok: true, message: 'Enviamos um novo link de confirmação.' };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      initializing,
      signUp,
      signIn,
      signOut,
      resendConfirmation,
    }),
    [session, initializing, signUp, signIn, signOut, resendConfirmation],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth precisa estar dentro de <AuthProvider>.');
  return context;
}
