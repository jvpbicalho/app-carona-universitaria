import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { AuthScreen } from '@/components/AuthScreen';
import { Banner } from '@/components/Banner';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Select } from '@/components/Select';
import { SplashGate } from '@/components/SplashGate';
import { ErrorState } from '@/components/StateViews';
import { TextField } from '@/components/TextField';
import type { FieldError } from '@/profile/profileValidation';
import { cancelRoute, describeRouteError } from '@/routes/routeApi';
import {
  CANCELLATION_REASONS,
  cancellationReasonText,
  canModifyRoute,
  formatDeparture,
  FORM_FIELD,
  MAX_OTHER_REASON_LENGTH,
  validateCancellation,
  type CancellationReasonCode,
} from '@/routes/routeValidation';
import { affectedPassengersText, useRouteDetail } from '@/routes/useRouteDetail';
import { spacing, typography } from '@/theme/tokens';

function errorFor(errors: FieldError[], field: string): string | null {
  return errors.find((error) => error.field === field)?.message ?? null;
}

/**
 * Wireframe 3.5 — "Cancelar esta carona?".
 *
 * O motivo é obrigatório porque vai no aviso ao passageiro (6.1). Cancelar não
 * apaga a rota: o status vira 'cancelada' e a linha fica, com motivo e
 * instante, como histórico do motorista e dos passageiros.
 */
export default function CancelRouteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { route, passengers, loading, error, notFound, reload } = useRouteDetail(id);

  const [reason, setReason] = useState<CancellationReasonCode | null>(null);
  const [otherText, setOtherText] = useState('');
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    if (!route) return;
    setFormError(null);

    // Validação antes da rede: motivo presente e carona ainda cancelável.
    const validationErrors = validateCancellation(route, reason, otherText, new Date());
    if (validationErrors.length > 0 || !reason) {
      setErrors(validationErrors);
      return;
    }
    setErrors([]);

    setSaving(true);
    try {
      await cancelRoute(route.id, cancellationReasonText(reason, otherText));
      // Volta ao detalhe, que recarrega no foco e mostra o estado "cancelada".
      router.back();
    } catch (err) {
      setFormError(
        describeRouteError(
          err as { message?: string; hint?: string | null },
          'Não foi possível cancelar a carona. Tente novamente.',
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <SplashGate />;

  if (error) {
    return (
      <AuthScreen title="Cancelar carona">
        <ErrorState message={error} onRetry={() => void reload()} />
      </AuthScreen>
    );
  }

  if (notFound || !route) {
    return (
      <AuthScreen title="Cancelar carona">
        <Banner tone="error" message="Esta carona não existe ou você não tem acesso a ela." />
        <PrimaryButton label="Voltar" variant="ghost" onPress={() => router.back()} />
      </AuthScreen>
    );
  }

  const modifiable = canModifyRoute(route);
  if (!modifiable.ok) {
    return (
      <AuthScreen title="Cancelar carona">
        <Banner tone="warning" message={modifiable.message} />
        <PrimaryButton label="Voltar" variant="ghost" onPress={() => router.back()} />
      </AuthScreen>
    );
  }

  const bannerMessage = formError ?? errorFor(errors, FORM_FIELD);

  return (
    <AuthScreen
      title="Cancelar esta carona?"
      subtitle={`${affectedPassengersText(passengers.length, 'com o motivo')} A ação não pode ser desfeita.`}
    >
      {bannerMessage ? <Banner tone="error" message={bannerMessage} /> : null}

      <View style={styles.summary}>
        <Text style={typography.label}>{formatDeparture(route.departureAt)}</Text>
        <Text style={typography.helper}>
          {route.originLabel} → {route.destinationLabel}
        </Text>
      </View>

      <Select
        label="Motivo"
        value={reason}
        options={CANCELLATION_REASONS.map((r) => ({ value: r.value, label: r.label }))}
        onChange={(value) => {
          setReason(value as CancellationReasonCode);
          setErrors([]);
        }}
        error={errorFor(errors, 'reason')}
        helper="Os passageiros confirmados recebem este motivo no aviso."
        disabled={saving}
      />

      {reason === 'outro' ? (
        <TextField
          label="Descreva o motivo"
          value={otherText}
          onChangeText={(text) => {
            setOtherText(text);
            setErrors((prev) => prev.filter((e) => e.field !== 'otherReason'));
          }}
          error={errorFor(errors, 'otherReason')}
          helper={`${otherText.length}/${MAX_OTHER_REASON_LENGTH}`}
          placeholder="ex: greve do metrô"
          maxLength={MAX_OTHER_REASON_LENGTH}
          editable={!saving}
        />
      ) : null}

      <View style={styles.actions}>
        <PrimaryButton
          label="Cancelar carona"
          variant="danger"
          onPress={handleConfirm}
          loading={saving}
        />
        <View style={styles.spacer} />
        <PrimaryButton label="Voltar" variant="ghost" onPress={() => router.back()} disabled={saving} />
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  summary: { marginBottom: spacing.lg },
  actions: { marginTop: spacing.md },
  spacer: { height: spacing.sm },
});
