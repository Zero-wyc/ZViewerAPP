import { useEffect, useState } from 'react'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { Maximize, Minimize, Smartphone, RectangleHorizontal } from 'lucide-react'
import { message } from '@/components/ui/message'

const Display = registerPlugin<{
  toggleOrientation(): Promise<void>
  setImmersive(options: { enabled: boolean }): Promise<void>
  unlockOrientation(): Promise<void>
}>('PlayerDisplay')

export async function restoreDisplay() {
  if (!Capacitor.isNativePlatform()) return
  await Display.setImmersive({ enabled: false })
  await Display.unlockOrientation()
}

export function ScreenOrientationButton({ className = 'player-tool' }: { className?: string }) {
  const [landscape, setLandscape] = useState(() => window.innerWidth > window.innerHeight)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const resized = () => setLandscape(window.innerWidth > window.innerHeight)
    window.addEventListener('resize', resized)
    return () => window.removeEventListener('resize', resized)
  }, [])
  const rotate = async () => {
    setBusy(true)
    try {
      if (Capacitor.isNativePlatform()) await Display.toggleOrientation()
      else {
        const orientation = screen.orientation as ScreenOrientation & { lock?: (value: string) => Promise<void> }
        if (!orientation.lock) throw new Error('unsupported')
        await orientation.lock(landscape ? 'portrait' : 'landscape')
      }
    } catch {
      message.info('当前设备不支持锁定屏幕方向')
    } finally {
      setBusy(false)
    }
  }
  return <button type="button" className={className} title={landscape ? '切换竖屏' : '切换横屏'}
      aria-label={landscape ? '切换竖屏' : '切换横屏'} disabled={busy}
      onClick={event => { event.stopPropagation(); void rotate() }}>
      {landscape ? <Smartphone size={20} /> : <RectangleHorizontal size={20} />}
    </button>
}

export function PlayerDisplayControls({ fullscreen = false, onFullscreen }: {
  fullscreen?: boolean
  onFullscreen?: () => void
}) {
  const [nativeFull, setNativeFull] = useState(Boolean(document.fullscreenElement))
  const active = fullscreen || nativeFull
  useEffect(() => {
    const changed = () => setNativeFull(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', changed)
    return () => document.removeEventListener('fullscreenchange', changed)
  }, [])
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      void Display.setImmersive({ enabled: active }).catch(() => message.error('无法切换系统栏'))
    }
  }, [active])
  useEffect(() => () => {
    if (Capacitor.isNativePlatform()) void Display.setImmersive({ enabled: false }).catch(() => {})
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
