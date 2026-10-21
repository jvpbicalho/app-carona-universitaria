import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton, type ButtonVariant } from '@/components/PrimaryButton';
import { colors, radius, sizes, spacing, typography } from '@/theme/tokens';

export type DialogAction = {
  /** Comece com verbo: "Salvar e avisar", "Tirar foto". */
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
};

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  /** Na ordem em que aparecem. Use no máximo uma ação `primary`. */
  actions: DialogAction[];
  /** Fechar sem escolher (toque fora, botão voltar do Android, Esc na web). */
  onDismiss: () => void;
  /** Texto do botão de fechar. Padrão: "Voltar". */
  dismissLabel?: string;
};

/**
 * Diálogo de confirmação ou escolha que funciona no celular E na web.
 *
 * Substitui `Alert.alert`, que na web (react-native-web) não faz nada: a
 * confirmação de edição de carona e a escolha da foto de perfil simplesmente
 * não apareciam no navegador. O teste themeUsage.test.ts barra `Alert.alert`
 * para isso não voltar.
 */
export function ConfirmDialog({ visible, title, message, actions, onDismiss, dismissLabel = 'Voltar' }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        {/* Toque fora do cartão fecha, como no diálogo do sistema. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityLabel={dismissLabel} />

        <View style={styles.card} accessibilityRole="alert" accessibilityViewIsModal>
          <Text style={typography.sectionTitle}>{title}</Text>
          {message ? <Text style={[typography.body, styles.message]}>{message}</Text> : null}

          <View style={styles.actions}>
            {actions.map((action) => (
              <View key={action.label} style={styles.action}>
                <PrimaryButton
                  label={action.label}
                  variant={action.variant ?? 'outline'}
                  onPress={action.onPress}
                />
              </View>
            ))}
            <PrimaryButton label={dismissLabel} variant="outline" onPress={onDismiss} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.scrim,
  },
  card: {
    width: '100%',
    maxWidth: sizes.contentMaxWidth - spacing.xl * 2,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  message: { marginTop: spacing.sm },
  actions: { marginTop: spacing.lg },
  action: { marginBottom: spacing.sm },
});
