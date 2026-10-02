import { BlurView } from 'expo-blur';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { useAppearance } from '@/state/appearance';
import { mobilePalette } from '@/lib/mobileDesign';
export function Surface({ children, style, readable = false, ...props }: ViewProps & { readable?: boolean }) {
  const theme = useAppearance();
  const color = parseInt(mobilePalette[theme.dark ? 'dark' : 'light'].surface.slice(1), 16);
  const readableBackground = `rgba(${color >> 16},${color >> 8 & 255},${color & 255},${Math.max(0.9, theme.preferences.opacity)})`;
  return <View {...props} style={[{ overflow: 'hidden', zIndex: 0 }, style, readable && { backgroundColor: readableBackground }]}>
    {!theme.preferences.reduceMotion && theme.preferences.glassBlur > 0 ? <BlurView pointerEvents="none" intensity={Math.min(100, theme.preferences.glassBlur * 2.5)} tint={theme.dark ? 'dark' : 'light'} style={[StyleSheet.absoluteFill, { zIndex: -1 }]} /> : null}
    {children}
  </View>;
}
