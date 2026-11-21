import { useLayoutEffect, useRef, type PointerEvent, type RefObject } from 'react'

const closeTransition = 'transform 220ms var(--zv-ease-exit, cubic-bezier(.3,0,1,1))'
const returnTransition = 'transform 280ms var(--zv-ease-sheet, cubic-bezier(.32,.72,0,1))'

function settleSheet(panel: HTMLElement, scrim: HTMLElement, closing: boolean) {
  panel.style.transition = closing ? closeTransition : returnTransition
  panel.style.transform = closing ? 'translateY(100%)' : 'translateY(0)'
  scrim.style.transition = closing ? 'opacity 220ms' : 'opacity 280ms'
  scrim.style.opacity = closing ? '0' : '1'
}

export function useSheetDrag(
  panelRef: RefObject<HTMLDivElement | null>,
  scrimRef: RefObject<HTMLDivElement | null>,
  onClose: () => void,
  enabled: boolean,
  open: boolean,
) {
  const dragRef = useRef<{
    id: number
    handle: HTMLDivElement
    startY: number
    lastY: number
    lastTime: number
    height: number
    dy: number
    velocity: number
    moved: boolean
  } | null>(null)

  useLayoutEffect(() => {
    const drag = dragRef.current
    dragRef.current = null
    if (drag?.handle.hasPointerCapture(drag.id)) drag.handle.releasePointerCapture(drag.id)
    const panel = panelRef.current
    const scrim = scrimRef.current
    if (!panel || !scrim || panel.style.animation !== 'none') return

    if (enabled && !open) {
      settleSheet(panel, scrim, true)
    } else {
      panel.style.removeProperty('animation')
      panel.style.removeProperty('transition')
      panel.style.removeProperty('transform')
      scrim.style.removeProperty('animation')
      scrim.style.removeProperty('transition')
      scrim.style.removeProperty('opacity')
    }
  }, [enabled, open, panelRef, scrimRef])

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    const panel = panelRef.current
    if (!enabled || !open || !panel || dragRef.current || e.button !== 0) return
    if (e.target instanceof Element && e.target.closest('button, a, input, select, textarea')) return

    const height = panel.getBoundingClientRect().height
    if (!height) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      id: e.pointerId, handle: e.currentTarget, startY: e.clientY, lastY: e.clientY,
      lastTime: e.timeStamp, height, dy: 0, velocity: 0, moved: false,
    }
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    const panel = panelRef.current
    const scrim = scrimRef.current
    if (!drag || drag.id !== e.pointerId || !panel || !scrim || e.clientY === drag.lastY) return

    drag.dy = Math.max(0, e.clientY - drag.startY)
    drag.velocity = (e.clientY - drag.lastY) / Math.max(1, e.timeStamp - drag.lastTime)
    drag.lastY = e.clientY
    drag.lastTime = e.timeStamp
    drag.moved = true
    panel.style.transition = 'none'
    panel.style.animation = 'none'
    panel.style.transform = `translateY(${drag.dy}px)`
    scrim.style.transition = 'none'
    scrim.style.animation = 'none'
    scrim.style.opacity = String(1 - Math.min(drag.dy / drag.height, 1) * 0.85)
  }

  function finish(e: PointerEvent<HTMLDivElement>, cancelled: boolean) {
    const drag = dragRef.current
    if (!drag || drag.id !== e.pointerId) return
    dragRef.current = null
    const panel = panelRef.current
    const scrim = scrimRef.current
    if (!drag.moved || !panel || !scrim) return

    // 拉过面板高度 35% 或向下快速甩动即关闭；松手前停顿超过 80ms 不算甩动。
    const flung = e.timeStamp - drag.lastTime < 80 && drag.velocity > 0.5 && drag.dy > 24
    const closing = !cancelled && (drag.dy > drag.height * 0.35 || flung)
    settleSheet(panel, scrim, closing)
    if (closing) onClose()
  }

  const cancel = (e: PointerEvent<HTMLDivElement>) => finish(e, true)
  return { onPointerDown, onPointerMove, onPointerUp: (e: PointerEvent<HTMLDivElement>) => finish(e, false), onPointerCancel: cancel, onLostPointerCapture: cancel }
}
