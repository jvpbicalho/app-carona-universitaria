import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/auth/AuthContext';
import { SplashGate } from '@/components/SplashGate';
import { colors } from '@/theme/tokens';

/**
 * Layout raiz. O AuthProvider fica acima de tudo para que os layouts de grupo
 * — (auth) e (app) — possam consultar a sessão e decidir o redirecionamento.
 *
 * Nenhuma tela é renderizada antes de a Inter carregar: sem isso, o primeiro
 * quadro sai na fonte do sistema e "pula" quando a Inter chega. Só os dois
 * pesos do manual (400 e 500) são importados — o pacote tem 18.
 *
 * Se o carregamento falhar (rede ruim na web), o app segue com as substitutas
 * do manual em vez de ficar preso na abertura.
 */
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium });

  if (!fontsLoaded && !fontError) {
    return <SplashGate />;
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
