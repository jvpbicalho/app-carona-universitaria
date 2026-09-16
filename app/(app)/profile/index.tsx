import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { useAuth } from '@/auth/AuthContext';
import { Banner } from '@/components/Banner';
import { ListRow } from '@/components/ListRow';
import { ErrorState, SkeletonBlock } from '@/components/StateViews';
import { useProfile, type ActiveRole } from '@/profile/ProfileContext';
import { avatarPublicUrl } from '@/profile/profileApi';
import { colors, radius, spacing, typography } from '@/theme/tokens';

/**
 * Wireframe 2.2 — "Meu perfil".
 *
 * A alternância Passageiro/Motorista fica aqui. Ela não exige cadastro novo
 * (perfil é único) e só habilita "Motorista" quando há veículo salvo.
 */
export default function ProfileScreen() {
  const { signOut } = useAuth();
  const {
    profile,
    vehicle,
    loading,
    error,
    reload,
    incompleteWarning,
    canDrive,
    activeRole,
    setActiveRole,
  } = useProfile();

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <SkeletonBlock height={112} width="100%" />
          <SkeletonBlock height={44} style={{ marginTop: spacing.lg }} />
          <SkeletonBlock height={54} style={{ marginTop: spacing.lg }} />
          <SkeletonBlock height={54} style={{ marginTop: spacing.sm }} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !profile) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ErrorState
          message={error ?? 'Não foi possível carregar seu perfil.'}
          onRetry={() => void reload()}
        />
      </SafeAreaView>
    );
  }

  const photo = avatarPublicUrl(profile.avatarUrl);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={typography.title}>Meu perfil</Text>

        <View style={styles.identity}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.avatar} accessibilityIgnoresInvertColors />
          ) : (
            <View style={[styles.avatar, styles.avatarEmpty]}>
              <Text style={typography.helper}>foto</Text>
            </View>
          )}

          <Text style={styles.name}>{profile.fullName ?? 'Sem nome'}</Text>
          <Text style={styles.verified}>✓ e-mail verificado</Text>
        </View>

        {incompleteWarning ? (
          <Pressable onPress={() => router.push('/profile/personal')} accessibilityRole="button">
            <Banner tone="warning" message={incompleteWarning} />
          </Pressable>
        ) : null}

        <RoleSwitch
          activeRole={activeRole}
          canDrive={canDrive}
          onChange={(role) => void setActiveRole(role)}
        />

        {!canDrive ? (
          <Text style={styles.roleHint}>
            Cadastre um veículo para poder alternar para o modo motorista.
          </Text>
        ) : null}

        <View style={styles.menu}>
          <ListRow
            label="Dados pessoais"
            value={profile.isComplete ? 'completo' : 'incompleto'}
            attention={!profile.isComplete}
            onPress={() => router.push('/profile/personal')}
          />
          <ListRow
            label="Meu veículo"
            value={vehicle ? `${vehicle.makeModel} · ${vehicle.seats} vagas` : 'não cadastrado'}
            attention={!vehicle}
            onPress={() => router.push('/profile/vehicle')}
          />
          <ListRow label="Minhas caronas" onPress={() => router.push('/routes')} />
          {/* EP07 e EP09 entram nos próximos sprints; as linhas ficam visíveis
              mas desabilitadas para não prometer o que ainda não existe. */}
          <ListRow label="Avaliações recebidas" value="em breve" disabled />
          <ListRow label="Histórico de viagens" value="em breve" disabled />
          <ListRow label="Sair" danger onPress={() => void signOut()} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Segmented control Passageiro/Motorista do wireframe 2.2. */
function RoleSwitch({
  activeRole,
  canDrive,
  onChange,
}: {
  activeRole: ActiveRole;
  canDrive: boolean;
  onChange: (role: ActiveRole) => void;
}) {
  const options: { role: ActiveRole; label: string; enabled: boolean }[] = [
    { role: 'passageiro', label: 'Passageiro', enabled: true },
    { role: 'motorista', label: 'Motorista', enabled: canDrive },
  ];

  return (
    <View style={styles.switch} accessibilityRole="radiogroup" accessibilityLabel="Modo de uso">
      {options.map((option) => {
        const selected = activeRole === option.role;
        return (
          <Pressable
            key={option.role}
            onPress={() => option.enabled && onChange(option.role)}
            disabled={!option.enabled}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled: !option.enabled }}
            style={[
              styles.switchOption,
              selected && styles.switchOptionActive,
              !option.enabled && styles.switchOptionDisabled,
            ]}
          >
            <Text style={[styles.switchLabel, selected && styles.switchLabelActive]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  identity: { alignItems: 'center', marginVertical: spacing.lg },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.surface },
  avatarEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  name: { ...typography.title, fontSize: 20, marginTop: spacing.sm },
  verified: { ...typography.helper, color: colors.success, marginTop: 2 },
  switch: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 4,
  },
  switchOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.sm,
  },
  switchOptionActive: { backgroundColor: colors.background },
  switchOptionDisabled: { opacity: 0.4 },
  switchLabel: { ...typography.body, color: colors.textMuted, fontWeight: '600' },
  switchLabelActive: { color: colors.primary, fontWeight: '700' },
  roleHint: { ...typography.helper, marginTop: spacing.sm },
  menu: { marginTop: spacing.lg },
});
