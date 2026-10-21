import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { fetchMatchingSettings, saveMatchingSettings } from '@/admin/matchingApi';
import { describeMatchingError } from '@/admin/matchingErrors';
import {
  formatKm,
  MAX_RADIUS_KM,
  MAX_TIME_WINDOW_MINUTES,
  MIN_RADIUS_KM,
  MIN_TIME_WINDOW_MINUTES,
  validateMatchingSettings,
  type MatchingSettings,
} from '@/admin/matchingValidation';
import { AuthScreen } from '@/components/AuthScreen';
import { Banner } from '@/components/Banner';
import { PrimaryButton } from '@/components/PrimaryButton';
import { EmptyState, ErrorState, FormSkeleton } from '@/components/StateViews';
import { TextField } from '@/components/TextField';
import { useProfile } from '@/profile/ProfileContext';
import type { FieldError } from '@/profile/profileValidation';
import { fetchSearchLimits } from '@/search/searchApi';
import { spacing } from '@/theme/tokens';

function errorFor(errors: FieldError[], field: string): string | null {
  return errors.find((error) => error.field === field)?.message ?? null;
}

/**
 * EP04 — "Regras de tolerância geográfica e de horário".
 *
 * Tela mínima do admin: dois campos e "Salvar alterações". A moderação
 * completa (painel, gestão de admins) é da EP10.
 *
 * Esconder a tela de quem não é admin é só conforto: quem decide é o banco
 * (RLS de matching_settings + checagem na RPC update_matching_settings).
 */
export default function MatchingSettingsScreen() {
  const { isAdmin, loading: profileLoading } = useProfile();

  const [radiusKm, setRadiusKm] = useState('');
  const [timeWindow, setTimeWindow] = useState('');
  const [saved, setSaved] = useState<MatchingSettings | null>(null);
  const [maxWindow, setMaxWindow] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [settings, limits] = await Promise.all([fetchMatchingSettings(), fetchSearchLimits()]);
      setSaved(settings);
      setRadiusKm(formatKm(settings.radiusKm));
      setTimeWindow(String(settings.timeWindowMinutes));
      setMaxWindow(limits.maxTimeWindowMinutes);
    } catch {
      setLoadError('Não foi possível carregar as regras da busca. Verifique sua conexão.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  async function handleSave() {
    setFormError(null);
    setSuccess(null);

    const result = validateMatchingSettings({ radiusKm, timeWindowMinutes: timeWindow });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);

    setSaving(true);
    try {
      const next = await saveMatchingSettings(result.value);
      const limits = await fetchSearchLimits();
      setSaved(next);
      setRadiusKm(formatKm(next.radiusKm));
      setTimeWindow(String(next.timeWindowMinutes));
      setMaxWindow(limits.maxTimeWindowMinutes);
      setSuccess(
        `Regras salvas. A próxima busca já usa raio de ${formatKm(next.radiusKm)} km e janela de ±${next.timeWindowMinutes} min.`,
      );
    } catch (err) {
      setFormError(describeMatchingError(err as { message?: string; hint?: string | null }));
    } finally {
      setSaving(false);
    }
  }

  const title = 'Regras da busca';

  if (profileLoading) {
    return (
      <AuthScreen title={title} back backFallback="/profile">
        <FormSkeleton fields={2} />
      </AuthScreen>
    );
  }

  if (!isAdmin) {
    return (
      <AuthScreen title={title} back backFallback="/profile">
        <EmptyState
          message="Esta tela é só para administradores do UniRota."
          actionLabel="Voltar ao perfil"
          onAction={() => router.replace('/profile')}
        />
      </AuthScreen>
    );
  }

  if (loading) {
    return (
      <AuthScreen title={title} back backFallback="/profile">
        <FormSkeleton fields={2} />
      </AuthScreen>
    );
  }

  if (loadError) {
    return (
      <AuthScreen title={title} back backFallback="/profile">
        <ErrorState message={loadError} onRetry={() => void load()} />
      </AuthScreen>
    );
  }

  const unchanged =
    saved !== null && radiusKm === formatKm(saved.radiusKm) && timeWindow === String(saved.timeWindowMinutes);

  return (
    <AuthScreen
      title={title}
      subtitle="Só aparecem para o passageiro as caronas dentro destes limites. A mudança vale na próxima busca."
      back
      backFallback="/profile"
    >
      {success ? <Banner tone="success" message={success} /> : null}
      {formError ? <Banner tone="error" message={formError} /> : null}

      <TextField
        label="Raio máximo (km)"
        value={radiusKm}
        onChangeText={(text) => {
          setRadiusKm(text);
          setSuccess(null);
          setErrors((prev) => prev.filter((e) => e.field !== 'radiusKm'));
        }}
        error={errorFor(errors, 'radiusKm')}
        helper={`Distância máxima entre a saída da carona e a do passageiro, e entre os destinos. De ${formatKm(MIN_RADIUS_KM)} a ${formatKm(MAX_RADIUS_KM)} km.`}
        keyboardType="decimal-pad"
        placeholder="Ex.: 2"
        editable={!saving}
      />

      <TextField
        label="Janela de horário (minutos)"
        value={timeWindow}
        onChangeText={(text) => {
          setTimeWindow(text);
          setSuccess(null);
          setErrors((prev) => prev.filter((e) => e.field !== 'timeWindowMinutes'));
        }}
        error={errorFor(errors, 'timeWindowMinutes')}
        helper={
          `Diferença máxima, para mais ou para menos, entre o horário pedido e a saída. De ${MIN_TIME_WINDOW_MINUTES} a ${MAX_TIME_WINDOW_MINUTES} min.` +
          (maxWindow !== null ? ` Hoje o passageiro pode ampliar até ±${maxWindow} min.` : '')
        }
        keyboardType="number-pad"
        placeholder="Ex.: 30"
        editable={!saving}
      />

      <View style={styles.action}>
        <PrimaryButton label="Salvar alterações" onPress={handleSave} loading={saving} disabled={unchanged} />
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  action: { marginTop: spacing.sm },
});
