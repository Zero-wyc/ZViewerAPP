import { addSourceBatch } from './sourceBatch.ts';
import type { SourceSelection } from './sources.ts';

export type CmsEpisode = { index: number; title: string; playbackParams: { vodId: string; playFromIndex: number; episodeIndex: number } };
export type CmsDetail = { id: string; title: string; playGroups: { name: string; episodes: CmsEpisode[] }[] };

export async function addCmsEpisodes(sourceId: string, detail: CmsDetail, groupIndex: number, ids: string[], add: (value: SourceSelection) => Promise<void>, signal?: AbortSignal) {
  const episodes = detail.playGroups[groupIndex]?.episodes || [];
  return addSourceBatch(ids, id => id, async id => {
      const episode = episodes[Number(id)]; const params = episode?.playbackParams;
      if (!episode || !params?.vodId || !Number.isSafeInteger(params.playFromIndex) || params.playFromIndex < 0 || !Number.isSafeInteger(params.episodeIndex) || params.episodeIndex < 0) throw new Error('集数信息无效，请重新加载影片');
      await add({ source: 'cms', title: `${detail.title} · ${episode.title}`, url: `cms://${encodeURIComponent(sourceId)}/${encodeURIComponent(params.vodId)}/${params.playFromIndex}/${params.episodeIndex}`, sourceMeta: { sourceId, vodId: params.vodId, vodTitle: detail.title, playFromIndex: params.playFromIndex, episodeIndex: params.episodeIndex, episodeTitle: episode.title } });
  }, signal);
}
