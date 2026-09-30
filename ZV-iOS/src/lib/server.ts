export type AuthUser = {
  id: number;
  username: string;
  role: 'root' | 'admin' | 'user' | 'guest';
};

export type Session = {
  serverUrl: string;
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};

export type Room = {
  roomId: string;
  name: string;
  viewerCount: number;
  maxViewers: number;
  hasPassword: boolean;
  requireApproval: boolean;
  sharerOnline: boolean;
  mode?: 'watch-together' | 'listen-together' | 'screen-share';
};

export type ApiResult<T> = T & { success: boolean; message?: string };

export function normalizeServerUrl(value: string): string {
  let candidate = value.trim().replace(/\/+$/, '');
  if (!candidate) throw new Error('请输入服务端地址');
  if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate) || /^[^/:]+:\d+(\/|$)/.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  const url = new URL(candidate);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('仅支持 HTTP 或 HTTPS 地址');
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('服务端地址不能包含账号、查询参数或片段');
  }
  return url.origin + url.pathname.replace(/\/+$/, '');
}

export function messageFor(error: unknown): string {
  if (error instanceof Error) return error.message;
  return '请求失败，请检查网络后重试';
}

export async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const response = await fetch(url, {
    ...init,
    headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
  const data = await response.json().catch(() => ({})) as ApiResult<T>;
  if (!response.ok || !data.success) {
    throw new Error(data.message || `服务器请求失败 (${response.status})`);
  }
  return data;
}
