import React from 'react';
import { StyleSheet, View } from 'react-native';

import { FieldMessage } from '@/components/FieldParts';
import { spacing } from '@/theme/tokens';

/**
 * Mensagem de erro única para o par Data + Horário, que ficam lado a lado.
 * Os dois campos ficam marcados como inválidos, e o motivo aparece uma vez,
 * embaixo da linha — e não espremido sob um dos dois.
 */
export function DateTimeError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.wrapper}>
      <FieldMessage error={message} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginTop: -spacing.md, marginBottom: spacing.md },
});
