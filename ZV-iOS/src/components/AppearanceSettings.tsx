import { useState } from 'react';
import { Image, Pressable, Switch, Text, TextInput, View } from 'react-native';
import Slider from '@react-native-community/slider';
import type { AppearancePreferences } from '@/lib/appearancePreferences';
import { mobilePalette, mobileRadiusPresets } from '@/lib/mobileDesign';
export function AppearanceSettings({ preferences, dark, patch, importImage, error }: {
  preferences: AppearancePreferences; dark: boolean; patch: (value: Partial<AppearancePreferences>) => void; importImage: () => void; error: string;
}) {
  const palette = mobilePalette[dark ? 'dark' : 'light']; const [url, setUrl] = useState(preferences.image.startsWith('http') ? preferences.image : ''); const [urlError, setUrlError] = useState('');
  const button = (label: string, action: () => void, active = false) => <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={action} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12, borderRadius: preferences.radius, backgroundColor: active ? palette.accent : palette.container }}><Text style={{ color: active ? palette.onAccent : palette.text }}>{label}</Text></Pressable>;
  const row = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 };
  const group = { padding: 16, borderWidth: 1, borderColor: palette.line, borderRadius: preferences.radius, gap: 12 };
  const range = (key: keyof AppearancePreferences, label: string, min: number, max: number, factor = 1, unit = '') => <View key={key} style={{ gap: 6 }}><Text style={{ color: palette.text }}>{label} · {Math.round(Number(preferences[key]) * factor)}{unit}</Text><Slider accessibilityLabel={label} minimumValue={min} maximumValue={max} value={Number(preferences[key])} minimumTrackTintColor={palette.accent} onSlidingComplete={value => patch({ [key]: value })} /></View>;
  return <><View style={group}><Text style={{ fontSize: 16, fontWeight: '700', color: palette.text }}>显示</Text>
    <View style={row}>{(['light', 'dark', 'system'] as const).map((mode, index) => <View key={mode}>{button(['浅色', '深色', '跟随系统'][index], () => patch({ mode }), preferences.mode === mode)}</View>)}</View>
    <Text style={{ color: palette.text }}>圆角 · {preferences.radius}</Text><View style={row}>{mobileRadiusPresets.map(preset => <View key={preset.value}>{button(preset.name, () => patch({ radius: preset.value }), preferences.radius === preset.value)}</View>)}</View>
    {range('opacity', '玻璃透明度', 0.2, 1, 100, '%')}{range('glassBlur', '卡片模糊度', 0, 40, 1, 'px')}
    <View style={[row, { alignItems: 'center', justifyContent: 'space-between' }]}><View><Text style={{ color: palette.text }}>精简动画</Text><Text style={{ color: palette.muted, fontSize: 12 }}>关闭背景和卡片模糊</Text></View><Switch value={preferences.reduceMotion} onValueChange={value => patch({ reduceMotion: value })} trackColor={{ true: palette.accent }} /></View>
  </View><View style={group}><Text style={{ fontSize: 16, fontWeight: '700', color: palette.text }}>自定义背景</Text>
    <Image source={preferences.image ? { uri: preferences.image } : require('../../assets/images/mobile-wallpaper.jpg')} style={{ height: 130, width: '100%', borderRadius: preferences.radius }} resizeMode="cover" />
    <TextInput accessibilityLabel="背景图片链接" placeholder="https://example.com/background.jpg" placeholderTextColor={palette.muted} value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={{ color: palette.text, borderWidth: 1, borderColor: palette.line, borderRadius: preferences.radius, padding: 12, minHeight: 44 }} />
    {button('应用背景图片链接', () => { if (url.trim() && !/^https?:\/\//i.test(url.trim())) { setUrlError('请输入 http 或 https 图片链接'); return; } patch({ image: url.trim() }); setUrlError(''); })}
    <View style={row}>{button('选择图片', importImage)}{button('默认背景', () => { patch({ image: '' }); setUrl(''); setUrlError(''); })}</View>
    {range('blur', '背景模糊', 0, 30, 1, 'px')}{range('whiteOverlay', '白色遮罩', 0, 1, 100, '%')}{range('overlay', '黑色遮罩', 0, 1, 100, '%')}
    {range('x', '水平位置', -200, 200)}{range('y', '垂直位置', -200, 200)}{range('scale', '缩放', 0.5, 3, 100, '%')}{range('rotation', '旋转', -180, 360, 1, '°')}
  </View>{error || urlError ? <Text style={{ color: palette.error }}>{error || urlError}</Text> : null}</>;
}
