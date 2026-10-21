import React, { useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FieldMessage } from '@/components/FieldParts';
import { TextLink } from '@/components/TextLink';
import { colors, sizes, spacing, typography } from '@/theme/tokens';

type Props = {
  /** URI local recém-escolhida, ou URL pública da foto já salva. */
  uri: string | null;
  onPick: (localUri: string) => void;
  /** Nome da pessoa, para mostrar as iniciais enquanto não há foto. */
  name?: string | null;
  error?: string | null;
  uploading?: boolean;
  size?: number;
};

/** "Maria Silva Souza" → "MS". Vazio quando não há nome. */
export function initialsOf(name?: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
  return `${first}${last}`.toUpperCase();
}

/**
 * Foto do perfil (campo obrigatório da História 1).
 *
 * No celular oferece câmera e galeria: quem ainda não tem foto vai tirar uma
 * na hora, e quem já tem prefere escolher. Na web, abre direto o seletor de
 * arquivo — computador não tem "tirar foto", e o diálogo do sistema
 * (Alert.alert) que fazia essa pergunta não aparece no navegador.
 *
 * Corta em 1:1 na própria escolha para a foto chegar já no formato em que é
 * exibida.
 */
export function AvatarPicker({ uri, onPick, name, error, uploading = false, size = sizes.avatarPicker }: Props) {
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function launch(source: 'camera' | 'library') {
    setChoosing(false);
    setProblem(null);
    setBusy(true);
    try {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        setProblem(
          source === 'camera'
            ? 'Sem acesso à câmera. Autorize nas configurações do aparelho ou escolha uma foto da galeria.'
            : 'Sem acesso às fotos. Autorize nas configurações do aparelho para escolher a imagem.',
        );
        return;
      }

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        // Foto de perfil não precisa de qualidade máxima, e o upload no 4G do
        // campus agradece.
        quality: 0.7,
      };

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);

      if (!result.canceled && result.assets.length > 0) {
        onPick(result.assets[0].uri);
      }
    } catch {
      setProblem('Não foi possível abrir a seleção de foto. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  function choose() {
    if (Platform.OS === 'web') {
      void launch('library');
      return;
    }
    setChoosing(true);
  }

  const showSpinner = busy || uploading;
  const initials = initialsOf(name);
  const actionLabel = uri ? 'Trocar foto' : 'Adicionar foto';

  return (
    <View style={styles.wrapper}>
      <Pressable
        onPress={choose}
        disabled={showSpinner}
        accessibilityRole="button"
        accessibilityLabel={uri ? 'Trocar foto do perfil' : 'Adicionar foto do perfil'}
        style={({ pressed }) => [
          styles.circle,
          { width: size, height: size, borderRadius: size / 2 },
          Boolean(error) && styles.circleError,
          pressed && !showSpinner && styles.circlePressed,
        ]}
      >
        {showSpinner ? (
          <ActivityIndicator color={colors.text} />
        ) : uri ? (
          <Image
            source={{ uri }}
            style={{ width: size, height: size, borderRadius: size / 2 }}
            accessibilityIgnoresInvertColors
          />
        ) : initials ? (
          <Text style={typography.sectionTitle}>{initials}</Text>
        ) : (
          <Text style={typography.caption}>Sem foto</Text>
        )}
      </Pressable>

      <View style={styles.action}>
        <TextLink label={actionLabel} onPress={choose} disabled={showSpinner} />
      </View>

      <View style={styles.message}>
        <FieldMessage error={problem ?? error} />
      </View>

      <ConfirmDialog
        visible={choosing}
        title="Foto do perfil"
        message="De onde você quer escolher?"
        actions={[
          { label: 'Tirar foto', onPress: () => void launch('camera') },
          { label: 'Escolher da galeria', onPress: () => void launch('library') },
        ]}
        dismissLabel="Cancelar"
        onDismiss={() => setChoosing(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', marginBottom: spacing.lg },
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  circlePressed: { opacity: 0.8 },
  circleError: { borderColor: colors.danger, borderWidth: sizes.borderStrong },
  action: { marginTop: spacing.sm },
  message: { alignSelf: 'stretch', alignItems: 'center' },
});
