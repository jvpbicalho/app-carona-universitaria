import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { useAuth } from '@/auth/AuthContext';
import { AuthScreen } from '@/components/AuthScreen';
import { Banner } from '@/components/Banner';
import { PrimaryButton } from '@/components/PrimaryButton';
import { colors, radius, spacing, typography } from '@/theme/tokens';

/**
 * Confirmação de cadastro (História 1). Exibida após o signUp, quando o
 * Supabase já disparou o link. A conta existe mas não está confirmada, então o
 * login ainda não passa — o que é o comportamento desejado.
 */
export default function VerifyEmailScreen() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const { resendConfirmation } = useAuth();

  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [resending, setResending] = useState(false);

  async function handleResend() {
    if (!email) return;
    setFeedback(null);
    setResending(true);
    try {
      const result = await resendConfirmation(email);
      setFeedback({ tone: result.ok ? 'success' : 'error', message: result.message });
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthScreen
      title="Confirme seu e-mail"
      subtitle="Falta um passo para ativar sua conta no UniRota."
    >
      {feedback ? <Banner tone={feedback.tone} message={feedback.message} /> : null}

      <View style={styles.card}>
        <Text style={typography.body}>Enviamos um link de confirmação para</Text>
        <Text style={styles.email}>{email ?? 'seu e-mail institucional'}</Text>
        <Text style={styles.instructions}>
          Abra o link para ativar a conta e depois volte aqui para entrar. Verifique também a caixa
          de spam.
        </Text>
      </View>

      <View style={styles.actions}>
        <PrimaryButton label="Ir para o login" onPress={() => router.replace('/sign-in')} />
        <View style={styles.spacer} />
        <PrimaryButton
          label="Reenviar link"
          variant="outline"
          onPress={handleResend}
          loading={resending}
          disabled={!email}
        />
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  email: {
    ...typography.bodyStrong,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  instructions: { ...typography.caption },
  actions: { marginTop: spacing.lg },
  spacer: { height: spacing.sm },
});
