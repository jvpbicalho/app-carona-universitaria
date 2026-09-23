/**
 * Tradução de erros do Supabase Auth e da Edge Function auth-login para
 * mensagens em português exibíveis ao usuário.
 *
 * Centralizado aqui para que as telas não fiquem cheias de comparação de
 * string, e para que a mensagem de credencial inválida seja sempre a mesma
 * (não distinguir "e-mail não existe" de "senha errada" evita enumeração de
 * contas institucionais).
 */

export type LoginFailure =
  | { kind: 'invalid_credentials'; message: string; attemptsLeft: number }
  | { kind: 'account_locked'; message: string; retryAfterSeconds: number }
  | { kind: 'email_not_confirmed'; message: string }
  | { kind: 'institutional_email_required'; message: string }
  | { kind: 'network'; message: string }
  | { kind: 'unknown'; message: string };

/** Formata segundos como "15 minutos" / "4 minutos e 30 segundos". */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;

  if (minutes === 0) return `${rest} segundo${rest === 1 ? '' : 's'}`;
  const minutesLabel = `${minutes} minuto${minutes === 1 ? '' : 's'}`;
  if (rest === 0) return minutesLabel;
  return `${minutesLabel} e ${rest} segundo${rest === 1 ? '' : 's'}`;
}

/** Mensagem completa de bloqueio, com o tempo restante. */
export function lockedMessage(retryAfterSeconds: number): string {
  return `Conta bloqueada temporariamente por tentativas inválidas. Tente novamente em ${formatDuration(retryAfterSeconds)}.`;
}

/** Aviso de tentativas restantes, para o usuário não ser pego de surpresa. */
export function attemptsLeftMessage(attemptsLeft: number): string | null {
  if (attemptsLeft <= 0) return null;
  if (attemptsLeft === 1) return 'Atenção: mais uma tentativa inválida bloqueia a conta.';
  return `Você tem ${attemptsLeft} tentativas antes do bloqueio.`;
}

/** Erros do signUp, que continua indo direto ao Supabase Auth. */
export function describeSignUpError(error: { message?: string; code?: string } | null): string {
  if (!error) return 'Não foi possível concluir o cadastro. Tente novamente.';

  const code = error.code ?? '';
  const message = (error.message ?? '').toLowerCase();

  if (code === 'user_already_exists' || message.includes('already registered')) {
    return 'Já existe uma conta com este e-mail. Tente entrar ou confirmar o e-mail.';
  }
  if (code === 'weak_password' || message.includes('password')) {
    return 'Senha muito fraca. Use ao menos 8 caracteres, com letras e números.';
  }
  // Formato recusado pelo Supabase Auth. A validação do app foi alinhada à do
  // servidor e deveria barrar antes; se chegar aqui, ao menos diz o que é, em
  // vez de cair na mensagem genérica — que foi o que escondeu esta causa.
  if (
    code === 'validation_failed' ||
    code === 'email_address_invalid' ||
    message.includes('unable to validate email')
  ) {
    return 'E-mail inválido. Use o endereço institucional sem acentos nem caracteres especiais.';
  }
  if (code === 'over_email_send_rate_limit' || message.includes('rate limit')) {
    return 'Muitas tentativas de cadastro. Aguarde alguns minutos e tente de novo.';
  }
  // O trigger enforce_institutional_email chega até aqui como erro de banco.
  if (message.includes('institucional') || message.includes('database error')) {
    return 'Cadastro permitido apenas com e-mail institucional.';
  }
  if (message.includes('network') || message.includes('fetch')) {
    return 'Sem conexão. Verifique sua internet e tente novamente.';
  }
  return 'Não foi possível concluir o cadastro. Tente novamente.';
}
