import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { colors, radius, sizes, spacing, typography } from '@/theme/tokens';

/**
 * Peças comuns a todos os campos de formulário (texto, seleção, data, endereço,
 * contador). Um lugar só para rótulo, caixa, foco, erro e dica — antes cada
 * campo repetia esses estilos e eles já tinham começado a divergir.
 *
 * Estados sem depender de cor (manual: o vermelho nunca carrega o significado
 * sozinho):
 *  - foco: contorno preto mais grosso;
 *  - erro: contorno vermelho mais grosso + ícone + mensagem em texto.
 */
export const fieldStyles = StyleSheet.create({
  wrapper: { marginBottom: spacing.md },
  label: { ...typography.fieldLabel, marginBottom: spacing.xs },
  box: {
    borderWidth: sizes.hairline,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    minHeight: sizes.control,
  },
  // Contorno de 2 px desloca o conteúdo em 1 px; a margem negativa compensa
  // para o texto não "pular" ao focar.
  boxFocused: { borderColor: colors.borderFocused, borderWidth: sizes.borderStrong, paddingHorizontal: spacing.md - 1 },
  boxError: { borderColor: colors.danger, borderWidth: sizes.borderStrong, paddingHorizontal: spacing.md - 1 },
  boxPressed: { backgroundColor: colors.surface },
  boxDisabled: { backgroundColor: colors.surface },
  input: {
    ...typography.input,
    flex: 1,
    paddingVertical: spacing.md - 2,
    // Na web o navegador desenha o próprio contorno de foco por cima do nosso.
    // O foco continua visível: é a borda preta de 2 px da caixa.
    ...(Platform.OS === 'web' ? { outlineWidth: 0 } : null),
  },
  value: { ...typography.body, flex: 1 },
  placeholder: { ...typography.body, color: colors.textSecondary, flex: 1 },
  valueDisabled: { color: colors.textDisabled },
  /** Ação em texto dentro do campo ("Mostrar", "Confirmar", "Fechar"). */
  action: { ...typography.captionStrong },
});

/** Mensagem abaixo do campo: erro (com ícone) tem prioridade sobre a dica. */
export function FieldMessage({ error, helper }: { error?: string | null; helper?: string | null }) {
  if (error && error.trim().length > 0) {
    return (
      <View style={styles.row} accessibilityLiveRegion="polite">
        <View style={styles.icon}>
          <Icon name="alert" size={sizes.iconSm} color={colors.danger} />
        </View>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }
  if (helper) return <Text style={styles.helper}>{helper}</Text>;
  return null;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', marginTop: spacing.xs },
  icon: { marginTop: 3, marginRight: spacing.xs },
  error: { ...typography.caption, color: colors.danger, flex: 1 },
  helper: { ...typography.caption, marginTop: spacing.xs },
});
