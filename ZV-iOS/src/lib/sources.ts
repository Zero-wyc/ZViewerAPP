import { nativeVideoSource, type PlaybackSource } from './media.ts';
import { biliSelection } from './biliSelection.ts';
export type AnimeMeta = { sourceId: string; originalTitle: string; episode: { id: string; title: string; episodeNumber: number; playbackParams: Record<string, unknown> } };
export type CmsMeta = { sourceId: string; vodId: string; vodTitle: string; playFromIndex: number; episodeIndex: number; episodeTitle: string };
export type SourceMeta = AnimeMeta | CmsMeta;
export function validSourceMeta(sourceType: string, meta: SourceMeta) {
  if (!meta || typeof meta.sourceId !== 'string' || !meta.sourceId.trim() || JSON.stringify(meta).length > 32000) return false;
  if (sourceType === 'cms') return 'vodId' in meta && typeof meta.vodId === 'string' && !!meta.vodId.trim() && Number.isSafeInteger(meta.playFromIndex) && meta.playFromIndex >= 0 && Number.isSafeInteger(meta.episodeIndex) && meta.episodeIndex >= 0;
  return 'episode' in meta && typeof meta.episode?.id === 'string' && !!meta.episode.id.trim() && typeof meta.episode.playbackParams === 'object' && meta.episode.playbackParams !== null;
}
export type MoviePage = { page: number; cid?: number; epId?: number; seasonId?: number; part: string; duration?: number; path?: string; mountId?: number };
type MovieDetails = import('./media').PlaybackPolicy & { cid?: number; pages?: MoviePage[] | null; currentPage?: number; epId?: number; seasonId?: number; cliOnly?: boolean; multiVersion?: boolean; duration?: number; cover?: string; serverUrl?: string; path?: string; directLink?: boolean; audioCodec?: string; videoCodec?: string };
export type Movie = MovieDetails & { id: number; cid?: number; title: string; url: string; source?: string; sourceType?: string; format?: string; audioUrl?: string | null; roomId?: string; headers?: Record<string, string>; sourceMeta?: SourceMeta };
export type SourceSelection = MovieDetails & { title: string; url: string; source: string; format?: string; audioUrl?: string; sourceMeta?: SourceMeta };
export function canonicalSelection(value: SourceSelection, server: string, token: string): SourceSelection {
  if (value.source === 'bilibili' && /(^BV[\w]+$|^(?:ep|ss)\d+$|https?:\/\/(?:www\.|m\.)?bilibili\.com|https?:\/\/b23\.tv)/i.test(value.url.trim())) { const parsed = biliSelection(value.url); return { ...value, url: parsed.url, ...(parsed.epId || parsed.seasonId ? { cliOnly: true } : {}) }; }
  if (['anime', 'kazumi', 'cms'].includes(value.source) && value.sourceMeta) {
    const meta = value.sourceMeta;
    if (!validSourceMeta(value.source, meta)) throw new Error('数据源元数据无效');
    const canonicalProxy = (input: string) => {
      let parsed: URL; try { parsed = new URL(input, 'https://catalogue.invalid'); } catch { return input; }
      const route = parsed.pathname.match(/\/api\/stream\/(anisubs|anime|kazumi|cms)\/proxy$/);
      if (!route) return input;
      parsed.searchParams.delete('token'); parsed.searchParams.delete('rangeMode');
      return `/api/stream/${route[1]}/proxy?${parsed.searchParams}`;
    };
    return { ...value, url: canonicalProxy(value.url), ...(value.audioUrl ? { audioUrl: canonicalProxy(value.audioUrl) } : {}) };
  }
  const video = nativeVideoSource({ sourceUrl: value.url, sourceType: value.source, format: value.format, audioUrl: value.audioUrl }, server, token);
  const canonical = (identity: string) => identity.startsWith(server.replace(/\/+$/, '') + '/api/') ? identity.slice(server.replace(/\/+$/, '').length) : identity;
  return { ...value, url: canonical(video.identity), ...(video.slaves.length ? { audioUrl: canonical(video.slaves[0].identity) } : {}) };
}
export function moviePlayback(movie: Movie): PlaybackSource {
  let url = movie.url;
  const page = movie.pages?.find(item => item.page === (movie.currentPage || 1));
  const epId = page?.epId || movie.epId;
  const cid = page?.cid || movie.cid;
  if ((movie.source || movie.sourceType) === 'bilibili') { const parsed = new URL(biliSelection(epId ? `ep${epId}` : url).url); if (cid) parsed.searchParams.set('cid', String(cid)); if (!epId && movie.currentPage) parsed.searchParams.set('p', String(movie.currentPage)); url = parsed.toString(); }
  return { movieId: movie.id, cid, epId, seasonId: page?.seasonId || movie.seasonId, cliOnly: movie.cliOnly, currentPage: movie.currentPage, sourceUrl: url, sourceType: movie.source || movie.sourceType || 'mp4', format: movie.format, audioUrl: (movie.source || movie.sourceType) === 'bilibili' ? undefined : movie.audioUrl, headers: movie.headers, sourceMeta: movie.sourceMeta, videoCodec: movie.videoCodec, audioCodec: movie.audioCodec, isHdr: undefined, hdrType: undefined, videoCodecid: undefined, serverProxy: ['anime', 'kazumi', 'cms'].includes(movie.source || movie.sourceType || '') ? movie.serverProxy === true : movie.serverProxy, playsvideoEnabled: movie.playsvideoEnabled, noProxyFallback: movie.noProxyFallback ?? (['anime', 'kazumi', 'cms'].includes(movie.source || movie.sourceType || '') ? movie.serverProxy !== true : movie.directLink), sourceMountId: movie.sourceMountId };
}
export function formatTime(time: number) {
  const seconds = Math.max(0, Math.floor(Number.isFinite(time) ? time : 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
