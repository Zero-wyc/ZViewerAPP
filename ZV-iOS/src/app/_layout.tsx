import { Stack, DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { AppearanceProvider, useAppearance } from '@/state/appearance';
import { SessionProvider } from '@/state/session';

function AppStack() {
  const appearance = useAppearance(); const base = appearance.dark ? DarkTheme : DefaultTheme;
  return <ThemeProvider value={{ ...base, colors: { ...base.colors, background: 'transparent', card: 'transparent' } }}>
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }} />
  </ThemeProvider>;
}

export default function RootLayout() {
  return (
    <AppearanceProvider><SessionProvider>

      <AppStack />
    </SessionProvider></AppearanceProvider>
  );
}
