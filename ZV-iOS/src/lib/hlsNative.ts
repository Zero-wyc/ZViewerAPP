import { Directory, File, Paths } from 'expo-file-system';
import type { NativeVideoSource } from './media';
import { prepareHlsPlaylists } from './hlsPlaylist';
import { withDeadline } from './deadline';

const entries = new Map<string, { source: NativeVideoSource; until: number }>();
const directories: Directory[] = [];
let sequence = 0;
let cleaned = false;

export async function prepareNativeHls(source: NativeVideoSource, signal?: AbortSignal) {
  if (!source.hlsProxy) return source;
  const key = source.uri;
  const existing = entries.get(key);
  if (existing && existing.until > Date.now()) return existing.source;
  const root = new Directory(Paths.cache, 'zviewer-hls');
  root.create({ intermediates: true, idempotent: true });
  if (!cleaned) {
    cleaned = true;
    for (const child of root.list()) {
      const name = child.uri.replace(/\/$/, '').split('/').at(-1) || '';
      if (child instanceof Directory && /^\d{13}-\d+$/.test(name) && Date.now() - Number(name.split('-')[0]) > 86_400_000) child.delete();
    }
  }
  const directory = new Directory(root, `${Date.now()}-${sequence++}`);
  directory.create({ intermediates: true, idempotent: true });
  try {
    const upstream = source.hlsProxy.upstream;
    const uri = await withDeadline(cancellation => prepareHlsPlaylists(upstream, source.uri, async proxy => {
      return withDeadline(async cancellation => {
        const response = await fetch(proxy, { signal: cancellation });
        if (!response.ok) throw new Error(`番剧清单请求失败（HTTP ${response.status}）`);
        if (Number(response.headers.get('content-length')) > 2_000_000) throw new Error('番剧清单过大');
        return response.text();
      }, 15000, cancellation);
    }, {
      reserve: index => new File(directory, `${index}.m3u8`).uri,
      write: (uri, text) => { if (cancellation.aborted) throw new Error('播放任务已取消'); new File(uri).write(text); },
    }), 45000, signal);
    if (signal?.aborted) throw new Error('播放任务已取消');
    const prepared = { ...source, uri, probeUri: source.uri };
    entries.delete(key); entries.set(key, { source: prepared, until: Date.now() + 300_000 });
    directories.push(directory);
    while (entries.size > 8) entries.delete(entries.keys().next().value!);
    // Keep recent files alive for VLC's lazy reads; bound the process cache.
    while (directories.length > 32) { const old = directories.shift()!; if (old.exists) old.delete(); }
    return prepared;
  } catch (error) { if (directory.exists) directory.delete(); throw error; }
}
