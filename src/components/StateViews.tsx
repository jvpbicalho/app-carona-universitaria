import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { PrimaryButton, type ButtonVariant } from '@/components/PrimaryButton';
import { colors, radius, sizes, spacing, typography } from '@/theme/tokens';

/**
 * Padrões transversais do wireframe. Definidos aqui uma vez para não serem
 * improvisados diferente em cada tela.
 */

/**
 * P.1 — Estado vazio. "Sempre com uma ação, nunca só 'nada aqui'".
 * Fundo cinza claro: o manual reserva essa cor para estados vazios.
 */
export function EmptyState({
  message,
  actionLabel,
  onAction,
  actionVariant = 'primary',
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Use 'outline' se a tela já tiver outro botão preto. */
  actionVariant?: ButtonVariant;
}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.message}>{message}</Text>
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <PrimaryButton label={actionLabel} onPress={onAction} variant={actionVariant} />
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
      <Icon name="alert" size={sizes.icon * 1.5} color={colors.danger} />
      <Text style={[styles.message, styles.errorMessage]} accessibilityRole="alert">
        {message}
      </Text>
      {onRetry ? (
        <View style={styles.action}>
          <PrimaryButton label="Tentar de novo" onPress={onRetry} variant="outline" />
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

/**
 * Esqueleto dos campos de um formulário. Vai dentro do AuthScreen, que já
 * mostra o título real — só os dados ainda estão chegando.
 */
export function FormSkeleton({ fields = 3 }: { fields?: number }) {
  return (
    <View accessibilityLabel="Carregando" accessibilityRole="progressbar">
      {Array.from({ length: fields }).map((_, index) => (
        <View key={index} style={{ marginBottom: spacing.lg }}>
          <SkeletonBlock height={12} width="30%" />
          <SkeletonBlock height={sizes.control} style={{ marginTop: spacing.xs }} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  message: { ...typography.bodySecondary, textAlign: 'center' },
  errorMessage: { color: colors.danger, marginTop: spacing.sm },
  action: { marginTop: spacing.lg, alignSelf: 'stretch' },
  skeleton: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
  },
  card: {
    borderWidth: sizes.hairline,
    borderColor: colors.divider,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
});
