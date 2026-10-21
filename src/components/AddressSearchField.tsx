import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { FieldMessage, fieldStyles } from '@/components/FieldParts';
import { Icon } from '@/components/Icon';
import { GeocodeError, searchAddress, type GeocodeSuggestion } from '@/geocode/geocodeApi';
import type { GeoPoint } from '@/routes/routeValidation';
import { colors, radius, sizes, spacing, typography } from '@/theme/tokens';

type Props = {
  label: string;
  placeholder?: string;
  value: GeoPoint | null;
  onChange: (point: GeoPoint | null) => void;
  error?: string | null;
  helper?: string;
};

/** Espera de digitação antes de buscar. Protege a cota do Nominatim. */
const DEBOUNCE_MS = 450;
const MIN_CHARS = 3;

/**
 * Busca de endereço com geocodificação (critério de aceite da História 3).
 *
 * Só vale como "endereço" o que o usuário escolheu na lista — texto digitado
 * sozinho não tem coordenada, e o formulário exige um GeoPoint. Por isso
 * editar o texto depois de escolher limpa a seleção: senão o rótulo na tela
 * diria uma coisa e as coordenadas salvas diriam outra.
 */
export function AddressSearchField({
  label,
  placeholder = 'Buscar endereço',
  value,
  onChange,
  error,
  helper,
}: Props) {
  const [query, setQuery] = useState(value?.label ?? '');
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Evita re-buscar o texto que acabou de ser preenchido por uma escolha.
  const justSelectedRef = useRef(false);

  // Reflete seleção vinda de fora (ex.: destino preenchido com o campus).
  useEffect(() => {
    if (value) {
      justSelectedRef.current = true;
      setQuery(value.label);
      setSuggestions([]);
    }
  }, [value]);

  const runSearch = useCallback(async (term: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setSearchError(null);
    try {
      const results = await searchAddress(term, controller.signal);
      if (!controller.signal.aborted) setSuggestions(results);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return; // digitou mais
      setSuggestions([]);
      setSearchError(
        err instanceof GeocodeError ? err.message : 'Não foi possível buscar endereços agora. Tente de novo em instantes.',
      );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);

    const term = query.trim();
    if (term.length < MIN_CHARS) {
      setSuggestions([]);
      setLoading(false);
      setSearchError(null);
      abortRef.current?.abort();
      return;
    }

    timerRef.current = setTimeout(() => void runSearch(term), DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, runSearch]);

  // Cancela busca pendente ao desmontar.
  useEffect(() => () => abortRef.current?.abort(), []);

  function handleChangeText(text: string) {
    setQuery(text);
    // Texto editado não corresponde mais ao ponto escolhido.
    if (value) onChange(null);
  }

  function choose(suggestion: GeocodeSuggestion) {
    justSelectedRef.current = true;
    setQuery(suggestion.label);
    setSuggestions([]);
    setSearchError(null);
    onChange({
      label: suggestion.label,
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
    });
  }

  const showSuggestions = focused && suggestions.length > 0 && !value;
  const showEmpty =
    focused && !loading && !value && suggestions.length === 0 && query.trim().length >= MIN_CHARS && !searchError;

  return (
    <View style={fieldStyles.wrapper}>
      <Text style={fieldStyles.label}>{label}</Text>

      <View
        style={[
          fieldStyles.box,
          styles.field,
          focused && fieldStyles.boxFocused,
          Boolean(error) && fieldStyles.boxError,
        ]}
      >
        <TextInput
          value={query}
          onChangeText={handleChangeText}
          onFocus={() => setFocused(true)}
          // Atraso para o toque na sugestão registrar antes de a lista sumir.
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={placeholder}
          placeholderTextColor={colors.textSecondary}
          style={fieldStyles.input}
          autoCorrect={false}
          accessibilityLabel={label}
          accessibilityHint={error ?? helper}
        />
        {loading ? (
          <ActivityIndicator size="small" color={colors.text} />
        ) : value ? (
          // Endereço escolhido da lista: marcado por ícone e por texto
          // acessível, não por cor.
          <View accessibilityLabel="Endereço selecionado">
            <Icon name="check" size={sizes.icon} />
          </View>
        ) : null}
      </View>

      {showSuggestions ? (
        <View style={styles.suggestions}>
          {suggestions.map((suggestion, index) => (
            <Pressable
              key={`${suggestion.latitude},${suggestion.longitude},${index}`}
              onPress={() => choose(suggestion)}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.suggestion,
                index === suggestions.length - 1 && styles.suggestionLast,
                pressed && styles.suggestionPressed,
              ]}
            >
              <Text style={typography.body} numberOfLines={2}>
                {suggestion.label}
              </Text>
              {suggestion.state ? <Text style={typography.caption}>{suggestion.state}</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      <FieldMessage
        error={searchError ?? error}
        helper={showEmpty ? 'Nenhum endereço encontrado. Tente incluir o bairro ou a cidade.' : helper}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center' },
  suggestions: {
    marginTop: spacing.xs,
    borderWidth: sizes.hairline,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  suggestion: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + spacing.xs,
    borderBottomWidth: sizes.hairline,
    borderBottomColor: colors.divider,
  },
  suggestionLast: { borderBottomWidth: 0 },
  suggestionPressed: { backgroundColor: colors.surface },
});
