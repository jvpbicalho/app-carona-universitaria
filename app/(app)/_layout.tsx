import React from 'react';
import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/auth/AuthContext';
import { SplashGate } from '@/components/SplashGate';
import { ProfileProvider } from '@/profile/ProfileContext';

/**
 * Grupo protegido. O guard fica no layout, e não em cada tela, para que toda
 * rota adicionada aqui já nasça exigindo sessão.
 *
 * O ProfileProvider mora aqui (e não na raiz) porque perfil e veículo só fazem
 * sentido com sessão — acima daqui não há usuário para carregar.
 */
export default function AppLayout() {
  const { session, initializing } = useAuth();

  if (initializing) return <SplashGate />;
  if (!session) return <Redirect href="/sign-in" />;

  return (
    <ProfileProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </ProfileProvider>
  );
}
