import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { DateTimeFieldFrame, type DateTimeFieldProps } from '@/components/DateTimeFieldFrame';
import { fieldStyles } from '@/components/FieldParts';
import { spacing } from '@/theme/tokens';

/**
 * Campo de data ou hora com o seletor nativo (iOS e Android). A versão web
 * fica em DateTimeField.web.tsx.
 *
 * `minimumDate` bloqueia o passado já no calendário — impedir de escolher é
 * melhor que deixar escolher e reclamar depois. A validação em
 * routeValidation continua existindo, porque o seletor não cobre o caso de a
 * data virar passado enquanto o formulário fica aberto.
 */
export function DateTimeField({
  label,
  mode,
  value,
  onChange,
  minimumDate,
  maximumDate,
  error,
  helper,
}: DateTimeFieldProps) {
  const [open, setOpen] = useState(false);

  function handleChange(event: DateTimePickerEvent, selected?: Date) {
    // No Android o picker é um diálogo próprio: fecha sozinho a cada evento.
    // No iOS é inline e continua aberto até o usuário confirmar.
    if (Platform.OS === 'android') setOpen(false);
    if (event.type === 'dismissed') return;
    if (selected) onChange(selected);
  }

  return (
    <DateTimeFieldFrame
      label={label}
      mode={mode}
      value={value}
      error={error}
      helper={helper}
      onPress={() => setOpen(true)}
    >
      {open ? (
        <DateTimePicker
          value={value ?? minimumDate ?? new Date()}
          mode={mode}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onChange={handleChange}
          locale="pt-BR"
          is24Hour
        />
      ) : null}

      {/* No iOS o picker fica inline e precisa de um jeito explícito de fechar. */}
      {open && Platform.OS === 'ios' ? (
        <Pressable onPress={() => setOpen(false)} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.confirm}>Confirmar</Text>
        </Pressable>
      ) : null}
    </DateTimeFieldFrame>
  );
}

const styles = StyleSheet.create({
  confirm: { ...fieldStyles.action, textAlign: 'right', paddingVertical: spacing.sm },
});
