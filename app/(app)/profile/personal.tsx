import React from 'react';
import { router } from 'expo-router';

import { AuthScreen } from '@/components/AuthScreen';
import { ErrorState, FormSkeleton } from '@/components/StateViews';
import { useProfile } from '@/profile/ProfileContext';
import { ProfileForm } from '@/profile/ProfileForm';

/** "Dados pessoais" do wireframe 2.2 — mesmo formulário do onboarding. */
export default function PersonalDataScreen() {
  const { profile, loading, error, reload } = useProfile();

  if (loading) {
    return (
      <AuthScreen title="Dados pessoais" back backFallback="/profile">
        <FormSkeleton fields={4} />
      </AuthScreen>
    );
  }

  if (error || !profile) {
    return (
      <AuthScreen title="Dados pessoais" back backFallback="/profile">
        <ErrorState
          message={error ?? 'Não foi possível carregar seu perfil.'}
          onRetry={() => void reload()}
        />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title="Dados pessoais"
      subtitle="Essas informações ficam visíveis para quem viaja com você."
      back
      backFallback="/profile"
    >
      <ProfileForm
        profile={profile}
        mode="edit"
        onSaved={async () => {
          await reload();
          router.back();
        }}
      />
    </AuthScreen>
  );
}
