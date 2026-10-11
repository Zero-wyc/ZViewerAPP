import { Modal, type ModalProps } from './Modal'
export type FullscreenOverlayProps = Omit<ModalProps, 'footer' | 'expandable'>

/** Secondary panel viewport expansion is independent of native player fullscreen. */
export function FullscreenOverlay({ className, ...props }: FullscreenOverlayProps) {
  return <Modal {...props} expandable className={`max-w-4xl h-[min(624px,85dvh)] ${className ?? ''}`} />
}
