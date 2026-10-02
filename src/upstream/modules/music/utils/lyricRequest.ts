import { apiGet, getApiUrl } from '@/lib/api'
import type { NcmLyricResponse } from '../types'

interface SubtitleResponse { lines?: Array<{ from: number; to: number; content: string }> }
const cache = new Map<string, { at: number; data: unknown }>()
const requests = new Map<string, Promise<unknown>>()

/** The panel and native media session share one request and the same lyric data. */
async function requestLyrics<T>(url: string): Promise<T | null> {
  const key = `${getApiUrl()}${url}`
  const cached = cache.get(key)
  if (cached && Date.now() - cached.at < 300000) return cached.data as T | null
  const pending = requests.get(key)
  if (pending) return await pending as T | null
  const request = apiGet<T>(url).then(({ data, ok }) => {
    if (!ok) throw new Error('Lyric request failed')
    cache.set(key, { at: Date.now(), data })
    if (cache.size > 20) cache.delete(cache.keys().next().value!)
    return data
  })
  requests.set(key, request)
  try { return await request } finally { if (requests.get(key) === request) requests.delete(key) }
}

export const requestNcmLyrics = (id: number) => requestLyrics<NcmLyricResponse>(`/api/music/ncm/lyric?id=${id}`)
export const requestBiliLyrics = (bvid: string, cid: number, durationMs = 0) => requestLyrics<SubtitleResponse>(
  `/api/stream/bilibili/ai-subtitle?bvid=${encodeURIComponent(bvid)}&cid=${cid}&duration=${Math.round(durationMs / 1000)}`
)
