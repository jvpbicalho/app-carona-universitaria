import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { colors, radius, sizes, spacing, typography } from '@/theme/tokens';

export type ButtonVariant = 'primary' | 'outline' | 'danger' | 'dangerOutline';

type Props = {
  /** Comece com verbo e diga o que acontece: "Publicar carona", não "Enviar". */
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  /**
   * Manual, seção 06: "Um botão preto por tela. Os demais ficam com contorno."
   *  - primary: preto cheio — a ação principal, no máximo um por tela;
   *  - outline: contorno — todas as outras;
   *  - danger: vermelho cheio — só a confirmação de ação irreversível;
   *  - dangerOutline: contorno vermelho — ação irreversível que ainda vai
   *    pedir confirmação (ex.: "Cancelar carona" no detalhe).
   */
  variant?: ButtonVariant;
  /** Botão menor, para atalhos dentro de formulário. */
  compact?: boolean;
  accessibilityHint?: string;
};

const VARIANTS: Record<ButtonVariant, { container: object; pressed: object; label: object; spinner: string }> = {
  primary: {
    container: { backgroundColor: colors.primary },
    pressed: { opacity: 0.82 },
    label: { color: colors.onPrimary },
    spinner: colors.onPrimary,
  },
  outline: {
    container: { backgroundColor: colors.background, borderWidth: sizes.hairline, borderColor: colors.border },
    pressed: { backgroundColor: colors.surface },
    label: { color: colors.text },
    spinner: colors.text,
  },
  danger: {
    container: { backgroundColor: colors.danger },
    pressed: { opacity: 0.82 },
    label: { color: colors.onDanger },
    spinner: colors.onDanger,
  },
  dangerOutline: {
    container: { backgroundColor: colors.background, borderWidth: sizes.hairline, borderColor: colors.danger },
    pressed: { backgroundColor: colors.surface },
    label: { color: colors.danger },
    spinner: colors.danger,
  },
};

export function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  compact = false,
  accessibilityHint,
}: Props) {
  const inactive = disabled || loading;
  const look = VARIANTS[variant];
  const filled = variant === 'primary' || variant === 'danger';

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        look.container,
        pressed && !inactive && look.pressed,
        // Desabilitado: o primário vira cinza (isento de contraste); os
        // demais só esmaecem. O spinner de carregamento não esmaece.
        disabled && (filled ? styles.filledDisabled : styles.outlineDisabled),
      ]}
    >
      {/* O spinner substitui o texto sem mudar a altura do botão. */}
      {loading ? (
        <ActivityIndicator color={look.spinner} />
      ) : (
        <Text style={[styles.label, compact && styles.labelCompact, look.label, disabled && filled && styles.labelDisabled]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: sizes.control,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  compact: {
    minHeight: sizes.controlCompact,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  filledDisabled: { backgroundColor: colors.primaryDisabled },
  outlineDisabled: { opacity: 0.5 },
  label: { ...typography.button, textAlign: 'center' },
  // Atalho com texto longo (nome do campus) quebra linha alinhado à esquerda.
  labelCompact: { ...typography.captionStrong, textAlign: 'left' },
  labelDisabled: { color: colors.onPrimary },
});
