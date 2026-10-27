import { useEffect, useRef, useState, type RefObject } from 'react'
import { useControlBarAutoHide } from '@/hooks/useControlBarAutoHide'
import { getRuntimePlatform, isGlobalAppearanceRuntime } from '../platform/runtime'
import { useScreenShareLevelGestures } from './useScreenShareLevelGestures'

/** Delay a single tap until a potential second tap has been ruled out. */
export function createScreenShareTapHandler(single: () => void, double: () => void) {
  let timer: ReturnType<typeof setTimeout> | null = null
  return {
    tap() {
      if (timer !== null) { clearTimeout(timer); timer = null; double(); return }
      timer = setTimeout(() => { timer = null; single() }, 280)
    },
    cancel() { if (timer !== null) clearTimeout(timer); timer = null },
  }
}

export function useScreenShareDisplay({ stage, video, fullscreen, enterFullscreen, enabled = true, autoHideDisabled = false }: {
  stage: RefObject<HTMLElement>; video: RefObject<HTMLVideoElement>; fullscreen: boolean
  enterFullscreen: () => void; enabled?: boolean; autoHideDisabled?: boolean
}) {
  const native = isGlobalAppearanceRuntime()
  const levels = useScreenShareLevelGestures({ stage, video, fullscreen, enabled, autoHideDisabled })
  const ordinaryVisible = useControlBarAutoHide(stage, { disabled: native || fullscreen || !enabled || autoHideDisabled })
  const [fullscreenVisible, setFullscreenVisible] = useState(true)
  const latest = useRef({ fullscreen, enterFullscreen, enabled })
  latest.current = { fullscreen, enterFullscreen, enabled }
  useEffect(() => {
    const platform = getRuntimePlatform()
    if (platform !== 'android' && platform !== 'harmony') return
    let landscape = false
    const changed = () => {
      if (document.documentElement.hasAttribute('data-webrtc-native-pip') || !latest.current.enabled) return
      const next = innerWidth > innerHeight
      if (next && !landscape && !latest.current.fullscreen) latest.current.enterFullscreen()
      landscape = next
    }
    changed()
    window.addEventListener('resize', changed)
    screen.orientation?.addEventListener('change', changed)
    return () => { window.removeEventListener('resize', changed); screen.orientation?.removeEventListener('change', changed) }
  }, [])
  useEffect(() => {
    setFullscreenVisible(true)
    if (native || !fullscreen || !enabled || !stage.current) return
    const element = stage.current
    const taps = createScreenShareTapHandler(() => setFullscreenVisible(visible => !visible), () => {
      const player = video.current
      if (!player) return
      if (player.paused) void player.play().catch(() => {})
      else player.pause()
    })
    let start: { x: number; y: number; time: number; id: number } | null = null
    const interactive = (target: EventTarget | null) => target instanceof Element && !!target.closest('button,input,textarea,select,a,[role="button"],[role="slider"],.vc-container,.art-bottom,.webrtc-pip-heading')
    const down = (event: PointerEvent) => {
      if (!event.isPrimary || interactive(event.target)) { start = null; taps.cancel(); return }
      start = { x: event.clientX, y: event.clientY, time: performance.now(), id: event.pointerId }
    }
    const up = (event: PointerEvent) => {
      const first = start
      start = null
      if (!first || first.id !== event.pointerId || interactive(event.target)) return
      if (performance.now() - first.time > 400 || Math.hypot(event.clientX - first.x, event.clientY - first.y) > 12) { taps.cancel(); return }
      taps.tap()
    }
    const cancel = () => { start = null; taps.cancel() }
    element.addEventListener('pointerdown', down, true)
    element.addEventListener('pointerup', up, true)
    element.addEventListener('pointercancel', cancel, true)
    return () => {
      cancel()
      element.removeEventListener('pointerdown', down, true)
      element.removeEventListener('pointerup', up, true)
      element.removeEventListener('pointercancel', cancel, true)
    }
  }, [fullscreen, enabled, stage, video, native])
  return { controlBarVisible: native && enabled ? levels.visible : fullscreen && enabled ? fullscreenVisible : ordinaryVisible,
    gestureNotice: levels.notice }
}
