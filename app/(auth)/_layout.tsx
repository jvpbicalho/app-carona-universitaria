import React from 'react';
import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/auth/AuthContext';
import { SplashGate } from '@/components/SplashGate';

/**
 * Grupo público. Quem já tem sessão não deveria ver login/cadastro — inclusive
 * quando volta ao app pelo link de confirmação de e-mail.
 */
export default function AuthLayout() {
  const { session, initializing } = useAuth();

  if (initializing) return <SplashGate />;
  if (session) return <Redirect href="/home" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
