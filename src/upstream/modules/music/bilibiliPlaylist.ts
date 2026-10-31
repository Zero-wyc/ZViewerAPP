import { getBilibiliVideoView, type BilibiliVideoItem, type BilibiliVideoViewInfo } from '@/modules/bilibili/bilibiliApi'
import type { MusicQueueItem } from './types'
import { portableMusicCoverUrl } from './utils/neteaseImage'
import { normalizeBiliPages, pickBiliPartMeta, type BiliPartMeta } from './utils/biliPartName'

const VIEW_CACHE_TTL_MS = 10 * 60 * 1000
const viewCache = new Map<string, { at: number; promise: Promise<BilibiliVideoViewInfo> }>()

/** Coalesce the detail requests shared by expansion and related-song naming. */
export function loadBilibiliView(bvid: string): Promise<BilibiliVideoViewInfo> {
  const now = Date.now()
  const cached = viewCache.get(bvid)
  if (cached && now - cached.at < VIEW_CACHE_TTL_MS) return cached.promise
  const promise = getBilibiliVideoView(bvid)
  if (viewCache.size >= 200) viewCache.clear()
  viewCache.set(bvid, { at: now, promise })
  void promise.catch(() => {
    if (viewCache.get(bvid)?.promise === promise) viewCache.delete(bvid)
  })
  return promise
}

export async function resolveBiliPartMeta(
  bvid: string,
  cid: number | null | undefined,
  fallbackTitle: string
): Promise<BiliPartMeta> {
  try {
    return pickBiliPartMeta(await loadBilibiliView(bvid), cid, fallbackTitle)
  } catch {
    return { name: fallbackTitle, album: '', durationSec: 0, multiPart: false }
  }
}

/** A BV's total duration is not the duration of any one CID. */
export function expandBilibiliParts(item: BilibiliVideoItem, view: BilibiliVideoViewInfo): MusicQueueItem[] {
  const pages = normalizeBiliPages(view)
  if (!pages.length && (view.cid || item.cid)) pages.push({ page: 1, cid: view.cid || item.cid!, part: item.title, duration: view.duration })
  if (!pages.length) throw new Error('没有找到可播放的分P')
  return pages.map((page, index) => {
    const meta = pickBiliPartMeta(view, page.cid, item.title, pages)
    return { id: -1, roomId: '', songId: 0,
    name: meta.name,
    artist: view.upName || item.upName || '哔哩哔哩', album: meta.album,
    cover: portableMusicCoverUrl(view.pic || item.pic),
    durationMs: Math.round(meta.durationSec * 1000),
    vip: false, order: index, addedBy: '', biliBvid: item.bvid, biliCid: page.cid }
  })
}

export async function loadBilibiliParts(item: BilibiliVideoItem): Promise<MusicQueueItem[]> {
  return expandBilibiliParts(item, await loadBilibiliView(item.bvid))
}

/** Append in order; only start after the first acknowledged queue write. */
export async function enqueueBilibiliParts(tracks: readonly MusicQueueItem[], deps: {
  enqueue: (track: MusicQueueItem) => Promise<void>
  isCurrent: () => boolean
  play?: (track: MusicQueueItem) => void
}): Promise<void> {
  for (let index = 0; index < tracks.length; index++) {
    if (!deps.isCurrent()) return
    await deps.enqueue(tracks[index])
    if (!deps.isCurrent()) return
    if (index === 0) deps.play?.(tracks[index])
  }
}
