import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { colors, radius, spacing } from '@/theme/tokens';

type Props = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** 'danger' é para ação irreversível, como cancelar uma carona. */
  variant?: 'primary' | 'ghost' | 'danger';
};

export function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
}: Props) {
  const inactive = disabled || loading;
  const ghost = variant === 'ghost';
  const danger = variant === 'danger';

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        ghost ? styles.ghost : danger ? styles.danger : styles.primary,
        pressed &&
          !inactive &&
          (ghost ? styles.ghostPressed : danger ? styles.dangerPressed : styles.primaryPressed),
        inactive && (ghost ? styles.ghostDisabled : danger ? styles.dangerDisabled : styles.primaryDisabled),
      ]}
    >
      {/* O spinner substitui o texto sem mudar a altura do botão. */}
      {loading ? (
        <ActivityIndicator color={ghost ? colors.primary : colors.onPrimary} />
      ) : (
        <Text style={[styles.label, ghost && styles.ghostLabel]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  primary: { backgroundColor: colors.primary },
  primaryPressed: { backgroundColor: colors.primaryPressed },
  primaryDisabled: { backgroundColor: colors.primaryDisabled },
  ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  ghostPressed: { backgroundColor: colors.surface },
  ghostDisabled: { opacity: 0.5 },
  danger: { backgroundColor: colors.danger },
  dangerPressed: { backgroundColor: colors.dangerPressed },
  dangerDisabled: { backgroundColor: colors.danger, opacity: 0.5 },
  label: { color: colors.onPrimary, fontSize: 16, fontWeight: '700' },
  ghostLabel: { color: colors.primary },
});
