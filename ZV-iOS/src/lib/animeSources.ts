import { checkAbort } from './cancellation.ts';
import type { SourceSelection } from './sources.ts';
import type { ApiRequest } from './mediaLibrary.ts';
export type AnimeEpisode = { id: string; title: string; episodeNumber: number; playbackParams: Record<string, unknown> };
export async function addAnimeEpisode(request: ApiRequest, kind: string, source: string, name: string, episode: AnimeEpisode, add: (value: SourceSelection) => Promise<void>, signal?: AbortSignal) {
  checkAbort(signal); const title = `${name} · ${episode.title}`;
  if (kind === 'anisubs') await add({ title, source: 'anime', url: `anisubs://${source}/${episode.id}`, sourceMeta: { sourceId: source, episode, originalTitle: title } });
  else {
    const root = `/api/stream/${kind}`;
    const media = await request<{ url: string; audioUrl?: string; headers?: Record<string, string>; format?: string }>(`${root}/resolve`, { method: 'POST', signal, body: JSON.stringify({ source, episode }) });
    checkAbort(signal);
    const proxy = (url: string) => {
      if (url.startsWith('/api/') && !url.startsWith('//')) return url;
      const params = new URLSearchParams({ url });
      for (const [key, value] of Object.entries(media.headers || {})) { const header = ({ referer: 'referer', 'user-agent': 'userAgent', origin: 'origin', cookie: 'cookie' } as Record<string, string>)[key.toLowerCase()]; if (header) params.set(header, value); }
      return `${root}/proxy?${params}`;
    };
    await add({ title, source: kind === 'anime' ? 'mp4' : kind, url: proxy(media.url), ...(media.audioUrl ? { audioUrl: proxy(media.audioUrl) } : {}), format: media.format });
  }
  checkAbort(signal);
}
