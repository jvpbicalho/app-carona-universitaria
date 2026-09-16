import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { Banner } from '@/components/Banner';
import { ListRow } from '@/components/ListRow';
import { PrimaryButton } from '@/components/PrimaryButton';
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
  const { profile, vehicle, loading, error, reload, incompleteWarning, activeRole, canDrive } =
    useProfile();

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <SkeletonBlock height={28} width="60%" />
          <SkeletonBlock height={18} width="80%" style={{ marginTop: spacing.sm }} />
          <SkeletonBlock height={72} style={{ marginTop: spacing.lg }} />
          <SkeletonBlock height={54} style={{ marginTop: spacing.lg }} />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ErrorState message={error} onRetry={() => void reload()} />
      </SafeAreaView>
    );
  }

  const firstName = profile?.fullName?.trim().split(' ')[0] ?? 'estudante';
  const isDriverMode = activeRole === 'motorista';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={typography.title}>Olá, {firstName}</Text>
        <Text style={[typography.subtitle, styles.subtitle]}>
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
            <Text style={typography.helper}>
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
            <Text style={typography.helper}>
              A busca de caronas (EP04) chega no próximo sprint.
              {canDrive ? ' Enquanto isso, você pode alternar para o modo motorista no perfil.' : ''}
            </Text>
          </View>
        )}

        <View style={styles.menu}>
          <ListRow label="Meu perfil" onPress={() => router.push('/profile')} />
          <ListRow label="Minhas caronas" onPress={() => router.push('/routes')} />
          <ListRow
            label="Meu veículo"
            value={vehicle ? vehicle.plate : 'não cadastrado'}
            attention={!vehicle}
            onPress={() => router.push('/profile/vehicle')}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
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
  cardTitle: { ...typography.label, fontSize: 16, marginBottom: spacing.xs },
  cardAction: { marginTop: spacing.md },
  menu: { marginTop: spacing.md },
});
