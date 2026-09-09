import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { useAuth } from '@/auth/AuthContext';
import { AuthScreen } from '@/components/AuthScreen';
import { Banner } from '@/components/Banner';
import { PrimaryButton } from '@/components/PrimaryButton';
import { colors, spacing, typography } from '@/theme/tokens';

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
      subtitle="Falta um passo para ativar sua conta."
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
          variant="ghost"
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
    borderRadius: 12,
    padding: spacing.md,
  },
  email: {
    ...typography.body,
    fontWeight: '700',
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  instructions: { ...typography.helper },
  actions: { marginTop: spacing.lg },
  spacer: { height: spacing.sm },
});
