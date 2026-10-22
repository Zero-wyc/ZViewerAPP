import Feather from '@expo/vector-icons/Feather';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ComponentProps, ReactNode } from 'react';
import { useAppearance } from '@/state/appearance';
import { mobilePalette } from '@/lib/mobileDesign';
import { MediaImage } from './MediaImage';

export function useMusicColors() {
  const theme = useAppearance(); const p = mobilePalette[theme.dark ? 'dark' : 'light'];
  return { ...p, dark: theme.dark, soft: theme.dark ? 'rgba(237,244,255,.07)' : 'rgba(30,55,85,.045)', glass: theme.dark ? 'rgba(22,31,43,.97)' : 'rgba(247,250,255,.97)', onText: theme.dark ? '#17212e' : '#fff' };
}
export function MusicIcon({ label, icon, onPress, disabled = false, selected = false, outlined = false, color, style, iconSize = 22 }: { label: string; icon: ComponentProps<typeof Feather>['name']; onPress: () => void; disabled?: boolean; selected?: boolean; outlined?: boolean; color?: string; iconSize?: number; style?: StyleProp<ViewStyle> }) {
  const p = useMusicColors();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected }} disabled={disabled} hitSlop={6} onPress={onPress} onAccessibilityTap={() => { if (!disabled) onPress(); }} style={[{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, borderWidth: outlined ? 1 : 0, borderColor: p.line, backgroundColor: selected ? p.soft : 'transparent', opacity: disabled ? .35 : 1 }, style]}><Feather name={icon} size={iconSize} color={color || p.text} /></Pressable>;
}
export function MusicButton({ label, onPress, disabled, secondary, selected }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean; selected?: boolean }) {
  const p = useMusicColors();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled, selected: !!selected }} disabled={disabled} onPress={onPress} onAccessibilityTap={() => { if (!disabled) onPress(); }} style={{ minHeight: 44, borderRadius: 10, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center', borderWidth: secondary ? 1 : 0, borderColor: p.line, backgroundColor: secondary ? selected ? p.soft : 'transparent' : p.text, opacity: disabled ? .35 : 1 }}><Text style={{ color: secondary ? p.text : p.onText, fontSize: 14, lineHeight: 20, fontWeight: '600' }}>{selected ? `✓ ${label}` : label}</Text></Pressable>;
}
export function MusicSection({ label }: { label: string }) {
  const p = useMusicColors();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 }}><Text style={{ color: p.onText, backgroundColor: p.text, fontSize: 10, lineHeight: 18, letterSpacing: 1.1, fontWeight: '700', paddingHorizontal: 8 }}>{label}</Text><View style={{ flex: 1, height: 1, backgroundColor: p.line }} /></View>;
}
export function MusicListItem({ title, subtitle, cover, active, number, onPress, children }: { title: string; subtitle?: string; cover?: string; active?: boolean; number?: number; onPress: () => void; children?: ReactNode }) {
  const p = useMusicColors();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, borderBottomWidth: .5, borderColor: p.line }}><Pressable accessibilityRole="button" accessibilityLabel={`播放 ${title}`} onPress={onPress} onAccessibilityTap={onPress} style={{ flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 }}>{cover ? <MediaImage source={{ uri: cover }} style={{ width: 44, height: 44, borderRadius: 8 }} /> : number !== undefined ? <View style={{ width: 26, alignItems: 'center' }}>{active ? <Feather name="volume-2" size={17} color={p.accent} /> : <Text style={{ fontSize: 13, color: p.muted, fontVariant: ['tabular-nums'] }}>{String(number).padStart(2, '0')}</Text>}</View> : null}<View style={{ flex: 1, minWidth: 0, gap: 4 }}><Text numberOfLines={2} style={{ color: active ? p.accent : p.text, fontSize: 15, lineHeight: 21, fontWeight: '500' }}>{title}</Text>{subtitle ? <Text numberOfLines={1} style={{ color: p.muted, fontSize: 12, lineHeight: 17 }}>{subtitle}</Text> : null}</View></Pressable>{children}</View>;
}
export function MusicOption({ label, value, selected, disabled, onPress }: { label: string; value?: string; selected?: boolean; disabled?: boolean; onPress: () => void }) {
  const p = useMusicColors();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected, disabled: !!disabled }} disabled={disabled} onPress={onPress} onAccessibilityTap={() => { if (!disabled) onPress(); }} style={{ minHeight: 48, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: .5, borderColor: p.line, opacity: disabled ? .4 : 1 }}><Text style={{ color: p.text, fontSize: 15, lineHeight: 21, flex: 1 }}>{label}</Text>{value ? <Text style={{ color: p.muted, fontSize: 13 }}>{value}</Text> : null}{selected !== undefined ? selected ? <Feather name="check" color={p.accent} size={18} /> : <View style={{ width: 18 }} /> : <Feather name="chevron-right" color={p.muted} size={17} />}</Pressable>;
}
