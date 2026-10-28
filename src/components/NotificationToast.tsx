import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { Icon } from '@/components/Icon';
import { TextLink } from '@/components/TextLink';
import { destinationFor } from '@/notifications/notificationModel';
import { useNotifications } from '@/notifications/NotificationsContext';
import { colors, radius, sizes, spacing, typography } from '@/theme/tokens';

/** Tempo na tela antes de sumir sozinho. O aviso continua na lista. */
const VISIBLE_MS = 8000;

/**
 * Aviso que chega ao vivo (Realtime), no topo da tela, por cima de qualquer
 * tela do app.
 *
 * Discreto e acessível: texto completo (título + mensagem), sem depender de
 * cor; o leitor de tela anuncia sozinho (live region). "Ver" leva à tela da
 * ação; "Fechar" dispensa. Some depois de alguns segundos — o aviso fica
 * guardado em Avisos.
 */
export function NotificationToast() {
  const { live, dismissLive, markRead } = useNotifications();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!live) return;
    const timer = setTimeout(dismissLive, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [live, dismissLive]);

  if (!live) return null;

  function open() {
    if (!live) return;
    void markRead(live.id);
    dismissLive();
    router.push(destinationFor(live));
  }

  return (
    <View pointerEvents="box-none" style={[styles.layer, { top: insets.top + spacing.sm }]}>
      <View
        style={styles.toast}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityLabel={`Novo aviso: ${live.title}. ${live.body}`}
        testID="notification-toast"
      >
        <View style={styles.icon}>
          <Icon name="alert" size={sizes.icon} />
        </View>
        <View style={styles.body}>
          <Text style={typography.bodyStrong}>{live.title}</Text>
          <Text style={typography.caption} numberOfLines={3}>
            {live.body}
          </Text>
          <View style={styles.actions}>
            <TextLink label="Ver" onPress={open} />
          </View>
        </View>
        <Pressable onPress={dismissLive} accessibilityRole="button" accessibilityLabel="Fechar aviso" hitSlop={12}>
          <Text style={typography.captionStrong}>Fechar</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    zIndex: 1000,
  },
  toast: {
    width: '100%',
    maxWidth: sizes.contentMaxWidth,
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.background,
    borderWidth: sizes.hairline,
    borderColor: colors.text,
    borderRadius: radius.md,
    padding: spacing.md,
    // Sombra discreta para destacar do conteúdo de baixo, sem cor.
    shadowColor: colors.text,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  icon: { marginTop: spacing.xxs, marginRight: spacing.sm },
  body: { flex: 1, marginRight: spacing.sm },
  actions: { flexDirection: 'row', marginTop: spacing.xs },
});
