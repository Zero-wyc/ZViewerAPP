import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { registerOverlayBack } from '@/components/ui/overlayBack'

export function PlayerMoreMenu({ anchor, children, onClose }: {
  anchor: RefObject<HTMLButtonElement>; children: ReactNode; onClose: () => void
}) {
  const menu = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' })
  useLayoutEffect(() => {
    const update = () => {
      const trigger = anchor.current, popup = menu.current
      if (!trigger || !popup) return
      const rect = trigger.getBoundingClientRect()
      const viewport = window.visualViewport
      const topEdge = (viewport?.offsetTop ?? 0) + 8
      const bottomEdge = (viewport?.offsetTop ?? 0) + (viewport?.height ?? innerHeight) - 8
      const leftEdge = (viewport?.offsetLeft ?? 0) + 8
      const rightEdge = (viewport?.offsetLeft ?? 0) + (viewport?.width ?? innerWidth) - 8
      const width = Math.min(220, rightEdge - leftEdge)
      const below = Math.max(0, bottomEdge - rect.bottom - 8)
      const above = Math.max(0, rect.top - topEdge - 8)
      // Normal playback opens downward beyond the clipped video container.
      // At the fullscreen bottom edge, use the space above without overlapping
      // the trigger; the menu scrolls instead of moving over its own button.
      const down = below >= 96 || below >= above
      const maxHeight = Math.min(300, down ? below : above)
      const border = getComputedStyle(popup)
      const height = Math.min(popup.scrollHeight + parseFloat(border.borderTopWidth) + parseFloat(border.borderBottomWidth), maxHeight)
      const next: CSSProperties = {
        position: 'fixed', width, maxHeight,
        left: Math.max(leftEdge, Math.min(rightEdge - width, rect.right - width)),
        top: down ? rect.bottom + 8 : rect.top - 8 - height,
        visibility: 'visible',
      }
      setPosition(previous => ['left', 'top', 'width', 'maxHeight', 'visibility'].every(key => previous[key as keyof CSSProperties] === next[key as keyof CSSProperties]) ? previous : next)
    }
    update()
    const outside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!anchor.current?.contains(target) && !menu.current?.contains(target)) close.current()
    }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); close.current() } }
    const unregister = registerOverlayBack(() => close.current())
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('keydown', key)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    const observer = new ResizeObserver(update)
    if (anchor.current) observer.observe(anchor.current)
    // Controlbar entry animations move the trigger without resizing it.
    // Follow those transforms as well as viewport/scroll changes.
    let frame = 0
    const followAnchor = () => { update(); frame = requestAnimationFrame(followAnchor) }
    frame = requestAnimationFrame(followAnchor)
    return () => {
      cancelAnimationFrame(frame)
      unregister(); observer.disconnect()
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('keydown', key)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
    }
  }, [anchor])
  return createPortal(<div ref={menu} role="dialog" aria-label="更多选项"
    className="player-more-menu rounded-lg border p-1 shadow-lg"
    style={{ ...position, zIndex: 180, overflow: 'auto', overscrollBehavior: 'contain',
      background: '#18212c', color: '#edf1ef', borderColor: '#54616a',
      '--md-sys-color-on-surface': '#edf1ef', '--md-sys-color-surface-container-highest': '#30373b',
    } as CSSProperties}>
    {children}
  </div>, document.fullscreenElement ?? document.body)
}
