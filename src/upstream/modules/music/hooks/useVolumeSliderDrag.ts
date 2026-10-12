import { lockBodyScroll } from '@/components/ui/bodyScrollLock'
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

export function usePointerVolumeDrag(compute: (event: PointerEvent | ReactPointerEvent) => void) {
  const cleanup = useRef<(() => void) | null>(null)
  const [volumeDragging, setVolumeDragging] = useState(false)
  useEffect(() => () => { cleanup.current?.() }, [])
  const handleVolumePointerDown = useCallback((event: ReactPointerEvent) => {
    if (event.button !== 0) return
    event.preventDefault(); event.stopPropagation(); cleanup.current?.()
    const pointerId = event.pointerId
    const body = document.body
    const releaseScroll = lockBodyScroll(), select = body.style.userSelect
    body.style.userSelect = 'none'
    setVolumeDragging(true); compute(event)
    const move = (next: PointerEvent) => { if (next.pointerId === pointerId) { next.preventDefault(); compute(next) } }
    const finish = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); window.removeEventListener('blur', finish); window.removeEventListener('pagehide', finish); window.removeEventListener('orientationchange', finish); document.removeEventListener('visibilitychange', background)
      releaseScroll()
      if (body.style.userSelect === 'none') body.style.userSelect = select
      cleanup.current = null; setVolumeDragging(false)
    }
    const up = (next: PointerEvent) => { if (next.pointerId === pointerId) finish() }
    const background = () => { if (document.hidden) finish() }
    cleanup.current = finish
    window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up); window.addEventListener('blur', finish); window.addEventListener('pagehide', finish); window.addEventListener('orientationchange', finish); document.addEventListener('visibilitychange', background)
  }, [compute])
  return { volumeDragging, handleVolumePointerDown }
}

export function useVolumeSliderDrag(setVolume: (value: number) => void) {
  const volumeTrackRef = useRef<HTMLDivElement>(null)
  const compute = useCallback((event: PointerEvent | ReactPointerEvent) => {
    const rect = volumeTrackRef.current?.getBoundingClientRect()
    if (rect && rect.width > 0) setVolume(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)))
  }, [setVolume])
  return { volumeTrackRef, ...usePointerVolumeDrag(compute) }
}
