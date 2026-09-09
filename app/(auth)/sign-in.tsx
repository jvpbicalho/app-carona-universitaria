import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { useAuth } from '@/auth/AuthContext';
import { attemptsLeftMessage, formatDuration, lockedMessage } from '@/auth/authErrors';
import { AuthScreen } from '@/components/AuthScreen';
import { Banner } from '@/components/Banner';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextField } from '@/components/TextField';
import { colors, spacing, typography } from '@/theme/tokens';

/**
 * História 2 — Login.
 *
 * O redirecionamento para a Home não é feito aqui: signIn instala a sessão no
 * SDK, o AuthProvider emite o novo estado e o layout de (auth) redireciona.
 * Assim existe um só caminho de navegação por sessão, e ele vale também para
 * quem reabre o app já autenticado.
 *
 * O bloqueio após 3 tentativas é decidido no servidor (Edge Function
 * auth-login). Esta tela apenas reflete o veredito: desabilita o botão e mostra
 * o tempo restante. A contagem regressiva local é conveniência visual — se o
 * usuário matar o app e voltar, o servidor continua recusando até expirar.
 */
export default function SignInScreen() {
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /** Segundos restantes de bloqueio. 0 = liberado. Fonte única do estado. */
  const [lockSeconds, setLockSeconds] = useState(0);
  const locked = lockSeconds > 0;

  // Um único intervalo enquanto o bloqueio durar: a dependência é a condição
  // "está bloqueado", não o valor, então o timer não é recriado a cada segundo.
  useEffect(() => {
    if (!locked) return;

    const timer = setInterval(() => {
      setLockSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [locked]);

  async function handleSubmit() {
    if (locked || submitting) return;

    setFormError(null);
    setWarning(null);

    if (email.trim().length === 0 || password.length === 0) {
      setFormError('Informe e-mail e senha.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await signIn({ email, password });

      if (result.ok) {
        // Sessão instalada: o guard de (auth) redireciona para /home.
        return;
      }

      switch (result.kind) {
        case 'account_locked':
          // O banner de bloqueio é renderizado a partir de lockSeconds, então
          // formError fica limpo — não há duas fontes para a mesma mensagem.
          setLockSeconds(result.retryAfterSeconds);
          setPassword('');
          break;

        case 'invalid_credentials':
          setFormError(result.message);
          setWarning(attemptsLeftMessage(result.attemptsLeft));
          setPassword('');
          break;

        default:
          setFormError(result.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthScreen
      title="Entrar"
      subtitle="Acesse com seu e-mail institucional e senha."
      footer={
        <Pressable
          onPress={() => router.replace('/sign-up')}
          accessibilityRole="link"
          disabled={submitting}
        >
          <Text style={styles.link}>
            Não tem conta? <Text style={styles.linkStrong}>Criar conta</Text>
          </Text>
        </Pressable>
      }
    >
      {locked ? <Banner tone="error" message={lockedMessage(lockSeconds)} /> : null}

      {!locked && formError ? <Banner tone="error" message={formError} /> : null}

      {!locked && warning ? <Banner tone="warning" message={warning} /> : null}

      <TextField
        label="E-mail institucional"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        placeholder="seu.nome@pucsp.edu.br"
        editable={!submitting && !locked}
        returnKeyType="next"
      />

      <TextField
        label="Senha"
        value={password}
        onChangeText={setPassword}
        secure
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        editable={!submitting && !locked}
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
      />

      <View style={styles.action}>
        <PrimaryButton
          label={locked ? `Aguarde ${formatDuration(lockSeconds)}` : 'Entrar'}
          onPress={handleSubmit}
          loading={submitting}
          disabled={locked}
        />
      </View>

      {/* SSO institucional e recuperação de senha estão fora do MVP (Fase 2). */}
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  action: { marginTop: spacing.sm },
  link: { ...typography.body, textAlign: 'center', color: colors.textMuted },
  linkStrong: { color: colors.primary, fontWeight: '700' },
});
