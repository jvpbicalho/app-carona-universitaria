import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { colors, radius, sizes, spacing, typography } from '@/theme/tokens';

type Tone = 'error' | 'success' | 'warning';

/**
 * Sem verde nem âmbar (paleta monocromática). O tom muda o ícone, e o erro
 * ganha o vermelho funcional — mas a mensagem em texto é sempre o que
 * explica o que houve.
 */
const TONES: Record<Tone, { icon: IconName; color: string; accent: string }> = {
  error: { icon: 'alert', color: colors.danger, accent: colors.danger },
  warning: { icon: 'alert', color: colors.text, accent: colors.text },
  success: { icon: 'check', color: colors.text, accent: colors.text },
};

/**
 * Mensagem de nível de formulário (erro de credencial, bloqueio, confirmação).
 * accessibilityLiveRegion faz o leitor de tela anunciar sem precisar de foco.
 */
export function Banner({ tone, message }: { tone: Tone; message: string }) {
  const look = TONES[tone];

  return (
    <View
      style={[styles.container, { borderLeftColor: look.accent }]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <View style={styles.icon}>
        <Icon name={look.icon} size={sizes.icon} color={look.color} />
      </View>
      <Text style={[styles.text, { color: look.color }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderLeftWidth: spacing.xs,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm + spacing.xxs,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  icon: { marginTop: spacing.xs, marginRight: spacing.sm },
  text: { ...typography.body, flex: 1 },
});
