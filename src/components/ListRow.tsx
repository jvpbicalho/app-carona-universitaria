import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { colors, sizes, spacing, typography } from '@/theme/tokens';

type Props = {
  label: string;
  /** Texto à direita, antes da seta (ex.: "Honda Fit"). Comece com maiúscula. */
  value?: string | null;
  onPress?: () => void;
  /**
   * Marca itens que exigem atenção, como perfil incompleto. A bolinha é só
   * reforço: o `value` precisa dizer em texto o que falta.
   */
  attention?: boolean;
  disabled?: boolean;
};

/** Linha de menu do wireframe 2.2 ("Dados pessoais ›", "Meu veículo ›"). */
export function ListRow({ label, value, onPress, attention = false, disabled = false }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}: ${value}` : label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.row, pressed && !disabled && styles.rowPressed]}
    >
      <Text style={[typography.body, styles.label, disabled && styles.textDisabled]}>{label}</Text>

      <View style={styles.right}>
        {attention ? <View style={styles.dot} /> : null}
        {value ? (
          <Text
            style={[attention ? typography.captionStrong : typography.caption, styles.value, disabled && styles.textDisabled]}
            numberOfLines={1}
          >
            {value}
          </Text>
        ) : null}
        {onPress && !disabled ? (
          <View style={styles.chevron}>
            <Icon name="chevron-right" size={sizes.iconSm} color={colors.iconInactive} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: sizes.row,
    paddingHorizontal: spacing.md,
    borderBottomWidth: sizes.hairline,
    borderBottomColor: colors.divider,
  },
  rowPressed: { backgroundColor: colors.surface },
  label: { flexShrink: 1 },
  textDisabled: { color: colors.textDisabled },
  right: { flexDirection: 'row', alignItems: 'center', marginLeft: spacing.sm },
  value: { maxWidth: 170 },
  chevron: { marginLeft: spacing.sm },
  dot: {
    width: sizes.dot,
    height: sizes.dot,
    borderRadius: sizes.dot / 2,
    backgroundColor: colors.text,
    marginRight: spacing.sm,
  },
});
