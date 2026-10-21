import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { AddressSearchField } from '@/components/AddressSearchField';
import { AuthScreen } from '@/components/AuthScreen';
import { CampusShortcut } from '@/components/CampusShortcut';
import { DateTimeError } from '@/components/DateTimeError';
import { DateTimeField } from '@/components/DateTimeField';
import { PrimaryButton } from '@/components/PrimaryButton';
import { fetchCampuses, type Campus } from '@/lib/referenceData';
import { useProfile } from '@/profile/ProfileContext';
import type { FieldError } from '@/profile/profileValidation';
import { combineDateAndTime, type GeoPoint } from '@/routes/routeValidation';
import { defaultDesiredAt, validateSearchForm } from '@/search/searchValidation';
import { spacing } from '@/theme/tokens';

function errorFor(errors: FieldError[], field: string): string | null {
  return errors.find((error) => error.field === field)?.message ?? null;
}

/**
 * Wireframe 4.1 — "Buscar carona".
 *
 * Reaproveita a busca de endereço com geocodificação do cadastro de rota
 * (AddressSearchField) e o atalho "usar meu campus". A validação roda antes da
 * rede; a busca em si acontece na tela de resultados.
 */
export default function SearchScreen() {
  const { profile } = useProfile();

  const initial = useMemo(() => defaultDesiredAt(), []);
  const [origin, setOrigin] = useState<GeoPoint | null>(null);
  const [destination, setDestination] = useState<GeoPoint | null>(null);
  // Já preenchidos com o próximo quarto de hora: "sair agora" é o caso comum.
  const [date, setDate] = useState<Date | null>(initial);
  const [time, setTime] = useState<Date | null>(initial);
  const [campus, setCampus] = useState<Campus | null>(null);
  const [errors, setErrors] = useState<FieldError[]>([]);

  // Destino sugerido: o campus do perfil — o mesmo atalho do cadastro de rota.
  useEffect(() => {
    if (!profile?.campusId) return;
    let active = true;
    void fetchCampuses().then((list) => {
      if (active) setCampus(list.find((c) => c.id === profile.campusId) ?? null);
    });
    return () => {
      active = false;
    };
  }, [profile?.campusId]);

  function clearError(field: string) {
    setErrors((prev) => prev.filter((e) => e.field !== field));
  }

  function handleSearch() {
    const desiredAt = date && time ? combineDateAndTime(date, time) : null;
    const validationErrors = validateSearchForm({ origin, destination, desiredAt }, new Date());
    if (validationErrors.length > 0 || !origin || !destination || !desiredAt) {
      setErrors(validationErrors);
      return;
    }
    setErrors([]);

    router.push({
      pathname: '/search/results',
      params: {
        originLabel: origin.label,
        originLat: String(origin.latitude),
        originLng: String(origin.longitude),
        destinationLabel: destination.label,
        destinationLat: String(destination.latitude),
        destinationLng: String(destination.longitude),
        desiredAt: desiredAt.toISOString(),
      },
    });
  }

  const hasCampusShortcut = campus?.latitude != null && campus.longitude != null;

  return (
    <AuthScreen
      title="Buscar carona"
      subtitle="Encontre caronas que saem perto de você, no horário que você precisa."
      back
    >
      <AddressSearchField
        label="Saindo de"
        value={origin}
        onChange={(point) => {
          setOrigin(point);
          clearError('origin');
        }}
        error={errorFor(errors, 'origin')}
        helper="Digite ao menos 3 letras e escolha um endereço da lista."
      />

      <AddressSearchField
        label="Indo para"
        value={destination}
        onChange={(point) => {
          setDestination(point);
          clearError('destination');
        }}
        error={errorFor(errors, 'destination')}
      />

      {hasCampusShortcut && !destination ? (
        <CampusShortcut
          label={`Ir para o meu campus: ${campus.name}`}
          onPress={() => {
            setDestination({
              label: campus.name,
              latitude: campus.latitude as number,
              longitude: campus.longitude as number,
            });
            clearError('destination');
          }}
        />
      ) : null}

      <View style={styles.dateTimeRow}>
        <DateTimeField
          label="Data"
          mode="date"
          value={date}
          onChange={(value) => {
            setDate(value);
            clearError('desiredAt');
          }}
          minimumDate={new Date()}
          error={errorFor(errors, 'desiredAt') ? ' ' : null}
        />
        <View style={styles.gap} />
        <DateTimeField
          label="Horário"
          mode="time"
          value={time}
          onChange={(value) => {
            setTime(value);
            clearError('desiredAt');
          }}
        />
      </View>

      <DateTimeError message={errorFor(errors, 'desiredAt')} />

      <View style={styles.action}>
        <PrimaryButton label="Buscar caronas" onPress={handleSearch} />
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  dateTimeRow: { flexDirection: 'row' },
  gap: { width: spacing.md },
  action: { marginTop: spacing.sm },
});
