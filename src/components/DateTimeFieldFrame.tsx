import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FieldMessage, fieldStyles } from '@/components/FieldParts';
import { Icon } from '@/components/Icon';
import { colors, sizes, spacing } from '@/theme/tokens';

/**
 * Partes comuns do campo de data/hora. O seletor em si muda por plataforma:
 *  - DateTimeField.tsx      → celular, com o seletor nativo do sistema;
 *  - DateTimeField.web.tsx  → web, com o seletor do navegador.
 * O Metro escolhe o arquivo pela extensão; as telas importam só
 * '@/components/DateTimeField' e não sabem qual é.
 */
export type DateTimeFieldProps = {
  label: string;
  mode: 'date' | 'time';
  value: Date | null;
  onChange: (value: Date) => void;
  /** Passe `new Date()` em campos de data futura para bloquear o passado no próprio calendário. */
  minimumDate?: Date;
  maximumDate?: Date;
  /** Uma string só com espaço marca o campo como inválido sem repetir a mensagem. */
  error?: string | null;
  helper?: string;
};

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * "Qua, 21/10". O ano só aparece quando não é o atual (virada de ano): os
 * dois campos dividem a linha, e com o ano a data era cortada num celular de
 * 375 px. Caronas vão no máximo 30 dias à frente, então o ano raramente muda.
 */
export function formatDateValue(date: Date, now: Date = new Date()): string {
  const weekday = WEEKDAYS[date.getDay()];
  const year = date.getFullYear() === now.getFullYear() ? '' : `/${date.getFullYear()}`;
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${pad(date.getDate())}/${pad(date.getMonth() + 1)}${year}`;
}

export function formatTimeValue(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function displayValue(mode: 'date' | 'time', value: Date | null): string {
  if (value) return mode === 'date' ? formatDateValue(value) : formatTimeValue(value);
  // Curto de propósito: os dois campos dividem a linha, e num celular de
  // 375 px "Escolher horário" era cortado.
  return mode === 'date' ? 'Escolher data' : 'Escolher hora';
}

/** Rótulo + caixa clicável + mensagem. `children` recebe o seletor da plataforma. */
export function DateTimeFieldFrame({
  label,
  mode,
  value,
  error,
  helper,
  onPress,
  children,
}: Pick<DateTimeFieldProps, 'label' | 'mode' | 'value' | 'error' | 'helper'> & {
  onPress: () => void;
  children?: React.ReactNode;
}) {
  const display = displayValue(mode, value);

  return (
    <View style={[fieldStyles.wrapper, styles.wrapper]}>
      <Text style={fieldStyles.label}>{label}</Text>

      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: display }}
        style={({ pressed }) => [
          fieldStyles.box,
          styles.field,
          pressed && fieldStyles.boxPressed,
          Boolean(error) && fieldStyles.boxError,
        ]}
      >
        <Text style={value ? fieldStyles.value : fieldStyles.placeholder} numberOfLines={1}>
          {display}
        </Text>
        <View style={styles.icon}>
          <Icon name={mode === 'date' ? 'calendar' : 'clock'} size={sizes.icon} color={colors.iconInactive} />
        </View>
      </Pressable>

      {children}

      <FieldMessage error={error} helper={helper} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  field: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  icon: { marginLeft: spacing.sm },
});
