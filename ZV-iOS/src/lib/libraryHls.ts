import type { NativeVideoSource } from './media.ts';
import { logicalConnectionUrl } from './connectionTransport.ts';

// A server can fall back from an MP4-labelled record to HLS. Probe only its
// dedicated media-library routes; a missing/failed MIME probe keeps ordinary
// progressive playback instead of interpreting binary media as a manifest.
export async function detectLibraryHls(source: NativeVideoSource, server: string, token: string,
  head: (uri: string) => Promise<string>, signal?: AbortSignal): Promise<NativeVideoSource> {
  if (source.libraryHls || !source.serverApi) return source;
  const base = new URL(server.replace(/\/+$/, '') + '/'); const uri = new URL(logicalConnectionUrl(source.uri));
  if (uri.origin !== base.origin || !uri.pathname.startsWith(base.pathname) ||
      !/^api\/(emby|jellyfin)\/(stream|proxy)$/.test(uri.pathname.slice(base.pathname.length))) return source;
  try {
    const mime = await head(source.uri);
    if (signal?.aborted) throw new Error('播放任务已取消');
    return /(?:application|audio)\/(?:vnd\.apple\.mpegurl|x-mpegurl|mpegurl)(?:\s*;|$)/i.test(mime.trim())
      ? { ...source, contentType: 'hls', libraryHls: { serverUrl: server.replace(/\/+$/, ''), accessToken: token } } : source;
  } catch (error) { if (signal?.aborted) throw error; return source; }
}
