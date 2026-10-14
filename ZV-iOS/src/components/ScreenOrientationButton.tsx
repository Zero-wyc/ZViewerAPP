import { Image } from 'expo-image';
import { Pressable, StyleSheet } from 'react-native';
import { useAppearance } from '@/state/appearance';
import { orientationAction } from '@/lib/playerDisplay';
import type { ScreenOrientationControl } from '@/hooks/usePlayerDisplay';

// Same Lucide Smartphone, RectangleHorizontal and LockKeyholeOpen paths as
// src/mobile/PlayerDisplayControls.tsx. License: assets/icons/lucide-LICENSE.
const paths = {
  portrait: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
  landscape: '<rect width="20" height="12" x="2" y="6" rx="2"/>',
  unlock: '<circle cx="12" cy="16" r="1"/><rect width="18" height="12" x="3" y="10" rx="2"/><path d="M7 10V7a5 5 0 0 1 9.33-2.5"/>',
};
export function ScreenOrientationButton({ state, color }: { state: ScreenOrientationControl; color?: string }) {
  const theme = useAppearance();
  if (!state.available) return null;
  const action = orientationAction(state);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color ?? theme.color('#a8b3b6')}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[action.icon]}</svg>`;
  return <Pressable testID="screen-orientation-button" accessibilityRole="button" accessibilityLabel={action.label} accessibilityHint="屏幕方向" accessibilityState={{ selected: state.locked, disabled: state.busy }} disabled={state.busy} onPress={() => void state.toggle()} style={[styles.button, state.busy && { opacity: .4 }]}>
    <Image testID={`orientation-icon-${action.icon}`} source={{ uri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` }} contentFit="contain" style={styles.icon} accessible={false} />
  </Pressable>;
}
const styles = StyleSheet.create({ button: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, icon: { width: 20, height: 20 } });
