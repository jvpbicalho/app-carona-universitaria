import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { PrimaryButton } from '@/components/PrimaryButton';
import { EmptyState, ErrorState, SkeletonList } from '@/components/StateViews';
import { avatarPublicUrl } from '@/profile/profileApi';
import { formatDeparture, type GeoPoint } from '@/routes/routeValidation';
import { fetchSearchLimits, searchRides, type RideResult } from '@/search/searchApi';
import { describeSearchError } from '@/search/searchErrors';
import {
  formatDistance,
  formatTimeDifference,
  formatWindowRange,
  widenedWindowMinutes,
  type SearchLimits,
} from '@/search/searchValidation';
import { colors, radius, spacing, typography } from '@/theme/tokens';

type Params = {
  originLabel?: string;
  originLat?: string;
  originLng?: string;
  destinationLabel?: string;
  destinationLat?: string;
  destinationLng?: string;
  desiredAt?: string;
};

function toPoint(label?: string, lat?: string, lng?: string): GeoPoint | null {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!label || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { label, latitude, longitude };
}

/**
 * Wireframe 4.2 — resultados, e 4.6 — busca sem resultado.
 *
 * A ordem vem pronta do banco (search_rides): relevância = proximidade das
 * origens e dos destinos + diferença de horário. Sem círculo de score: é
 * Fase 2 (wireframe 4.3). Tocar numa carona para ver detalhe e pedir vaga é
 * do EP05, por isso o cartão ainda não é clicável.
 */
export default function SearchResultsScreen() {
  const params = useLocalSearchParams<Params>();

  const origin = useMemo(
    () => toPoint(params.originLabel, params.originLat, params.originLng),
    [params.originLabel, params.originLat, params.originLng],
  );
  const destination = useMemo(
    () => toPoint(params.destinationLabel, params.destinationLat, params.destinationLng),
    [params.destinationLabel, params.destinationLat, params.destinationLng],
  );
  const desiredAt = useMemo(() => {
    const date = params.desiredAt ? new Date(params.desiredAt) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
  }, [params.desiredAt]);

  const [limits, setLimits] = useState<SearchLimits | null>(null);
  const [windowMinutes, setWindowMinutes] = useState<number | null>(null);
  const [rides, setRides] = useState<RideResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const invalid = !origin || !destination || !desiredAt;

  const run = useCallback(
    async (requestedWindow: number | null) => {
      if (!origin || !destination || !desiredAt) return;
      setLoading(true);
      setError(null);
      try {
        const currentLimits = limits ?? (await fetchSearchLimits());
        setLimits(currentLimits);
        const window = requestedWindow ?? currentLimits.timeWindowMinutes;
        setWindowMinutes(window);
        setRides(await searchRides({ origin, destination, desiredAt, timeWindowMinutes: window }));
      } catch (err) {
        setError(describeSearchError(err as { message?: string; hint?: string | null }));
      } finally {
        setLoading(false);
      }
    },
    [origin, destination, desiredAt, limits],
  );

  // Busca uma vez ao abrir. `run` depende de `limits`, que muda após a
  // primeira chamada — sem o guarda, a busca rodaria de novo sozinha.
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (started || invalid) return;
    setStarted(true);
    void run(null);
  }, [started, invalid, run]);

  if (invalid) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <EmptyState
          message="Não entendemos essa busca. Informe origem, destino e horário de novo."
          actionLabel="Nova busca"
          onAction={() => router.replace('/search')}
        />
      </SafeAreaView>
    );
  }

  const widerWindow = limits && windowMinutes !== null ? widenedWindowMinutes(windowMinutes, limits) : null;
  const countLabel = `${rides.length} ${rides.length === 1 ? 'carona' : 'caronas'}`;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={typography.title}>{loading ? 'Buscando…' : countLabel}</Text>
        <Text style={[typography.subtitle, styles.subtitle]} numberOfLines={2}>
          {origin.label} → {destination.label}
        </Text>
        <Text style={typography.helper}>
          {formatDeparture(desiredAt)}
          {windowMinutes !== null ? ` · de ${formatWindowRange(desiredAt, windowMinutes)}` : ''}
          {limits ? ` · até ${String(limits.radiusKm).replace('.', ',')} km` : ''}
        </Text>
        {!loading && rides.length > 1 ? (
          <Text style={styles.orderHint}>ordenadas por relevância: mais perto e mais no horário primeiro</Text>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.body}>
          <SkeletonList count={3} />
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={() => void run(windowMinutes)} />
      ) : rides.length === 0 ? (
        // Wireframe 4.6: estado vazio sempre com saída.
        <View>
          <EmptyState
            message="Nenhuma carona encontrada nesse horário."
            actionLabel={widerWindow ? `Ampliar para ${formatWindowRange(desiredAt, widerWindow)}` : undefined}
            onAction={widerWindow ? () => void run(widerWindow) : undefined}
          />
          <View style={styles.secondaryAction}>
            <PrimaryButton label="Alterar busca" variant="ghost" onPress={() => router.back()} />
          </View>
        </View>
      ) : (
        <FlatList
          data={rides}
          keyExtractor={(item) => item.routeId}
          contentContainerStyle={styles.body}
          renderItem={({ item }) => <RideCard ride={item} />}
        />
      )}
    </SafeAreaView>
  );
}

