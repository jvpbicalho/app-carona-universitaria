import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { Banner } from '@/components/Banner';
import { ListRow } from '@/components/ListRow';
import { PrimaryButton } from '@/components/PrimaryButton';
import { screenLayout } from '@/components/AuthScreen';
import { ErrorState, SkeletonBlock } from '@/components/StateViews';
import { useProfile } from '@/profile/ProfileContext';
import { colors, radius, spacing, typography } from '@/theme/tokens';

/**
 * Home — destino do login válido.
 *
 * Também é onde o aviso de perfil incompleto aparece (critério de aceite da
 * História 1): é a primeira tela depois de entrar, então é onde o aviso tem
 * chance de ser visto.
 *
 * O conteúdo muda com o modo ativo, conforme o wireframe 2.2: "trocar de modo
 * troca a Home e a aba Caronas".
 */
export default function HomeScreen() {
  const { profile, vehicle, loading, error, reload, incompleteWarning, activeRole } =
    useProfile();

  if (loading) {
    return (
      <SafeAreaView style={screenLayout.safe} edges={['top', 'bottom']}>
        <View style={[screenLayout.column, styles.content]}>
          <SkeletonBlock height={34} width="60%" />
          <SkeletonBlock height={18} width="80%" style={{ marginTop: spacing.sm }} />
          <SkeletonBlock height={72} style={{ marginTop: spacing.lg }} />
          <SkeletonBlock height={54} style={{ marginTop: spacing.lg }} />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={screenLayout.safe} edges={['top', 'bottom']}>
        <ErrorState message={error} onRetry={() => void reload()} />
      </SafeAreaView>
    );
  }

  const firstName = profile?.fullName?.trim().split(' ')[0] ?? 'estudante';
  const isDriverMode = activeRole === 'motorista';

  return (
    <SafeAreaView style={screenLayout.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[screenLayout.column, styles.content]}>
          <Text style={typography.screenTitle} accessibilityRole="header">
            Olá, {firstName}
          </Text>
          <Text style={[typography.bodySecondary, styles.subtitle]}>
            {isDriverMode ? 'Modo motorista' : 'Modo passageiro'}
          </Text>

          {/* Critério de aceite: perfil incompleto exibe um aviso. Clicável,
              porque avisar sem oferecer o caminho não resolve nada. */}
          {incompleteWarning ? (
            <Pressable
              onPress={() => router.push('/complete-profile')}
              accessibilityRole="button"
              accessibilityHint="Abre a tela de completar perfil"
            >
              <Banner tone="warning" message={incompleteWarning} />
            </Pressable>
          ) : null}

          {isDriverMode ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Ofereça uma carona</Text>
              <Text style={typography.caption}>
                {vehicle
                  ? `${vehicle.makeModel} · ${vehicle.seats} ${vehicle.seats === 1 ? 'vaga' : 'vagas'}`
                  : 'Sem veículo cadastrado.'}
              </Text>
              <View style={styles.cardAction}>
                <PrimaryButton label="Publicar carona" onPress={() => router.push('/routes/new')} />
              </View>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Encontre uma carona</Text>
              <Text style={typography.caption}>
                Informe de onde sai, para onde vai e a que horas.
              </Text>
              <View style={styles.cardAction}>
                <PrimaryButton label="Buscar carona" onPress={() => router.push('/search')} />
              </View>
            </View>
          )}

          <View style={styles.menu}>
            <ListRow label="Meu perfil" onPress={() => router.push('/profile')} />
            <ListRow label="Minhas caronas" onPress={() => router.push('/routes')} />
            <ListRow label="Minhas solicitações" onPress={() => router.push('/requests')} />
            <ListRow
              label="Meu veículo"
              value={vehicle ? vehicle.plate : 'Não cadastrado'}
              attention={!vehicle}
              onPress={() => router.push('/profile/vehicle')}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  subtitle: { marginTop: spacing.xs, marginBottom: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardTitle: { ...typography.sectionTitle, marginBottom: spacing.xs },
  cardAction: { marginTop: spacing.md },
  menu: { marginTop: spacing.md },
});
