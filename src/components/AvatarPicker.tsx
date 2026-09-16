import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { colors, spacing, typography } from '@/theme/tokens';

type Props = {
  /** URI local recém-escolhida, ou URL pública da foto já salva. */
  uri: string | null;
  onPick: (localUri: string) => void;
  error?: string | null;
  uploading?: boolean;
  size?: number;
};

/**
 * Foto do perfil (campo obrigatório da História 1).
 *
 * Oferece câmera e galeria: quem ainda não tem foto vai tirar uma na hora, e
 * quem já tem prefere escolher. Corta em 1:1 na própria escolha para a foto
 * chegar já no formato em que é exibida.
 */
export function AvatarPicker({ uri, onPick, error, uploading = false, size = 112 }: Props) {
  const [busy, setBusy] = useState(false);

  async function launch(source: 'camera' | 'library') {
    setBusy(true);
    try {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          'Permissão necessária',
          source === 'camera'
            ? 'Autorize o acesso à câmera nas configurações do aparelho para tirar a foto.'
            : 'Autorize o acesso às fotos nas configurações do aparelho para escolher a imagem.',
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
      Alert.alert('Erro', 'Não foi possível abrir a seleção de foto. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  function choose() {
    Alert.alert('Foto do perfil', 'De onde você quer escolher?', [
      { text: 'Tirar foto', onPress: () => void launch('camera') },
      { text: 'Escolher da galeria', onPress: () => void launch('library') },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  const showSpinner = busy || uploading;

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
          <ActivityIndicator color={colors.primary} />
        ) : uri ? (
          <Image
            source={{ uri }}
            style={{ width: size, height: size, borderRadius: size / 2 }}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Text style={styles.placeholder}>foto</Text>
        )}
      </Pressable>

      <Pressable onPress={choose} disabled={showSpinner} accessibilityRole="button" hitSlop={8}>
        <Text style={styles.action}>{uri ? 'Trocar foto' : 'Adicionar foto'}</Text>
      </Pressable>

      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', marginBottom: spacing.lg },
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  circlePressed: { opacity: 0.8 },
  circleError: { borderColor: colors.danger, borderWidth: 2 },
  placeholder: { ...typography.helper, textTransform: 'lowercase' },
  action: {
    ...typography.helper,
    color: colors.primary,
    fontWeight: '700',
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
  },
  error: { ...typography.helper, color: colors.danger, marginTop: spacing.xs, textAlign: 'center' },
});
