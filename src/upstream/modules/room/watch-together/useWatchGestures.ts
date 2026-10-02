import { useEffect } from 'react'
import type Artplayer from 'artplayer'
import { getFullscreenElement } from '@/lib/fullscreen-utils'
import { isGlobalAppearanceRuntime } from '../../../../platform/runtime'

/** Native touch gestures are captured before ArtPlayer's click/play and double/fullscreen handlers. */
export function useWatchGestures({ art, video, stage, fullscreen, canControl, requestPlay, requestPause, requestSeek }: {
  art: Artplayer; video: HTMLVideoElement; stage: React.RefObject<HTMLDivElement>
  fullscreen: boolean; canControl: boolean
  requestPlay(): void; requestPause(): void; requestSeek(position: number): void
}) {
  useEffect(() => {
    const element = stage.current
    if (!element || !isGlobalAppearanceRuntime()) return
    let lastTap: { time: number; x: number; y: number; zone: number } | null = null
    let lastTouchDouble = -Infinity
    let press: { time: number; x: number; y: number } | null = null
    const surface = (event: Event) => event.target === video || event.target === art.template.$player ||
      (event.target instanceof Node && art.template.$state.contains(event.target))
    const zone = (x: number) => {
      const rect = element.getBoundingClientRect()
      const ratio = rect.width ? (x - rect.left) / rect.width : .5
      return ratio < 1 / 3 ? -1 : ratio > 2 / 3 ? 1 : 0
    }
    const activate = (x: number) => {
      const region = zone(x)
      if (region === 0) {
        if (canControl) {
          if (video.paused) void video.play().catch(() => {})
          else video.pause()
        } else if (video.paused) requestPlay()
        else requestPause()
      } else if (fullscreen || getFullscreenElement()) {
        if (!Number.isFinite(video.duration) || video.duration <= 0) return
        const position = Math.max(0, Math.min(video.duration, video.currentTime + region * 15))
        if (canControl) video.currentTime = position
        else requestSeek(position)
        art.notice.show = region < 0 ? '后退 15 秒' : '前进 15 秒'
      }
    }
    const click = (event: Event) => {
      if (!surface(event)) return
      event.stopImmediatePropagation()
      event.preventDefault()
      art.controls.show = true
    }
    const double = (event: MouseEvent) => {
      if (!surface(event)) return
      event.stopImmediatePropagation()
      event.preventDefault()
      if (performance.now() - lastTouchDouble > 700) activate(event.clientX)
    }
    const pointer = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' || !event.isPrimary || !surface(event)) return
      const time = performance.now(), region = zone(event.clientX)
      const start = press
      press = null
      if (!start || time - start.time > 350 || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) { lastTap = null; return }
      if (lastTap && time - lastTap.time <= 320 && lastTap.zone === region &&
          Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) <= 36) {
        lastTap = null
        lastTouchDouble = time
        activate(event.clientX)
      } else lastTap = { time, x: event.clientX, y: event.clientY, zone: region }
    }
    const down = (event: PointerEvent) => {
      if (event.pointerType === 'touch' && event.isPrimary && surface(event)) press = { time: performance.now(), x: event.clientX, y: event.clientY }
      else { press = null; lastTap = null }
    }
    const cancel = () => { press = null; lastTap = null }
    element.addEventListener('click', click, true)
    element.addEventListener('dblclick', double, true)
    element.addEventListener('pointerup', pointer, true)
    element.addEventListener('pointerdown', down, true)
    element.addEventListener('pointercancel', cancel, true)
    return () => {
      element.removeEventListener('click', click, true)
      element.removeEventListener('dblclick', double, true)
      element.removeEventListener('pointerup', pointer, true)
      element.removeEventListener('pointerdown', down, true)
      element.removeEventListener('pointercancel', cancel, true)
    }
  }, [art, video, stage, fullscreen, canControl, requestPlay, requestPause, requestSeek])
}
