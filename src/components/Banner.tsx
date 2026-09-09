import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme/tokens';

type Tone = 'error' | 'success' | 'warning';

const TONES: Record<Tone, { background: string; text: string }> = {
  error: { background: colors.dangerSurface, text: colors.danger },
  success: { background: colors.successSurface, text: colors.success },
  warning: { background: colors.warningSurface, text: colors.warning },
};

/**
 * Mensagem de nível de formulário (erro de credencial, bloqueio, confirmação).
 * accessibilityLiveRegion faz o leitor de tela anunciar sem precisar de foco.
 */
export function Banner({ tone, message }: { tone: Tone; message: string }) {
  const palette = TONES[tone];

  return (
    <View
      style={[styles.container, { backgroundColor: palette.background }]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <Text style={[styles.text, { color: palette.text }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  text: { ...typography.body, fontWeight: '600' },
});
