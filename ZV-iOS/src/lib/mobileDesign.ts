// Source of truth: src/mobile/appearance.css and MobileAppearance.tsx used by
// Android and HarmonyOS. Keep semantic colors/presets aligned in native views.
export const mobilePalette = {
  light: { background: '#dce7f5', surface: '#f7f9ff', container: '#e3eaf3', field: '#f6f9ff', text: '#1c293a', muted: '#43566b', line: 'rgba(50,67,91,0.25)', accent: '#1463b6', onAccent: '#ffffff', error: '#a12626' },
  dark: { background: '#101a25', surface: '#131b25', container: '#252f3b', field: '#0d141d', text: '#f3f7fa', muted: '#b8c5cd', line: 'rgba(235,245,255,0.25)', accent: '#9cdbff', onAccent: '#102638', error: '#ffb4ab' },
};
export const mobileRadiusPresets = [{ name: '无', value: 0 }, { name: '小', value: 8 }, { name: '中', value: 16 }, { name: '大', value: 28 }];
