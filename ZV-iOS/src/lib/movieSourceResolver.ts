import type { PlaybackSource } from './media.ts';
import type { ApiRequest, LibraryKind, LibraryMedia } from './mediaLibrary.ts';
import { logicalConnectionUrl } from './connectionTransport.ts';

export type MovieSourceRequest = <T>(path: string, init?: RequestInit) => Promise<T & { success: boolean; message?: string }>;

export function canSwitchLibraryPlayback(movie: { serverUrl?: string }): boolean {
  if (!movie.serverUrl) return true;
  try {
    const address = /^[a-z][a-z\d+.-]*:\/\//i.test(movie.serverUrl) ? movie.serverUrl : `http://${movie.serverUrl}`;
    let host = new URL(address).hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (!host || host === 'localhost' || host.endsWith('.localhost') || /\.(local|lan|internal|localdomain|home\.arpa)$/.test(host) || !host.includes('.') && !host.includes(':')) return false;
    const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
    if (mapped) {
      const high = parseInt(mapped[1], 16); const low = parseInt(mapped[2], 16);
      host = `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
    }
    const ipv4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
    if (ipv4) {
      const [a, b] = ipv4.slice(1).map(Number);
      if (a === 0 || a === 10 || a === 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127) return false;
    }
    return !(host === '::' || host === '::1' || /^f[cd][0-9a-f]{0,2}:/.test(host) || /^fe[89ab][0-9a-f]{0,2}:/.test(host));
  } catch { return true; }
}

export function libraryMediaSourceId(url: string): string | undefined {
  try {
    const query = new URL(url, 'https://source.invalid').searchParams;
    return query.get('ms') || query.get('MediaSourceId') || undefined;
  } catch { return undefined; }
}

export function libraryMovieSourceUrl(data: LibraryMedia, directLink: boolean, serverUrl: string): string {
  const url = directLink ? data.directUrl : data.streamUrl;
  if (!url) throw new Error(directLink ? '服务器未提供媒体库直链' : '服务器未提供可供房间成员播放的地址');
  return logicalConnectionUrl(url.startsWith('/') ? `${serverUrl.replace(/\/+$/, '')}${url}` : url);
}

export function libraryMoviePlaybackUrl(data: LibraryMedia, directLink: boolean, serverUrl: string): string {
  if (!directLink) return libraryMovieSourceUrl(data, false, serverUrl);
  const url = data.resolvedDirectUrl || data.directUrl;
  if (!url) throw new Error('服务器未提供媒体库直链');
  return logicalConnectionUrl(url.startsWith('/') ? `${serverUrl.replace(/\/+$/, '')}${url}` : url);
}

export async function fetchLibraryMovieSource(
  request: MovieSourceRequest,
  kind: LibraryKind,
  movieId: number,
  currentUrl: string,
  directLink: boolean,
  signal?: AbortSignal,
): Promise<LibraryMedia> {
  const params = new URLSearchParams({ movieId: String(movieId) });
  const mediaSourceId = libraryMediaSourceId(currentUrl);
  if (mediaSourceId) params.set('ms', mediaSourceId);
  if (directLink) params.set('direct', '1');
  return request<LibraryMedia>(`/api/${kind}/movie-source?${params}`, { signal });
}

function movieIdQuery(id: number): string { return new URLSearchParams({ movieId: String(id) }).toString(); }

export async function resolveMoviePlaybackSource(
  source: PlaybackSource,
  serverUrl: string,
  request: ApiRequest,
  signal?: AbortSignal,
): Promise<PlaybackSource> {
  const movieId = source.movieId;
  const kind = source.sourceType || '';
  if (!movieId || !Number.isSafeInteger(movieId) || movieId < 1) return source;
  if (signal?.aborted) throw new Error('播放任务已取消');

  if (kind === 'ftp' || kind === 'server-files') {
    const route = kind === 'ftp' ? '/api/ftp/stream' : '/api/server-files/proxy';
    return { ...source, sourceUrl: `${route}?${movieIdQuery(movieId)}`, noProxyFallback: undefined };
  }
  if (kind === 'webdav' || kind === 'openlist') {
    if (source.noProxyFallback === true) {
      const data = await request<{ directUrl: string }>(`/api/direct-resolve/movie?${movieIdQuery(movieId)}`, { signal });
      if (!data.directUrl) throw new Error('服务器未返回可用的挂载直链');
      return { ...source, sourceUrl: logicalConnectionUrl(data.directUrl), noProxyFallback: true };
    }
    return { ...source, sourceUrl: `/api/${kind}/stream?${movieIdQuery(movieId)}`, noProxyFallback: false };
  }
  if (kind !== 'emby' && kind !== 'jellyfin') return source;

  const data = await fetchLibraryMovieSource(request, kind, movieId, source.sourceUrl, source.noProxyFallback === true, signal);
  if (signal?.aborted) throw new Error('播放任务已取消');
  const directLink = source.noProxyFallback === true;
  const sourceUrl = libraryMoviePlaybackUrl(data, directLink, serverUrl);
  const expectedRoute = `/api/${kind}/stream`;
  if (!directLink && !sourceUrl.startsWith(`${serverUrl.replace(/\/+$/, '')}${expectedRoute}?`)) {
    throw new Error('服务器返回的媒体库地址不属于当前服务器');
  }
  return {
    ...source,
    sourceUrl,
    format: data.format || source.format,
    audioCodec: data.audioCodec || source.audioCodec,
    noProxyFallback: directLink,
  };
}
