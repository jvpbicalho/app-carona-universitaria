import React from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { colors } from '@/theme/tokens';

/**
 * Abertura do app: enquanto a Inter carrega e o SDK lê a sessão salva.
 *
 * Manual, seção 06: splash é "versão vertical centralizada sobre preto, sem
 * nenhum outro elemento" — por isso não há spinner. O lockup vertical entra
 * aqui quando os arquivos da pasta `logo` existirem no repositório.
 *
 * É só para a abertura. Carregamento DENTRO do app usa esqueleto
 * (ScreenSkeleton), não esta tela: um flash preto no meio da navegação seria
 * pior que o carregamento.
 */
export function SplashGate() {
  return (
    <View style={styles.container} accessibilityLabel="Abrindo o UniRota">
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.splash },
});