function RideCard({ ride }: { ride: RideResult }) {
  const photo = avatarPublicUrl(ride.driverAvatarUrl);
  const seatsLabel = `${ride.seatsAvailable} ${ride.seatsAvailable === 1 ? 'vaga' : 'vagas'}`;

  return (
    <View style={styles.card} accessibilityRole="summary">
      <View style={styles.cardTop}>
        <Text style={styles.departure}>{formatDeparture(ride.departureAt)}</Text>
        <Text style={styles.badge}>{formatTimeDifference(ride.timeDifferenceMinutes)}</Text>
      </View>

      <Text style={styles.leg} numberOfLines={1}>
        {ride.originLabel}
      </Text>
      <Text style={styles.distance}>
        {ride.originDistanceKm < 0.05
          ? 'sai do mesmo ponto que você'
          : `sai a ${formatDistance(ride.originDistanceKm)} de onde você sai`}
      </Text>
      <Text style={styles.leg} numberOfLines={1}>
        {ride.destinationLabel}
      </Text>
      <Text style={styles.distance}>
        {ride.destinationDistanceKm < 0.05
          ? 'chega ao seu destino'
          : `chega a ${formatDistance(ride.destinationDistanceKm)} do seu destino`}
      </Text>

      <View style={styles.footer}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.avatar} accessibilityIgnoresInvertColors />
        ) : (
          <View style={[styles.avatar, styles.avatarEmpty]} />
        )}
        <View style={styles.driver}>
          <Text style={typography.body} numberOfLines={1}>
            {ride.driverName ?? 'Motorista'}
          </Text>
          <Text style={typography.helper} numberOfLines={1}>
            {[ride.vehicleMakeModel, ride.vehicleColor?.toLowerCase()].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Text style={styles.seats}>{seatsLabel}</Text>
      </View>

      {ride.notes ? <Text style={styles.notes}>{ride.notes}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md },
  subtitle: { marginTop: spacing.xs },
  orderHint: { ...typography.helper, marginTop: spacing.sm, fontStyle: 'italic' },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  secondaryAction: { paddingHorizontal: spacing.lg },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  departure: { ...typography.label, color: colors.primary },
  badge: {
    ...typography.helper,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  leg: { ...typography.body },
  distance: { ...typography.helper, marginBottom: spacing.xs },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.surface,
  },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface },
  avatarEmpty: { borderWidth: 1, borderColor: colors.border },
  driver: { flex: 1, marginLeft: spacing.sm },
  seats: { ...typography.label, color: colors.success },
  notes: { ...typography.helper, marginTop: spacing.sm, fontStyle: 'italic' },
});
