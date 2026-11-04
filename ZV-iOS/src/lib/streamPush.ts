type WatchRequest = <T>(path: string, init?: RequestInit) => Promise<T & { success: boolean; message?: string }>;

export type WatchTicket = { success: boolean; url: string; message?: string };

export function watchPlaybackUrl(serverUrl: string, roomId: string, ticketUrl: string, customBase = ''): string {
  if (!roomId.trim()) throw new Error('房间信息无效，无法获取观看权限');
  const server = new URL(serverUrl);
  const base = new URL(customBase.trim() || serverUrl);
  if (!['http:', 'https:'].includes(server.protocol) || !['http:', 'https:'].includes(base.protocol) ||
    !server.hostname || !base.hostname || server.username || server.password || server.search || server.hash ||
    base.username || base.password || base.search || base.hash) {
    throw new Error('请输入有效的 HTTP-FLV 服务地址');
  }

  const expectedPath = `/live/${encodeURIComponent(roomId)}.flv`;
  let parsed: URL;
  try { parsed = new URL(ticketUrl, 'https://watch.invalid'); }
  catch { throw new Error('服务器返回了无效的观看地址'); }
  if (parsed.origin !== 'https://watch.invalid' || parsed.pathname !== expectedPath ||
    !ticketUrl.startsWith(`${expectedPath}?`) || !parsed.searchParams.get('ticket') ||
    parsed.searchParams.getAll('ticket').length !== 1) {
    throw new Error('服务器返回了无效的观看地址');
  }

  const prefix = base.pathname.replace(/\/+$/, '');
  base.pathname = `${prefix}${expectedPath}`;
  base.search = parsed.search;
  return base.toString();
}

export async function getWatchPlaybackUrl(
  request: WatchRequest,
  serverUrl: string,
  roomId: string,
  signal?: AbortSignal,
  current: () => boolean = () => true,
  customBase = '',
): Promise<string> {
  const data = await request<WatchTicket>(`/api/stream-push/watch/${encodeURIComponent(roomId)}`, { signal });
  if (signal?.aborted || !current()) {
    throw new Error('服务器连接已变更，请重新连接直播');
  }
  if (!data.success || typeof data.url !== 'string') {
    throw new Error(data.message || '无法获取观看权限，请确认已获准进入房间');
  }
  return watchPlaybackUrl(serverUrl, roomId, data.url, customBase);
}
