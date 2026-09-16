import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { AuthScreen } from '@/components/AuthScreen';
import { Banner } from '@/components/Banner';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Select } from '@/components/Select';
import { SplashGate } from '@/components/SplashGate';
import { Stepper } from '@/components/Stepper';
import { TextField } from '@/components/TextField';
import { useProfile } from '@/profile/ProfileContext';
import type { FieldError } from '@/profile/profileValidation';
import { saveVehicle } from '@/vehicle/vehicleApi';
import {
  formatPlate,
  MAX_SEATS,
  MIN_SEATS,
  validateVehicleForm,
  VEHICLE_COLORS,
} from '@/vehicle/vehicleValidation';
import { spacing, typography } from '@/theme/tokens';

function errorFor(errors: FieldError[], field: string): string | null {
  return errors.find((error) => error.field === field)?.message ?? null;
}

/**
 * Wireframe 2.3 — "Meu veículo" (História 2).
 *
 * Salvar o primeiro veículo é o que libera o modo motorista: `can_drive` é
 * derivado da existência desta linha, não de um campo de papel.
 */
export default function VehicleScreen() {
  const { profile, vehicle, loading, reload } = useProfile();

  const [makeModel, setMakeModel] = useState(vehicle?.makeModel ?? '');
  const [color, setColor] = useState<string | null>(vehicle?.color ?? null);
  const [plate, setPlate] = useState(formatPlate(vehicle?.plate ?? ''));
  const [seats, setSeats] = useState(vehicle?.seats ?? 3);

  const [errors, setErrors] = useState<FieldError[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (loading) return <SplashGate />;

  async function handleSubmit() {
    if (!profile) return;
    setFormError(null);

    // Validação antes de qualquer chamada ao Supabase.
    const draft = { makeModel, color, plate, seats };
    const validationErrors = validateVehicleForm(draft);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors([]);
    setSaving(true);
    try {
      await saveVehicle(profile.id, draft);
      await reload();
      router.back();
    } catch {
      setFormError('Não foi possível salvar o veículo. Verifique sua conexão e tente de novo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthScreen
      title="Meu veículo"
      subtitle="Os passageiros usam esses dados para reconhecer seu carro no ponto de encontro."
    >
      {formError ? <Banner tone="error" message={formError} /> : null}

      {!vehicle ? (
        <Banner
          tone="warning"
          message="Você ainda não cadastrou um veículo. Sem ele, o modo motorista fica indisponível."
        />
      ) : null}

      <TextField
        label="Marca e modelo"
        value={makeModel}
        onChangeText={setMakeModel}
        error={errorFor(errors, 'makeModel')}
        placeholder="ex: Honda Fit"
        autoCapitalize="words"
        editable={!saving}
      />

      <Select
        label="Cor"
        value={color}
        options={VEHICLE_COLORS.map((c) => ({ value: c, label: c }))}
        onChange={(value) => {
          setColor(value);
          setErrors((prev) => prev.filter((e) => e.field !== 'color'));
        }}
        error={errorFor(errors, 'color')}
        disabled={saving}
      />

      <TextField
        label="Placa"
        value={plate}
        onChangeText={(text) => setPlate(formatPlate(text))}
        error={errorFor(errors, 'plate')}
        helper="Mercosul (ABC-1D23) ou padrão antigo (ABC-1234)"
        placeholder="ABC-1D23"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={8}
        editable={!saving}
      />

      <Stepper
        label="Vagas disponíveis"
        value={seats}
        onChange={(value) => {
          setSeats(value);
          setErrors((prev) => prev.filter((e) => e.field !== 'seats'));
        }}
        min={MIN_SEATS}
        max={MAX_SEATS}
        helper="Define o limite máximo de passageiros por carona. Não conte o motorista."
        error={errorFor(errors, 'seats')}
        disabled={saving}
      />

      <View style={styles.action}>
        <PrimaryButton
          label={vehicle ? 'Salvar alterações' : 'Salvar veículo'}
          onPress={handleSubmit}
          loading={saving}
        />
      </View>

      {/* Consumo médio (EP08) e CNH estão fora do Sprint: o consumo é Fase 2 no
          próprio wireframe, e a exigência da CNH é pendência de Sprint
          Planning — a coluna existe no banco, nullable, aguardando a decisão. */}
      <Text style={styles.note}>
        Consumo médio e envio da CNH entram quando a equipe definir a regra de exigência.
      </Text>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  action: { marginTop: spacing.sm },
  note: { ...typography.helper, marginTop: spacing.md },
});
