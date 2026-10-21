import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';

import { screenLayout } from '@/components/AuthScreen';
import { Icon } from '@/components/Icon';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ScreenHeader } from '@/components/ScreenHeader';
import { EmptyState, ErrorState, SkeletonList } from '@/components/StateViews';
import { useProfile } from '@/profile/ProfileContext';
import { fetchMyRoutes, type Route } from '@/routes/routeApi';
import { formatDeparture } from '@/routes/routeValidation';
import { RouteLegs } from '@/components/RouteLegs';
import { colors, radius, sizes, spacing, typography } from '@/theme/tokens';

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
      setError('Não foi possível carregar suas caronas. Verifique sua conexão.');
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
    <SafeAreaView style={screenLayout.safe} edges={['top', 'bottom']}>
      <View style={[screenLayout.column, screenLayout.fill]}>
        <View style={styles.header}>
          <ScreenHeader />
          <Text style={typography.screenTitle} accessibilityRole="header">
            Minhas caronas
          </Text>
          <Text style={[typography.bodySecondary, styles.subtitle]}>
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
          <View style={styles.body}>
            <EmptyState
              message="Você ainda não publicou nenhuma carona."
              actionLabel={vehicle ? 'Publicar carona' : 'Cadastrar veículo'}
              onAction={vehicle ? goToNew : () => router.push('/profile/vehicle')}
            />
          </View>
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
            <PrimaryButton label="Publicar nova carona" onPress={goToNew} />
          </View>
        ) : null}
      </View>
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

      <RouteLegs origin={route.originLabel} destination={route.destinationLabel} />

      <View style={styles.footerRow}>
        {cancelled ? (
          <Text style={[styles.badge, styles.badgeStrong]}>Cancelada</Text>
        ) : full ? (
          <Text style={[styles.badge, styles.badgeStrong]}>Lotada</Text>
        ) : (
          <Text style={styles.badge}>
            {route.seatsAvailable} de {route.seatsTotal} {route.seatsTotal === 1 ? 'vaga livre' : 'vagas livres'}
          </Text>
        )}
        <Icon name="chevron-right" size={sizes.iconSm} color={colors.iconInactive} />
      </View>

      {route.notes ? <Text style={styles.notes}>{route.notes}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  subtitle: { marginTop: spacing.xs, marginBottom: spacing.md },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: sizes.hairline,
    borderTopColor: colors.divider,
  },
  card: {
    borderWidth: sizes.hairline,
    borderColor: colors.divider,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardCancelled: { opacity: 0.6 },
  cardPressed: { backgroundColor: colors.surface },
  departure: { ...typography.bodyStrong, marginBottom: spacing.sm },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  badge: {
    ...typography.caption,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  badgeStrong: { ...typography.captionStrong },
  notes: { ...typography.caption, marginTop: spacing.sm },
});
