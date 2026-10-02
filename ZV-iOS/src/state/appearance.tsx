import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, ImageBackground, Modal, Pressable, ScrollView, Switch, Text, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Slider from '@react-native-community/slider';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { readPreference, writePreference } from '@/lib/preferences';

type Preferences = { mode: 'light' | 'dark' | 'system'; image: string; radius: number; opacity: number; blur: number; x: number; y: number; scale: number; rotation: number; overlay: number; reduceMotion: boolean };
const defaults: Preferences = { mode: 'system', image: '', radius: 12, opacity: 0.95, blur: 0, x: 0, y: 0, scale: 1, rotation: 0, overlay: 0.3, reduceMotion: false };
type Appearance = { dark: boolean; preferences: Preferences; open(): void; color(value: string, role?: string): string; styles<T>(value: T): T };
const Context = createContext<Appearance | null>(null);
const surfaces = new Set(['#111417', '#1b2024', '#141a1d', '#1b2326', '#1b2426', '#101719', '#20272a', '#202729', '#202628', '#24312d', '#243b30', '#253a30', '#33443a']);
const lines = new Set(['#343d41', '#485256', '#293033', '#40504a', '#4a5355', '#4a5557']);
const foreground = new Set(['#edf1ef']);
const muted = new Set(['#a8b3b6', '#7c888b', '#9aa5a7', '#7d898c', '#788588']);
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme(); const [preferences, setPreferences] = useState(defaults); const [visible, setVisible] = useState(false); const [ready, setReady] = useState(false); const [error, setError] = useState(''); const [systemReduce, setSystemReduce] = useState(false);
  useEffect(() => { let active = true; void readPreference('zviewer-appearance-v1', defaults).then(value => { if (active) { setPreferences({ ...defaults, ...value, mode: ['light', 'dark', 'system'].includes(value.mode) ? value.mode : 'system' }); setReady(true); } }); void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setSystemReduce(value); }); const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystemReduce); return () => { active = false; listener.remove(); }; }, []);
  useEffect(() => { if (ready) void writePreference('zviewer-appearance-v1', preferences).catch(() => setError('外观偏好保存失败')); }, [preferences, ready]);
  const dark = preferences.mode === 'system' ? system === 'dark' : preferences.mode === 'dark';
  const reduceMotion = preferences.reduceMotion || systemReduce;
  const theme = useMemo<Appearance>(() => {
    const color = (value: string, role = 'color') => {
      if (surfaces.has(value)) {
        if (role === 'color') return dark ? '#111417' : '#14251d';
        if (value === '#111417' && preferences.image) return 'transparent';
        const hex = dark ? value : value === '#111417' ? '#f1f5f3' : ['#24312d', '#243b30', '#253a30', '#33443a'].includes(value) ? '#dcf1e5' : '#ffffff';
        if (preferences.image && role === 'backgroundColor') { const number = parseInt(hex.slice(1), 16); return `rgba(${number >> 16},${number >> 8 & 255},${number & 255},${preferences.opacity})`; }
        return hex;
      }
      if (lines.has(value)) return dark ? value : '#bdcbc3';
      if (foreground.has(value)) return dark ? value : '#14251d';
      if (muted.has(value)) return dark ? '#a8b3b6' : '#53655b';
      if (value === '#ffaaa5') return dark ? value : '#a52b27';
      if (value === '#65d59b' && role === 'color') return dark ? value : '#167a4c';
      return value;
    };
    const map = (value: unknown, role = ''): unknown => {
      if (typeof value === 'string') return color(value, role);
      if (Array.isArray(value)) return value.map(item => map(item));
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === 'borderRadius' && typeof item === 'number' && item <= 24 ? preferences.radius : map(item, key)]));
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
      // eslint-disable-next-line react-hooks/purity -- only invoked by the image picker button, after its asynchronous result.
      const target = new File(directory, `background-${Date.now()}${suffix}`); original.copy(target);
      const previous = preferences.image; patch({ image: target.uri });
      if (previous.startsWith(directory.uri)) { const old = new File(previous); if (old.exists) old.delete(); }
      setError('');
    } catch { setError('无法导入背景，请选择小于 20 MiB 的有效图片'); }
  };
  const row = (label: string, action: () => void) => <Pressable accessibilityRole="button" onPress={action} style={{ minHeight: 44, padding: 12, backgroundColor: dark ? '#243b30' : '#dcf1e5', borderRadius: 10 }}><Text style={{ color: dark ? '#edf1ef' : '#14251d' }}>{label}</Text></Pressable>;
  return <Context.Provider value={theme}><View style={{ flex: 1, backgroundColor: dark ? '#111417' : '#f1f5f3' }}>
    {preferences.image ? <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, overflow: 'hidden' }}><ImageBackground source={{ uri: preferences.image }} blurRadius={preferences.blur} resizeMode="cover" style={{ flex: 1, transform: [{ translateX: preferences.x }, { translateY: preferences.y }, { scale: preferences.scale }, { rotate: `${preferences.rotation}deg` }] }} /><View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: `rgba(0,0,0,${preferences.overlay})` }} /></View> : null}
    <StatusBar style={dark ? 'light' : 'dark'} />{children}
    <Modal visible={visible} animationType={reduceMotion ? 'none' : 'slide'} presentationStyle="fullScreen" supportedOrientations={['portrait', 'portrait-upside-down', 'landscape']} onRequestClose={() => setVisible(false)}><SafeAreaView style={{ flex: 1, backgroundColor: dark ? '#111417' : '#f1f5f3' }}><View style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}><Text style={{ flex: 1, fontSize: 22, color: dark ? '#edf1ef' : '#14251d' }}>全局外观</Text>{row('完成', () => setVisible(false))}</View><ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled"><View style={{ flexDirection: 'row', gap: 12 }}>{(['system', 'light', 'dark'] as const).map((mode, index) => <View key={mode}>{row(`${preferences.mode === mode ? '✓ ' : ''}${['跟随系统', '浅色', '深色'][index]}`, () => patch({ mode }))}</View>)}</View>{row('选择本地背景图', () => void importImage())}{row('移除背景图', () => patch({ image: '' }))}{(['radius', 'opacity', 'blur', 'x', 'y', 'scale', 'rotation', 'overlay'] as const).map((key, index) => <View key={key}><Text style={{ color: dark ? '#edf1ef' : '#14251d' }}>{['圆角', '表面不透明度', '背景模糊', '水平位置', '垂直位置', '缩放', '旋转', '遮罩'][index]} · {preferences[key].toFixed(2)}</Text><Slider accessibilityLabel={key} minimumValue={[0, 0.5, 0, -200, -200, 1, -180, 0][index]} maximumValue={[24, 1, 30, 200, 200, 3, 180, 0.9][index]} value={preferences[key]} onSlidingComplete={value => patch({ [key]: value })} /></View>)}<View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}><Text style={{ color: dark ? '#edf1ef' : '#14251d' }}>减少动态效果</Text><Switch value={preferences.reduceMotion} onValueChange={value => patch({ reduceMotion: value })} /></View><Text style={{ color: dark ? '#a8b3b6' : '#53655b' }}>设置面板使用普通表面；背景模糊仅用于背景图。主题切换保持媒体实例。</Text>{error ? <Text style={{ color: '#c74740' }}>{error}</Text> : null}</ScrollView></SafeAreaView></Modal>
  </View></Context.Provider>;
}
export function useAppearance() { const value = useContext(Context); if (!value) throw new Error('Missing AppearanceProvider'); return value; }
