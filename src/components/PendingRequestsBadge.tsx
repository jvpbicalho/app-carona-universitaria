import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Icon } from '@/components/Icon';
import {
  pendingBadgeDestination,
  pendingBadgeLabel,
  shouldShowPendingBadge,
  type PendingSummary,
} from '@/requests/pendingBadge';
import { colors, radius, sizes, spacing, typography } from '@/theme/tokens';

/**
 * Badge de solicitações pendentes do motorista, na tela inicial (EP06).
 *
 * Some quando é zero (e, portanto, para quem não tem rotas). O número vai
 * junto do texto ("3 solicitações pendentes"), e o rótulo acessível diz o
 * mesmo — nada depende de cor. Tocar leva às pendentes.
 */
export function PendingRequestsBadge({ summary }: { summary: PendingSummary }) {
  if (!shouldShowPendingBadge(summary)) return null;

  const label = pendingBadgeLabel(summary.pendingCount);

  return (
    <Pressable
      onPress={() => router.push(pendingBadgeDestination(summary))}
      accessibilityRole="button"
      accessibilityLabel={`${label}. Toque para responder.`}
      testID="pending-requests-badge"
      style={({ pressed }) => [styles.badge, pressed && styles.pressed]}
    >
      <View style={styles.count}>
        <Text style={styles.countText}>{summary.pendingCount > 99 ? '99+' : summary.pendingCount}</Text>
      </View>
      <View style={styles.body}>
        <Text style={typography.bodyStrong}>{label}</Text>
        <Text style={typography.caption}>Responda para o passageiro saber se tem vaga.</Text>
      </View>
      <Icon name="chevron-right" size={sizes.iconSm} color={colors.iconInactive} />
    </Pressable>
  );
}

const COUNT_SIZE = 32;

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: sizes.hairline,
    borderColor: colors.text,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.background,
  },
  pressed: { backgroundColor: colors.surface },
  count: {
    minWidth: COUNT_SIZE,
    height: COUNT_SIZE,
    borderRadius: COUNT_SIZE / 2,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  countText: { ...typography.bodyStrong, color: colors.onPrimary },
  body: { flex: 1, marginRight: spacing.sm },
});
