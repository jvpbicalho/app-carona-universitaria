import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { colors, radius, spacing, typography } from '@/theme/tokens';

/**
 * Padrões transversais do wireframe. Definidos aqui uma vez para não serem
 * improvisados diferente em cada tela.
 */

/**
 * P.1 — Estado vazio. "Sempre com uma ação, nunca só 'nada aqui'".
 */
export function EmptyState({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.centered}>
      <Text style={styles.message}>{message}</Text>
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <PrimaryButton label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

/**
 * P.3 — Erro de conexão. "Diz o que houve e oferece a saída, sem jargão
 * técnico" e "nunca mostrar código de erro cru pro usuário".
 */
export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.centered}>
      <Text style={[styles.message, styles.errorMessage]} accessibilityRole="alert">
        {message}
      </Text>
      {onRetry ? (
        <View style={styles.action}>
          <PrimaryButton label="Tentar de novo" onPress={onRetry} variant="ghost" />
        </View>
      ) : null}
    </View>
  );
}

/**
 * P.2 — Carregando. "Esqueleto com a forma do conteúdo final", não spinner:
 * evita o pulo de layout quando os dados chegam.
 */
export function SkeletonBlock({
  height = 16,
  width = '100%',
  style,
}: {
  height?: number;
  width?: number | `${number}%`;
  style?: object;
}) {
  return (
    <View
      style={[styles.skeleton, { height, width }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

/** Esqueleto no formato de um cartão de carona da lista. */
export function SkeletonCard() {
  return (
    <View style={styles.card}>
      <SkeletonBlock height={14} width="40%" />
      <SkeletonBlock height={18} width="80%" style={{ marginTop: spacing.sm }} />
      <SkeletonBlock height={14} width="55%" style={{ marginTop: spacing.sm }} />
    </View>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <View accessibilityLabel="Carregando" accessibilityRole="progressbar">
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={index} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  message: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  errorMessage: { color: colors.danger },
  action: { marginTop: spacing.lg, alignSelf: 'stretch' },
  skeleton: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
});
