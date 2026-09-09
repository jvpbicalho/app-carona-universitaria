import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { useAuth } from '@/auth/AuthContext';
import { allowedDomains, MIN_PASSWORD_LENGTH, validateInstitutionalEmail } from '@/auth/institutionalEmail';
import { AuthScreen } from '@/components/AuthScreen';
import { Banner } from '@/components/Banner';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextField } from '@/components/TextField';
import { colors, spacing, typography } from '@/theme/tokens';

/**
 * História 1 — Cadastro com e-mail institucional.
 *
 * O critério "cadastro fora do domínio institucional é bloqueado antes de
 * enviar qualquer confirmação" é atendido em dois pontos desta tela:
 *  - o botão só chama signUp depois de validateInstitutionalEmail passar;
 *  - o campo mostra o erro de domínio já no blur, antes de o usuário submeter.
 * Nenhuma requisição sai do dispositivo em nenhum dos dois casos.
 */
export default function SignUpScreen() {
  const { signUp } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [fieldErrors, setFieldErrors] = useState<{
    fullName?: string | null;
    email?: string | null;
    password?: string | null;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const domains = useMemo(() => allowedDomains(), []);
  const domainHint = domains.map((d) => `@${d}`).join(' ou ');

  /** Valida o domínio ao sair do campo: feedback antes do submit. */
  function handleEmailBlur() {
    if (email.trim().length === 0) return;
    const check = validateInstitutionalEmail(email, domains);
    setFieldErrors((prev) => ({ ...prev, email: check.ok ? null : check.message }));
  }

  async function handleSubmit() {
    setFormError(null);
    setFieldErrors({});
    setSubmitting(true);

    try {
      const result = await signUp({ fullName, email, password });

      if (!result.ok) {
        switch (result.field) {
          case 'fullName':
            setFieldErrors({ fullName: result.message });
            break;
          case 'email':
            setFieldErrors({ email: result.message });
            break;
          case 'password':
            setFieldErrors({ password: result.message });
            break;
          default:
            // Erro vindo do Supabase, não atribuível a um campo específico.
            setFormError(result.message);
        }
        return;
      }

      // Conta criada: o link de confirmação foi enviado pelo Supabase.
      router.replace({
        pathname: '/verify-email',
        params: { email: result.email },
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthScreen
      title="Criar conta"
      subtitle={`Use seu e-mail institucional (${domainHint}) para comprovar seu vínculo com a universidade.`}
      footer={
        <Pressable
          onPress={() => router.replace('/sign-in')}
          accessibilityRole="link"
          disabled={submitting}
        >
          <Text style={styles.link}>
            Já tem conta? <Text style={styles.linkStrong}>Entrar</Text>
          </Text>
        </Pressable>
      }
    >
      {formError ? <Banner tone="error" message={formError} /> : null}

      <TextField
        label="Nome completo"
        value={fullName}
        onChangeText={setFullName}
        error={fieldErrors.fullName}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        placeholder="Maria Silva"
        editable={!submitting}
        returnKeyType="next"
      />

      <TextField
        label="E-mail institucional"
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: null }));
        }}
        onBlur={handleEmailBlur}
        error={fieldErrors.email}
        helper={`Somente ${domainHint}`}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        placeholder={`seu.nome${domains[0] ? `@${domains[0]}` : ''}`}
        editable={!submitting}
        returnKeyType="next"
      />

      <TextField
        label="Senha"
        value={password}
        onChangeText={(value) => {
          setPassword(value);
          if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: null }));
        }}
        error={fieldErrors.password}
        helper={`No mínimo ${MIN_PASSWORD_LENGTH} caracteres, com letras e números`}
        secure
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        editable={!submitting}
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
      />

      <View style={styles.action}>
        <PrimaryButton label="Criar conta" onPress={handleSubmit} loading={submitting} />
      </View>

      <Text style={styles.disclaimer}>
        Enviaremos um link de confirmação para o seu e-mail. A conta só é liberada depois que você
        abrir esse link.
      </Text>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  action: { marginTop: spacing.sm },
  disclaimer: { ...typography.helper, marginTop: spacing.md },
  link: { ...typography.body, textAlign: 'center', color: colors.textMuted },
  linkStrong: { color: colors.primary, fontWeight: '700' },
});
