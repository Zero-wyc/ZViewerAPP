import { useEffect, useState } from 'react'
import { Maximize, Minimize, Smartphone, RectangleHorizontal } from 'lucide-react'
import { message } from '@/components/ui/message'
import { playerDisplay, restorePlayerDisplay } from '../platform/playerDisplay'

export async function restoreDisplay() {
  await restorePlayerDisplay()
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
      await playerDisplay.toggleOrientation(landscape)
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
    void playerDisplay.setImmersive(active).catch(() => message.error('无法切换系统栏'))
  }, [active])
  useEffect(() => () => {
    void playerDisplay.setImmersive(false).catch(() => {})
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
