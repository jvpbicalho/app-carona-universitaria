import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FieldMessage, fieldStyles } from '@/components/FieldParts';
import { colors, radius, sizes, spacing, typography } from '@/theme/tokens';

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
    <View style={fieldStyles.wrapper}>
      <Text style={fieldStyles.label}>{label}</Text>

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

      <FieldMessage error={error} helper={helper} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: sizes.hairline,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  rowError: { borderColor: colors.danger, borderWidth: sizes.borderStrong },
  button: {
    width: sizes.control,
    height: sizes.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: { backgroundColor: colors.surface },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { ...typography.counter },
  buttonTextDisabled: { color: colors.iconInactive },
  valueBox: { minWidth: 72, alignItems: 'center', paddingHorizontal: spacing.sm },
  value: { ...typography.counter },
  suffix: { ...typography.caption },
});
