import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { useAuth } from '@/auth/AuthContext';
import { screenLayout } from '@/components/AuthScreen';
import { initialsOf } from '@/components/AvatarPicker';
import { Banner } from '@/components/Banner';
import { Icon } from '@/components/Icon';
import { ListRow } from '@/components/ListRow';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ErrorState, SkeletonBlock } from '@/components/StateViews';
import { useProfile, type ActiveRole } from '@/profile/ProfileContext';
import { avatarPublicUrl } from '@/profile/profileApi';
import { colors, radius, sizes, spacing, typography } from '@/theme/tokens';

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
    isAdmin,
  } = useProfile();

  if (loading) {
    return (
      <SafeAreaView style={screenLayout.safe} edges={['top', 'bottom']}>
        <View style={[screenLayout.column, styles.content]}>
          <ScreenHeader />
          <SkeletonBlock height={sizes.avatarLg + spacing.xl} width="100%" />
          <SkeletonBlock height={44} style={{ marginTop: spacing.lg }} />
          <SkeletonBlock height={54} style={{ marginTop: spacing.lg }} />
          <SkeletonBlock height={54} style={{ marginTop: spacing.sm }} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !profile) {
    return (
      <SafeAreaView style={screenLayout.safe} edges={['top', 'bottom']}>
        <View style={[screenLayout.column, styles.content]}>
          <ScreenHeader />
        </View>
        <ErrorState
          message={error ?? 'Não foi possível carregar seu perfil.'}
          onRetry={() => void reload()}
        />
      </SafeAreaView>
    );
  }

  const photo = avatarPublicUrl(profile.avatarUrl);

  return (
    <SafeAreaView style={screenLayout.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={[screenLayout.column, styles.content]} showsVerticalScrollIndicator={false}>
        <ScreenHeader />
        <Text style={typography.screenTitle} accessibilityRole="header">
          Meu perfil
        </Text>

        <View style={styles.identity}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.avatar} accessibilityIgnoresInvertColors />
          ) : (
            <View style={[styles.avatar, styles.avatarEmpty]}>
              <Text style={typography.sectionTitle}>{initialsOf(profile.fullName) || '?'}</Text>
            </View>
          )}

          <Text style={styles.name}>{profile.fullName ?? 'Sem nome'}</Text>
          <View style={styles.verified}>
            <Icon name="check" size={sizes.iconSm} color={colors.textSecondary} />
            <Text style={styles.verifiedText}>E-mail institucional verificado</Text>
          </View>
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
            value={profile.isComplete ? 'Completo' : 'Incompleto'}
            attention={!profile.isComplete}
            onPress={() => router.push('/profile/personal')}
          />
          <ListRow
            label="Meu veículo"
            value={vehicle ? `${vehicle.makeModel} · ${vehicle.seats} ${vehicle.seats === 1 ? 'vaga' : 'vagas'}` : 'Não cadastrado'}
            attention={!vehicle}
            onPress={() => router.push('/profile/vehicle')}
          />
          <ListRow label="Minhas caronas" onPress={() => router.push('/routes')} />
          <ListRow label="Minhas solicitações" onPress={() => router.push('/requests')} />
          {/* EP07 e EP09 entram nos próximos sprints; as linhas ficam visíveis
              mas desabilitadas para não prometer o que ainda não existe. */}
          <ListRow label="Avaliações recebidas" value="Em breve" disabled />
          <ListRow label="Histórico de viagens" value="Em breve" disabled />
          {/* Só para admin (EP04): a permissão real é do banco; aqui só a entrada. */}
          {isAdmin ? (
            <ListRow label="Regras da busca" value="Admin" onPress={() => router.push('/admin/matching')} />
          ) : null}
          {/* Sair não é destrutivo (dá para entrar de novo): sem vermelho. */}
          <ListRow label="Sair da conta" onPress={() => void signOut()} />
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
            style={[styles.switchOption, selected && styles.switchOptionActive]}
          >
            <Text
              style={[
                styles.switchLabel,
                selected && styles.switchLabelActive,
                !option.enabled && styles.switchLabelDisabled,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  identity: { alignItems: 'center', marginVertical: spacing.lg },
  avatar: {
    width: sizes.avatarLg,
    height: sizes.avatarLg,
    borderRadius: sizes.avatarLg / 2,
    backgroundColor: colors.surface,
  },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  name: { ...typography.sectionTitle, marginTop: spacing.sm },
  verified: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xxs },
  verifiedText: { ...typography.caption, marginLeft: spacing.xs },
  switch: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.xs,
  },
  switchOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: sizes.controlCompact,
    borderRadius: radius.sm,
  },
  // Selecionado: cartão branco com texto em Medium. Não selecionado: cinza
  // de apoio. A diferença é de peso e de fundo, não de cor.
  switchOptionActive: { backgroundColor: colors.background },
  switchLabel: { ...typography.body, color: colors.textSecondary },
  switchLabelActive: { ...typography.bodyStrong },
  switchLabelDisabled: { color: colors.textDisabled },
  roleHint: { ...typography.caption, marginTop: spacing.sm },
  menu: { marginTop: spacing.lg },
});
