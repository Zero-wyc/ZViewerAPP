import { useEffect, useRef, useState } from 'react'
import { getApiUrl } from '@/lib/api'
import type { SystemMediaAction, SystemMediaCommand, SystemMediaState } from '../platform/contracts'
import { clearSystemMedia, listenSystemMedia, updateSystemMedia } from '../platform/mediaSession'
import { isGlobalAppearanceRuntime } from '../platform/runtime'

type MediaSnapshot = Omit<SystemMediaState, 'sessionId'>
interface MediaBinding {
  getSnapshot(): MediaSnapshot | null
  onAction(action: SystemMediaAction, position?: number): void
}

export function systemArtworkUrl(cover?: string | null): string {
  if (!cover) return ''
  try {
    const url = new URL(cover.startsWith('//') ? `https:${cover}` : cover, `${getApiUrl() || location.origin}/`)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : ''
  } catch { return '' }
}

/** One owner per player. Native sessions also own the background playback lease. */
export function useSystemMediaSession(binding: MediaBinding): void {
  const [sessionId] = useState(() => `zv-${crypto.randomUUID()}`)
  const current = useRef(binding)
  useEffect(() => { current.current = binding })
  useEffect(() => {
    const native = isGlobalAppearanceRuntime()
    const web = !native && 'mediaSession' in navigator ? navigator.mediaSession : null
    let disposed = false
    let removeListener: (() => void) | undefined
    let reportedError = false
    const report = (error: unknown) => {
      if (!reportedError && !disposed) console.warn('System media session unavailable', error)
      reportedError = true
    }
    const command = ({ sessionId: owner, action, position }: SystemMediaCommand) => {
      if (owner !== sessionId || disposed) return
      const snapshot = current.current.getSnapshot()
      if (!snapshot?.actions.includes(action)) return
      current.current.onAction(action, position)
    }
    if (native) {
      void listenSystemMedia(command).then(remove => {
        if (disposed) remove()
        else removeListener = remove
      }).catch(report)
    }
    const actions: MediaSessionAction[] = ['play', 'pause', 'stop', 'previoustrack', 'nexttrack', 'seekto', 'seekbackward', 'seekforward']
    for (const action of actions) {
      try {
        web?.setActionHandler(action, details => {
          const snapshot = current.current.getSnapshot()
          if (!snapshot) return
          let translated: SystemMediaAction = action as SystemMediaAction
          let position = details.seekTime
          if (action === 'seekbackward' || action === 'seekforward') {
            translated = 'seekto'
            position = snapshot.position + (action === 'seekbackward' ? -1 : 1) * (details.seekOffset ?? 10)
          }
          if (position !== undefined) position = Math.max(0, Math.min(position, snapshot.duration || Infinity))
          command({ sessionId, action: translated, position })
        })
      } catch { /* Optional browser action. */ }
    }
    const update = () => {
      const snapshot = current.current.getSnapshot()
      if (native) {
        void (snapshot ? updateSystemMedia({ ...snapshot, sessionId }) : clearSystemMedia(sessionId)).catch(report)
        return
      }
      if (!web) return
      web.metadata = snapshot && typeof MediaMetadata === 'function' ? new MediaMetadata({
        title: snapshot.title, artist: snapshot.artist, album: snapshot.album,
        artwork: snapshot.artwork ? [{ src: snapshot.artwork }] : [],
      }) : null
      web.playbackState = snapshot ? snapshot.playing ? 'playing' : 'paused' : 'none'
      try {
        web.setPositionState(snapshot?.duration ? {
          duration: snapshot.duration, position: Math.min(snapshot.position, snapshot.duration), playbackRate: snapshot.playbackRate,
        } : undefined)
      } catch { /* Unknown duration/live media. */ }
    }
    update()
    const timer = window.setInterval(update, 1000)
    window.addEventListener('zviewer:media-refresh', update)
    document.addEventListener('visibilitychange', update)
    return () => {
      disposed = true
      clearInterval(timer)
      removeListener?.()
      window.removeEventListener('zviewer:media-refresh', update)
      document.removeEventListener('visibilitychange', update)
      if (native) void clearSystemMedia(sessionId).catch(() => {})
      else if (web) {
        actions.forEach(action => { try { web.setActionHandler(action, null) } catch { /* optional */ } })
        web.metadata = null
        web.playbackState = 'none'
        try { web.setPositionState() } catch { /* optional */ }
      }
    }
  }, [sessionId])
  useEffect(() => { window.dispatchEvent(new Event('zviewer:media-refresh')) }, [binding])
}
