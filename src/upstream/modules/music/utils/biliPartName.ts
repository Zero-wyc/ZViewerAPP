export interface BiliViewPageLike {
  page: number
  cid: number
  part?: string | null
  duration?: number
}

export interface BiliViewLike {
  title?: string | null
  duration?: number | null
  pages?: BiliViewPageLike[] | null
}

export interface BiliPartMeta {
  name: string
  album: string
  durationSec: number
  multiPart: boolean
}

/** Keep part expansion and single recommendations on the same CID ordering. */
export function normalizeBiliPages(view: BiliViewLike | null | undefined): BiliViewPageLike[] {
  const seen = new Set<number>()
  return (view?.pages || []).filter(page => {
    if (!Number.isSafeInteger(page.cid) || page.cid <= 0 || seen.has(page.cid)) return false
    seen.add(page.cid)
    return true
  }).sort((a, b) => a.page - b.page)
}

function durationSec(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

/** Multi-part totals cannot be used as the duration of an individual song. */
export function pickBiliPartMeta(
  view: BiliViewLike | null | undefined,
  cid: number | null | undefined,
  fallbackTitle: string,
  normalized?: BiliViewPageLike[]
): BiliPartMeta {
  const title = (view?.title || '').trim()
  const pages = normalized ?? normalizeBiliPages(view)
  if (pages.length <= 1) {
    return {
      name: fallbackTitle,
      album: '',
      durationSec: durationSec(pages[0]?.duration) || durationSec(view?.duration),
      multiPart: false,
    }
  }
  const target = Number.isSafeInteger(cid) && (cid as number) > 0
    ? pages.find(page => page.cid === cid)
    : pages[0]
  return {
    name: target ? target.part?.trim() || `${title || fallbackTitle} · P${target.page}` : fallbackTitle,
    album: title,
    durationSec: durationSec(target?.duration),
    multiPart: true,
  }
}
