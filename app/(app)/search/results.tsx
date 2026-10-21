import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { screenLayout } from '@/components/AuthScreen';
import { initialsOf } from '@/components/AvatarPicker';
import { Banner } from '@/components/Banner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PrimaryButton } from '@/components/PrimaryButton';
import { RouteLegs } from '@/components/RouteLegs';
import { goBack, ScreenHeader } from '@/components/ScreenHeader';
import { EmptyState, ErrorState, SkeletonList } from '@/components/StateViews';
import { TextLink } from '@/components/TextLink';
import { avatarPublicUrl } from '@/profile/profileApi';
import { requestSeat } from '@/requests/requestApi';
import { describeRequestError, REFRESH_AFTER } from '@/requests/requestErrors';
import { isActiveRequest, requestButtonLabel } from '@/requests/requestStatus';
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
import { colors, radius, sizes, spacing, typography } from '@/theme/tokens';

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
 * Fase 2 (wireframe 4.3).
 *
 * EP05 — "Solicitar vaga" fica no próprio cartão (contorno: são vários
 * cartões, e o manual reserva o preto cheio para uma ação por tela). A
 * confirmação é um diálogo que funciona na web e no celular. Depois de pedir,
 * o botão vira "Solicitação pendente" e fica desabilitado.
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

  const [confirming, setConfirming] = useState<RideResult | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

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

  async function confirmRequest() {
    const ride = confirming;
    if (!ride) return;
    setConfirming(null);
    setRequesting(true);
    setFeedback(null);
    try {
      const status = await requestSeat(ride.routeId);
      setRides((prev) => prev.map((r) => (r.routeId === ride.routeId ? { ...r, myRequestStatus: status } : r)));
      setFeedback({
        tone: 'success',
        message: 'Solicitação enviada. A vaga só fica sua quando o motorista aceitar.',
      });
    } catch (err) {
      const dbError = err as { message?: string; hint?: string | null };
      setFeedback({ tone: 'error', message: describeRequestError(dbError) });
      // Sem vaga, cancelada ou partida: a lista mudou; busca de novo.
      if (dbError.hint && REFRESH_AFTER.has(dbError.hint)) void run(windowMinutes);
      if (dbError.hint === 'already_requested') {
        setRides((prev) => prev.map((r) => (r.routeId === ride.routeId ? { ...r, myRequestStatus: 'pendente' } : r)));
      }
    } finally {
      setRequesting(false);
    }
  }

  if (invalid) {
    return (
      <SafeAreaView style={screenLayout.safe} edges={['top', 'bottom']}>
        <View style={[screenLayout.column, styles.header]}>
          <ScreenHeader fallback="/search" />
          <EmptyState
            message="Não entendemos essa busca. Informe origem, destino e horário de novo."
            actionLabel="Fazer nova busca"
            onAction={() => router.replace('/search')}
          />
        </View>
      </SafeAreaView>
    );
  }

  const widerWindow = limits && windowMinutes !== null ? widenedWindowMinutes(windowMinutes, limits) : null;
  const countLabel = `${rides.length} ${rides.length === 1 ? 'carona' : 'caronas'}`;

  return (
    <SafeAreaView style={screenLayout.safe} edges={['top', 'bottom']}>
      <View style={[screenLayout.column, screenLayout.fill]}>
        <View style={styles.header}>
          <ScreenHeader fallback="/search" />
          <Text style={typography.screenTitle} accessibilityRole="header">
            {loading ? 'Buscando caronas' : countLabel}
          </Text>
          <Text style={[typography.bodySecondary, styles.subtitle]} numberOfLines={2}>
            De {origin.label} para {destination.label}
          </Text>
          <Text style={typography.caption}>
            {formatDeparture(desiredAt)}
            {windowMinutes !== null ? ` · de ${formatWindowRange(desiredAt, windowMinutes)}` : ''}
            {limits ? ` · até ${String(limits.radiusKm).replace('.', ',')} km` : ''}
          </Text>
          {!loading && rides.length > 1 ? (
            <Text style={styles.orderHint}>Mais perto e mais no horário aparecem primeiro.</Text>
          ) : null}
          {feedback ? (
            <View style={styles.feedback}>
              <Banner tone={feedback.tone} message={feedback.message} />
              {feedback.tone === 'success' ? (
                <TextLink label="Ver minhas solicitações" onPress={() => router.push('/requests')} />
              ) : null}
            </View>
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
          <View style={styles.body}>
            <EmptyState
              message={
                widerWindow
                  ? 'Nenhuma carona encontrada nesse horário. Amplie o intervalo ou altere a busca.'
                  : 'Nenhuma carona encontrada, mesmo com o intervalo máximo. Tente outro horário ou outro trajeto.'
              }
              actionLabel={widerWindow ? `Ampliar para ${formatWindowRange(desiredAt, widerWindow)}` : undefined}
              onAction={widerWindow ? () => void run(widerWindow) : undefined}
            />
            <View style={styles.secondaryAction}>
              <PrimaryButton
                label="Alterar busca"
                variant={widerWindow ? 'outline' : 'primary'}
                onPress={() => goBack('/search')}
              />
            </View>
          </View>
        ) : (
          <FlatList
            data={rides}
            keyExtractor={(item) => item.routeId}
            contentContainerStyle={styles.body}
            renderItem={({ item }) => (
              <RideCard ride={item} busy={requesting} onRequest={() => setConfirming(item)} />
            )}
          />
        )}
      </View>

      <ConfirmDialog
        visible={confirming !== null}
        title="Solicitar vaga?"
        message={
          confirming
            ? `${formatDeparture(confirming.departureAt)}, com ${confirming.driverName ?? 'o motorista'}. ` +
              'O motorista precisa aceitar; até lá, a vaga não fica reservada.'
            : undefined
        }
        actions={[{ label: 'Solicitar vaga', onPress: () => void confirmRequest(), variant: 'primary' }]}
        onDismiss={() => setConfirming(null)}
      />
    </SafeAreaView>
  );
}

