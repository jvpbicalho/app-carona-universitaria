import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/theme/tokens';

type Props = {
  label: string;
  /** Texto à direita, antes da seta (ex.: "★ 4,8" ou "Honda Fit"). */
  value?: string | null;
  onPress?: () => void;
  /** Marca visualmente itens que exigem atenção, como perfil incompleto. */
  attention?: boolean;
  disabled?: boolean;
  danger?: boolean;
};

/** Linha de menu do wireframe 2.2 ("Dados pessoais ›", "Meu veículo ›"). */
export function ListRow({
  label,
  value,
  onPress,
  attention = false,
  disabled = false,
  danger = false,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}: ${value}` : label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.row,
        pressed && !disabled && styles.rowPressed,
        disabled && styles.rowDisabled,
      ]}
    >
      <Text style={[styles.label, danger && styles.labelDanger]}>{label}</Text>

      <View style={styles.right}>
        {attention ? <View style={styles.dot} accessibilityLabel="Requer atenção" /> : null}
        {value ? (
          <Text style={styles.value} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
        {onPress ? <Text style={styles.chevron}>›</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 54,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
  },
  rowPressed: { backgroundColor: colors.surface },
  rowDisabled: { opacity: 0.5 },
  label: { ...typography.body, flexShrink: 1 },
  labelDanger: { color: colors.danger },
  right: { flexDirection: 'row', alignItems: 'center', marginLeft: spacing.sm },
  value: { ...typography.helper, maxWidth: 150 },
  chevron: { color: colors.textMuted, fontSize: 22, marginLeft: spacing.sm },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.warning,
    marginRight: spacing.sm,
  },
});
