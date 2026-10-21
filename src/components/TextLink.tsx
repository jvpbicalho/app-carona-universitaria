import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { spacing, typography } from '@/theme/tokens';

/**
 * Ação em forma de texto ("Criar conta", "Trocar foto").
 *
 * Sem cor de destaque (a paleta não tem): o que diz "isto é clicável" é o
 * peso Medium e o sublinhado. Para ação principal, use PrimaryButton.
 */
export function TextLink({
  label,
  onPress,
  disabled = false,
  role = 'button',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  role?: 'button' | 'link';
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={role}
      accessibilityState={{ disabled }}
      hitSlop={8}
      style={({ pressed }) => [styles.touch, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  touch: { paddingVertical: spacing.xs },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.4 },
  label: { ...typography.bodyStrong, textDecorationLine: 'underline' },
});
