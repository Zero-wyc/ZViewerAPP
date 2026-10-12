import { parseEpisodeFromFilePath } from './embyApi'
import type { EmbyDirectoryEntry } from './types'
import type { BilibiliVideoPage } from '@/modules/bilibili/types'

export async function enumerateSeriesPages(
  mountId: number,
  series: EmbyDirectoryEntry,
  browse: (mountId: number, path?: string) => Promise<EmbyDirectoryEntry[]>,
  isCurrent: () => boolean = () => true
): Promise<BilibiliVideoPage[]> {
  const children = await browse(mountId, series.path)
  if (!isCurrent()) return []
  const seasons = children.filter(entry => entry.type === 'directory' && entry.embyType === 'Season')
  const pages: BilibiliVideoPage[] = []
  for (const season of seasons.length ? seasons : [series]) {
    const episodes = season === series ? children : await browse(mountId, season.path)
    if (!isCurrent()) return []
    for (const episode of episodes) {
      if (episode.type !== 'file' || !['Episode', 'Video'].includes(episode.embyType || '')) continue
      const parsed = episode.filePath ? parseEpisodeFromFilePath(episode.filePath) : null
      const label = episode.indexNumber != null
        ? `S${episode.parentIndexNumber ?? '?'}E${episode.indexNumber}`
        : parsed ? `EP${parsed.episode}` : season !== series ? season.name : ''
      pages.push({ page: pages.length + 1, cid: 0, part: label ? `${label} · ${episode.name}` : episode.name,
        duration: episode.duration ?? 0, path: episode.path, mountId })
    }
  }
  return pages
}
