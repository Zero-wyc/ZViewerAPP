import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import type { Socket } from 'socket.io-client';

import { fetchJson, HttpError, messageFor, normalizeServerUrl, type AuthUser, type Session } from '@/lib/server';
import { openSocket } from '@/lib/socket';
import { withDeadline } from '@/lib/deadline';
import { SessionLease } from '@/lib/sessionLease';
import { authenticationFailure, shouldRefreshAuth } from '@/lib/httpAuth';
import { selectServerUrl } from '@/lib/serverDiscovery';
import { nativeBridge } from '@/lib/nativeBridge';
import { debugLaunchConfiguration } from '@/lib/debugLaunch';
import { sessionDiagnostic } from '@/lib/sessionDiagnostics';
import { accessTokenExpiresAt, accessRefreshDelay, ACCESS_REFRESH_RETRY_MS } from '@/lib/sessionFreshness';
import { applyServerPolicy, restoreServerPolicy, saveServerPolicy } from '@/lib/serverConnection';
import { connectionUrl } from '@/lib/connectionTransport';

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
type FreshnessOptions = { force?: boolean; expected?: Session };
type SessionContextValue = {
  session: Session | null;
  savedServer: string;
  restoring: boolean;
  socket: Socket | null;
  connected: boolean;
  certificateException: boolean;
  connectionError: string;
  login: (server: string, mode: 'account' | 'guest', username?: string, password?: string, allowUntrustedCertificate?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  revokeCertificateException: () => Promise<void>;
  ensureFresh: (options?: FreshnessOptions) => Promise<Session>;
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
  const [certificateException, setCertificateException] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const selectedServer = useRef('');
  const current = useRef(new SessionLease<Session>());
  const refreshInFlight = useRef<{ previous: Session; promise: Promise<Session> } | null>(null);
  const persistence = useRef<Promise<void>>(Promise.resolve());
  const freshnessFailure = useRef<{ previous: Session; retryAt: number; error: unknown } | null>(null);

  useEffect(() => {
    sessionDiagnostic('provider-mount');
    return () => sessionDiagnostic('provider-unmount');
  }, []);

  const update = useCallback(async (next: Session | null) => {
    sessionDiagnostic('session-update', { userId: next?.user.id, role: next?.user.role });
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
        if (data.user && data.user.id !== previous.user.id) throw new HttpError('登录身份校验不一致，请重新登录', 401);
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

  const ensureFresh = useCallback(async (options: FreshnessOptions = {}): Promise<Session> => {
    const previous = current.current.value;
    if (!previous) throw new Error('请先登录');
    if (options.expected && previous !== options.expected) throw new Error('登录状态已改变，请重试');
    const expires = accessTokenExpiresAt(previous.accessToken);
    if (!options.force && (expires === null || accessRefreshDelay(previous.accessToken)! > 0)) return previous;
    if (!options.force && !previous.refreshToken && expires !== null && expires > Date.now()) return previous;
    const failed = freshnessFailure.current;
    if (failed?.previous === previous && Date.now() < failed.retryAt) {
      if (!options.force && expires !== null && expires > Date.now()) return previous;
      throw failed.error;
    }
    try {
      const next = await refresh(previous);
      freshnessFailure.current = null;
      return next;
    } catch (error) {
      if (current.current.value === previous) {
        freshnessFailure.current = { previous, retryAt: Date.now() + ACCESS_REFRESH_RETRY_MS, error };
        if (error instanceof HttpError && [401, 403].includes(error.status)) await update(null);
        else if (!options.force && expires !== null && expires > Date.now()) return previous;
      }
      throw error;
    }
  }, [current, refresh, update]);

  useEffect(() => {
    if (!session?.refreshToken) return;
    const delay = accessRefreshDelay(session.accessToken); if (delay === null) return;
    let active = true, attempts = 0; let timer: ReturnType<typeof setTimeout>;
    const renew = async () => {
      try { await ensureFresh({ expected: session }); } catch { /* Requests retain visible, bounded error handling. */ }
      if (active && current.current.value === session && ++attempts < 3) timer = setTimeout(() => { void renew(); }, ACCESS_REFRESH_RETRY_MS);
    };
    timer = setTimeout(() => { void renew(); }, delay);
    return () => { active = false; clearTimeout(timer); };
  }, [session, ensureFresh, current]);

  const requestText = useCallback(async (path: string, init: RequestInit = {}) => {
    if (!path.startsWith('/api/') || path.startsWith('//') || path.includes('\\')) throw new Error('无效的服务端接口');
    // Optional-auth music routes return anonymous 200s for expired Bearers.
    // Renew before sending; their own NCM 401s still must not retire NAS auth.
    let active = await ensureFresh();
    if (current.current.value !== active) throw new Error('登录状态已改变，请重试');
    let lease = current.current.capture();
    const execute = async (token: string) => {
      if (!current.current.accepts(lease)) throw new Error('登录状态已改变，请重试');
      return withDeadline(async signal => {
      const response = await fetch(connectionUrl(`${active!.serverUrl}${path}`), {
        ...init,
        credentials: 'omit',
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
    if (shouldRefreshAuth(path) && authenticationFailure(response.status, response.text)) {
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
      if (shouldRefreshAuth(path) && authenticationFailure(response.status, text) && current.current.value === active) await update(null);
      let message = ''; try { message = JSON.parse(text).message; } catch {}
      throw new HttpError(message || `请求失败 (${response.status})`, response.status);
    }
    return text;
  }, [current, refresh, update, ensureFresh]);
  const request = useCallback(async <T,>(path: string, init: RequestInit = {}) => {
    const data = JSON.parse(await requestText(path, init)) as T & { success: boolean; message?: string };
    if (!data.success) throw new Error(data.message || '服务器未返回成功结果');
    return data;
  }, [requestText]);

  useEffect(() => {
    sessionDiagnostic('restore-start');
    let mounted = true;
    const lease = current.current.capture();
    void (async () => {
      let parsed: Session | null = null;
      try {
        const launch = await debugLaunchConfiguration();
        sessionDiagnostic(launch ? 'restore-debug' : 'restore-storage', { userId: launch?.session.user.id, role: launch?.session.user.role });
        const [server, raw] = launch
          ? [launch.session.serverUrl, JSON.stringify(launch.session)]
          : await Promise.all([readSaved(SERVER_KEY).catch(() => null), readSaved(SESSION_KEY).catch(() => null)]);
        if (!mounted || !current.current.accepts(lease)) return;
        if (mounted && server) setSavedServer(server);
        if (!raw) return;
        parsed = JSON.parse(raw) as Session;
        if (!parsed.serverUrl || !parsed.accessToken || !parsed.user) return;
        parsed.serverUrl = normalizeServerUrl(parsed.serverUrl);
        selectedServer.current = parsed.serverUrl;
        const exception = await restoreServerPolicy(parsed.serverUrl);
        if (!mounted || !current.current.accepts(lease)) return;
        setCertificateException(exception);
        current.current.replace(parsed);
        sessionDiagnostic('restore-applied', { userId: parsed.user.id, role: parsed.user.role });
        setSession(parsed);
      } catch (failure) {
        // A damaged local session should not prevent a fresh login.
        if (parsed && mounted && current.current.accepts(lease)) setConnectionError(messageFor(failure));
        parsed = null;
      } finally {
        if (mounted) setRestoring(false);
      }
      // Only keychain reads gate the form. Offline verification stays bounded
      // and may finish after the user has chosen logout or another server.
      if (parsed && mounted && current.current.value === parsed) {
        try {
          const response = await request<{ user: AuthUser }>('/api/auth/me');
          if (response.user?.id !== parsed.user.id) throw new HttpError('登录身份校验不一致，请重新登录', 401);
          if (mounted && current.current.value === parsed && JSON.stringify(parsed.user) !== JSON.stringify(response.user)) {
            sessionDiagnostic('auth-user-updated', { userId: response.user.id, role: response.user.role });
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

  const login = useCallback(async (server: string, mode: 'account' | 'guest', username = '', password = '', allowUntrustedCertificate = false) => {
    const lease = current.current.capture();
    setConnectionError('');
    if (mode === 'account' && (!username.trim() || !password)) throw new Error('请输入用户名和密码');
    selectedServer.current = normalizeServerUrl(server);
    await saveServerPolicy(server, allowUntrustedCertificate);
    if (!current.current.accepts(lease)) throw new Error('登录状态已改变，请重试');
    const serverUrl = await selectServerUrl(server, async url => {
      if (nativeBridge?.probeServerConnection) return nativeBridge.probeServerConnection(connectionUrl(url));
      if (nativeBridge?.serverProbe) return nativeBridge.serverProbe(connectionUrl(url));
      try { await fetchJson(`${url}/api/auth/public-settings`, { credentials: 'omit', redirect: 'error' }); return { ok: true, code: 'response' }; }
      catch { return { ok: false, code: 'network' }; }
    }, url => applyServerPolicy(url, allowUntrustedCertificate));
    if (!current.current.accepts(lease)) throw new Error('登录状态已改变，请重试');
    selectedServer.current = serverUrl;
    const data = await fetchJson<AuthPayload>(`${serverUrl}/api/auth/${mode === 'guest' ? 'guest' : 'login'}`, {
      method: 'POST',
      body: JSON.stringify(mode === 'guest' ? {} : { username: username.trim(), password }),
    });
    if (!data.accessToken || !data.user) throw new Error('服务器未返回完整登录信息');
    if (!current.current.accepts(lease)) throw new Error('登录状态已改变，请重试');
    setCertificateException(allowUntrustedCertificate && serverUrl.startsWith('https:'));
    await update({ serverUrl, accessToken: data.accessToken, refreshToken: data.refreshToken || '', user: data.user });
    setSavedServer(serverUrl);
  }, [current, update]);

  const logout = useCallback(async () => {
    const previous = current.current.value;
    const server = previous?.serverUrl || selectedServer.current; selectedServer.current = '';
    socket?.disconnect(); setCertificateException(false); setConnectionError('');
    await update(null);
    if (server) await applyServerPolicy(server, false);
  }, [current, socket, update]);
  const revokeCertificateException = useCallback(async () => {
    const previous = current.current.value;
    if (!previous) return;
    await saveServerPolicy(previous.serverUrl, false);
    if (current.current.value !== previous) throw new Error('登录状态已改变，请重试');
    await logout();
  }, [current, logout]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    let dispose = () => {};
    void (async () => {
    await nativeBridge?.isolateServerAuthCookies?.(session.serverUrl);
    if (!active || current.current.value !== session) return;
    const connection = openSocket(session);
    let serverDisconnects = 0; let reconnectTimer: ReturnType<typeof setTimeout> | undefined; let stableTimer: ReturnType<typeof setTimeout> | undefined;
    const onConnect = () => { setSocket(connection); setConnected(true); if (stableTimer) clearTimeout(stableTimer); stableTimer = setTimeout(() => { serverDisconnects = 0; }, 30000); };
    const onDisconnect = (reason: string) => {
      setConnected(false); if (stableTimer) clearTimeout(stableTimer);
      if (reason !== 'io server disconnect' || serverDisconnects >= 2) return;
      const delay = ++serverDisconnects * 750;
      void request('/api/auth/me').then(() => {
        if (!active || current.current.value !== session) return;
        reconnectTimer = setTimeout(() => { if (active && current.current.value === session) connection.connect(); }, delay);
      }).catch(() => {});
    };
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
      if (status === 'active') void ensureFresh({ expected: session }).then(next => {
        if (active && next === session && current.current.value === session && !connection.connected) connection.connect();
      }).catch(() => {});
    });
    dispose = () => {
      if (reconnectTimer) clearTimeout(reconnectTimer); if (stableTimer) clearTimeout(stableTimer);
      appState.remove();
      connection.off('connect', onConnect);
      connection.off('disconnect', onDisconnect);
      connection.off('connect_error', onConnectError);
      connection.disconnect();
    };
    })().catch(() => {
      if (active) sessionDiagnostic('socket-isolation-failed', { userId: session.user.id, role: session.user.role });
    });
    return () => {
      active = false;
      dispose();
      setSocket(null);
      setConnected(false);
    };
  }, [session, request, ensureFresh]);

  const value = useMemo(() => ({ session, savedServer, restoring, socket, connected, certificateException, connectionError, login, logout, revokeCertificateException, request, requestText, ensureFresh }), [session, savedServer, restoring, socket, connected, certificateException, connectionError, login, logout, revokeCertificateException, request, requestText, ensureFresh]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('SessionProvider is missing');
  return value;
}
