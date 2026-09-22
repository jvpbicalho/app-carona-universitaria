import React from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { Banner } from '@/components/Banner';
import { PrimaryButton } from '@/components/PrimaryButton';
import { EmptyState, ErrorState, SkeletonBlock } from '@/components/StateViews';
import { useProfile } from '@/profile/ProfileContext';
import { avatarPublicUrl } from '@/profile/profileApi';
import { canModifyRoute, formatDeparture } from '@/routes/routeValidation';
import { useRouteDetail } from '@/routes/useRouteDetail';
import { colors, radius, spacing, typography } from '@/theme/tokens';

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
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <SkeletonBlock height={20} width="50%" />
          <SkeletonBlock height={18} width="85%" style={{ marginTop: spacing.md }} />
          <SkeletonBlock height={18} width="70%" style={{ marginTop: spacing.sm }} />
          <SkeletonBlock height={72} style={{ marginTop: spacing.lg }} />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ErrorState message={error} onRetry={() => void reload()} />
      </SafeAreaView>
    );
  }

  if (notFound || !route) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <EmptyState
          message="Esta carona não existe ou você não tem acesso a ela."
          actionLabel="Voltar para minhas caronas"
          onAction={() => router.replace('/routes')}
        />
      </SafeAreaView>
    );
  }

  const isDriver = profile?.id === route.driverId;
  const modifiable = canModifyRoute(route);
  const cancelled = route.status === 'cancelada';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={typography.title}>Detalhe da carona</Text>

        {cancelled ? (
          <Banner
            tone="error"
            message={`Carona cancelada${route.cancellationReason ? `. Motivo: ${route.cancellationReason}` : ''}`}
          />
        ) : !modifiable.ok ? (
          <Banner tone="warning" message={modifiable.message} />
        ) : null}

        <View style={styles.card}>
          <Text style={styles.departure}>{formatDeparture(route.departureAt)}</Text>
          <Text style={styles.leg}>{route.originLabel}</Text>
          <Text style={styles.arrow}>↓</Text>
          <Text style={styles.leg}>{route.destinationLabel}</Text>
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
                  <View style={[styles.avatar, styles.avatarEmpty]} />
                )}
                <View style={styles.passengerBody}>
                  <Text style={typography.body}>{passenger.fullName ?? 'Passageiro'}</Text>
                  {passenger.courseName ? (
                    <Text style={typography.helper}>{passenger.courseName}</Text>
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
              variant="ghost"
              onPress={() => router.push({ pathname: '/routes/[id]/edit', params: { id: route.id } })}
            />
            <View style={styles.spacer} />
            <PrimaryButton
              label="Cancelar carona"
              variant="danger"
              onPress={() => router.push({ pathname: '/routes/[id]/cancel', params: { id: route.id } })}
            />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  departure: { ...typography.label, color: colors.primary, marginBottom: spacing.sm },
  leg: { ...typography.body },
  arrow: { ...typography.helper, marginVertical: 2 },
  seats: { ...typography.helper, marginTop: spacing.sm },
  notes: { ...typography.helper, marginTop: spacing.sm, fontStyle: 'italic' },
  sectionTitle: { ...typography.label, marginTop: spacing.lg, marginBottom: spacing.sm },
  emptyPassengers: { ...typography.helper },
  passenger: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface },
  avatarEmpty: { borderWidth: 1, borderColor: colors.border },
  passengerBody: { marginLeft: spacing.md, flex: 1 },
  actions: { marginTop: spacing.xl },
  spacer: { height: spacing.sm },
});
