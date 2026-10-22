import { useState } from 'react';
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import type { AppearancePreferences } from '@/lib/appearancePreferences';
import { mobilePalette, mobileRadiusPresets } from '@/lib/mobileDesign';
import { Surface } from './Surface';

type Props = { preferences: AppearancePreferences; dark: boolean; patch: (value: Partial<AppearancePreferences>) => void; importImage: () => void; error: string };

export function AppearanceSheet({ visible, close, reducedMotion, ...props }: Props & { visible: boolean; close: () => void; reducedMotion?: boolean }) {
  const { preferences, dark } = props; const p = mobilePalette[dark ? 'dark' : 'light']; const { height } = useWindowDimensions(); const insets = useSafeAreaInsets();
  const color = parseInt(p.surface.slice(1), 16);
  return <Modal visible={visible} transparent animationType={(reducedMotion ?? preferences.reduceMotion) ? 'none' : 'fade'} supportedOrientations={['portrait', 'portrait-upside-down', 'landscape']} onRequestClose={close}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', paddingTop: insets.top, backgroundColor: 'rgba(7,17,30,0.55)' }}>
      <Pressable accessible={false} importantForAccessibility="no" onPress={close} style={StyleSheet.absoluteFill} />
      <Surface accessibilityViewIsModal testID="appearance-sheet" style={{ width: '100%', maxWidth: 640, maxHeight: Math.min(height * .88, 900), alignSelf: 'center', flexShrink: 1, borderWidth: 1, borderColor: p.line, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: 'rgba(' + (color >> 16) + ',' + (color >> 8 & 255) + ',' + (color & 255) + ',' + preferences.opacity + ')' }}>
        <View style={appearance.header}><View style={{ flex: 1, gap: 5 }}><Text style={{ color: p.accent, fontSize: 10, fontWeight: '700', letterSpacing: 1.4 }}>ZVIEWER · APPEARANCE</Text><Text style={{ color: p.text, fontSize: 24, fontWeight: '500' }}>外观设置</Text></View><Pressable accessibilityRole="button" accessibilityLabel="关闭外观设置" onAccessibilityTap={close} onPress={close} style={appearance.closeTouch}><View style={[appearance.close, { backgroundColor: p.field, borderColor: p.line }]}><Feather name="x" size={20} color={p.text} /></View></Pressable></View>
        <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0, flexShrink: 1, minHeight: 0 }} contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 26 + insets.bottom }}><AppearanceSettings {...props} /></ScrollView>
      </Surface>
    </KeyboardAvoidingView>
  </Modal>;
}

