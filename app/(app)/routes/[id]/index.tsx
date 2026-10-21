import React, { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { screenLayout } from '@/components/AuthScreen';
import { initialsOf } from '@/components/AvatarPicker';
import { Banner } from '@/components/Banner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PrimaryButton } from '@/components/PrimaryButton';
import { RouteLegs } from '@/components/RouteLegs';
import { ScreenHeader } from '@/components/ScreenHeader';
import { EmptyState, ErrorState, SkeletonBlock } from '@/components/StateViews';
import { useProfile } from '@/profile/ProfileContext';
import { avatarPublicUrl } from '@/profile/profileApi';
import { decideRequest, type PendingRequest } from '@/requests/requestApi';
import { describeDecisionError } from '@/requests/requestErrors';
import { canModifyRoute, formatDeparture } from '@/routes/routeValidation';
import { useRouteDetail } from '@/routes/useRouteDetail';
import { colors, radius, sizes, spacing, typography } from '@/theme/tokens';

/**
 * Wireframe 3.4 — "Detalhe da carona" (lado motorista).
 *
 * Lista os passageiros com vaga aceita — os mesmos que serão avisados se a
 * carona for editada ou cancelada — e dá acesso às duas ações.
 *
 * EP05 — "Aceitar ou recusar solicitação": as solicitações pendentes aparecem
 * aqui, com nome, foto, curso e campus do passageiro. A decisão é pela RPC
 * decide_request (transacional; revalida a vaga ao aceitar). Recusar pede
 * confirmação num diálogo que funciona na web e no celular.
 */
export default function RouteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useProfile();
  const { route, passengers, pending, loading, error, notFound, reload } = useRouteDetail(id);

  const [deciding, setDeciding] = useState<string | null>(null);
  const [refusing, setRefusing] = useState<PendingRequest | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  async function decide(request: PendingRequest, decision: 'aceita' | 'recusada') {
    setRefusing(null);
    setDeciding(request.requestId);
    setFeedback(null);
    const name = request.fullName ?? 'o passageiro';
    try {
      await decideRequest(request.requestId, decision);
      setFeedback({
        tone: 'success',
        message:
          decision === 'aceita'
            ? `Vaga de ${name} aceita. A vaga já foi descontada da carona.`
            : `Solicitação de ${name} recusada. A recusa aparece para quem pediu, que pode buscar outra carona.`,
      });
    } catch (err) {
      setFeedback({ tone: 'error', message: describeDecisionError(err as { message?: string; hint?: string | null }) });
    } finally {
      setDeciding(null);
      // Sucesso ou recusa do banco: a lista e as vagas podem ter mudado.
      void reload();
    }
  }

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

        {feedback ? <Banner tone={feedback.tone} message={feedback.message} /> : null}

        {isDriver && !cancelled ? (
          <>
            <Text style={styles.sectionTitle}>Solicitações pendentes ({pending.length})</Text>
            {pending.length === 0 ? (
              <Text style={styles.emptyPassengers}>
                Nenhuma solicitação esperando resposta. Quando um passageiro pedir vaga, ela aparece aqui.
              </Text>
            ) : (
              pending.map((request) => (
                <PendingRequestCard
                  key={request.requestId}
                  request={request}
                  busy={deciding !== null}
                  deciding={deciding === request.requestId}
                  canAccept={modifiable.ok}
                  onAccept={() => void decide(request, 'aceita')}
                  onRefuse={() => setRefusing(request)}
                />
              ))
            )}
          </>
        ) : null}

        <Text style={styles.sectionTitle}>Passageiros com vaga aceita ({passengers.length})</Text>

        {passengers.length === 0 ? (
          <Text style={styles.emptyPassengers}>
            Nenhum passageiro com vaga aceita ainda. Quem você aceitar aparece aqui — e é avisado se
            você alterar ou cancelar a carona.
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

      <ConfirmDialog
        visible={refusing !== null}
        title="Recusar solicitação?"
        message={
          refusing
            ? `A recusa aparece para ${refusing.fullName ?? 'quem pediu'}, que poderá buscar outra carona. ` +
              'Não dá para desfazer, e não será possível pedir vaga de novo nesta carona.'
            : undefined
        }
        actions={[
          {
            label: 'Recusar solicitação',
            variant: 'danger',
            onPress: () => {
              if (refusing) void decide(refusing, 'recusada');
            },
          },
        ]}
        onDismiss={() => setRefusing(null)}
      />
    </SafeAreaView>
  );
}

function PendingRequestCard({
  request,
  busy,
  deciding,
  canAccept,
  onAccept,
  onRefuse,
}: {
  request: PendingRequest;
  busy: boolean;
  deciding: boolean;
  /** Carona que já partiu não aceita mais passageiros (o banco também barra). */
  canAccept: boolean;
  onAccept: () => void;
  onRefuse: () => void;
}) {
  const photo = avatarPublicUrl(request.avatarUrl);
  const details = [request.courseName, request.campusName].filter(Boolean).join(' · ');

  return (
    <View style={styles.requestCard}>
      <View style={styles.requestPerson}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.avatarLg} accessibilityIgnoresInvertColors />
        ) : (
          <View style={[styles.avatarLg, styles.avatarEmpty]}>
            <Text style={typography.bodyStrong}>{initialsOf(request.fullName)}</Text>
          </View>
        )}
        <View style={styles.passengerBody}>
          <Text style={typography.bodyStrong}>{request.fullName ?? 'Passageiro'}</Text>
          {details ? <Text style={typography.caption}>{details}</Text> : null}
          <Text style={typography.caption}>Pediu em {formatDeparture(request.createdAt)}</Text>
        </View>
      </View>

      <View style={styles.requestActions}>
        <View style={styles.requestAction}>
          <PrimaryButton
            label="Aceitar"
            variant="outline"
            onPress={onAccept}
            loading={deciding}
            disabled={busy || !canAccept}
            accessibilityHint={`Aceita ${request.fullName ?? 'o passageiro'} e desconta uma vaga`}
          />
        </View>
        <View style={styles.requestAction}>
          <PrimaryButton
            label="Recusar"
            variant="dangerOutline"
            onPress={onRefuse}
            disabled={busy}
            accessibilityHint="Abre a confirmação da recusa"
          />
        </View>
      </View>
    </View>
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
  avatarLg: {
    width: sizes.control,
    height: sizes.control,
    borderRadius: sizes.control / 2,
    backgroundColor: colors.surface,
  },
  requestCard: {
    borderWidth: sizes.hairline,
    borderColor: colors.divider,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  requestPerson: { flexDirection: 'row', alignItems: 'center' },
  requestActions: { flexDirection: 'row', marginTop: spacing.md, gap: spacing.sm },
  requestAction: { flex: 1 },
  passengerBody: { marginLeft: spacing.md, flex: 1 },
  actions: { marginTop: spacing.xl },
  spacer: { height: spacing.sm },
});
