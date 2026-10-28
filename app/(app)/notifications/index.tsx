import React, { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';

import { screenLayout } from '@/components/AuthScreen';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ScreenHeader } from '@/components/ScreenHeader';
import { EmptyState, SkeletonList } from '@/components/StateViews';
import { destinationFor, unreadLabel, type AppNotification } from '@/notifications/notificationModel';
import { useNotifications } from '@/notifications/NotificationsContext';
import { formatDeparture } from '@/routes/routeValidation';
import { colors, radius, sizes, spacing, typography } from '@/theme/tokens';

/**
 * EP06 — Avisos (wireframe 6.1): os avisos do usuário, não lidos destacados,
 * e "Marcar como lidas".
 *
 * Ao abrir, recarrega do banco: é o que traz o que chegou enquanto o usuário
 * estava offline (o Realtime não reenvia). Os que chegam com a tela aberta
 * entram sozinhos pelo contexto.
 */
export default function NotificationsScreen() {
  const { items, unread, loading, markAllRead, markRead, reload } = useNotifications();

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  function open(notification: AppNotification) {
    void markRead(notification.id);
    router.push(destinationFor(notification));
  }

  return (
    <SafeAreaView style={screenLayout.safe} edges={['top', 'bottom']}>
      <View style={[screenLayout.column, screenLayout.fill]}>
        <View style={styles.header}>
          <ScreenHeader />
          <Text style={typography.screenTitle} accessibilityRole="header">
            Avisos
          </Text>
          <Text style={[typography.bodySecondary, styles.subtitle]}>{unreadLabel(unread)}.</Text>
          {unread > 0 ? (
            <View style={styles.markAll}>
              <PrimaryButton label="Marcar como lidas" variant="outline" compact onPress={() => void markAllRead()} />
            </View>
          ) : null}
        </View>

        {loading && items.length === 0 ? (
          <View style={styles.body}>
            <SkeletonList count={3} />
          </View>
        ) : items.length === 0 ? (
          <View style={styles.body}>
            <EmptyState
              message="Nenhum aviso por enquanto. Quando um motorista responder ao seu pedido, ou alguém pedir vaga na sua carona, o aviso aparece aqui."
              actionLabel="Voltar ao início"
              actionVariant="outline"
              onAction={() => router.replace('/home')}
            />
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.body}
            renderItem={({ item }) => <NotificationRow notification={item} onPress={() => open(item)} />}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function NotificationRow({ notification, onPress }: { notification: AppNotification; onPress: () => void }) {
  const unread = notification.readAt === null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      // "Não lido" em texto: o destaque visual (peso e bolinha) não chega ao
      // leitor de tela.
      accessibilityLabel={`${unread ? 'Não lido. ' : ''}${notification.title}. ${notification.body}`}
      style={({ pressed }) => [styles.row, unread && styles.rowUnread, pressed && styles.rowPressed]}
    >
      <View style={styles.rowTop}>
        <View style={styles.titleLine}>
          {unread ? <View style={styles.dot} /> : null}
          <Text style={unread ? typography.bodyStrong : typography.body}>{notification.title}</Text>
        </View>
        {unread ? <Text style={typography.captionStrong}>Não lido</Text> : null}
      </View>
      <Text style={[typography.body, styles.message]}>{notification.body}</Text>
      <Text style={typography.caption}>{formatDeparture(notification.createdAt)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md },
  subtitle: { marginTop: spacing.xs },
  markAll: { marginTop: spacing.md },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  row: {
    borderWidth: sizes.hairline,
    borderColor: colors.divider,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  // Não lido: fundo de cartão + borda escura. Lido: só contorno claro.
  rowUnread: { backgroundColor: colors.surface, borderColor: colors.text },
  rowPressed: { opacity: 0.8 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleLine: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  dot: {
    width: sizes.dot,
    height: sizes.dot,
    borderRadius: sizes.dot / 2,
    backgroundColor: colors.text,
    marginRight: spacing.sm,
  },
  message: { marginTop: spacing.xs, marginBottom: spacing.xs },
});
