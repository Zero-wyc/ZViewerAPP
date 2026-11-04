import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type StyleProp, type TextInputProps, type ViewStyle, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DynamicText as Text } from '@/components/DynamicText';
import { mobilePalette } from '@/lib/mobileDesign';
import { useAppearance } from '@/state/appearance';
import { Surface } from './Surface';

// Native counterparts of the shared `.app-shell` classes in src/styles.css,
// src/mobile/appearance.css and about-app.css used by Android / HarmonyOS.
const RELEASES_URL = 'https://github.com/Zero-wyc/ZViewerAPP/releases';
const rgba = (hex: string, alpha: number) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${n >> 8 & 255},${n & 255},${alpha})`; };

export function useHomeTokens() {
  const theme = useAppearance(); const p = mobilePalette[theme.dark ? 'dark' : 'light'];
  return {
    p, dark: theme.dark, radius: theme.preferences.radius,
    glass: rgba(p.surface, Math.max(.2, theme.preferences.opacity)),
    field: rgba(p.field, theme.dark ? .68 : .66),
  };
}

export function GlassCard({ children, style, testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const t = useHomeTokens();
  return <Surface testID={testID} style={[{ borderWidth: 1, borderColor: t.p.line, borderRadius: t.radius, backgroundColor: t.glass }, style]}>{children}</Surface>;
}

export function FieldLabel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useHomeTokens();
  return <View style={style}><Text style={{ color: t.p.text, fontSize: 13, fontWeight: '700', marginBottom: 8 }}>{children}</Text></View>;
}

type IconName = ComponentProps<typeof Feather>['name'];
export function InputShell({ icon, trailing, compact = false, ...props }: TextInputProps & { icon: IconName; trailing?: ReactNode; compact?: boolean }) {
  const t = useHomeTokens();
  return <View style={[home.shell, { minHeight: compact ? 46 : 50, borderColor: t.p.line, borderRadius: t.radius, backgroundColor: t.field }]}>
    <Feather name={icon} size={19} color={t.p.muted} />
    <TextInput placeholderTextColor={rgba(t.p.muted, .7)} autoCorrect={false} {...props} style={[{ flex: 1, minWidth: 0, minHeight: compact ? 44 : 48, color: t.p.text, fontSize: 15 }, props.style]} />
    {trailing}
  </View>;
}

export function PrimaryButton({ label, icon, onPress, disabled, busy, arrow = true, style }: { label: string; icon: IconName; onPress: () => void; disabled?: boolean; busy?: boolean; arrow?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = useHomeTokens();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled, busy: !!busy }} disabled={disabled} onPress={onPress}
    style={[home.primary, { borderRadius: t.radius, backgroundColor: t.p.accent, opacity: disabled ? .72 : 1 }, style]}>
    {busy ? <ActivityIndicator size="small" color={t.p.onAccent} style={{ marginLeft: 10 }} /> : <Feather name={icon} size={19} color={t.p.onAccent} style={{ marginLeft: 10 }} />}
    <Text numberOfLines={1} style={{ color: t.p.onAccent, fontSize: 17, fontWeight: '800', flexShrink: 1 }}>{label}</Text>
    <View style={{ flex: 1 }} />
    {arrow && !busy ? <Feather name="arrow-right" size={19} color={t.p.onAccent} /> : null}
  </Pressable>;
}

export function GlassIconButton({ label, icon, onPress, disabled, size = 44, children }: { label: string; icon?: IconName; onPress: () => void; disabled?: boolean; size?: number; children?: ReactNode }) {
  const t = useHomeTokens();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
    style={{ width: size, height: size, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: t.p.line, borderRadius: t.radius, backgroundColor: t.glass, opacity: disabled ? .45 : 1 }}>
    {children ?? (icon ? <Feather name={icon} size={21} color={t.p.text} /> : null)}
  </Pressable>;
}

export function Checkbox({ label, value, disabled, onChange }: { label: string; value: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  const t = useHomeTokens();
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked: value, disabled: !!disabled }} disabled={disabled} onPress={() => onChange(!value)}
    style={{ flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 44, opacity: disabled ? .5 : 1 }}>
    <View style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: value ? t.p.accent : t.p.muted, backgroundColor: value ? t.p.accent : t.field, alignItems: 'center', justifyContent: 'center' }}>{value ? <Feather name="check" size={14} color={t.p.onAccent} /> : null}</View>
    <Text style={{ flex: 1, color: t.p.muted, fontSize: 13, lineHeight: 20 }}>{label}</Text>
  </Pressable>;
}

export function Segmented<T extends string>({ label, value, options, onChange, disabled }: { label: string; value: T; options: { id: T; name: string; icon: IconName }[]; onChange: (value: T) => void; disabled?: boolean }) {
  const t = useHomeTokens();
  return <View accessibilityRole="tablist" accessibilityLabel={label} style={{ flexDirection: 'row', gap: 4, padding: 4, borderWidth: 1, borderColor: t.p.line, borderRadius: t.radius, backgroundColor: t.field }}>
    {options.map(option => { const active = option.id === value; return <Pressable key={option.id} accessibilityRole="tab" accessibilityLabel={option.name} accessibilityState={{ selected: active, disabled: !!disabled }} disabled={disabled} onPress={() => onChange(option.id)}
      style={{ flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: Math.max(0, t.radius - 4), backgroundColor: active ? t.p.accent : 'transparent' }}>
      <Feather name={option.icon} size={17} color={active ? t.p.onAccent : t.p.muted} /><Text style={{ color: active ? t.p.onAccent : t.p.muted, fontSize: 16 }}>{option.name}</Text>
    </Pressable>; })}
  </View>;
}

export function SelectShell<T extends string>({ label, icon, value, options, onChange, disabled }: { label: string; icon: IconName; value: T; options: { id: T; name: string }[]; onChange: (value: T) => void; disabled?: boolean }) {
  const t = useHomeTokens(); const [open, setOpen] = useState(false);
  return <View style={{ gap: 6 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityValue={{ text: options.find(item => item.id === value)?.name }} accessibilityState={{ expanded: open, disabled: !!disabled }} disabled={disabled} onPress={() => setOpen(previous => !previous)}
      style={[home.shell, { minHeight: 50, borderColor: t.p.line, borderRadius: t.radius, backgroundColor: t.field, opacity: disabled ? .6 : 1 }]}>
      <Feather name={icon} size={19} color={t.p.muted} />
      <Text numberOfLines={1} style={{ flex: 1, color: t.p.text, fontSize: 15 }}>{options.find(item => item.id === value)?.name}</Text>
      <Feather name={open ? 'chevron-up' : 'chevron-down'} size={18} color={t.p.muted} />
    </Pressable>
    {open && !disabled ? <View style={{ borderWidth: 1, borderColor: t.p.line, borderRadius: t.radius, backgroundColor: t.p.surface, overflow: 'hidden' }}>
      {options.map(option => <Pressable key={option.id} accessibilityRole="button" accessibilityLabel={option.name} accessibilityState={{ selected: option.id === value }} onPress={() => { onChange(option.id); setOpen(false); }}
        style={{ minHeight: 44, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ flex: 1, color: t.p.text, fontSize: 15 }}>{option.name}</Text>{option.id === value ? <Feather name="check" size={18} color={t.p.accent} /> : null}
      </Pressable>)}
    </View> : null}
  </View>;
}

export function AppIcon({ size = 38 }: { size?: number }) {
  const t = useHomeTokens();
  return <Image accessibilityLabel="ZViewer 应用图标" source={require('../../assets/images/zviewer-icon.png')} style={{ width: size, height: size, borderRadius: t.radius, flexShrink: 0 }} />;
}

/** Floating “关于应用” and “外观设置” shortcuts (`.appearance-trigger`). */
export function HomeShortcuts({ openAppearance }: { openAppearance: () => void }) {
  const t = useHomeTokens(); const insets = useSafeAreaInsets(); const [about, setAbout] = useState(false);
  const trigger = (label: string, name: ComponentProps<typeof Ionicons>['name'], bottom: number, onPress: () => void) => <Surface style={{ position: 'absolute', right: 20 + insets.right, bottom: bottom + insets.bottom, width: 52, height: 52, borderRadius: 18, borderWidth: 1, borderColor: t.p.line, backgroundColor: t.glass, zIndex: 40 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={name} size={24} color={t.p.text} /></Pressable>
  </Surface>;
  return <>
    {trigger('关于应用', 'information-circle-outline', 88, () => setAbout(true))}
    {trigger('外观设置', 'color-palette-outline', 24, openAppearance)}
    <AboutDialog visible={about} close={() => setAbout(false)} />
  </>;
}

function AboutDialog({ visible, close }: { visible: boolean; close: () => void }) {
  const t = useHomeTokens(); const { width } = useWindowDimensions(); const theme = useAppearance(); const [message, setMessage] = useState('');
  const version = Constants.expoConfig?.version || '—';
  const build = Constants.expoConfig?.ios?.buildNumber;
  const open = async () => { try { setMessage(''); await WebBrowser.openBrowserAsync(RELEASES_URL); } catch { setMessage('无法打开浏览器'); } };
  return <Modal visible={visible} transparent animationType={theme.preferences.reduceMotion ? 'none' : 'fade'} supportedOrientations={['portrait', 'portrait-upside-down', 'landscape']} onRequestClose={close}>
    <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <Pressable accessible={false} onPress={close} style={StyleSheet.absoluteFill} />
      <Surface readable accessibilityViewIsModal testID="about-dialog" style={{ width: Math.min(480, width - 32), maxHeight: '92%', borderRadius: t.radius, borderWidth: 1, borderColor: t.p.line }}>
        <ScrollView contentContainerStyle={{ padding: width <= 420 ? 18 : 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingBottom: 18, borderBottomWidth: 1, borderColor: t.p.line }}>
            <View style={{ flex: 1 }}><Text style={home.eyebrow(t.p.accent)}>ZVIEWER</Text><Text style={{ color: t.p.text, fontSize: 24, marginTop: 4 }}>关于应用</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel="关闭关于应用" onPress={close} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Feather name="x" size={22} color={t.p.text} /></Pressable>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginVertical: 26 }}><AppIcon /><View style={{ flex: 1 }}><Text style={{ color: t.p.text, fontSize: 23, fontWeight: '700' }}>ZViewer</Text><Text style={{ color: t.p.muted, fontSize: 13, lineHeight: 21 }}>和朋友一起看，一起听。</Text></View></View>
          <View style={{ padding: 16, borderWidth: 1, borderColor: t.p.line, borderRadius: t.radius, marginBottom: 20, gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><Text style={{ color: t.p.text, fontSize: 15 }}>当前版本</Text><Text style={{ color: t.p.text, fontSize: 15, fontWeight: '700' }}>V{version}</Text></View>
            <Text style={{ color: t.p.muted, fontSize: 13 }}>iOS{build ? ` · 构建 ${build}` : ''}</Text>
          </View>
          <PrimaryButton label="查看发布记录" icon="external-link" arrow={false} onPress={() => void open()} style={{ minHeight: 46, marginTop: 0, justifyContent: 'center' }} />
          <Text accessibilityLiveRegion="polite" style={{ color: t.p.muted, fontSize: 13, lineHeight: 21, minHeight: 22, marginTop: 8 }}>{message || 'iOS 安装包需自行签名后侧载，新版本请在发布记录中查看。'}</Text>
        </ScrollView>
      </Surface>
    </View>
  </Modal>;
}

export const home = {
  shell: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, borderWidth: 1 } satisfies ViewStyle,
  primary: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 52, paddingHorizontal: 14, marginTop: 20 } satisfies ViewStyle,
  eyebrow: (color: string) => ({ color, fontSize: 12, fontWeight: '800' as const }),
};
