import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Href } from 'expo-router';

import { ScreenHeader } from '@/components/ScreenHeader';
import { colors, sizes, spacing, typography } from '@/theme/tokens';

/**
 * Casca comum das telas de formulário (login, cadastro, perfil, veículo,
 * carona, busca): área segura, teclado que não cobre os campos, o par
 * título/subtítulo e, nas telas internas, o "Voltar".
 *
 * Na web o conteúdo para em `sizes.contentMaxWidth` e fica centralizado — sem
 * isso, num monitor, os campos esticavam até as bordas da janela.
 */
export function AuthScreen({
  title,
  subtitle,
  children,
  footer,
  back = false,
  backFallback,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Mostra "Voltar" no topo. Telas internas devem usar. */
  back?: boolean;
  /** Para onde "Voltar" leva quando não há tela anterior (ex.: link direto na web). */
  backFallback?: Href;
}) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            {back ? <ScreenHeader fallback={backFallback} /> : null}

            <View style={styles.header}>
              <Text style={typography.screenTitle} accessibilityRole="header">
                {title}
              </Text>
              {subtitle ? <Text style={[typography.bodySecondary, styles.subtitle]}>{subtitle}</Text> : null}
            </View>

            {children}

            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Mesma largura e respiro do AuthScreen, para telas que montam o próprio layout. */
export const screenLayout = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  /** Coluna central de largura máxima. Dentro de ScrollView, use como contentContainerStyle. */
  column: {
    width: '100%',
    maxWidth: sizes.contentMaxWidth,
    alignSelf: 'center',
  },
  /** Para a coluna ocupar a altura toda (telas de lista com rodapé fixo). */
  fill: { flex: 1 },
  padded: { paddingHorizontal: spacing.lg },
});

const styles = StyleSheet.create({
  safe: screenLayout.safe,
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: sizes.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  header: { marginBottom: spacing.lg },
  subtitle: { marginTop: spacing.sm },
  footer: { marginTop: spacing.lg },
});
