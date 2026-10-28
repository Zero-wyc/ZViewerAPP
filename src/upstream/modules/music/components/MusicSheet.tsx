import { useEffect, useRef, type ReactNode, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { CARD_TONE_VARS } from '../utils/playerTone'

/** Portal keeps sheets outside transformed/scrolling player and widget ancestors. */
export function MusicSheet({ title, onClose, children, tone, className = '' }: {
  title: string; onClose: () => void; children: ReactNode; tone?: 'light' | 'dark'; className?: string
}) {
  const panel = useRef<HTMLElement>(null)
  const start = useRef<number | null>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panel.current?.focus()
    const key = (event: KeyboardEvent) => {
      if (document.querySelector('[data-cloud-modal]')) return
      if ([...document.querySelectorAll('.music-sheet')].at(-1) !== panel.current) return
      if (event.key === 'Escape') { event.stopImmediatePropagation(); close.current() }
      if (event.key !== 'Tab') return
      const nodes = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,summary,[tabindex="0"]') ?? [])]
      const first = nodes[0], last = nodes.at(-1)
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', key, true)
    return () => { document.removeEventListener('keydown', key, true); previous?.focus() }
  }, [])
  const effectiveTone = tone ?? document.querySelector('[data-player-ui-tone]')?.getAttribute('data-player-ui-tone')
  return createPortal(<div className="music-sheet-backdrop" onClick={onClose}>
    <section ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
      className={`music-sheet ${className}`} onClick={event => event.stopPropagation()}
      style={{ ...(effectiveTone === 'light' || effectiveTone === 'dark' ? CARD_TONE_VARS[effectiveTone] : {}),
        background: effectiveTone === 'light' ? '#f7f8fa' : effectiveTone === 'dark' ? '#171c24' : 'var(--md-sys-color-surface)' } as CSSProperties}>
      <div className="music-sheet-grip" onPointerDown={event => { start.current = event.clientY; event.currentTarget.setPointerCapture(event.pointerId) }}
        onPointerCancel={() => { start.current = null }} onPointerUp={event => { if (start.current != null && event.clientY - start.current > 55) onClose(); start.current = null }}><span /></div>
      <header><h2>{title}</h2><button onClick={onClose} aria-label={`关闭${title}`}><X size={22} /></button></header>
      {children}
    </section>
  </div>, document.body)
}
