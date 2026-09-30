import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import type { Socket } from 'socket.io-client';

import { fetchJson, normalizeServerUrl, type AuthUser, type Session } from '@/lib/server';
import { openSocket } from '@/lib/socket';

const SESSION_KEY = 'zviewer-ios-session';
const SERVER_KEY = 'zviewer-ios-server';
const webPreviewStore = new Map<string, string>();

async function readSaved(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return webPreviewStore.get(key) || null;
  return SecureStore.getItemAsync(key);
}

async function save(key: string, value: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    if (value === null) webPreviewStore.delete(key);
    else webPreviewStore.set(key, value);
    return;
  }
  if (value === null) await SecureStore.deleteItemAsync(key);
  else await SecureStore.setItemAsync(key, value);
}

type AuthPayload = { accessToken: string; refreshToken?: string; user: AuthUser };
type SessionContextValue = {
  session: Session | null;
  savedServer: string;
  restoring: boolean;
  socket: Socket | null;
  connected: boolean;
  login: (server: string, mode: 'account' | 'guest', username?: string, password?: string) => Promise<void>;
  logout: () => Promise<void>;
  request: <T>(path: string, init?: RequestInit) => Promise<T & { success: boolean; message?: string }>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

async function persist(session: Session | null): Promise<void> {
  if (session) {
    await save(SESSION_KEY, JSON.stringify(session));
    await save(SERVER_KEY, session.serverUrl);
  } else {
    await save(SESSION_KEY, null);
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [savedServer, setSavedServer] = useState('');
  const [restoring, setRestoring] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const current = useRef<Session | null>(null);
  const refreshInFlight = useRef<Promise<Session> | null>(null);

  const update = useCallback(async (next: Session | null) => {
    current.current = next;
    setSession(next);
    await persist(next);
  }, []);

  const refresh = useCallback(async (previous: Session): Promise<Session> => {
    if (!previous.refreshToken) throw new Error('登录状态已过期，请重新登录');
    if (!refreshInFlight.current) {
      refreshInFlight.current = (async () => {
        const data = await fetchJson<AuthPayload>(`${previous.serverUrl}/api/auth/refresh`, {
          method: 'POST',
          body: JSON.stringify({ refreshToken: previous.refreshToken }),
        });
        const next = {
          ...previous,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken || previous.refreshToken,
          user: data.user || previous.user,
        };
        await update(next);
        return next;
      })().finally(() => { refreshInFlight.current = null; });
    }
    return refreshInFlight.current;
  }, [update]);

  const request = useCallback(async <T,>(path: string, init: RequestInit = {}) => {
    let active = current.current;
    if (!active) throw new Error('请先登录');
    const execute = async (token: string) => {
      const response = await fetch(`${active!.serverUrl}${path}`, {
        ...init,
        headers: {
          Accept: 'application/json',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          Authorization: `Bearer ${token}`,
          ...init.headers,
        },
      });
      return response;
    };
    let response = await execute(active.accessToken);
    if (response.status === 401 || response.status === 403) {
      try {
        active = await refresh(active);
        response = await execute(active.accessToken);
      } catch (error) {
        await update(null);
        throw error;
      }
    }
    const data = await response.json().catch(() => ({})) as T & { success: boolean; message?: string };
    if (!response.ok || !data.success) throw new Error(data.message || `请求失败 (${response.status})`);
    return data;
  }, [refresh, update]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const server = await readSaved(SERVER_KEY);
        if (mounted && server) setSavedServer(server);
        const raw = await readSaved(SESSION_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as Session;
        if (!parsed.serverUrl || !parsed.accessToken || !parsed.user) return;
        current.current = parsed;
        if (mounted) setSession(parsed);
        try {
          const response = await request<{ user: AuthUser }>('/api/auth/me');
          if (mounted) {
            const verified = { ...current.current!, user: response.user };
            await update(verified);
          }
        } catch {
          // Keep the stored session when offline. Auth failures are cleared by request().
        }
      } catch {
        // A damaged local session should not prevent a fresh login.
      } finally {
        if (mounted) setRestoring(false);
      }
    })();
    return () => { mounted = false; };
  }, [request, update]);

  const login = useCallback(async (server: string, mode: 'account' | 'guest', username = '', password = '') => {
    const serverUrl = normalizeServerUrl(server);
    if (mode === 'account' && (!username.trim() || !password)) throw new Error('请输入用户名和密码');
    const data = await fetchJson<AuthPayload>(`${serverUrl}/api/auth/${mode === 'guest' ? 'guest' : 'login'}`, {
      method: 'POST',
      body: JSON.stringify(mode === 'guest' ? {} : { username: username.trim(), password }),
    });
    if (!data.accessToken || !data.user) throw new Error('服务器未返回完整登录信息');
    await update({ serverUrl, accessToken: data.accessToken, refreshToken: data.refreshToken || '', user: data.user });
    setSavedServer(serverUrl);
  }, [update]);

  const logout = useCallback(async () => { await update(null); }, [update]);

  useEffect(() => {
    if (!session) return;
    const connection = openSocket(session);
    const onConnect = () => { setSocket(connection); setConnected(true); };
    const onDisconnect = () => setConnected(false);
    const onConnectError = (failure: Error) => {
      setConnected(false);
      if (/token|unauthor|认证|令牌/i.test(failure.message)) {
        void request<{ user: AuthUser }>('/api/auth/me').catch(() => {});
      }
    };
    connection.on('connect', onConnect);
    connection.on('disconnect', onDisconnect);
    connection.on('connect_error', onConnectError);
    const appState = AppState.addEventListener('change', status => {
      if (status === 'active' && !connection.connected) connection.connect();
    });
    return () => {
      appState.remove();
      connection.off('connect', onConnect);
      connection.off('disconnect', onDisconnect);
      connection.off('connect_error', onConnectError);
      connection.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [session, request]);

  const value = useMemo(() => ({ session, savedServer, restoring, socket, connected, login, logout, request }), [session, savedServer, restoring, socket, connected, login, logout, request]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('SessionProvider is missing');
  return value;
}
