import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, spacing, typography } from '@/theme/tokens';

export type SelectOption = { value: string; label: string; hint?: string };

type Props = {
  label: string;
  placeholder?: string;
  value: string | null;
  options: SelectOption[];
  onChange: (value: string) => void;
  error?: string | null;
  helper?: string;
  disabled?: boolean;
  /** Mostra campo de busca na lista. Ligado por padrão acima de 10 opções. */
  searchable?: boolean;
};

/**
 * Select em modal — React Native não tem `<select>` e o Picker nativo se
 * comporta de forma muito diferente entre iOS e Android.
 *
 * Acima de 10 opções ganha busca: a lista de cursos tem 30, e rolar até
 * "Sistemas de Informação" sem filtro é desagradável.
 */
export function Select({
  label,
  placeholder = 'selecione',
  value,
  options,
  onChange,
  error,
  helper,
  disabled = false,
  searchable,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const showSearch = searchable ?? options.length > 10;
  const selected = options.find((option) => option.value === value) ?? null;

  const visibleOptions = useMemo(() => {
    if (!showSearch || query.trim().length === 0) return options;
    const needle = query.trim().toLowerCase();
    return options.filter((option) => option.label.toLowerCase().includes(needle));
  }, [options, query, showSearch]);

  function close() {
    setOpen(false);
    setQuery('');
  }

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>

      <Pressable
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: selected?.label ?? placeholder }}
        accessibilityState={{ disabled }}
        style={({ pressed }) => [
          styles.field,
          pressed && !disabled && styles.fieldPressed,
          Boolean(error) && styles.fieldError,
          disabled && styles.fieldDisabled,
        ]}
      >
        <Text style={selected ? styles.valueText : styles.placeholderText} numberOfLines={1}>
          {selected?.label ?? placeholder}
        </Text>
        <Text style={styles.chevron}>⌄</Text>
      </Pressable>

      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : helper ? (
        <Text style={styles.helper}>{helper}</Text>
      ) : null}

      <Modal visible={open} animationType="slide" onRequestClose={close} transparent={false}>
        <SafeAreaView style={styles.modal} edges={['top', 'bottom']}>
          <View style={styles.modalHeader}>
            <Text style={typography.label}>{label}</Text>
            <Pressable onPress={close} hitSlop={12} accessibilityRole="button">
              <Text style={styles.close}>Fechar</Text>
            </Pressable>
          </View>

          {showSearch ? (
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar..."
              placeholderTextColor={colors.textMuted}
              style={styles.search}
              autoCorrect={false}
              accessibilityLabel={`Buscar ${label}`}
            />
          ) : null}

          <FlatList
            data={visibleOptions}
            keyExtractor={(item) => item.value}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text style={styles.empty}>Nenhuma opção encontrada para "{query}".</Text>
            }
            renderItem={({ item }) => {
              const isSelected = item.value === value;
              return (
                <Pressable
                  onPress={() => {
                    onChange(item.value);
                    close();
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
                >
                  <View style={styles.optionBody}>
                    <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                      {item.label}
                    </Text>
                    {item.hint ? <Text style={styles.optionHint}>{item.hint}</Text> : null}
                  </View>
                  {isSelected ? <Text style={styles.check}>✓</Text> : null}
                </Pressable>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.md },
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
  fieldDisabled: { backgroundColor: colors.surface, opacity: 0.6 },
  valueText: { ...typography.body, flex: 1 },
  placeholderText: { ...typography.body, color: colors.textMuted, flex: 1 },
  chevron: { color: colors.textMuted, fontSize: 16, marginLeft: spacing.sm },
  error: { ...typography.helper, color: colors.danger, marginTop: spacing.xs },
  helper: { ...typography.helper, marginTop: spacing.xs },

  modal: { flex: 1, backgroundColor: colors.background },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  close: { ...typography.body, color: colors.primary, fontWeight: '700' },
  search: {
    margin: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    fontSize: 16,
    color: colors.text,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
  },
  optionPressed: { backgroundColor: colors.surface },
  optionBody: { flex: 1 },
  optionLabel: { ...typography.body },
  optionLabelSelected: { color: colors.primary, fontWeight: '700' },
  optionHint: { ...typography.helper, marginTop: 2 },
  check: { color: colors.primary, fontSize: 18, fontWeight: '700' },
  empty: { ...typography.helper, textAlign: 'center', padding: spacing.lg },
});
