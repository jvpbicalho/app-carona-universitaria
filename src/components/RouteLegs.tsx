import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, sizes, spacing, typography } from '@/theme/tokens';

type Leg = { label: string; detail?: string | null };

/**
 * Origem e destino de uma carona, ligados por um traço vertical.
 *
 * Substitui a seta "↓" em texto. Origem é um quadrado vazado e destino um
 * quadrado cheio — ângulos retos e traço único, como o símbolo da marca. Os
 * rótulos "Saída" e "Chegada" ficam para o leitor de tela.
 */
export function RouteLegs({
  origin,
  destination,
  originDetail,
  destinationDetail,
  numberOfLines = 1,
}: {
  origin: string;
  destination: string;
  /** Linha de apoio abaixo do endereço (ex.: distância até você). */
  originDetail?: string | null;
  destinationDetail?: string | null;
  numberOfLines?: number;
}) {
  const legs: (Leg & { kind: 'origin' | 'destination' })[] = [
    { kind: 'origin', label: origin, detail: originDetail },
    { kind: 'destination', label: destination, detail: destinationDetail },
  ];

  return (
    <View>
      {legs.map((leg, index) => (
        <View key={leg.kind} style={styles.leg}>
          <View style={styles.rail}>
            <View style={[styles.marker, leg.kind === 'destination' && styles.markerFilled]} />
            {index === 0 ? <View style={styles.line} /> : null}
          </View>
          <View
            style={[styles.text, index === 0 && styles.textFirst]}
            accessibilityLabel={`${leg.kind === 'origin' ? 'Saída' : 'Chegada'}: ${leg.label}${leg.detail ? `, ${leg.detail}` : ''}`}
          >
            <Text style={typography.body} numberOfLines={numberOfLines}>
              {leg.label}
            </Text>
            {leg.detail ? <Text style={typography.caption}>{leg.detail}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const MARKER = 10;

const styles = StyleSheet.create({
  leg: { flexDirection: 'row' },
  rail: { width: MARKER, alignItems: 'center', marginRight: spacing.sm, paddingTop: spacing.sm },
  marker: {
    width: MARKER,
    height: MARKER,
    borderWidth: sizes.borderStrong,
    borderColor: colors.text,
  },
  markerFilled: { backgroundColor: colors.text },
  line: { flex: 1, width: sizes.borderStrong, backgroundColor: colors.border, marginTop: spacing.xxs },
  text: { flex: 1 },
  textFirst: { paddingBottom: spacing.sm },
});
