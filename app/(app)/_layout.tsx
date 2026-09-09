import React from 'react';
import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/auth/AuthContext';
import { SplashGate } from '@/components/SplashGate';

/**
 * Grupo protegido. O guard fica no layout, e não em cada tela, para que toda
 * rota adicionada aqui (EP03 em diante) já nasça exigindo sessão.
 */
export default function AppLayout() {
  const { session, initializing } = useAuth();

  if (initializing) return <SplashGate />;
  if (!session) return <Redirect href="/sign-in" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
