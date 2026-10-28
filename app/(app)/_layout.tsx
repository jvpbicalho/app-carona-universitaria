import React from 'react';
import { View } from 'react-native';
import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/auth/AuthContext';
import { NotificationToast } from '@/components/NotificationToast';
import { SplashGate } from '@/components/SplashGate';
import { NotificationsProvider } from '@/notifications/NotificationsContext';
import { ProfileProvider } from '@/profile/ProfileContext';
import { screenLayout } from '@/components/AuthScreen';

/**
 * Grupo protegido. O guard fica no layout, e não em cada tela, para que toda
 * rota adicionada aqui já nasça exigindo sessão.
 *
 * O ProfileProvider mora aqui (e não na raiz) porque perfil e veículo só fazem
 * sentido com sessão — acima daqui não há usuário para carregar.
 *
 * O NotificationsProvider também (EP06): a inscrição no Realtime existe só
 * com sessão. No logout este layout desmonta, e a inscrição é cancelada. O
 * aviso ao vivo (NotificationToast) fica por cima de todas as telas.
 */
export default function AppLayout() {
  const { session, initializing } = useAuth();

  if (initializing) return <SplashGate />;
  if (!session) return <Redirect href="/sign-in" />;

  return (
    <ProfileProvider>
      <NotificationsProvider>
        <View style={screenLayout.fill}>
          <Stack screenOptions={{ headerShown: false }} />
          <NotificationToast />
        </View>
      </NotificationsProvider>
    </ProfileProvider>
  );
}
