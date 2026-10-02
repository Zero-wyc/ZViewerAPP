import { Stack } from 'expo-router';
import { AppearanceProvider } from '@/state/appearance';
import { SessionProvider } from '@/state/session';

export default function RootLayout() {
  return (
    <AppearanceProvider><SessionProvider>

      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }} />
    </SessionProvider></AppearanceProvider>
  );
}
