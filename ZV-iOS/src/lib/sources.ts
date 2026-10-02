import { nativeVideoSource, type PlaybackSource } from './media.ts';
export type AnimeMeta = { sourceId: string; originalTitle: string; episode: { id: string; title: string; episodeNumber: number; playbackParams: Record<string, unknown> } };
export type Movie = { id: number; cid?: number; title: string; url: string; source?: string; sourceType?: string; format?: string; audioUrl?: string | null; roomId?: string; headers?: Record<string, string>; sourceMeta?: AnimeMeta };
export type SourceSelection = { title: string; url: string; source: string; format?: string; audioUrl?: string; serverUrl?: string; path?: string; directLink?: boolean; sourceMeta?: AnimeMeta };
export function canonicalSelection(value: SourceSelection, server: string, token: string): SourceSelection {
  if (value.source === 'anime' && value.sourceMeta) {
    if (!value.url.startsWith('anisubs://') || JSON.stringify(value.sourceMeta).length > 32000 || typeof value.sourceMeta.sourceId !== 'string' || !value.sourceMeta.episode?.id) throw new Error('番剧元数据无效');
    return value;
  }
  const video = nativeVideoSource({ sourceUrl: value.url, sourceType: value.source, format: value.format, audioUrl: value.audioUrl }, server, token);
  const canonical = (identity: string) => identity.startsWith(server.replace(/\/+$/, '') + '/api/') ? identity.slice(server.replace(/\/+$/, '').length) : identity;
  return { ...value, url: canonical(video.identity), ...(video.slaves.length ? { audioUrl: canonical(video.slaves[0].identity) } : {}) };
}
export function moviePlayback(movie: Movie): PlaybackSource {
  let url = movie.url;
  if ((movie.source || movie.sourceType) === 'bilibili' && movie.cid) { const parsed = new URL(url); parsed.searchParams.set('cid', String(movie.cid)); url = parsed.toString(); }
  return { movieId: movie.id, cid: movie.cid, sourceUrl: url, sourceType: movie.source || movie.sourceType || 'mp4', format: movie.format, audioUrl: movie.audioUrl, headers: movie.headers };
}
export function formatTime(time: number) {
  const seconds = Math.max(0, Math.floor(Number.isFinite(time) ? time : 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
