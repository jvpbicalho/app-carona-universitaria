import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme/tokens';

type Props = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Texto à direita do número, ex.: "de 4". */
  suffix?: string;
  helper?: string;
  error?: string | null;
  disabled?: boolean;
};

/**
 * Contador "− n +" do wireframe (vagas do veículo e vagas da carona).
 *
 * Stepper em vez de campo numérico porque o intervalo é pequeno e fechado: não
 * há o que digitar, e teclado numérico em campo de 1 dígito é atrito puro.
 */
export function Stepper({
  label,
  value,
  onChange,
  min = 1,
  max = 7,
  suffix,
  helper,
  error,
  disabled = false,
}: Props) {
  const canDecrease = !disabled && value > min;
  const canIncrease = !disabled && value < max;

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>

      <View style={[styles.row, Boolean(error) && styles.rowError]}>
        <Pressable
          onPress={() => canDecrease && onChange(value - 1)}
          disabled={!canDecrease}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Diminuir"
          accessibilityState={{ disabled: !canDecrease }}
          style={({ pressed }) => [
            styles.button,
            pressed && canDecrease && styles.buttonPressed,
            !canDecrease && styles.buttonDisabled,
          ]}
        >
          <Text style={[styles.buttonText, !canDecrease && styles.buttonTextDisabled]}>−</Text>
        </Pressable>

        <View style={styles.valueBox}>
          <Text style={styles.value} accessibilityLiveRegion="polite">
            {value}
            {suffix ? <Text style={styles.suffix}> {suffix}</Text> : null}
          </Text>
        </View>

        <Pressable
          onPress={() => canIncrease && onChange(value + 1)}
          disabled={!canIncrease}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Aumentar"
          accessibilityState={{ disabled: !canIncrease }}
          style={({ pressed }) => [
            styles.button,
            pressed && canIncrease && styles.buttonPressed,
            !canIncrease && styles.buttonDisabled,
          ]}
        >
          <Text style={[styles.buttonText, !canIncrease && styles.buttonTextDisabled]}>+</Text>
        </Pressable>
      </View>

      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : helper ? (
        <Text style={styles.helper}>{helper}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.md },
  label: { ...typography.label, marginBottom: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  rowError: { borderColor: colors.danger, borderWidth: 2 },
  button: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: { backgroundColor: colors.surface },
  buttonDisabled: { opacity: 0.35 },
  buttonText: { fontSize: 24, color: colors.primary, fontWeight: '700' },
  buttonTextDisabled: { color: colors.textMuted },
  valueBox: { minWidth: 72, alignItems: 'center', paddingHorizontal: spacing.sm },
  value: { fontSize: 18, fontWeight: '700', color: colors.text },
  suffix: { fontSize: 14, fontWeight: '400', color: colors.textMuted },
  error: { ...typography.helper, color: colors.danger, marginTop: spacing.xs },
  helper: { ...typography.helper, marginTop: spacing.xs },
});
