import { internalAnimeHost } from './media.ts';

// The server streams provider playlists unchanged. Each child must use the
// same proxy (and site headers), including keys, maps and nested playlists.
export function proxyHlsUri(value: string, upstream: string, proxy: string) {
  const target = new URL(value, upstream);
  const endpoint = new URL(proxy);
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password ||
      target.origin === endpoint.origin || internalAnimeHost(target.hostname) || /[\r\n\0]/.test(value) || value.includes('{$')) {
    throw new Error('番剧清单包含无效媒体地址');
  }
  endpoint.searchParams.set('url', target.toString());
  return { upstream: target.toString(), proxy: endpoint.toString() };
}

type PlaylistStore = { reserve(index: number): string; write(uri: string, text: string): void };
export async function prepareHlsPlaylists(upstream: string, proxy: string,
  fetchPlaylist: (uri: string) => Promise<string>, store: PlaylistStore) {
  const seen = new Map<string, string>();
  const loading = new Set<string>();
  let bytes = 0;
  async function load(target: string, uri: string, depth: number): Promise<string> {
    if (loading.has(target)) throw new Error('番剧清单存在循环引用');
    const existing = seen.get(target); if (existing) return existing;
    if (depth > 4 || seen.size >= 24) throw new Error('番剧嵌套清单过多');
    const local = store.reserve(seen.size); seen.set(target, local);
    loading.add(target);
    const text = await fetchPlaylist(uri);
    bytes += text.length;
    if (text.length > 2_000_000 || bytes > 4_000_000 || !text.trimStart().startsWith('#EXTM3U')) throw new Error('番剧清单无效或过大');
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
    const master = lines.some(line => /^#EXT-X-(STREAM-INF|I-FRAME-STREAM-INF):/.test(line));
    if (!master && !lines.some(line => line.trim() === '#EXT-X-ENDLIST')) throw new Error('此番剧源返回直播清单，请选择完整剧集');
    let variant = false;
    const output: string[] = [];
    for (let line of lines) {
      if (!line.trim()) { output.push(line); continue; }
      if (!line.startsWith('#')) {
        const child = proxyHlsUri(line.trim(), target, proxy);
        line = variant ? await load(child.upstream, child.proxy, depth + 1) : child.proxy;
        variant = false;
      } else {
        const nested = /^#EXT-X-(MEDIA|I-FRAME-STREAM-INF):/.test(line);
        const matches = [...line.matchAll(/\bURI="([^"]*)"/g)];
        // URI attributes are quoted by the HLS specification. Reject malformed
        // values instead of leaving an upstream URL outside the proxy.
        if (/\bURI=/.test(line) && !matches.length) throw new Error('番剧清单 URI 属性无效');
        for (const match of matches) {
          const child = proxyHlsUri(match[1], target, proxy);
          const replacement = nested ? await load(child.upstream, child.proxy, depth + 1) : child.proxy;
          line = line.replace(match[0], `URI="${replacement}"`);
        }
        if (line.startsWith('#EXT-X-STREAM-INF:')) variant = true;
      }
      output.push(line);
    }
    if (variant) throw new Error('番剧清单缺少子清单');
    store.write(local, output.join('\n'));
    loading.delete(target);
    return local;
  }
  return load(upstream, proxy, 0);
}
