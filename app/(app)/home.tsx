import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthContext';
import { PrimaryButton } from '@/components/PrimaryButton';
import { colors, radius, spacing, typography } from '@/theme/tokens';

/**
 * Home — destino do login válido (critério de aceite da História 2).
 *
 * Placeholder proposital: busca de caronas (EP04) e publicação de rotas (EP03)
 * entram nos próximos sprints. O que existe aqui é o suficiente para provar que
 * a sessão foi estabelecida e que o logout devolve ao login.
 */
export default function HomeScreen() {
  const { user, signOut } = useAuth();

  const displayName =
    (user?.user_metadata?.full_name as string | undefined)?.split(' ')[0] ?? 'estudante';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View>
          <Text style={typography.title}>Olá, {displayName}</Text>
          <Text style={[typography.subtitle, styles.subtitle]}>
            Sua conta institucional está ativa.
          </Text>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Conta</Text>
            <Text style={typography.body}>{user?.email}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Próximos passos</Text>
            <Text style={typography.helper}>
              Publicar rotas (EP03) e buscar caronas (EP04) chegam nos próximos sprints.
            </Text>
          </View>
        </View>

        <PrimaryButton label="Sair" variant="ghost" onPress={signOut} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  subtitle: { marginTop: spacing.sm, marginBottom: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardLabel: {
    ...typography.helper,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
});
