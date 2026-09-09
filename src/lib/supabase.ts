import 'react-native-url-polyfill/auto';
import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Faltam EXPO_PUBLIC_SUPABASE_URL e/ou EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY. ' +
      'Copie .env.example para .env e preencha.',
  );
}

/**
 * O refresh token fica no Keychain (iOS) / Keystore (Android), não em
 * AsyncStorage — em device com root/jailbreak AsyncStorage é texto plano.
 *
 * SecureStore limita cada valor a 2048 bytes e a sessão do Supabase costuma
 * passar disso quando o JWT carrega metadata. Por isso o valor é fatiado em
 * pedaços: uma chave índice com a contagem, e N chaves com os fragmentos.
 */
const CHUNK_SIZE = 1800;

async function setChunked(key: string, value: string): Promise<void> {
  const total = Math.ceil(value.length / CHUNK_SIZE);
  await SecureStore.setItemAsync(`${key}.chunks`, String(total));
  for (let i = 0; i < total; i++) {
    await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
  }
}

async function getChunked(key: string): Promise<string | null> {
  const totalRaw = await SecureStore.getItemAsync(`${key}.chunks`);
  if (!totalRaw) return null;
  const total = Number(totalRaw);
  if (!Number.isFinite(total) || total <= 0) return null;

  const parts: string[] = [];
  for (let i = 0; i < total; i++) {
    const part = await SecureStore.getItemAsync(`${key}.${i}`);
    // Fragmento faltando: a sessão está corrompida. Trata como "sem sessão"
    // em vez de devolver um JSON truncado que quebraria o parse do SDK.
    if (part === null) return null;
    parts.push(part);
  }
  return parts.join('');
}

async function removeChunked(key: string): Promise<void> {
  const totalRaw = await SecureStore.getItemAsync(`${key}.chunks`);
  const total = Number(totalRaw ?? 0);
  for (let i = 0; i < total; i++) {
    await SecureStore.deleteItemAsync(`${key}.${i}`);
  }
  await SecureStore.deleteItemAsync(`${key}.chunks`);
}

const secureStorage: SupportedStorage = {
  getItem: getChunked,
  setItem: setChunked,
  removeItem: removeChunked,
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // Na web o SecureStore não existe; o SDK cai no localStorage.
    storage: Platform.OS === 'web' ? undefined : secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Mobile não recebe a sessão pela URL; o deep link é tratado explicitamente.
    detectSessionInUrl: false,
  },
});

export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_KEY = supabaseKey;
