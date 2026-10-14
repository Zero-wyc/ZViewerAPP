import Feather from '@expo/vector-icons/Feather';
import Slider from '@react-native-community/slider';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { mobilePalette } from '@/lib/mobileDesign';
import { useAppearance } from '@/state/appearance';

export function useMediaPalette() {
  return mobilePalette[useAppearance().dark ? 'dark' : 'light'];
}

export function MediaTabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  const p = useMediaPalette();
  return <View accessibilityRole="tablist" style={[panel.tabs, { borderColor: p.line, backgroundColor: p.container }]}>{tabs.map(tab => <Pressable key={tab.value} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected: value === tab.value }} onPress={() => onChange(tab.value)} style={[panel.tab, { backgroundColor: value === tab.value ? p.accent : 'transparent' }]}><Text style={{ color: value === tab.value ? p.onAccent : p.muted, fontSize: 16, fontWeight: '600' }}>{tab.label}</Text></Pressable>)}</View>;
}

export function MediaSlider({ label, value, minimumValue = 0, maximumValue = 1, step, displayValue, onChange, onComplete, disabled = false, inline = false }: { label: string; value: number; minimumValue?: number; maximumValue?: number; step?: number; displayValue: string; onChange?: (value: number) => void; onComplete?: (value: number) => void; disabled?: boolean; inline?: boolean }) {
  const p = useMediaPalette();
  return <View style={[panel.sliderCard, { backgroundColor: p.field, opacity: disabled ? .5 : 1 }, inline && { flexDirection: 'row', alignItems: 'center', backgroundColor: 'transparent', borderRadius: 0, borderBottomWidth: 1, borderColor: p.line, paddingHorizontal: 0, paddingVertical: 8, gap: 8 }]}><Text style={{ color: p.text, fontSize: 15, ...(inline ? { width: 72 } : {}) }}>{label}</Text><View style={[panel.row, inline && { flex: 1, minWidth: 0, gap: 4 }]}><Slider accessibilityLabel={label} accessibilityValue={{ text: displayValue }} style={{ flex: 1, height: 36, minWidth: 0 }} minimumValue={minimumValue} maximumValue={maximumValue} step={step} value={value} disabled={disabled} minimumTrackTintColor={p.accent} maximumTrackTintColor={p.container} thumbTintColor={p.accent} onValueChange={onChange} onSlidingComplete={onComplete} /><Text style={{ color: p.muted, fontSize: 13, minWidth: 44, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{displayValue}</Text></View></View>;
}

export function MediaSwitch({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  const p = useMediaPalette();
  return <View style={[panel.row, { minHeight: 52, justifyContent: 'space-between' }]}><Text style={{ color: p.text, fontSize: 16, flex: 1 }}>{label}</Text><Switch accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ false: p.line, true: p.accent }} thumbColor="#fff" /></View>;
}

export function MediaAction({ label, icon, onPress, disabled, danger = false, selected = false, iconOnly = false }: { label: string; icon?: ComponentProps<typeof Feather>['name']; onPress: () => void; disabled?: boolean; danger?: boolean; selected?: boolean; iconOnly?: boolean }) {
  const p = useMediaPalette();
  const ink = danger ? p.error : selected ? p.onAccent : p.text;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled, selected }} disabled={disabled} onPress={onPress} style={[panel.action, { flex: iconOnly ? undefined : 1, width: iconOnly ? 48 : undefined, borderColor: danger || selected ? 'transparent' : p.line, backgroundColor: danger ? `${p.error}25` : selected ? p.accent : p.container, opacity: disabled ? .4 : 1 }]}>{icon ? <Feather name={icon} color={ink} size={20} /> : null}{!iconOnly ? <Text style={{ color: ink, fontSize: 15, fontWeight: '500', flexShrink: 1 }}>{label}</Text> : null}</Pressable>;
}

export const panel = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tabs: { flexDirection: 'row', padding: 4, gap: 4, borderWidth: 1, borderRadius: 14, marginBottom: 10 },
  tab: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  sliderCard: { borderRadius: 12, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4, gap: 3 },
  action: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
});
