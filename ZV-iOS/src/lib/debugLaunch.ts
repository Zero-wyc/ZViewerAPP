import { nativeBridge } from './nativeBridge';
import type { Session } from './server';
import { sessionDiagnostic } from './sessionDiagnostics';

type DebugLaunch = { session: Session; roomId?: string };
let configuration: Promise<DebugLaunch | null> | undefined;

// Credentials arrive through a local Debug process environment, never through
// Expo public env variables, source files, logs, or a Release native module.
export function debugLaunchConfiguration(): Promise<DebugLaunch | null> {
  if (!__DEV__ || !nativeBridge?.debugLaunchConfiguration) return Promise.resolve(null);
  return configuration ??= nativeBridge.debugLaunchConfiguration().then(raw => {
    if (!raw || raw.length > 20000) return null;
    const value = JSON.parse(raw) as DebugLaunch;
    if (!value.session?.accessToken || !value.session.user || !/^https?:\/\//.test(value.session.serverUrl)) return null;
    if (value.roomId && !/^[\w-]{1,128}$/.test(value.roomId)) return null;
    sessionDiagnostic('debug-launch-parsed', { userId: value.session.user.id, role: value.session.user.role, roomId: value.roomId });
    return value;
  }).catch(() => null);
}
