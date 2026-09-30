export type PlaybackSource = {
  sourceUrl: string;
  sourceType?: string;
  format?: string;
  audioUrl?: string | null;
  headers?: Record<string, string>;
};

export function nativeVideoSource(source: PlaybackSource, serverUrl: string, accessToken: string) {
  const sourceType = source.sourceType || 'mp4';
  if (!['mp4', 'url', 'server-files', 'jellyfin', 'emby', 'webdav', 'ftp', 'openlist', 'smb'].includes(sourceType) || source.audioUrl) {
    throw new Error('该影片需要专用解析或分离音轨，当前 iOS 播放器尚不支持');
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
  if (/^(localhost\.?|127\..*|\[::1\]|\[::ffff:7f[0-9a-f]{2}:.*\])$/i.test(parsed.hostname)) {
    throw new Error('影片地址指向其他设备无法访问的本机服务');
  }

  const serverApi = parsed.origin === base.origin && parsed.pathname.startsWith(`${base.pathname}api/`);
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
  return { uri: parsed.toString(), identity, headers, serverApi, options,
    contentType: hls ? 'hls' as const : 'progressive' as const };
}
