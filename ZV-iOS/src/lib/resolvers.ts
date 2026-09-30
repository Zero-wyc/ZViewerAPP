export type ResolvedMedia = { videoUrl: string; audioUrl?: string; title?: string; format?: string };
export function parseResolvedMedia(text: string): ResolvedMedia {
  if (text.length > 2_000_000) throw new Error('媒体解析响应过大');
  for (const line of text.split(/\r?\n/).reverse()) {
    let data; try { data = JSON.parse(line); } catch { continue; }
    if (data.success && typeof data.videoUrl === 'string') return data;
    if (data.error || data.success === false) throw new Error('媒体解析失败，请检查链接和账号权限');
  }
  throw new Error('服务器没有返回可播放的媒体地址');
}
export async function resolveBilibili(url: string, requestText: (path: string, init?: RequestInit) => Promise<string>, signal?: AbortSignal): Promise<ResolvedMedia> {
  const params = new URLSearchParams({ url, preferMp4: 'true', forceDash: 'true' });
  return parseResolvedMedia(await requestText(`/api/stream/resolve-bilibili?${params}`, { signal }));
}
