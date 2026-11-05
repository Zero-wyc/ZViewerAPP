import { isBilibiliUrlExpiring } from '@/modules/playback-memory/services/url-expiry'
import {
  invalidateBiliAudioUrl, isBiliAudioStale,
  setBiliStandbyUrl, setCachedBiliAudioUrl, takeBiliStandbyUrl,
} from './biliAudioCache'
import type { MusicQueueItem } from '../types'

interface Playback {
  item: MusicQueueItem
  key: string
  identity: string
  cacheKey: string
  audio: HTMLAudioElement
  playing: boolean
}
interface RecoveryOptions {
  read: () => Playback | null
  resolve: (item: MusicQueueItem, options: { force: true; noCache: true; variant?: 'mp4' }) => Promise<{ playUrl: string }>
  refresh: (fromError: boolean) => Promise<unknown>
  play: (state: Playback, url: string, position: number, playing: boolean, rate: number) => void
  failed: () => void
}

/** One owner for deadline renewal, error recovery, standby and cancellation. */
export function createMusicStreamRecovery(options: RecoveryOptions) {
  let active = true
  let generation = 0
  let attempts = 0
  let inFlight = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let preparing: Promise<void> | null = null
  let preparedUrl = ''
  let preparedAt = 0
  let progress: { at: number; time: number; url: string } | null = null
  const current = (state: Playback, request: number) => {
    const next = options.read()
    return active && generation === request && next?.identity === state.identity &&
      next.cacheKey === state.cacheKey && next.audio === state.audio
  }
  const recover = (fromError: boolean): boolean => {
    const snapshot = options.read()
    const state = snapshot ? { ...snapshot } : null
    if (!active || !state?.audio.src) return false
    if (!fromError && (!state.item.biliBvid || !isBilibiliUrlExpiring(state.audio.src))) return false
    if (inFlight) return true
    if (attempts >= 3) return false
    const attempt = attempts++
    const request = generation
    const oldUrl = state.audio.src
    inFlight = true
    progress = null
    const run = async () => {
      try {
        if (preparing) await preparing
        await options.refresh(fromError)
        if (!current(state, request)) return
        let url = oldUrl
        if (state.item.biliBvid) {
          const spare = takeBiliStandbyUrl(state.cacheKey)
          if (spare) url = spare
          else if (!(attempt === 0 && fromError && [1, 2].includes(state.audio.error?.code ?? 0))) {
            invalidateBiliAudioUrl(state.cacheKey)
            url = (await options.resolve(state.item, { force: true, noCache: true })).playUrl
            if (url === oldUrl && fromError && attempt > 0) {
              url = (await options.resolve(state.item, { force: true, noCache: true, variant: 'mp4' })).playUrl
            }
          }
        }
        if (!current(state, request) || state.audio.src !== oldUrl) return
        if (state.item.biliBvid) {
          if (isBilibiliUrlExpiring(url)) throw new Error('Resolved media URL is already expiring')
          setCachedBiliAudioUrl(state.cacheKey, url)
        }
        const latest = options.read()!
        const position = state.audio.currentTime
        const rate = state.audio.playbackRate
        options.play(state, url, position, latest.playing, rate)
        progress = { at: Date.now(), time: position, url: options.read()?.audio.src ?? url }
        preparedUrl = ''
      } catch {
        if (current(state, request) && attempts >= 3) options.failed()
      } finally {
        if (request === generation) inFlight = false
      }
    }
    timer = setTimeout(() => { timer = undefined; void run() }, [0, 1500, 4000][attempt])
    return true
  }
  return {
    recover,
    isRecovering: () => inFlight,
    retry() { if (!inFlight) attempts = 0; return recover(true) },
    check() {
      const snapshot = options.read()
      const state = snapshot ? { ...snapshot } : null
      if (!active || !state) return
      const audio = state.audio
      if (progress && !audio.error && !audio.paused && audio.src === progress.url &&
        Date.now() - progress.at >= 15_000 && audio.currentTime > progress.time + 2) {
        attempts = 0
        progress = null
      }
      if (audio.error && state.playing) { recover(true); return }
      if (state.item.biliBvid && isBilibiliUrlExpiring(audio.src)) { recover(false); return }
      if (inFlight || preparing || !state.item.biliBvid || !state.playing || !isBiliAudioStale(state.cacheKey) ||
        (preparedUrl === audio.src && Date.now() - preparedAt < 60_000)) return
      const request = generation
      preparedUrl = audio.src
      preparedAt = Date.now()
      preparing = (async () => {
        await options.refresh(false)
        if (!current(state, request)) return
        const result = await options.resolve(state.item, { force: true, noCache: true })
        if (current(state, request) && result.playUrl !== audio.src && !isBilibiliUrlExpiring(result.playUrl)) {
          setBiliStandbyUrl(state.cacheKey, result.playUrl)
          preparedAt = Infinity
        }
      })().catch(() => {}).finally(() => { preparing = null })
    },
    dispose() {
      active = false
      generation++
      clearTimeout(timer)
      inFlight = false
    },
  }
}