function RideCard({ ride, busy, onRequest }: { ride: RideResult; busy: boolean; onRequest: () => void }) {
  // Pedido ativo ou recusado: o botão vira o estado, desabilitado.
  const alreadyAsked = isActiveRequest(ride.myRequestStatus) || ride.myRequestStatus === 'recusada';
  const photo = avatarPublicUrl(ride.driverAvatarUrl);
  const seatsLabel = `${ride.seatsAvailable} ${ride.seatsAvailable === 1 ? 'vaga' : 'vagas'}`;

  return (
    <View style={styles.card} accessibilityRole="summary">
      <View style={styles.cardTop}>
        <Text style={styles.departure}>{formatDeparture(ride.departureAt)}</Text>
        <Text style={styles.badge}>{formatTimeDifference(ride.timeDifferenceMinutes)}</Text>
      </View>

      <RouteLegs
        origin={ride.originLabel}
        destination={ride.destinationLabel}
        originDetail={
          ride.originDistanceKm < 0.05
            ? 'Sai do mesmo ponto que você'
            : `Sai a ${formatDistance(ride.originDistanceKm)} de onde você sai`
        }
        destinationDetail={
          ride.destinationDistanceKm < 0.05
            ? 'Chega ao seu destino'
            : `Chega a ${formatDistance(ride.destinationDistanceKm)} do seu destino`
        }
      />

      <View style={styles.footer}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.avatar} accessibilityIgnoresInvertColors />
        ) : (
          <View style={[styles.avatar, styles.avatarEmpty]}>
            <Text style={typography.captionStrong}>{initialsOf(ride.driverName)}</Text>
          </View>
        )}
        <View style={styles.driver}>
          <Text style={typography.body} numberOfLines={1}>
            {ride.driverName ?? 'Motorista'}
          </Text>
          <Text style={typography.caption} numberOfLines={1}>
            {[ride.vehicleMakeModel, ride.vehicleColor?.toLowerCase()].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Text style={styles.seats}>{seatsLabel}</Text>
      </View>

      {ride.notes ? <Text style={styles.notes}>{ride.notes}</Text> : null}

      <View style={styles.cardAction}>
        <PrimaryButton
          label={requestButtonLabel(ride.myRequestStatus)}
          variant="outline"
          onPress={onRequest}
          disabled={alreadyAsked || busy}
          accessibilityHint={alreadyAsked ? undefined : 'Abre a confirmação do pedido de vaga'}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md },
  subtitle: { marginTop: spacing.xs },
  orderHint: { ...typography.caption, marginTop: spacing.sm },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  secondaryAction: { marginTop: spacing.md },
  feedback: { marginTop: spacing.md },
  cardAction: { marginTop: spacing.md },
  card: {
    borderWidth: sizes.hairline,
    borderColor: colors.divider,
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
  departure: { ...typography.sectionTitle },
  badge: {
    ...typography.caption,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: sizes.hairline,
    borderTopColor: colors.divider,
  },
  avatar: {
    width: sizes.avatarSm,
    height: sizes.avatarSm,
    borderRadius: sizes.avatarSm / 2,
    backgroundColor: colors.surface,
  },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  driver: { flex: 1, marginLeft: spacing.sm },
  seats: { ...typography.bodyStrong },
  notes: { ...typography.caption, marginTop: spacing.sm },
});
