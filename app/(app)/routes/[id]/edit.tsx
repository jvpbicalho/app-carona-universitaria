import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { AddressSearchField } from '@/components/AddressSearchField';
import { AuthScreen } from '@/components/AuthScreen';
import { Banner } from '@/components/Banner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DateTimeError } from '@/components/DateTimeError';
import { DateTimeField } from '@/components/DateTimeField';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ErrorState, FormSkeleton } from '@/components/StateViews';
import type { FieldError } from '@/profile/profileValidation';
import { describeRouteError, updateRoute } from '@/routes/routeApi';
import {
  canModifyRoute,
  combineDateAndTime,
  FORM_FIELD,
  validateRouteEdit,
  type GeoPoint,
} from '@/routes/routeValidation';
import { affectedPassengersText, useRouteDetail } from '@/routes/useRouteDetail';
import { spacing } from '@/theme/tokens';

function errorFor(errors: FieldError[], field: string): string | null {
  return errors.find((error) => error.field === field)?.message ?? null;
}

/**
 * "Editar carona" (wireframe 3.4). Edita origem, destino, data e horário.
 *
 * Vagas e observações não entram: a história pede estes quatro campos, e
 * mudar vagas com passageiros já confirmados exige regra do EP05 (o que fazer
 * com quem passa do novo limite).
 *
 * O aviso aos passageiros confirmados não é disparado por esta tela: o
 * trigger do banco grava o aviso na mesma transação do UPDATE.
 */
export default function EditRouteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { route, passengers, loading, error, notFound, reload } = useRouteDetail(id);

  const [origin, setOrigin] = useState<GeoPoint | null>(null);
  const [destination, setDestination] = useState<GeoPoint | null>(null);
  const [date, setDate] = useState<Date | null>(null);
  const [time, setTime] = useState<Date | null>(null);
  const [initialized, setInitialized] = useState(false);

  const [errors, setErrors] = useState<FieldError[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Pré-preenche uma vez. O hook recarrega a rota ao ganhar foco, e isso não
  // pode apagar o que o motorista já digitou.
  useEffect(() => {
    if (!route || initialized) return;
    setOrigin(route.origin);
    setDestination(route.destination);
    setDate(new Date(route.departureAt));
    setTime(new Date(route.departureAt));
    setInitialized(true);
  }, [route, initialized]);

  const departureAt = useMemo(() => {
    if (!date || !time) return null;
    return combineDateAndTime(date, time);
  }, [date, time]);

  function clearError(field: string) {
    setErrors((prev) => prev.filter((e) => e.field !== field && e.field !== FORM_FIELD));
  }

  async function save() {
    if (!route) return;
    setConfirming(false);
    setSaving(true);
    try {
      await updateRoute(route.id, { origin, destination, departureAt });
      router.back();
    } catch (err) {
      setFormError(
        describeRouteError(
          err as { message?: string; hint?: string | null },
          'Não foi possível salvar a alteração. Tente de novo.',
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit() {
    if (!route) return;
    setFormError(null);

    // Validação antes de qualquer chamada ao Supabase — incluindo a regra de
    // horário não-passado, a mesma do cadastro.
    const validationErrors = validateRouteEdit(route, { origin, destination, departureAt }, new Date());
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors([]);

    if (passengers.length === 0) {
      void save();
      return;
    }

    // Com gente confirmada, a mudança sai do controle do motorista assim que
    // salva: o aviso é imediato. Vale uma confirmação explícita — num diálogo
    // próprio, porque o do sistema não aparece na web.
    setConfirming(true);
  }

  if (loading) {
    return (
      <AuthScreen title="Editar carona" back backFallback="/routes">
        <FormSkeleton fields={3} />
      </AuthScreen>
    );
  }

  if (error) {
    return (
      <AuthScreen title="Editar carona" back backFallback="/routes">
        <ErrorState message={error} onRetry={() => void reload()} />
      </AuthScreen>
    );
  }

  if (notFound || !route) {
    return (
      <AuthScreen title="Editar carona" back backFallback="/routes">
        <Banner
          tone="error"
          message="Não encontramos esta carona. Ela pode ter sido removida, ou você não tem acesso a ela."
        />
        <PrimaryButton label="Ver minhas caronas" variant="outline" onPress={() => router.replace('/routes')} />
      </AuthScreen>
    );
  }

  const modifiable = canModifyRoute(route);
  if (!modifiable.ok) {
    return (
      <AuthScreen title="Editar carona" back backFallback="/routes">
        <Banner tone="warning" message={modifiable.message} />
        <PrimaryButton label="Voltar ao detalhe" variant="outline" onPress={() => router.back()} />
      </AuthScreen>
    );
  }

  const bannerMessage = formError ?? errorFor(errors, FORM_FIELD);

  return (
    <AuthScreen
      title="Editar carona"
      subtitle={affectedPassengersText(passengers.length, 'da mudança')}
      back
      backFallback="/routes"
    >
      {bannerMessage ? <Banner tone="error" message={bannerMessage} /> : null}

      <AddressSearchField
        label="Origem"
        value={origin}
        onChange={(point) => {
          setOrigin(point);
          clearError('origin');
        }}
        error={errorFor(errors, 'origin')}
        helper="Para trocar, apague e escolha outro endereço da lista."
      />

      <AddressSearchField
        label="Destino"
        value={destination}
        onChange={(point) => {
          setDestination(point);
          clearError('destination');
        }}
        error={errorFor(errors, 'destination')}
      />

      <View style={styles.dateTimeRow}>
        <DateTimeField
          label="Data"
          mode="date"
          value={date}
          onChange={(value) => {
            setDate(value);
            clearError('departureAt');
          }}
          minimumDate={new Date()}
          error={errorFor(errors, 'departureAt') ? ' ' : null}
        />
        <View style={styles.gap} />
        <DateTimeField
          label="Horário de saída"
          mode="time"
          value={time}
          onChange={(value) => {
            setTime(value);
            clearError('departureAt');
          }}
        />
      </View>

      <DateTimeError message={errorFor(errors, 'departureAt')} />

      <View style={styles.action}>
        <PrimaryButton label="Salvar alteração" onPress={handleSubmit} loading={saving} />
      </View>

      <ConfirmDialog
        visible={confirming}
        title="Salvar alteração?"
        message={affectedPassengersText(passengers.length, 'da mudança')}
        actions={[{ label: 'Salvar e avisar', onPress: () => void save(), variant: 'primary' }]}
        onDismiss={() => setConfirming(false)}
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  dateTimeRow: { flexDirection: 'row' },
  gap: { width: spacing.md },
  action: { marginTop: spacing.sm },
});
