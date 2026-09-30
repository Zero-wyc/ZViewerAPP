import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
const memory = new Map<string, string>();
export async function readPreference<T>(key: string, defaults: T): Promise<T> {
  try { const raw = Platform.OS === 'web' ? memory.get(key) : await SecureStore.getItemAsync(key); return raw ? { ...defaults, ...JSON.parse(raw) } : defaults; } catch { return defaults; }
}
export async function writePreference(key: string, value: object) {
  const raw = JSON.stringify(value); if (Platform.OS === 'web') memory.set(key, raw); else await SecureStore.setItemAsync(key, raw);
}
