import React from 'react';
import { Redirect } from 'expo-router';

import { useAuth } from '@/auth/AuthContext';
import { SplashGate } from '@/components/SplashGate';

/** Ponto de entrada: manda para a Home ou para o login, conforme a sessão. */
export default function Index() {
  const { session, initializing } = useAuth();

  if (initializing) return <SplashGate />;
  return <Redirect href={session ? '/home' : '/sign-in'} />;
}
