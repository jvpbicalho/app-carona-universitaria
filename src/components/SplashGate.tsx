import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors } from '@/theme/tokens';

/**
 * Tela neutra exibida enquanto o SDK lê a sessão persistida do SecureStore.
 * Sem isto, o app pisca a tela de login por um instante para quem já está
 * autenticado.
 */
export function SplashGate() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
