import React from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { screenLayout } from '@/components/AuthScreen';
import { initialsOf } from '@/components/AvatarPicker';
import { Banner } from '@/components/Banner';
import { PrimaryButton } from '@/components/PrimaryButton';
import { RouteLegs } from '@/components/RouteLegs';
import { ScreenHeader } from '@/components/ScreenHeader';
import { EmptyState, ErrorState, SkeletonBlock } from '@/components/StateViews';
import { useProfile } from '@/profile/ProfileContext';
import { avatarPublicUrl } from '@/profile/profileApi';
import { canModifyRoute, formatDeparture } from '@/routes/routeValidation';
import { useRouteDetail } from '@/routes/useRouteDetail';
import { colors, radius, sizes, spacing, typography } from '@/theme/tokens';

/**
 * Wireframe 3.4 — "Detalhe da carona" (lado motorista).
 *
 * Lista os passageiros confirmados — os mesmos que serão avisados se a carona
 * for editada ou cancelada — e dá acesso às duas ações. Contato do passageiro
 * não aparece aqui ainda: o wireframe o libera só após confirmação, e quem
 * confirma é o EP05.
 */
export default function RouteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useProfile();
  const { route, passengers, loading, error, notFound, reload } = useRouteDetail(id);

  if (loading) {
    return (
      <SafeAreaView style={screenLayout.safe} edges={['top', 'bottom']}>
        <View style={[screenLayout.column, styles.content]}>
          <ScreenHeader fallback="/routes" />
          <SkeletonBlock height={34} width="60%" />
          <SkeletonBlock height={18} width="85%" style={{ marginTop: spacing.md }} />
          <SkeletonBlock height={18} width="70%" style={{ marginTop: spacing.sm }} />
          <SkeletonBlock height={72} style={{ marginTop: spacing.lg }} />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={screenLayout.safe} edges={['top', 'bottom']}>
        <View style={[screenLayout.column, styles.content]}>
          <ScreenHeader fallback="/routes" />
          <ErrorState message={error} onRetry={() => void reload()} />
        </View>
      </SafeAreaView>
    );
  }

  if (notFound || !route) {
    return (
      <SafeAreaView style={screenLayout.safe} edges={['top', 'bottom']}>
        <View style={[screenLayout.column, styles.content]}>
          <EmptyState
            message="Não encontramos esta carona. Ela pode ter sido removida, ou você não tem acesso a ela."
            actionLabel="Ver minhas caronas"
            onAction={() => router.replace('/routes')}
          />
        </View>
      </SafeAreaView>
    );
  }

  const isDriver = profile?.id === route.driverId;
  const modifiable = canModifyRoute(route);
  const cancelled = route.status === 'cancelada';

  return (
    <SafeAreaView style={screenLayout.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={[screenLayout.column, styles.content]} showsVerticalScrollIndicator={false}>
        <ScreenHeader fallback="/routes" />
        <Text style={[typography.screenTitle, styles.title]} accessibilityRole="header">
          Detalhe da carona
        </Text>

        {cancelled ? (
          <Banner
            tone="error"
            message={`Esta carona foi cancelada${route.cancellationReason ? `. Motivo: ${route.cancellationReason}` : '.'}`}
          />
        ) : !modifiable.ok ? (
          <Banner tone="warning" message={modifiable.message} />
        ) : null}

        <View style={styles.card}>
          <Text style={styles.departure}>{formatDeparture(route.departureAt)}</Text>
          <RouteLegs origin={route.originLabel} destination={route.destinationLabel} numberOfLines={3} />
          <Text style={styles.seats}>
            {route.seatsTaken} de {route.seatsTotal}{' '}
            {route.seatsTotal === 1 ? 'vaga ocupada' : 'vagas ocupadas'}
          </Text>
          {route.notes ? <Text style={styles.notes}>{route.notes}</Text> : null}
        </View>

        <Text style={styles.sectionTitle}>Passageiros confirmados ({passengers.length})</Text>

        {passengers.length === 0 ? (
          <Text style={styles.emptyPassengers}>
            Nenhum passageiro confirmado ainda. Quando alguém tiver a vaga aceita, aparece aqui — e é
            avisado se você alterar ou cancelar a carona.
          </Text>
        ) : (
          passengers.map((passenger) => {
            const photo = avatarPublicUrl(passenger.avatarUrl);
            return (
              <View key={passenger.requestId} style={styles.passenger}>
                {photo ? (
                  <Image source={{ uri: photo }} style={styles.avatar} accessibilityIgnoresInvertColors />
                ) : (
                  <View style={[styles.avatar, styles.avatarEmpty]}>
                    <Text style={typography.captionStrong}>{initialsOf(passenger.fullName)}</Text>
                  </View>
                )}
                <View style={styles.passengerBody}>
                  <Text style={typography.body}>{passenger.fullName ?? 'Passageiro'}</Text>
                  {passenger.courseName ? (
                    <Text style={typography.caption}>{passenger.courseName}</Text>
                  ) : null}
                </View>
              </View>
            );
          })
        )}

        {/* Ações só para o motorista, e só enquanto a carona pode mudar. O banco
            barra de qualquer jeito; esconder evita oferecer o que vai falhar. */}
        {isDriver && modifiable.ok ? (
          <View style={styles.actions}>
            <PrimaryButton
              label="Editar carona"
              variant="outline"
              onPress={() => router.push({ pathname: '/routes/[id]/edit', params: { id: route.id } })}
            />
            <View style={styles.spacer} />
            <PrimaryButton
              label="Cancelar carona"
              // Contorno: aqui só abre a confirmação. O vermelho cheio fica
              // para a tela que de fato cancela.
              variant="dangerOutline"
              onPress={() => router.push({ pathname: '/routes/[id]/cancel', params: { id: route.id } })}
            />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  title: { marginBottom: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  departure: { ...typography.sectionTitle, marginBottom: spacing.sm },
  seats: { ...typography.caption, marginTop: spacing.sm },
  notes: { ...typography.caption, marginTop: spacing.sm },
  sectionTitle: { ...typography.sectionTitle, marginTop: spacing.lg, marginBottom: spacing.sm },
  emptyPassengers: { ...typography.caption },
  passenger: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: sizes.hairline,
    borderBottomColor: colors.divider,
  },
  avatar: {
    width: sizes.avatarSm,
    height: sizes.avatarSm,
    borderRadius: sizes.avatarSm / 2,
    backgroundColor: colors.surface,
  },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  passengerBody: { marginLeft: spacing.md, flex: 1 },
  actions: { marginTop: spacing.xl },
  spacer: { height: spacing.sm },
});
