import { Stack, DarkTheme, DefaultTheme, ThemeProvider, router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { debugLaunchConfiguration } from '@/lib/debugLaunch';
import { AppearanceProvider, useAppearance } from '@/state/appearance';
import { SessionProvider, useSession } from '@/state/session';

function AppStack() {
  const { session, restoring } = useSession();
  const debugNavigated = useRef(false);
  useEffect(() => {
    if (!__DEV__ || restoring || !session || debugNavigated.current) return;
    let active = true;
    void debugLaunchConfiguration().then(launch => {
      if (!active || !launch?.roomId || debugNavigated.current) return;
      debugNavigated.current = true;
      router.replace({ pathname: '/room/[roomId]', params: { roomId: launch.roomId, asHost: '0' } });
    });
    return () => { active = false; };
  }, [session, restoring]);
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
