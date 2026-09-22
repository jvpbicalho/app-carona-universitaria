import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';

import { PrimaryButton } from '@/components/PrimaryButton';
import { EmptyState, ErrorState, SkeletonList } from '@/components/StateViews';
import { useProfile } from '@/profile/ProfileContext';
import { fetchMyRoutes, type Route } from '@/routes/routeApi';
import { formatDeparture } from '@/routes/routeValidation';
import { colors, radius, spacing, typography } from '@/theme/tokens';

/**
 * Wireframe 3.3 — "Minhas caronas" (lado motorista).
 *
 * Destino do "Publicar carona": sem esta tela a rota publicada sumiria de
 * vista. Tocar num cartão abre o detalhe (3.4), de onde se edita ou cancela.
 */
export default function MyRoutesScreen() {
  const { profile, vehicle } = useProfile();

  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setError(null);
    try {
      setRoutes(await fetchMyRoutes(profile.id));
    } catch {
      setError('Não foi possível carregar suas caronas.');
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    void load();
  }, [load]);

  // Recarrega ao voltar de "Nova carona", para a recém-publicada aparecer.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function goToNew() {
    router.push('/routes/new');
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={typography.title}>Minhas caronas</Text>
        <Text style={[typography.subtitle, styles.subtitle]}>
          Viagens que você publicou como motorista.
        </Text>
      </View>

      {loading ? (
        <View style={styles.body}>
          <SkeletonList count={3} />
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : routes.length === 0 ? (
        <EmptyState
          message="Você ainda não publicou nenhuma carona."
          actionLabel={vehicle ? 'Publicar carona' : 'Cadastrar veículo'}
          onAction={vehicle ? goToNew : () => router.push('/profile/vehicle')}
        />
      ) : (
        <FlatList
          data={routes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.body}
          renderItem={({ item }) => <RouteCard route={item} />}
        />
      )}

      {routes.length > 0 ? (
        <View style={styles.footer}>
          <PrimaryButton label="+ Nova carona" onPress={goToNew} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function RouteCard({ route }: { route: Route }) {
  const full = route.seatsAvailable === 0;
  const cancelled = route.status === 'cancelada';

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/routes/[id]', params: { id: route.id } })}
      accessibilityRole="button"
      accessibilityHint="Abre o detalhe da carona"
      style={({ pressed }) => [styles.card, cancelled && styles.cardCancelled, pressed && styles.cardPressed]}
    >
      <Text style={styles.departure}>{formatDeparture(route.departureAt)}</Text>

      <Text style={styles.leg} numberOfLines={1}>
        {route.originLabel}
      </Text>
      <Text style={styles.arrow}>↓</Text>
      <Text style={styles.leg} numberOfLines={1}>
        {route.destinationLabel}
      </Text>

      <View style={styles.badges}>
        {cancelled ? (
          <Text style={[styles.badge, styles.badgeCancelled]}>cancelada</Text>
        ) : full ? (
          <Text style={[styles.badge, styles.badgeFull]}>lotada</Text>
        ) : (
          <Text style={styles.badge}>
            {route.seatsAvailable} de {route.seatsTotal} {route.seatsTotal === 1 ? 'vaga' : 'vagas'}
          </Text>
        )}
      </View>

      {route.notes ? <Text style={styles.notes}>{route.notes}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  subtitle: { marginTop: spacing.xs, marginBottom: spacing.md },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.surface,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardCancelled: { opacity: 0.6 },
  cardPressed: { backgroundColor: colors.surface },
  departure: { ...typography.label, color: colors.primary, marginBottom: spacing.sm },
  leg: { ...typography.body },
  arrow: { ...typography.helper, marginVertical: 2 },
  badges: { flexDirection: 'row', marginTop: spacing.sm },
  badge: {
    ...typography.helper,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  badgeFull: { backgroundColor: colors.warningSurface, color: colors.warning, fontWeight: '700' },
  badgeCancelled: { backgroundColor: colors.dangerSurface, color: colors.danger, fontWeight: '700' },
  notes: { ...typography.helper, marginTop: spacing.sm, fontStyle: 'italic' },
});
