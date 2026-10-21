import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';

import { Icon } from '@/components/Icon';
import { sizes, spacing, typography } from '@/theme/tokens';

/**
 * Volta uma tela; se não houver para onde voltar (na web, depois de recarregar
 * a página ou abrir um link direto), vai para `fallback`.
 */
export function goBack(fallback: Href = '/home') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

/**
 * Barra de "Voltar" das telas internas.
 *
 * Antes não havia nenhuma: todos os layouts escondem o cabeçalho, e na web a
 * única saída era o botão do navegador. O título da tela continua no corpo,
 * em "Título de tela" (28 px), como no manual — aqui fica só a navegação.
 */
export function ScreenHeader({ fallback = '/home', onBack }: { fallback?: Href; onBack?: () => void }) {
  return (
    <View style={styles.bar}>
      <Pressable
        onPress={onBack ?? (() => goBack(fallback))}
        accessibilityRole="button"
        accessibilityLabel="Voltar"
        hitSlop={8}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Icon name="chevron-left" size={sizes.iconSm} />
        <Text style={styles.label}>Voltar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', marginBottom: spacing.md },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: sizes.controlCompact,
    paddingRight: spacing.sm,
  },
  pressed: { opacity: 0.6 },
  label: { ...typography.bodyStrong, marginLeft: spacing.xs },
});
