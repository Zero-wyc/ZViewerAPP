import type { LucideIcon } from 'lucide-react'
import { LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import './PlaybackOptionButton.css'

export function PlaybackOptionButton({ icon: Icon, label, pressed, disabled = false,
  busy = false, onPressedChange }: {
  icon: LucideIcon
  label: string
  pressed: boolean
  disabled?: boolean
  busy?: boolean
  onPressedChange: (pressed: boolean) => void
}) {
  return <button type="button" aria-pressed={pressed} aria-busy={busy}
    disabled={disabled || busy} onClick={() => onPressedChange(!pressed)}
    className="playback-option-button shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-default disabled:opacity-60">
    <span className={cn('playback-option-pill border shadow-sm transition-colors',
      pressed ? 'border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]'
        : 'border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)]')}>
      {busy ? <LoaderCircle aria-hidden="true" className="playback-option-icon animate-spin" />
        : <Icon aria-hidden="true" className="playback-option-icon" />}
      <span className="whitespace-nowrap">{label}</span>
    </span>
  </button>
}
