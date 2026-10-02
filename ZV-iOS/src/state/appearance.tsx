import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, ImageBackground, useColorScheme, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { readPreference, writePreference } from '@/lib/preferences';
import { appearanceDefaults as defaults, normalizeAppearance, type AppearancePreferences as Preferences } from '@/lib/appearancePreferences';
import { withDeadline } from '@/lib/deadline';
import { mobilePalette } from '@/lib/mobileDesign';
import { AppDialog } from '@/components/AppDialog';
import { AppearanceSettings } from '@/components/AppearanceSettings';

type Appearance = { dark: boolean; preferences: Preferences; open(): void; color(value: string, role?: string): string; styles<T>(value: T): T };
const Context = createContext<Appearance | null>(null);
const surfaces = new Set(['#111417', '#1b2024', '#141a1d', '#1b2326', '#1b2426', '#101719', '#20272a', '#202729', '#202628', '#24312d', '#243b30', '#253a30', '#33443a']);
const lines = new Set(['#343d41', '#485256', '#293033', '#40504a', '#4a5355', '#4a5557']);
const foreground = new Set(['#edf1ef']);
const muted = new Set(['#a8b3b6', '#7c888b', '#9aa5a7', '#7d898c', '#788588']);
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme(); const [preferences, setPreferences] = useState(defaults); const [visible, setVisible] = useState(false); const [ready, setReady] = useState(false); const [error, setError] = useState(''); const [systemReduce, setSystemReduce] = useState(false);
  useEffect(() => { let active = true; void withDeadline(() => readPreference('zviewer-appearance-v1', defaults), 5000).catch(() => defaults).then(value => { if (active) { setPreferences(normalizeAppearance(value)); setReady(true); } }); void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setSystemReduce(value); }).catch(() => {}); const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystemReduce); return () => { active = false; listener.remove(); }; }, []);
  useEffect(() => { if (ready) void writePreference('zviewer-appearance-v1', preferences).catch(() => setError('外观偏好保存失败')); }, [preferences, ready]);
  const dark = preferences.mode === 'system' ? system === 'dark' : preferences.mode === 'dark';
  const reduceMotion = preferences.reduceMotion || systemReduce;
  const theme = useMemo<Appearance>(() => {
    const palette = mobilePalette[dark ? 'dark' : 'light'];
    const color = (value: string, role = 'color') => {
      if (surfaces.has(value)) {
        if (role === 'color') return palette.onAccent;
        if (value === '#111417' && role === 'backgroundColor') return 'transparent';
        const hex = palette.surface;
        if (role === 'backgroundColor') { const number = parseInt(hex.slice(1), 16); return `rgba(${number >> 16},${number >> 8 & 255},${number & 255},${preferences.opacity})`; }
        return hex;
      }
      if (lines.has(value)) return palette.line;
      if (foreground.has(value)) return palette.text;
      if (muted.has(value)) return palette.muted;
      if (value === '#ffaaa5') return palette.error;
      if (value === '#65d59b') return palette.accent;
      return value;
    };
    const map = (value: unknown, role = ''): unknown => {
      if (typeof value === 'string') return color(value, role);
      if (Array.isArray(value)) return value.map(item => map(item));
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === 'borderRadius' && typeof item === 'number' && item <= 28 ? preferences.radius : map(item, key)]));
      return value;
    };
    return { dark, preferences: { ...preferences, reduceMotion }, open: () => setVisible(true), color, styles: <T,>(value: T) => map(value) as T };
  }, [dark, preferences, reduceMotion]);
  const patch = (value: Partial<Preferences>) => setPreferences(old => ({ ...old, ...value }));
  const importImage = async () => {
    try {
      const value = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true }); if (value.canceled) return;
      const asset = value.assets[0]; const original = new File(asset.uri); if (original.size > 20 * 1024 * 1024) throw new Error('背景图片需小于 20 MiB');
      const directory = new Directory(Paths.document, 'appearance'); directory.create({ idempotent: true, intermediates: true });
      const suffix = asset.name.match(/\.(png|jpg|jpeg|webp|heic)$/i)?.[0] || '.jpg';
      const target = new File(directory, `background-${Date.now()}${suffix}`); original.copy(target);
      const previous = preferences.image; patch({ image: target.uri });
      if (previous.startsWith(directory.uri)) { const old = new File(previous); if (old.exists) old.delete(); }
      setError('');
    } catch { setError('无法导入背景，请选择小于 20 MiB 的有效图片'); }
  };
  return <Context.Provider value={theme}><View style={{ flex: 1, backgroundColor: mobilePalette[dark ? 'dark' : 'light'].background }}>
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, overflow: 'hidden' }}>
      <ImageBackground source={preferences.image ? { uri: preferences.image } : require('../../assets/images/mobile-wallpaper.jpg')} blurRadius={reduceMotion ? 0 : preferences.blur} resizeMode="cover" style={{ flex: 1, transform: [{ translateX: preferences.x }, { translateY: preferences.y }, { scale: preferences.scale }, { rotate: `${preferences.rotation}deg` }] }} />
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: `rgba(255,255,255,${preferences.whiteOverlay})` }} />
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: `rgba(0,0,0,${preferences.overlay})` }} />
    </View>
    <StatusBar style={dark ? 'light' : 'dark'} />{children}
    <AppDialog visible={visible} title="外观设置" close={() => setVisible(false)}>
      <AppearanceSettings preferences={preferences} dark={dark} patch={patch} importImage={() => void importImage()} error={error} />
    </AppDialog>
  </View></Context.Provider>;
}

export function useAppearance() { const value = useContext(Context); if (!value) throw new Error('Missing AppearanceProvider'); return value; }
