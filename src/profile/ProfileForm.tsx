import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AvatarPicker } from '@/components/AvatarPicker';
import { Banner } from '@/components/Banner';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Select, type SelectOption } from '@/components/Select';
import { ErrorState, SkeletonBlock } from '@/components/StateViews';
import { TextField } from '@/components/TextField';
import { fetchCampuses, fetchCourses } from '@/lib/referenceData';
import { avatarPublicUrl, updateProfile, uploadAvatar, type Profile } from '@/profile/profileApi';
import {
  formatPhone,
  MAX_BIO_LENGTH,
  validateProfileForm,
  type FieldError,
} from '@/profile/profileValidation';
import { spacing, typography } from '@/theme/tokens';

type Props = {
  profile: Profile;
  /**
   * 'onboarding' é a tela 2.1 do wireframe, que aparece uma vez após a
   * verificação de e-mail; 'edit' é "Dados pessoais" dentro do perfil.
   * Muda só o texto do botão e o rodapé — o formulário é o mesmo.
   */
  mode: 'onboarding' | 'edit';
  onSaved: (profile: Profile) => void;
};

function errorFor(errors: FieldError[], field: string): string | null {
  return errors.find((error) => error.field === field)?.message ?? null;
}

export function ProfileForm({ profile, mode, onSaved }: Props) {
  const [fullName, setFullName] = useState(profile.fullName ?? '');
  const [phone, setPhone] = useState(formatPhone(profile.phone ?? ''));
  const [courseId, setCourseId] = useState<string | null>(profile.courseId);
  const [campusId, setCampusId] = useState<string | null>(profile.campusId);
  const [bio, setBio] = useState(profile.bio ?? '');

  /** URI local escolhida agora; null quando a foto é a que já estava salva. */
  const [avatarLocalUri, setAvatarLocalUri] = useState<string | null>(null);

  const [courses, setCourses] = useState<SelectOption[]>([]);
  const [campuses, setCampuses] = useState<SelectOption[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(true);
  const [refsError, setRefsError] = useState(false);

  const [errors, setErrors] = useState<FieldError[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadReferences = React.useCallback(async () => {
    setLoadingRefs(true);
    setRefsError(false);
    try {
      const [courseList, campusList] = await Promise.all([fetchCourses(), fetchCampuses()]);
      setCourses(courseList.map((c) => ({ value: c.id, label: c.name })));
      setCampuses(campusList.map((c) => ({ value: c.id, label: c.name, hint: c.city })));
    } catch {
      setRefsError(true);
    } finally {
      setLoadingRefs(false);
    }
  }, []);

  useEffect(() => {
    void loadReferences();
  }, [loadReferences]);

  /** Foto exibida: a recém-escolhida tem prioridade sobre a salva. */
  const displayedAvatar = useMemo(
    () => avatarLocalUri ?? avatarPublicUrl(profile.avatarUrl),
    [avatarLocalUri, profile.avatarUrl],
  );

  async function handleSubmit() {
    setFormError(null);

    // Validação ANTES de qualquer chamada ao Supabase — inclusive antes de
    // subir a foto, que é a operação cara.
    const draft = {
      fullName,
      // Para a validação, foto escolhida agora conta como preenchida mesmo
      // antes do upload.
      avatarUrl: avatarLocalUri ?? profile.avatarUrl,
      courseId,
      campusId,
      phone,
      bio,
    };

    const validationErrors = validateProfileForm(draft);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors([]);
    setSaving(true);
    try {
      let avatarPath = profile.avatarUrl;
      if (avatarLocalUri) {
        avatarPath = await uploadAvatar(profile.id, avatarLocalUri);
      }

      const saved = await updateProfile(profile.id, { ...draft, avatarUrl: avatarPath });
      setAvatarLocalUri(null);
      onSaved(saved);
    } catch {
      setFormError('Não foi possível salvar seu perfil. Verifique sua conexão e tente de novo.');
    } finally {
      setSaving(false);
    }
  }

  if (refsError) {
    return (
      <ErrorState
        message="Não foi possível carregar a lista de cursos e campi."
        onRetry={() => void loadReferences()}
      />
    );
  }

  return (
    <View>
      {formError ? <Banner tone="error" message={formError} /> : null}

      <AvatarPicker
        uri={displayedAvatar}
        onPick={(uri) => {
          setAvatarLocalUri(uri);
          setErrors((prev) => prev.filter((e) => e.field !== 'avatar'));
        }}
        error={errorFor(errors, 'avatar')}
        uploading={saving && avatarLocalUri !== null}
      />

      <TextField
        label="Nome completo"
        value={fullName}
        onChangeText={setFullName}
        error={errorFor(errors, 'fullName')}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        placeholder="Maria Silva"
        editable={!saving}
      />

      <TextField
        label="Telefone / WhatsApp"
        value={phone}
        onChangeText={(text) => setPhone(formatPhone(text))}
        error={errorFor(errors, 'phone')}
        helper="Opcional. É como o motorista fala com você antes do chat existir."
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        placeholder="(11) 90000-0000"
        editable={!saving}
        maxLength={16}
      />

      {loadingRefs ? (
        <View style={styles.skeletons}>
          <SkeletonBlock height={52} />
          <SkeletonBlock height={52} style={{ marginTop: spacing.md }} />
        </View>
      ) : (
        <>
          <Select
            label="Curso"
            value={courseId}
            options={courses}
            onChange={(value) => {
              setCourseId(value);
              setErrors((prev) => prev.filter((e) => e.field !== 'course'));
            }}
            error={errorFor(errors, 'course')}
            disabled={saving}
          />

          <Select
            label="Campus"
            value={campusId}
            options={campuses}
            onChange={(value) => {
              setCampusId(value);
              setErrors((prev) => prev.filter((e) => e.field !== 'campus'));
            }}
            error={errorFor(errors, 'campus')}
            helper="Usado para sugerir o destino das suas caronas."
            disabled={saving}
          />
        </>
      )}

      <TextField
        label="Sobre mim"
        value={bio}
        onChangeText={setBio}
        error={errorFor(errors, 'bio')}
        helper={`Opcional · ${bio.length}/${MAX_BIO_LENGTH}`}
        placeholder="Ex.: curso à noite, costumo sair do campus às 22h"
        multiline
        numberOfLines={3}
        maxLength={MAX_BIO_LENGTH}
        editable={!saving}
        style={styles.bio}
      />

      <View style={styles.action}>
        <PrimaryButton
          label={mode === 'onboarding' ? 'Salvar e continuar' : 'Salvar alterações'}
          onPress={handleSubmit}
          loading={saving}
          disabled={loadingRefs}
        />
      </View>

      {mode === 'onboarding' ? (
        <Text style={styles.disclaimer}>
          Nome, foto, curso e campus são obrigatórios: é o que permite que outros usuários
          reconheçam você.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  skeletons: { marginBottom: spacing.md },
  bio: { minHeight: 80, textAlignVertical: 'top' },
  action: { marginTop: spacing.sm },
  disclaimer: { ...typography.helper, marginTop: spacing.md },
});
