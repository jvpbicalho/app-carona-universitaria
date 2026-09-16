import React from 'react';
import { router } from 'expo-router';

import { AuthScreen } from '@/components/AuthScreen';
import { SplashGate } from '@/components/SplashGate';
import { ErrorState } from '@/components/StateViews';
import { useProfile } from '@/profile/ProfileContext';
import { ProfileForm } from '@/profile/ProfileForm';

/**
 * Wireframe 2.1 — "Completar perfil".
 *
 * Aparece uma vez, logo após a verificação de e-mail. Reaproveita AuthScreen
 * porque é o mesmo formato de tela de formulário em passo único.
 */
export default function CompleteProfileScreen() {
  const { profile, loading, error, reload } = useProfile();

  if (loading) return <SplashGate />;

  if (error || !profile) {
    return (
      <AuthScreen title="Completar perfil">
        <ErrorState
          message={error ?? 'Não foi possível carregar seu perfil.'}
          onRetry={() => void reload()}
        />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title="Completar perfil"
      subtitle="Quem oferece e quem pega carona precisa saber com quem está viajando."
    >
      <ProfileForm
        profile={profile}
        mode="onboarding"
        onSaved={async () => {
          await reload();
          router.replace('/home');
        }}
      />
    </AuthScreen>
  );
}
