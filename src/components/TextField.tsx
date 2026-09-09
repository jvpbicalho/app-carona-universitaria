import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme/tokens';

type Props = TextInputProps & {
  label: string;
  /** Mensagem de erro do campo. Presente = campo em estado inválido. */
  error?: string | null;
  /** Dica exibida abaixo do campo quando não há erro. */
  helper?: string;
  /** Renderiza o botão "mostrar/ocultar" e mascara o texto. */
  secure?: boolean;
};

export function TextField({ label, error, helper, secure = false, style, ...inputProps }: Props) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const hasError = Boolean(error);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>

      <View
        style={[
          styles.inputRow,
          focused && styles.inputRowFocused,
          hasError && styles.inputRowError,
        ]}
      >
        <TextInput
          {...inputProps}
          style={[styles.input, style]}
          secureTextEntry={secure && !revealed}
          onFocus={(event) => {
            setFocused(true);
            inputProps.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            inputProps.onBlur?.(event);
          }}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={label}
          // O leitor de tela precisa saber do erro, não só da borda vermelha.
          // AccessibilityState do RN não tem "invalid", então o motivo vai no hint.
          accessibilityHint={error ?? helper}
        />

        {secure ? (
          <Pressable
            onPress={() => setRevealed((value) => !value)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Ocultar senha' : 'Mostrar senha'}
          >
            <Text style={styles.reveal}>{revealed ? 'Ocultar' : 'Mostrar'}</Text>
          </Pressable>
        ) : null}
      </View>

      {hasError ? (
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
  },
  inputRowFocused: { borderColor: colors.borderFocused, borderWidth: 2 },
  inputRowError: { borderColor: colors.danger, borderWidth: 2 },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
  },
  reveal: { ...typography.helper, color: colors.primary, fontWeight: '600' },
  error: { ...typography.helper, color: colors.danger, marginTop: spacing.xs },
  helper: { ...typography.helper, marginTop: spacing.xs },
});
