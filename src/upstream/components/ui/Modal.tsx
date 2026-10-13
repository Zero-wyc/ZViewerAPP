import { lockBodyScroll } from './bodyScrollLock'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Maximize, Minimize } from 'lucide-react'
import { consumeOverlayBack, registerOverlayBack } from './overlayBack'
import { cn } from '@/lib/utils'
import { Button } from './Button'

const MODAL_ANIMATION_DURATION = 220

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
  expandable?: boolean
  /** 保留关闭时的内容挂载，供需要持续监听房间事件的面板使用。 */
  keepMounted?: boolean
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  className,
  expandable = false,
  keepMounted = false,
}: ModalProps) {
  const [expanded, setExpanded] = useState(false)
  const [viewport, setViewport] = useState(() => ({ height: window.visualViewport?.height ?? window.innerHeight, top: window.visualViewport?.offsetTop ?? 0 }))
  const backRef = useRef(() => {})
  backRef.current = () => { if (expanded) setExpanded(false); else onClose() }
  useEffect(() => {
    if (!open) { setExpanded(false); return }
    return registerOverlayBack(() => backRef.current())
  }, [open])
  useEffect(() => {
    if (!open) return
    const update = () => setViewport({ height: window.visualViewport?.height ?? window.innerHeight, top: window.visualViewport?.offsetTop ?? 0 })
    update()
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => { window.visualViewport?.removeEventListener('resize', update); window.visualViewport?.removeEventListener('scroll', update); window.removeEventListener('resize', update) }
  }, [open])
  const [visible, setVisible] = useState(open)
  const [exiting, setExiting] = useState(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevOpenRef = useRef(open)

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setVisible(true)
      setExiting(false)
    } else if (!open && prevOpenRef.current) {
      setExiting(true)
      closeTimerRef.current = setTimeout(() => {
        setVisible(false)
        setExiting(false)
      }, MODAL_ANIMATION_DURATION)
    }
    prevOpenRef.current = open

    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current)
      }
    }
  }, [open])

  // Modal 打开期间锁定 body 滚动，避免滚轮穿透到底层页面
  useEffect(() => {
    if (!visible) return
    return lockBodyScroll()
  }, [visible])

  useEffect(() => {
    if (!visible) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); e.stopImmediatePropagation(); consumeOverlayBack() }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [visible, onClose])

  if (!visible && !keepMounted) return null

  return createPortal(
    <div
      className="secondary-panel fixed inset-x-0 flex items-center justify-center"
      style={{ display: visible ? undefined : 'none', zIndex: 999, top: viewport.top, height: viewport.height, padding: 'max(8px, var(--app-safe-top, 0px)) max(8px, var(--app-safe-right, 0px)) max(8px, var(--app-safe-bottom, 0px)) max(8px, var(--app-safe-left, 0px))', transform: 'translateZ(0)' }}
      // 阻止滚轮事件冒泡到 document，防止触发底层页面滚动
      onWheel={(e) => e.stopPropagation()}
    >
      <div
        className={cn(
          'absolute inset-0 bg-black/40',
          exiting ? 'zen-modal-backdrop-exit' : 'zen-modal-backdrop-enter'
        )}
        style={{
          // 蒙层模糊度跟随主题设置（取 glass-blur 的 40%，避免大模糊度时背景过度模糊）
          backdropFilter: 'blur(var(--glass-blur-mask))',
          WebkitBackdropFilter: 'blur(var(--glass-blur-mask))',
        }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={cn(
          'glass-strong relative z-10 flex w-full max-w-md flex-col overflow-hidden rounded-[var(--md-sys-shape-corner)] p-6 shadow-lg',
          exiting ? 'zen-modal-content-exit' : 'zen-modal-content-enter',
          className,
          expanded && '!h-full !max-w-none'
        )}
        style={{
          maxHeight: '100%',
          boxShadow:
            '0 8px 24px -8px color-mix(in srgb, var(--md-sys-color-primary) 25%, transparent)',
        }}
      >
        <div className="flex shrink-0 items-start justify-between gap-2">
          {title ? (
            <h3 className="text-lg font-semibold text-[var(--md-sys-color-on-surface)]">
              {title}
            </h3>
          ) : (
            <span />
          )}
          <div className="ml-auto flex shrink-0 items-center gap-2">
          {expandable && <button type="button" aria-label={expanded ? '退出面板全屏' : '面板全屏'} onClick={() => setExpanded(value => !value)} className="rounded p-2 text-[var(--md-sys-color-on-surface-variant)]">{expanded ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}</button>}
          <button
            aria-label="关闭面板"
            onClick={onClose}
            className="rounded-[var(--md-sys-shape-corner)] p-1 text-[var(--md-sys-color-on-surface-variant)] transition-all hover:bg-[var(--md-sys-color-surface-container)] hover:text-[var(--md-sys-color-on-surface)] hover:scale-110 active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>
          </div>
        </div>
        {/* 内容超出可用高度（小屏）时出滚动条，而不是被裁掉 */}
        <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-y-auto text-sm text-[var(--md-sys-color-on-surface-variant)]">
          {children}
        </div>
        {footer && (
          <div className="mt-6 flex shrink-0 items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

export interface ConfirmModalProps extends Omit<ModalProps, 'footer'> {
  okText?: string
  cancelText?: string
  onOk?: () => void
  onCancel?: () => void
  confirmLoading?: boolean
}

export function ConfirmModal({
  okText = '确认',
  cancelText = '取消',
  onOk,
  onCancel,
  confirmLoading,
  ...modalProps
}: ConfirmModalProps) {
  return (
    <Modal
      {...modalProps}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={onCancel ?? modalProps.onClose}
            disabled={confirmLoading}
          >
            {cancelText}
          </Button>
          <Button
            variant="primary"
            onClick={onOk}
            loading={confirmLoading}
            disabled={confirmLoading}
          >
            {okText}
          </Button>
        </>
      }
    />
  )
}
