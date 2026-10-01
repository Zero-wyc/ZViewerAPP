import { useEffect, useRef, type ReactNode } from 'react'
import { ArrowLeft, X } from 'lucide-react'

interface SettingsDialogProps {
  title: string
  onBack?: () => void
  onClose: () => void
  children: ReactNode
}

/** Top-layer dialog also stays above the video controls in native fullscreen. */
export function SettingsDialog({ title, onBack, onClose, children }: SettingsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const dragStart = useRef<number | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current!
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    const stage = dialog.closest('.zart-stage')
    const updateViewport = () => {
      const viewport = window.visualViewport
      const height = viewport?.height ?? window.innerHeight
      const top = viewport?.offsetTop ?? 0
      const videoBottom = stage?.getBoundingClientRect().bottom ?? height * 0.3
      const fullscreen = !!document.fullscreenElement || stage?.classList.contains('zart-web-fullscreen')
      const sheetTop = fullscreen ? height * 0.3 : Math.min(Math.max(videoBottom - top, height * 0.2), height * 0.55)
      dialog.style.setProperty('--settings-sheet-height', `${height - sheetTop}px`)
      dialog.style.height = `${height}px`
      dialog.style.top = `${top}px`
    }
    updateViewport()
    const observer = new ResizeObserver(updateViewport)
    if (stage) observer.observe(stage)
    window.addEventListener('resize', updateViewport)
    window.visualViewport?.addEventListener('resize', updateViewport)
    window.visualViewport?.addEventListener('scroll', updateViewport)
    document.addEventListener('fullscreenchange', updateViewport)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateViewport)
      window.visualViewport?.removeEventListener('resize', updateViewport)
      window.visualViewport?.removeEventListener('scroll', updateViewport)
      document.removeEventListener('fullscreenchange', updateViewport)
      dialog.close()
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    bodyRef.current?.scrollTo(0, 0)
    headingRef.current?.focus({ preventScroll: true })
  }, [title])

  return (
    <dialog
      ref={dialogRef}
      className="player-settings-dialog"
      data-player-settings
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault()
        const dismiss = onBack ?? onClose
        dismiss()
      }}
      onClick={(event) => {
        event.stopPropagation()
        if (event.target === event.currentTarget) onClose()
      }}
      // Player shortcuts must not seek or exit fullscreen while editing settings.
      onKeyDown={(event) => event.stopPropagation()}
    >
      <section className="player-settings-dialog-card">
        <div className="player-settings-dialog-grip" aria-hidden="true"
          onPointerDown={(event) => {
            dragStart.current = event.clientY
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerUp={(event) => {
            if (dragStart.current != null && event.clientY - dragStart.current > 60) onClose()
            dragStart.current = null
          }}
          onPointerCancel={() => { dragStart.current = null }}
        ><span /></div>
        <header className="player-settings-dialog-header">
          {onBack && (
            <button type="button" onClick={onBack} aria-label="返回上一级设置">
              <ArrowLeft size={20} />
            </button>
          )}
          <h2 ref={headingRef} tabIndex={-1}>{title}</h2>
          <button type="button" onClick={onClose} aria-label="关闭播放设置">
            <X size={20} />
          </button>
        </header>
        <div ref={bodyRef} className="player-settings-dialog-body">{children}</div>
      </section>
    </dialog>
  )
}
