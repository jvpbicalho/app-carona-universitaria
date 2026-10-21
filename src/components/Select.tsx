import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FieldMessage, fieldStyles } from '@/components/FieldParts';
import { Icon } from '@/components/Icon';
import { colors, sizes, spacing, typography } from '@/theme/tokens';

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
  placeholder = 'Selecione',
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
    <View style={fieldStyles.wrapper}>
      <Text style={fieldStyles.label}>{label}</Text>

      <Pressable
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: selected?.label ?? placeholder }}
        accessibilityState={{ disabled }}
        style={({ pressed }) => [
          fieldStyles.box,
          styles.field,
          pressed && !disabled && fieldStyles.boxPressed,
          Boolean(error) && fieldStyles.boxError,
          disabled && fieldStyles.boxDisabled,
        ]}
      >
        <Text
          style={[selected ? fieldStyles.value : fieldStyles.placeholder, disabled && fieldStyles.valueDisabled]}
          numberOfLines={1}
        >
          {selected?.label ?? placeholder}
        </Text>
        <Icon name="chevron-down" size={sizes.iconSm} color={colors.iconInactive} />
      </Pressable>

      <FieldMessage error={error} helper={helper} />

      <Modal visible={open} animationType="slide" onRequestClose={close} transparent={false}>
        <SafeAreaView style={styles.modal} edges={['top', 'bottom']}>
          <View style={styles.modalInner}>
            <View style={styles.modalHeader}>
              <Text style={typography.sectionTitle}>{label}</Text>
              <Pressable onPress={close} hitSlop={12} accessibilityRole="button">
                <Text style={typography.bodyStrong}>Fechar</Text>
              </Pressable>
            </View>

            {showSearch ? (
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={`Buscar ${label.toLowerCase()}`}
                placeholderTextColor={colors.textSecondary}
                style={[fieldStyles.box, fieldStyles.input, styles.search]}
                autoCorrect={false}
                accessibilityLabel={`Buscar ${label.toLowerCase()}`}
              />
            ) : null}

            <FlatList
              data={visibleOptions}
              keyExtractor={(item) => item.value}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text style={styles.empty}>Nenhuma opção encontrada para "{query}". Tente outra palavra.</Text>
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
                      <Text style={isSelected ? typography.bodyStrong : typography.body}>{item.label}</Text>
                      {item.hint ? <Text style={typography.caption}>{item.hint}</Text> : null}
                    </View>
                    {isSelected ? <Icon name="check" /> : null}
                  </Pressable>
                );
              }}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modal: { flex: 1, backgroundColor: colors.background },
  modalInner: { flex: 1, width: '100%', maxWidth: sizes.contentMaxWidth, alignSelf: 'center' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: sizes.hairline,
    borderBottomColor: colors.divider,
  },
  search: { flex: 0, margin: spacing.md },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: sizes.hairline,
    borderBottomColor: colors.divider,
  },
  optionPressed: { backgroundColor: colors.surface },
  optionBody: { flex: 1 },
  empty: { ...typography.caption, textAlign: 'center', padding: spacing.lg },
});
