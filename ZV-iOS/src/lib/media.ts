export type PlaybackSource = {
  movieId?: number;
  cid?: number;
  epId?: number;
  seasonId?: number;
  cliOnly?: boolean;
  currentPage?: number;
  biliPolicy?: { qn: number; cliEnabled: boolean; preferMp4: boolean; dashAllowed: boolean; revision: number };
  sourceUrl: string;
  sourceType?: string;
  format?: string;
  audioUrl?: string | null;
  headers?: Record<string, string>;
};

// Keep the aggregate proxy's default identity when VLC requests its upstream.
const ANIME_PROXY_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function internalAnimeHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  const mapped = /^\[::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})\]$/.exec(host);
  if (mapped) {
    const high = parseInt(mapped[1], 16); const low = parseInt(mapped[2], 16);
    return internalAnimeHost(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (/^\[(::|::1|f[cd][0-9a-f]{2}:.*|fe[89ab][0-9a-f]:.*)\]$/.test(host)) return true;
  const ipv4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  if (!ipv4) return false;
  const first = Number(ipv4[1]); const second = Number(ipv4[2]);
  return first === 0 || first === 127 || first === 10 || first === 169 && second === 254 || first === 192 && second === 168 || first === 172 && second >= 16 && second <= 31;
}

export function nativeVideoSource(source: PlaybackSource, serverUrl: string, accessToken: string): NativeVideoSource {
  return nativeTrackSource(source, serverUrl, accessToken, false);
}

function nativeTrackSource(source: PlaybackSource, serverUrl: string, accessToken: string, slave: boolean): NativeVideoSource {
  const sourceType = source.sourceType || 'mp4';
  if (!['mp4', 'url', 'server-files', 'jellyfin', 'emby', 'webdav', 'ftp', 'openlist', 'smb', 'bilibili', 'anime', 'kazumi'].includes(sourceType)) {
    throw new Error('该影片需要先解析为可播放的媒体地址');
  }

  const relative = source.sourceUrl.startsWith('/') && !source.sourceUrl.startsWith('//');
  const base = new URL(serverUrl.replace(/\/+$/, '') + '/');
  const uri = relative ? `${serverUrl.replace(/\/+$/, '')}${source.sourceUrl}` : source.sourceUrl;
  let parsed: URL;
  try { parsed = new URL(uri); }
  catch { throw new Error('影片地址无效'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('影片地址无效');
  }
  const serverApi = parsed.origin === base.origin && parsed.pathname.startsWith(`${base.pathname}api/`);
  if (!serverApi && /^(localhost\.?|127\..*|\[::1\]|\[::ffff:7f[0-9a-f]{2}:.*\])$/i.test(parsed.hostname)) {
    throw new Error('影片地址指向其他设备无法访问的本机服务');
  }

  if ((relative && !serverApi) || (sourceType === 'server-files' && !serverApi)) {
    throw new Error('服务端影片地址无效');
  }

  // VLC owns Range requests. A fixed Range from a room payload breaks later
  // seeks and must never be forwarded. Keep only source-site headers for URLs.
  const headers = serverApi ? {} as Record<string, string> : Object.fromEntries(
    Object.entries(source.headers || {}).filter(([key]) => /^(referer|user-agent)$/i.test(key)),
  );
  if (serverApi) headers.Authorization = `Bearer ${accessToken}`;

  const hls = ['hls', 'm3u8'].includes(source.format?.toLowerCase() || '') || /\.m3u8$/i.test(parsed.pathname);
  // VLC's HTTP file reader resumes short 206 responses using Content-Range's
  // total size. Keep the existing server cap, including for proxied MP4 files.
  if (serverApi) { parsed.searchParams.delete('rangeMode'); parsed.searchParams.delete('token'); }
  const identity = parsed.toString();
  const animeProxy = serverApi && /^api\/stream\/(anime|kazumi|anisubs)\/proxy$/.test(parsed.pathname.slice(base.pathname.length));
  if (animeProxy) {
    const target = parsed.searchParams.get('url');
    if (!target || parsed.searchParams.getAll('url').length !== 1) throw new Error('番剧解析未返回有效媒体地址');
    // These server routes stream playlists unchanged. Let VLC resolve every
    // child playlist, segment and key against the actual upstream URL instead.
    // VLC's adaptive HTTP stack inherits these two media options for children.
    const sourceHeaders: Record<string, string> = {};
    const proxyHeader = (name: string) => {
      const values = parsed.searchParams.getAll(name);
      if (values.length > 1 || values.some(value => /[\r\n\0]/.test(value))) throw new Error('影片请求头无效');
      return values[0]?.trim() ? values[0] : '';
    };
    for (const [parameter, header] of [['referer', 'Referer'], ['userAgent', 'User-Agent']]) {
      const value = proxyHeader(parameter); if (value) sourceHeaders[header] = value;
    }
    sourceHeaders['User-Agent'] ||= ANIME_PROXY_USER_AGENT;
    const origin = proxyHeader('origin'); const cookie = proxyHeader('cookie');
    const restrictedHeaders = origin || cookie;
    let targetUrl: URL;
    try { targetUrl = new URL(target); }
    catch { throw new Error('番剧解析返回的媒体地址无效'); }
    // Aggregate providers use public media sites. Unwrapping must retain the
    // server's private-network boundary, including IPv4-mapped IPv6 addresses.
    if (!['http:', 'https:'].includes(targetUrl.protocol) || targetUrl.username || targetUrl.password || targetUrl.origin === base.origin || internalAnimeHost(targetUrl.hostname)) throw new Error('番剧解析返回的媒体地址无效');
    const targetHls = hls || /\.m3u8$/i.test(targetUrl.pathname);
    if (restrictedHeaders && targetHls) throw new Error('此番剧 HLS 需要 Origin 或 Cookie 请求头，当前 iOS 播放方式暂不支持，请切换番剧源');
    // Arbitrary Origin/Cookie options are not supported by the current VLCKit
    // wrapper. Progressive streams can still use the authenticated server proxy.
    // A playback slave accepts only a URL, not its own media options. Keep
    // progressive audio on the proxy so its separate site headers survive.
    if (!restrictedHeaders && (!slave || targetHls)) return { ...nativeTrackSource({ ...source, sourceUrl: target, sourceType: 'url', headers: sourceHeaders }, serverUrl, accessToken, slave), identity };
  }
  const options = ['network-caching=1500'];
  // The existing server authenticates media URLs via ?token=. VLCKit's
  // wrapper accepts a URL rather than arbitrary HTTP headers. This private
  // playback URL must never replace the room's canonical sourceUrl.
  if (serverApi) parsed.searchParams.set('token', accessToken);
  for (const [key, value] of Object.entries(headers)) {
    if (/[\r\n\0]/.test(value)) throw new Error('影片请求头无效');
    if (/^referer$/i.test(key)) options.push(`http-referrer=${value}`);
    if (/^user-agent$/i.test(key)) options.push(`http-user-agent=${value}`);
  }
  const slaves = source.audioUrl ? [nativeTrackSource({ sourceUrl: source.audioUrl, headers: source.headers }, serverUrl, accessToken, true)] : [];
  return { uri: parsed.toString(), identity, headers, serverApi, options, slaves,
    contentType: hls ? 'hls' as const : 'progressive' as const };
}

export type NativeVideoSource = { uri: string; identity: string; headers: Record<string, string>; serverApi: boolean; options: string[]; slaves: NativeVideoSource[]; contentType: 'hls' | 'progressive' };
