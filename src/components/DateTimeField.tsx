import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { colors, radius, spacing, typography } from '@/theme/tokens';

type Props = {
  label: string;
  mode: 'date' | 'time';
  value: Date | null;
  onChange: (value: Date) => void;
  /** Passe `new Date()` em campos de data futura para bloquear o passado no próprio calendário. */
  minimumDate?: Date;
  maximumDate?: Date;
  error?: string | null;
  helper?: string;
};

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatDateValue(date: Date): string {
  return `${WEEKDAYS[date.getDay()]} · ${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function formatTimeValue(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Campo de data ou hora com o picker nativo.
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
}: Props) {
  const [open, setOpen] = useState(false);

  function handleChange(event: DateTimePickerEvent, selected?: Date) {
    // No Android o picker é um diálogo próprio: fecha sozinho a cada evento.
    // No iOS é inline e continua aberto até o usuário confirmar.
    if (Platform.OS === 'android') setOpen(false);
    if (event.type === 'dismissed') return;
    if (selected) onChange(selected);
  }

  const display = value
    ? mode === 'date'
      ? formatDateValue(value)
      : formatTimeValue(value)
    : mode === 'date'
      ? 'escolher data'
      : 'escolher horário';

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>

      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: display }}
        style={({ pressed }) => [
          styles.field,
          pressed && styles.fieldPressed,
          Boolean(error) && styles.fieldError,
        ]}
      >
        <Text style={value ? styles.value : styles.placeholder}>{display}</Text>
        <Text style={styles.icon}>{mode === 'date' ? '▤' : '◷'}</Text>
      </Pressable>

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
  wrapper: { marginBottom: spacing.md, flex: 1 },
  label: { ...typography.label, marginBottom: spacing.xs },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    minHeight: 52,
  },
  fieldPressed: { backgroundColor: colors.surface },
  fieldError: { borderColor: colors.danger, borderWidth: 2 },
  value: { ...typography.body, flex: 1 },
  placeholder: { ...typography.body, color: colors.textMuted, flex: 1 },
  icon: { color: colors.textMuted, fontSize: 16, marginLeft: spacing.sm },
  confirm: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '700',
    textAlign: 'right',
    paddingVertical: spacing.sm,
  },
  error: { ...typography.helper, color: colors.danger, marginTop: spacing.xs },
  helper: { ...typography.helper, marginTop: spacing.xs },
});
