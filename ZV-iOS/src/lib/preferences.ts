import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
const memory = new Map<string, string>();
export async function readPreference<T>(key: string, defaults: T): Promise<T> {
  try {
    if (!/^[A-Za-z0-9._-]+$/.test(key)) return defaults;
    const file = Platform.OS === 'web' ? null : new File(Paths.document, 'preferences', `${key}.json`);
    const raw = Platform.OS === 'web' ? localStorage.getItem(key) || memory.get(key) : file?.exists ? await file.text() : await SecureStore.getItemAsync(key);
    return raw && raw.length <= 65536 ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch { return defaults; }
}
export async function writePreference(key: string, value: object) {
  if (!/^[A-Za-z0-9._-]+$/.test(key)) throw new Error('偏好名称无效');
  const raw = JSON.stringify(value); if (raw.length > 65536) throw new Error('偏好数据过大');
  if (Platform.OS === 'web') { memory.set(key, raw); localStorage.setItem(key, raw); }
  else { const directory = new Directory(Paths.document, 'preferences'); directory.create({ idempotent: true, intermediates: true }); const file = new File(directory, `${key}.json`); file.write(raw); }
}
