import { useRef, type KeyboardEvent, type PointerEvent } from 'react'

/** Horizontal song swipes leave vertical page scrolling to the browser. */
export function useMusicTrackSwipe(onPrev: () => void, onNext: () => void, enabled: boolean) {
  const suppressClick = useRef(false)
  const start = useRef<{ id: number; x: number; y: number; time: number } | null>(null)
  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (!enabled || event.isPrimary === false || event.button !== 0) return
      suppressClick.current = false
      start.current = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      const origin = start.current
      if (!origin || origin.id !== event.pointerId) return
      start.current = null
      if (!enabled) return
      const dx = event.clientX - origin.x, dy = event.clientY - origin.y
      const elapsed = event.timeStamp - origin.time
      if (elapsed < 0 || elapsed > 1000 || Math.abs(dx) < 36 || Math.abs(dx) < Math.abs(dy) * 1.5) return
      suppressClick.current = true
      if (dx < 0) onNext()
      else onPrev()
    },
    onClickCapture(event: { preventDefault: () => void; stopPropagation: () => void }) { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false } },
    onPointerCancel() { start.current = null },
    onKeyDown(event: KeyboardEvent<HTMLElement>) {
      if (!enabled || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      if (event.key === 'ArrowLeft') onPrev()
      else onNext()
    },
  }
}
