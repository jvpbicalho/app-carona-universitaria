import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { FieldMessage, fieldStyles } from '@/components/FieldParts';
import { colors } from '@/theme/tokens';

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
    <View style={fieldStyles.wrapper}>
      <Text style={fieldStyles.label}>{label}</Text>

      <View
        style={[
          fieldStyles.box,
          styles.inputRow,
          focused && fieldStyles.boxFocused,
          hasError && fieldStyles.boxError,
        ]}
      >
        <TextInput
          {...inputProps}
          style={[fieldStyles.input, style]}
          secureTextEntry={secure && !revealed}
          onFocus={(event) => {
            setFocused(true);
            inputProps.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            inputProps.onBlur?.(event);
          }}
          placeholderTextColor={colors.textSecondary}
          accessibilityLabel={label}
          // O leitor de tela precisa saber do erro, não só da borda.
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

      <FieldMessage error={error} helper={helper} />
    </View>
  );
}

const styles = StyleSheet.create({
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  reveal: { ...fieldStyles.action },
});