export function AppearanceSettings({ preferences, dark, patch, importImage, error }: Props) {
  const p = mobilePalette[dark ? 'dark' : 'light'];
  const [url, setUrl] = useState(preferences.image.startsWith('http') ? preferences.image : ''); const [urlError, setUrlError] = useState('');
  const [ranges, setRanges] = useState<Partial<Record<keyof AppearancePreferences, number>>>({});
  const button = (label: string, action: () => void, active = false, icon?: 'image' | 'rotate-ccw') => <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }} onAccessibilityTap={action} onPress={action} style={{ flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', gap: 6, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: active ? p.accent : p.line, borderRadius: preferences.radius, backgroundColor: active ? p.accent : p.field }}>{icon ? <Feather name={icon} size={17} color={p.text} /> : null}<Text style={{ color: active ? p.onAccent : p.text, fontSize: 15, fontWeight: active ? '600' : '400', flexShrink: 1 }}>{label}</Text></Pressable>;
  const range = (key: keyof AppearancePreferences, label: string, min: number, max: number, factor = 1, unit = '', disabled = false) => {
    const value = ranges[key] ?? Number(preferences[key]); const displayed = Math.round(value * factor) + unit;
    return <View key={key} style={{ marginVertical: 12, opacity: disabled ? .4 : 1 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}><Text style={{ color: p.text, fontSize: 13 }}>{label}</Text><Text style={{ color: p.text, fontSize: 13, fontWeight: '600' }}>{displayed}</Text></View>
      <Slider accessibilityLabel={label} accessibilityValue={{ text: displayed }} disabled={disabled} style={{ width: '100%', height: 30 }} minimumValue={min} maximumValue={max} value={value} minimumTrackTintColor={p.accent} maximumTrackTintColor={p.field} thumbTintColor={p.accent} onValueChange={number => setRanges(old => ({ ...old, [key]: number }))} onSlidingComplete={number => { setRanges(old => { const next = { ...old }; delete next[key]; return next; }); patch({ [key]: number }); }} />
    </View>;
  };
  const applyUrl = () => { if (url.trim() && !/^https?:\/\//i.test(url.trim())) { setUrlError('请输入 http 或 https 图片链接'); return; } patch({ image: url.trim() }); setUrlError(''); };
  const toggleReducedMotion = () => patch({ reduceMotion: !preferences.reduceMotion });
  return <>
    <View style={appearance.group}><Text style={[appearance.groupTitle, { color: p.muted }]}>显示</Text>
      <View style={appearance.segments}>{(['light', 'dark', 'system'] as const).map((mode, index) => <View key={mode} style={{ flex: 1 }}>{button(['浅色', '深色', '跟随系统'][index], () => patch({ mode }), preferences.mode === mode)}</View>)}</View>
      <View accessibilityLabel="圆角" style={appearance.segments}>{mobileRadiusPresets.map(preset => <View key={preset.value} style={{ flex: 1 }}>{button(preset.name, () => patch({ radius: preset.value }), preferences.radius === preset.value)}</View>)}</View>
      {range('opacity', '玻璃透明度', .2, 1, 100, '%', preferences.reduceMotion)}{range('glassBlur', '卡片模糊度', 0, 40, 1, 'px', preferences.reduceMotion)}
      <Pressable accessibilityRole="checkbox" accessibilityLabel="精简动画" accessibilityState={{ checked: preferences.reduceMotion }} onAccessibilityTap={toggleReducedMotion} onPress={toggleReducedMotion} style={[appearance.toggle, { borderColor: p.line }]}><View style={{ flex: 1, gap: 4 }}><Text style={{ color: p.text, fontSize: 14 }}>精简动画</Text><Text style={{ color: p.muted, fontSize: 11 }}>关闭背景和卡片模糊</Text></View><View style={{ width: 21, height: 21, borderWidth: 1, borderColor: preferences.reduceMotion ? p.accent : p.muted, borderRadius: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: preferences.reduceMotion ? p.accent : p.field }}>{preferences.reduceMotion ? <Feather name="check" size={16} color={p.onAccent} /> : null}</View></Pressable>
    </View>
    <View style={[appearance.group, { marginTop: 18, borderTopWidth: StyleSheet.hairlineWidth, borderColor: p.line }]}><Text style={[appearance.groupTitle, { color: p.muted }]}>自定义背景</Text>
      <Image source={preferences.image ? { uri: preferences.image } : require('../../assets/images/mobile-wallpaper.jpg')} style={{ height: 112, width: '100%', borderRadius: preferences.radius, borderWidth: 1, borderColor: p.line }} resizeMode="cover" />
      <View style={{ flexDirection: 'row', gap: 8, marginVertical: 12 }}><TextInput accessibilityLabel="背景图片链接" placeholder="https://example.com/background.jpg" placeholderTextColor={p.muted} value={url} onChangeText={setUrl} onSubmitEditing={applyUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" returnKeyType="done" style={{ flex: 1, minWidth: 0, color: p.text, borderWidth: 1, borderColor: p.line, backgroundColor: p.field, borderRadius: preferences.radius, paddingHorizontal: 12, paddingVertical: 10, minHeight: 44, fontSize: 14 }} /><Pressable accessibilityRole="button" accessibilityLabel="应用背景图片链接" onAccessibilityTap={applyUrl} onPress={applyUrl} style={{ width: 46, minHeight: 44, borderWidth: 1, borderColor: p.line, borderRadius: preferences.radius, alignItems: 'center', justifyContent: 'center', backgroundColor: p.field }}><Feather name="check" size={20} color={p.text} /></Pressable></View>
      <View style={appearance.segments}>{button('选择图片', importImage, false, 'image')}{button('默认背景', () => { patch({ image: '' }); setUrl(''); setUrlError(''); }, false, 'rotate-ccw')}</View>
      {error || urlError ? <Text accessibilityLiveRegion="assertive" style={{ color: p.error, fontSize: 12 }}>{error || urlError}</Text> : null}
      {range('blur', '背景模糊', 0, 30, 1, 'px', preferences.reduceMotion)}{range('whiteOverlay', '白色遮罩', 0, 1, 100, '%')}{range('overlay', '黑色遮罩', 0, 1, 100, '%')}
      {range('x', '水平位置', -200, 200)}{range('y', '垂直位置', -200, 200)}{range('scale', '缩放', .5, 3, 100, '%')}{range('rotation', '旋转', -180, 360, 1, '°')}
    </View>
  </>;
}

const appearance = StyleSheet.create({
  header: { paddingTop: 24, paddingHorizontal: 22, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 14 },
  closeTouch: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, close: { width: 40, height: 40, borderWidth: 1, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  group: { paddingTop: 17 }, groupTitle: { fontSize: 13, marginBottom: 14 }, segments: { flexDirection: 'row', gap: 7, marginBottom: 13 },
  toggle: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 13, minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
});
