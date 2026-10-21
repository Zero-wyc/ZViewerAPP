import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react'
import { Maximize, Minimize, Smartphone, RectangleHorizontal, LockKeyholeOpen } from 'lucide-react'
import { message } from '@/components/ui/message'
import { getOrientationLocked, getVideoFullscreenLandscape, playerDisplay, restorePlayerDisplay, setPlayerFullscreen, subscribeOrientationLock } from '../platform/playerDisplay'

export async function restoreDisplay() {
  await restorePlayerDisplay()
}

export function ScreenOrientationButton({ className = 'player-tool' }: { className?: string }) {
  const [landscape, setLandscape] = useState(() => window.innerWidth > window.innerHeight)
  const [busy, setBusy] = useState(false)
  const locked = useSyncExternalStore(subscribeOrientationLock, getOrientationLocked)
  useEffect(() => {
    const resized = () => setLandscape(window.innerWidth > window.innerHeight)
    window.addEventListener('resize', resized)
    return () => window.removeEventListener('resize', resized)
  }, [])
  const rotate = async () => {
    setBusy(true)
    try {
      if (locked) await playerDisplay.unlockOrientation()
      else await playerDisplay.toggleOrientation(!landscape)
    } catch {
      message.info('当前设备不支持锁定屏幕方向')
    } finally {
      setBusy(false)
    }
  }
  const label = locked ? '解除旋转锁定（自动旋转）' : landscape ? '切换并锁定竖屏' : '切换并锁定横屏'
  return <button type="button" className={className} title={label}
      aria-label={label} aria-pressed={locked} disabled={busy}
      onClick={event => { event.stopPropagation(); void rotate() }}>
      {locked ? <LockKeyholeOpen size={20} /> : landscape ? <Smartphone size={20} /> : <RectangleHorizontal size={20} />}
    </button>
}

export function PlayerDisplayControls({ fullscreen = false, onFullscreen, videoRef }: {
  fullscreen?: boolean
  onFullscreen?: () => void
  videoRef?: RefObject<HTMLVideoElement | null>
}) {
  const [nativeFull, setNativeFull] = useState(Boolean(document.fullscreenElement))
  const active = fullscreen || nativeFull
  const wasActive = useRef(false)
  useEffect(() => {
    const changed = () => setNativeFull(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', changed)
    return () => document.removeEventListener('fullscreenchange', changed)
  }, [])
  useEffect(() => {
    const video = videoRef?.current
    let landscape = getVideoFullscreenLandscape(video)
    const apply = () => void setPlayerFullscreen(active, landscape).catch(() => message.info('无法调整全屏显示或屏幕方向'))
    if (active || wasActive.current) {
      apply()
    }
    wasActive.current = active
    // Metadata may arrive after entry, or change when switching films in fullscreen.
    // Same-aspect resize events must not override a user's manual rotation unlock.
    const changed = () => {
      if (!active || !video || !video.videoWidth || !video.videoHeight) return
      const next = getVideoFullscreenLandscape(video)
      if (next !== landscape) { landscape = next; apply() }
    }
    video?.addEventListener('loadedmetadata', changed)
    video?.addEventListener('resize', changed)
    return () => {
      video?.removeEventListener('loadedmetadata', changed)
      video?.removeEventListener('resize', changed)
    }
  }, [active, videoRef])
  useEffect(() => () => {
    if (wasActive.current) void restorePlayerDisplay().catch(() => {})
  }, [])
  return <div className="player-display-controls" data-fullscreen={active}>
    {active && <ScreenOrientationButton />}
    <button type="button" className="player-tool" title={active ? '退出全屏' : '全屏'}
      aria-label={active ? '退出全屏' : '全屏'} aria-pressed={active}
      onClick={event => {
        event.stopPropagation()
        if (document.fullscreenElement) void document.exitFullscreen()
        else onFullscreen?.()
      }}>
      {active ? <Minimize size={20} /> : <Maximize size={20} />}
    </button>
  </div>
}
