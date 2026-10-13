import { checkAbort } from './cancellation.ts';
import type { SourceSelection } from './sources.ts';
import type { ApiRequest } from './mediaLibrary.ts';
export type AnimeEpisode = { id: string; title: string; episodeNumber: number; playbackParams: Record<string, unknown> };
export async function addAnimeEpisodes(request: ApiRequest, kind: string, source: string, name: string, episodes: AnimeEpisode[], add: (value: SourceSelection) => Promise<void>, signal?: AbortSignal, pendingSelections = new Map<string, SourceSelection>()) {
  const added: string[] = []; const failures: { id: string; message: string }[] = []; const visited = new Set<string>();
  for (const episode of episodes) {
    checkAbort(signal); if (visited.has(episode.id)) continue; visited.add(episode.id);
    try {
      if (!episode.id) throw new Error('集数信息无效');
      const key = JSON.stringify([kind, source, name, episode.id]);
      // Resolution can rotate CDN signatures. Reuse the exact selection until
      // the add transaction finishes, including its refresh/play follow-ups.
      const selection = pendingSelections.get(key) ?? await resolveAnimeSelection(request, kind, source, name, episode, signal);
      checkAbort(signal); pendingSelections.set(key, selection);
      await add(selection); pendingSelections.delete(key); checkAbort(signal);
      added.push(episode.id);
    }
    catch (failure) { checkAbort(signal); failures.push({ id: episode.id, message: failure instanceof Error ? failure.message : '添加失败' }); }
  }
  return { added, failures };
}
export async function addAnimeEpisode(request: ApiRequest, kind: string, source: string, name: string, episode: AnimeEpisode, add: (value: SourceSelection) => Promise<void>, signal?: AbortSignal) {
  const selection = await resolveAnimeSelection(request, kind, source, name, episode, signal);
  checkAbort(signal); await add(selection); checkAbort(signal);
}
async function resolveAnimeSelection(request: ApiRequest, kind: string, source: string, name: string, episode: AnimeEpisode, signal?: AbortSignal): Promise<SourceSelection> {
  checkAbort(signal); const title = `${name} · ${episode.title}`;
  if (kind === 'anisubs') return { title, source: 'anime', url: `anisubs://${source}/${episode.id}`, sourceMeta: { sourceId: source, episode, originalTitle: title } };
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
    return { title, source: kind === 'anime' ? 'mp4' : kind, url: proxy(media.url), ...(media.audioUrl ? { audioUrl: proxy(media.audioUrl) } : {}), format: media.format };
  }
}
