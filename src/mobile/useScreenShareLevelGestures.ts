import { useEffect, useRef, useState, type RefObject } from 'react'
import { attachWatchVideoGestures } from './watchVideoGestures'
import { createBrightnessGesture } from './playerBrightness'
import { isGlobalAppearanceRuntime } from '../platform/runtime'

/** Both MediaStream and FLV viewers use the same local-only level gestures. */
export function useScreenShareLevelGestures({ stage, video, fullscreen, enabled, autoHideDisabled }: {
  stage: RefObject<HTMLElement>; video: RefObject<HTMLVideoElement>
  fullscreen: boolean; enabled: boolean; autoHideDisabled: boolean
}) {
  const [visible, setVisible] = useState(fullscreen || autoHideDisabled)
  const [notice, setNotice] = useState('')
  const latest = useRef({ fullscreen, autoHideDisabled })
  latest.current = { fullscreen, autoHideDisabled }
  useEffect(() => { setVisible(fullscreen || autoHideDisabled) }, [fullscreen, autoHideDisabled, enabled])
  useEffect(() => {
    const element = stage.current
    if (!isGlobalAppearanceRuntime() || !enabled || !element) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let noticeTimer: ReturnType<typeof setTimeout> | undefined
    let player: HTMLVideoElement | null = null
    let dispose: (() => void) | undefined
    let alive = true
    setVisible(fullscreen || autoHideDisabled)
    const show = () => {
      setVisible(true)
      clearTimeout(timer)
      if (!latest.current.fullscreen && !latest.current.autoHideDisabled) timer = setTimeout(() => {
        if (!latest.current.fullscreen && !latest.current.autoHideDisabled) setVisible(false)
      }, 3000)
    }
    const showNotice = (text: string) => {
      if (!alive) return
      setNotice(text)
      clearTimeout(noticeTimer)
      noticeTimer = setTimeout(() => setNotice(''), 1500)
    }
    const bind = () => {
      const next = element.querySelector('video')
      if (next === player) return
      dispose?.()
      player = next
      if (!next) { dispose = undefined; return }
      const brightness = createBrightnessGesture(showNotice)
      let startVolume = 1
      const state = element.querySelector<HTMLElement>('.art-state')
      const remove = attachWatchVideoGestures(element, {
        touchSurfaces: state ? [next, state] : [next], seek: false,
        surface: event => event.target === next ||
          (event.target instanceof Element && (event.target.classList.contains('art-video-player') || !!state?.contains(event.target))),
        onSingleTap: () => { if (latest.current.fullscreen) setVisible(value => !value); else show() },
        onDoubleTap: () => {
          if (!latest.current.fullscreen) return
          if (next.paused) void next.play().catch(() => {})
          else next.pause()
        },
        onDragStart: kind => {
          if (kind === 'brightness') brightness.begin()
          else startVolume = next.muted ? 0 : next.volume
        },
        onDrag: (kind, fraction) => {
          if (kind === 'brightness') brightness.move(fraction)
          else if (kind === 'volume') {
            next.volume = Math.max(0, Math.min(1, startVolume + fraction))
            next.muted = next.volume === 0
            showNotice(`音量 ${Math.round(next.volume * 100)}%`)
          }
        },
        onDragEnd: (kind, cancelled) => { if (kind === 'brightness') brightness.end(cancelled) },
      })
      next.addEventListener('emptied', remove.cancel)
      dispose = () => { next.removeEventListener('emptied', remove.cancel); remove(); brightness.dispose() }
    }
    // FLV creates its ArtPlayer after this hook's first effect; WebRTC may replace its video.
    const observer = new MutationObserver(bind)
    observer.observe(element, { childList: true, subtree: true })
    bind()
    element.addEventListener('pointerdown', show)
    return () => {
      alive = false
      observer.disconnect()
      dispose?.()
      element.removeEventListener('pointerdown', show)
      clearTimeout(timer)
      clearTimeout(noticeTimer)
      setNotice('')
    }
  }, [stage, video, enabled])
  return { visible, notice }
}
