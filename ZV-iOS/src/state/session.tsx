import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import type { Socket } from 'socket.io-client';

import { fetchJson, HttpError, normalizeServerUrl, type AuthUser, type Session } from '@/lib/server';
import { openSocket } from '@/lib/socket';
import { withDeadline } from '@/lib/deadline';
import { SessionLease } from '@/lib/sessionLease';
import { authenticationFailure } from '@/lib/httpAuth';

const SESSION_KEY = 'zviewer-ios-session';
const SERVER_KEY = 'zviewer-ios-server';
const webPreviewStore = new Map<string, string>();

async function readSaved(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return webPreviewStore.get(key) || null;
  return withDeadline(() => SecureStore.getItemAsync(key), 5000);
}

async function save(key: string, value: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    if (value === null) webPreviewStore.delete(key);
    else webPreviewStore.set(key, value);
    return;
  }
  await withDeadline(() => value === null ? SecureStore.deleteItemAsync(key) : SecureStore.setItemAsync(key, value), 5000);
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
  requestText: (path: string, init?: RequestInit) => Promise<string>;
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
  const current = useRef(new SessionLease<Session>());
  const refreshInFlight = useRef<{ previous: Session; promise: Promise<Session> } | null>(null);
  const persistence = useRef<Promise<void>>(Promise.resolve());

  const update = useCallback(async (next: Session | null) => {
    current.current.replace(next);
    setSession(next);
    // Serialize writes so logout is persisted after an already-running save.
    const pending = persistence.current.catch(() => {}).then(() => persist(next));
    persistence.current = pending;
    await pending;
  }, [current]);

  const refresh = useCallback(async (previous: Session): Promise<Session> => {
    if (!previous.refreshToken) throw new HttpError('登录状态已过期，请重新登录', 401);
    if (refreshInFlight.current?.previous === previous) return refreshInFlight.current.promise;
    if (current.current.value !== previous) throw new Error('登录状态已改变，请重试');
    const lease = current.current.capture();
    const pending = (async () => {
        const data = await fetchJson<AuthPayload>(`${previous.serverUrl}/api/auth/refresh`, {
          method: 'POST',
          body: JSON.stringify({ refreshToken: previous.refreshToken }),
        });
        if (!data.accessToken) throw new HttpError('服务器未返回完整刷新信息', 502);
        const next = {
          ...previous,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken || previous.refreshToken,
          user: data.user || previous.user,
        };
        if (!current.current.accepts(lease)) throw new Error('登录状态已改变，请重试');
        await update(next);
        return next;
      })().finally(() => { if (refreshInFlight.current?.promise === pending) refreshInFlight.current = null; });
    refreshInFlight.current = { previous, promise: pending };
    return pending;
  }, [current, update]);

  const requestText = useCallback(async (path: string, init: RequestInit = {}) => {
    if (!path.startsWith('/api/') || path.startsWith('//') || path.includes('\\')) throw new Error('无效的服务端接口');
    let active = current.current.value;
    if (!active) throw new Error('请先登录');
    let lease = current.current.capture();
    const execute = async (token: string) => {
      if (!current.current.accepts(lease)) throw new Error('登录状态已改变，请重试');
      return withDeadline(async signal => {
      const response = await fetch(`${active!.serverUrl}${path}`, {
        ...init,
        signal,
        headers: {
          Accept: 'application/json',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          Authorization: `Bearer ${token}`,
          ...init.headers,
        },
      });
      const text = await response.text();
      if (!current.current.accepts(lease)) throw new Error('登录状态已改变，请重试');
      return { status: response.status, ok: response.ok, text };
      }, 15000, init.signal);
    };
    let response = await execute(active.accessToken);
    if (authenticationFailure(response.status, response.text)) {
      try {
        active = await refresh(active);
        if (current.current.value !== active) throw new Error('登录状态已改变，请重试');
        lease = current.current.capture();
        response = await execute(active.accessToken);
      } catch (error) {
        if (current.current.value === active && error instanceof HttpError && [401, 403].includes(error.status)) await update(null);
        throw error;
      }
    }
    const text = response.text;
    if (!response.ok) {
      if (authenticationFailure(response.status, text) && current.current.value === active) await update(null);
      let message = ''; try { message = JSON.parse(text).message; } catch {}
      throw new HttpError(message || `请求失败 (${response.status})`, response.status);
    }
    return text;
  }, [current, refresh, update]);
  const request = useCallback(async <T,>(path: string, init: RequestInit = {}) => {
    const data = JSON.parse(await requestText(path, init)) as T & { success: boolean; message?: string };
    if (!data.success) throw new Error(data.message || '服务器未返回成功结果');
    return data;
  }, [requestText]);

  useEffect(() => {
    let mounted = true;
    const lease = current.current.capture();
    void (async () => {
      let parsed: Session | null = null;
      try {
        const [server, raw] = await Promise.all([readSaved(SERVER_KEY).catch(() => null), readSaved(SESSION_KEY).catch(() => null)]);
        if (!mounted || !current.current.accepts(lease)) return;
        if (mounted && server) setSavedServer(server);
        if (!raw) return;
        parsed = JSON.parse(raw) as Session;
        if (!parsed.serverUrl || !parsed.accessToken || !parsed.user) return;
        parsed.serverUrl = normalizeServerUrl(parsed.serverUrl);
        current.current.replace(parsed);
        setSession(parsed);
      } catch {
        // A damaged local session should not prevent a fresh login.
        parsed = null;
      } finally {
        if (mounted) setRestoring(false);
      }
      // Only keychain reads gate the form. Offline verification stays bounded
      // and may finish after the user has chosen logout or another server.
      if (parsed && mounted && current.current.value === parsed) {
        try {
          const response = await request<{ user: AuthUser }>('/api/auth/me');
          if (mounted && current.current.value === parsed && JSON.stringify(parsed.user) !== JSON.stringify(response.user)) {
            const verified = { ...parsed, user: response.user };
            await update(verified);
          }
        } catch {
          // Keep the stored session when offline. Auth failures are cleared by request().
        }
      }
    })();
    return () => { mounted = false; };
  }, [current, request, update]);

  const login = useCallback(async (server: string, mode: 'account' | 'guest', username = '', password = '') => {
    const lease = current.current.capture();
    const serverUrl = normalizeServerUrl(server);
    if (mode === 'account' && (!username.trim() || !password)) throw new Error('请输入用户名和密码');
    const data = await fetchJson<AuthPayload>(`${serverUrl}/api/auth/${mode === 'guest' ? 'guest' : 'login'}`, {
      method: 'POST',
      body: JSON.stringify(mode === 'guest' ? {} : { username: username.trim(), password }),
    });
    if (!data.accessToken || !data.user) throw new Error('服务器未返回完整登录信息');
    if (!current.current.accepts(lease)) throw new Error('登录状态已改变，请重试');
    await update({ serverUrl, accessToken: data.accessToken, refreshToken: data.refreshToken || '', user: data.user });
    setSavedServer(serverUrl);
  }, [current, update]);

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

  const value = useMemo(() => ({ session, savedServer, restoring, socket, connected, login, logout, request, requestText }), [session, savedServer, restoring, socket, connected, login, logout, request, requestText]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('SessionProvider is missing');
  return value;
}
