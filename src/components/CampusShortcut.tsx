import React from 'react';
import { StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { spacing } from '@/theme/tokens';

/**
 * Atalho "usar meu campus" abaixo do campo de destino (nova carona e busca).
 *
 * Era um texto azul em negrito, que não parecia clicável. Agora é um botão
 * compacto com contorno — o manual deixa o preto cheio para a ação principal
 * da tela.
 */
export function CampusShortcut({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <View style={styles.wrapper}>
      <PrimaryButton label={label} onPress={onPress} variant="outline" compact />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginTop: -spacing.xs, marginBottom: spacing.md },
});
