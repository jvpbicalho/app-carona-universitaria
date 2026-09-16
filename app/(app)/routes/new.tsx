import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { AddressSearchField } from '@/components/AddressSearchField';
import { AuthScreen } from '@/components/AuthScreen';
import { Banner } from '@/components/Banner';
import { DateTimeField } from '@/components/DateTimeField';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SplashGate } from '@/components/SplashGate';
import { Stepper } from '@/components/Stepper';
import { TextField } from '@/components/TextField';
import { fetchCampuses, type Campus } from '@/lib/referenceData';
import { useProfile } from '@/profile/ProfileContext';
import type { FieldError } from '@/profile/profileValidation';
import { createRoute, describeRouteError } from '@/routes/routeApi';
import {
  combineDateAndTime,
  MAX_NOTES_LENGTH,
  validateRouteForm,
  type GeoPoint,
} from '@/routes/routeValidation';
import { colors, spacing, typography } from '@/theme/tokens';

function errorFor(errors: FieldError[], field: string): string | null {
  return errors.find((error) => error.field === field)?.message ?? null;
}

/**
 * Wireframe 3.1 — "Nova carona" (História 3).
 *
 * Duas validações desta tela rodam inteiramente no client, antes de qualquer
 * requisição: horário no passado e vagas acima da capacidade do veículo.
 */
