import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';

import { screenLayout } from '@/components/AuthScreen';
import { RouteLegs } from '@/components/RouteLegs';
import { ScreenHeader } from '@/components/ScreenHeader';
import { EmptyState, ErrorState, SkeletonList } from '@/components/StateViews';
import { fetchMyRequests, type MyRequest } from '@/requests/requestApi';
import { describeRequest } from '@/requests/requestStatus';
import { formatDeparture } from '@/routes/routeValidation';
import { colors, radius, sizes, spacing, typography } from '@/theme/tokens';

/**
 * EP05 — "Minhas solicitações" do passageiro: cada pedido com o status.
 *
 * Lista simples, como a história pede; histórico completo é da EP09. Recarrega
 * ao ganhar foco, para refletir aceite ou recusa do motorista ao voltar.
 */
export default function MyRequestsScreen() {
  const [requests, setRequests] = useState<MyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRequests(await fetchMyRequests());
    } catch {
      setError('Não foi possível carregar suas solicitações. Verifique sua conexão.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <SafeAreaView style={screenLayout.safe} edges={['top', 'bottom']}>
      <View style={[screenLayout.column, screenLayout.fill]}>
        <View style={styles.header}>
          <ScreenHeader />
          <Text style={typography.screenTitle} accessibilityRole="header">
            Minhas solicitações
          </Text>
          <Text style={[typography.bodySecondary, styles.subtitle]}>
            Pedidos de vaga que você fez como passageiro.
          </Text>
        </View>

        {loading ? (
          <View style={styles.body}>
            <SkeletonList count={3} />
          </View>
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : requests.length === 0 ? (
          <View style={styles.body}>
            <EmptyState
              message="Você ainda não pediu vaga em nenhuma carona."
              actionLabel="Buscar carona"
              onAction={() => router.push('/search')}
            />
          </View>
        ) : (
          <FlatList
            data={requests}
            keyExtractor={(item) => item.requestId}
            contentContainerStyle={styles.body}
            renderItem={({ item }) => <RequestCard request={item} />}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function RequestCard({ request }: { request: MyRequest }) {
  const { label, detail } = describeRequest(request);
  // Destaque (Medium + borda escura) só para o que pede atenção: aceita e
  // recusada. Sem cor de status: o rótulo diz o que é.
  const strong =
    request.status === 'aceita' ||
    request.status === 'recusada' ||
    request.status === 'encerrada' ||
    request.routeStatus === 'cancelada';

  return (
    <View style={styles.card} accessibilityLabel={`${label}. ${detail}`}>
      <View style={styles.cardTop}>
        <Text style={typography.bodyStrong}>{formatDeparture(request.departureAt)}</Text>
        <Text style={[styles.badge, strong && styles.badgeStrong]}>{label}</Text>
      </View>

      <RouteLegs origin={request.originLabel} destination={request.destinationLabel} />

      <Text style={[typography.caption, styles.driver]} numberOfLines={1}>
        {[request.driverName ?? 'Motorista', request.vehicleMakeModel].filter(Boolean).join(' · ')}
      </Text>
      <Text style={[typography.body, styles.detail]}>{detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md },
  subtitle: { marginTop: spacing.xs },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
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
  badge: {
    ...typography.caption,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  badgeStrong: { ...typography.captionStrong, borderWidth: sizes.hairline, borderColor: colors.text },
  driver: { marginTop: spacing.sm },
  detail: { marginTop: spacing.xs },
});
