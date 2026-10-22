import type { PlaybackSource } from './media.ts';
import { validSourceMeta } from './sources.ts';

export type AggregateMedia = { url: string; audioUrl?: string; headers?: Record<string, string>; format?: string };
type Request = <T>(path: string, init?: RequestInit) => Promise<T>;

// Saved proxies can belong to another device/entry point. Keep provider headers
// and upstream media, while discarding the adding user's server token and host.
export function aggregateProxy(value: string) {
  try {
    const url = new URL(value, 'https://catalogue.invalid');
    const route = url.pathname.match(/\/api\/stream\/(anisubs|anime|kazumi|cms)\/proxy$/);
    if (!route) return null;
    const target = url.searchParams.get('url'); if (!target) return null;
    const headers: Record<string, string> = {};
    for (const [param, header] of [['referer', 'Referer'], ['userAgent', 'User-Agent'], ['origin', 'Origin'], ['cookie', 'Cookie']]) {
      const field = url.searchParams.get(param); if (field) headers[header] = field;
    }
    return { url: target, headers, provider: route[1] };
  } catch { return null; }
}

export async function resolveAggregateSource(source: PlaybackSource, request: Request, signal?: AbortSignal): Promise<PlaybackSource> {
  const kind = source.sourceType;
  if (!['anime', 'kazumi', 'cms'].includes(kind || '')) return source;
  const meta = source.sourceMeta;
  const provider = kind === 'anime' ? 'anisubs' : kind!;
  let media: AggregateMedia | null = null;
  let failure: unknown;
  if (meta && validSourceMeta(kind!, meta)) {
    const body = 'vodId' in meta
      ? { source: meta.sourceId, params: { vodId: meta.vodId, playFromIndex: meta.playFromIndex, episodeIndex: meta.episodeIndex } }
      : { source: meta.sourceId, episode: meta.episode };
    try { media = await request<AggregateMedia>(`/api/stream/${provider}/resolve`, { method: 'POST', body: JSON.stringify(body), signal }); }
    catch (error) { if (signal?.aborted) throw error; failure = error; }
  }
  // Legacy Kazumi records had a usable proxy but no metadata. A logical
  // kazumi:// address is never a playable fallback.
  if (!media && kind === 'kazumi' && !meta) {
    const saved = aggregateProxy(source.sourceUrl);
    if (saved) media = { ...saved, audioUrl: source.audioUrl || undefined, format: source.format };
    else if (/^https?:\/\//i.test(source.sourceUrl)) media = { url: source.sourceUrl, audioUrl: source.audioUrl || undefined, headers: source.headers, format: source.format };
  }
  if (!media) throw failure || new Error('数据源元数据缺失，请重新添加影片');
  if (signal?.aborted) throw new Error('播放任务已取消');
  const nested = aggregateProxy(media.url);
  if (nested) media = { ...media, url: nested.url, headers: { ...nested.headers, ...media.headers } };
  const parsed = new URL(media.url);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('数据源未返回有效媒体地址');
  // Keep all provider header semantics on the dedicated proxy; nativeTrackSource
  // enforces explicit direct/proxy policy and never silently falls back.
  const proxy = (url: string, headers = media!.headers) => {
    const params = new URLSearchParams({ url });
    for (const [key, value] of Object.entries(headers || {})) {
      const name = ({ referer: 'referer', 'user-agent': 'userAgent', origin: 'origin', cookie: 'cookie' } as Record<string, string>)[key.toLowerCase()];
      if (name) params.set(name, value);
    }
    return `/api/stream/${provider}/proxy?${params}`;
  };
  const audio = media.audioUrl ? aggregateProxy(media.audioUrl) : null;
  return { ...source, sourceUrl: proxy(media.url), audioUrl: media.audioUrl ? proxy(audio?.url || media.audioUrl, { ...media.headers, ...audio?.headers }) : undefined, format: media.format ?? source.format, headers: undefined };
}