export default function NewRouteScreen() {
  const { profile, vehicle, loading, isComplete } = useProfile();

  const [origin, setOrigin] = useState<GeoPoint | null>(null);
  const [destination, setDestination] = useState<GeoPoint | null>(null);
  const [date, setDate] = useState<Date | null>(null);
  const [time, setTime] = useState<Date | null>(null);
  const [seatsTotal, setSeatsTotal] = useState(1);
  const [notes, setNotes] = useState('');

  const [campus, setCampus] = useState<Campus | null>(null);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Vagas da carona começam no total do veículo: é o caso comum.
  useEffect(() => {
    if (vehicle) setSeatsTotal(vehicle.seats);
  }, [vehicle]);

  // Destino sugerido: o campus do perfil (wireframe 3.1). Só quando o campus
  // tem coordenadas — sem elas não dá para gravar a rota.
  useEffect(() => {
    if (!profile?.campusId) return;
    let active = true;

    void fetchCampuses().then((list) => {
      if (!active) return;
      const found = list.find((c) => c.id === profile.campusId) ?? null;
      setCampus(found);
    });

    return () => {
      active = false;
    };
  }, [profile?.campusId]);

  const departureAt = useMemo(() => {
    if (!date || !time) return null;
    return combineDateAndTime(date, time);
  }, [date, time]);

  const now = new Date();

  async function handleSubmit() {
    if (!profile || !vehicle) return;
    setFormError(null);

    const draft = { origin, destination, departureAt, seatsTotal, notes };

    // Validação completa antes de tocar na rede. `now` é recalculado no submit
    // para pegar o caso de o formulário ter ficado aberto até a hora passar.
    const validationErrors = validateRouteForm(draft, vehicle.seats, new Date());
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors([]);
    setSaving(true);
    try {
      const usedCampus =
        campus && destination && campus.latitude === destination.latitude ? campus.id : null;

      await createRoute(profile.id, vehicle.id, draft, usedCampus);
      router.replace('/routes');
    } catch (error) {
      setFormError(describeRouteError(error as { message?: string; hint?: string | null }));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <SplashGate />;

  // Guardas de pré-condição: publicar exige perfil completo e veículo. As duas
  // regras também existem no trigger do banco; aqui elas viram uma saída clara
  // em vez de um erro depois do submit.
  if (!isComplete) {
    return (
      <AuthScreen title="Nova carona">
        <Banner
          tone="warning"
          message="Complete seu perfil antes de publicar uma carona. Passageiros precisam saber com quem vão viajar."
        />
        <PrimaryButton label="Completar perfil" onPress={() => router.replace('/profile/personal')} />
      </AuthScreen>
    );
  }

  if (!vehicle) {
    return (
      <AuthScreen title="Nova carona">
        <Banner
          tone="warning"
          message="Cadastre seu veículo antes de publicar uma carona: é ele que define quantas vagas você pode oferecer."
        />
        <PrimaryButton label="Cadastrar veículo" onPress={() => router.replace('/profile/vehicle')} />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen title="Nova carona" subtitle="Publique uma viagem específica e receba solicitações de vaga.">
      {formError ? <Banner tone="error" message={formError} /> : null}

      <AddressSearchField
        label="Origem"
        placeholder="buscar endereço"
        value={origin}
        onChange={(point) => {
          setOrigin(point);
          setErrors((prev) => prev.filter((e) => e.field !== 'origin'));
        }}
        error={errorFor(errors, 'origin')}
        helper="Digite ao menos 3 letras e escolha um endereço da lista."
      />

      <AddressSearchField
        label="Destino"
        placeholder="buscar endereço"
        value={destination}
        onChange={(point) => {
          setDestination(point);
          setErrors((prev) => prev.filter((e) => e.field !== 'destination'));
        }}
        error={errorFor(errors, 'destination')}
      />

      {campus?.latitude != null && campus.longitude != null && !destination ? (
        <Text
          style={styles.suggestion}
          onPress={() =>
            setDestination({
              label: campus.name,
              latitude: campus.latitude as number,
              longitude: campus.longitude as number,
            })
          }
          accessibilityRole="button"
        >
          Usar meu campus como destino: {campus.name}
        </Text>
      ) : null}

      <View style={styles.dateTimeRow}>
        <DateTimeField
          label="Data"
          mode="date"
          value={date}
          onChange={(value) => {
            setDate(value);
            setErrors((prev) => prev.filter((e) => e.field !== 'departureAt'));
          }}
          minimumDate={now}
          error={errorFor(errors, 'departureAt') ? ' ' : null}
        />
        <View style={styles.gap} />
        <DateTimeField
          label="Horário de saída"
          mode="time"
          value={time}
          onChange={(value) => {
            setTime(value);
            setErrors((prev) => prev.filter((e) => e.field !== 'departureAt'));
          }}
        />
      </View>

      {errorFor(errors, 'departureAt') ? (
        <Text style={styles.dateError} accessibilityLiveRegion="polite">
          {errorFor(errors, 'departureAt')}
        </Text>
      ) : null}

      <Stepper
        label="Vagas nesta carona"
        value={seatsTotal}
        onChange={(value) => {
          setSeatsTotal(value);
          setErrors((prev) => prev.filter((e) => e.field !== 'seatsTotal'));
        }}
        min={1}
        max={vehicle.seats}
        suffix={`de ${vehicle.seats}`}
        helper={`Limitado pela capacidade do ${vehicle.makeModel}.`}
        error={errorFor(errors, 'seatsTotal')}
        disabled={saving}
      />

      <TextField
        label="Observações"
        value={notes}
        onChangeText={setNotes}
        error={errorFor(errors, 'notes')}
        helper={`Opcional · ${notes.length}/${MAX_NOTES_LENGTH}`}
        placeholder="ex: não levo animais"
        multiline
        numberOfLines={2}
        maxLength={MAX_NOTES_LENGTH}
        editable={!saving}
        style={styles.notes}
      />

      <View style={styles.action}>
        <PrimaryButton label="Publicar carona" onPress={handleSubmit} loading={saving} />
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  dateTimeRow: { flexDirection: 'row' },
  gap: { width: spacing.md },
  dateError: {
    ...typography.helper,
    color: colors.danger,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },
  suggestion: {
    ...typography.helper,
    color: colors.primary,
    fontWeight: '700',
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
    paddingVertical: spacing.xs,
  },
  notes: { minHeight: 64, textAlignVertical: 'top' },
  action: { marginTop: spacing.sm },
});
