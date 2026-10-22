import { Switch } from '@/components/ui/Switch'
import { Text } from '@/components/ui/Typography'

/** Draft-only playback options retain the original descriptive switch cards. */
export function PlaybackOptionToggle({ label, description, checked, disabled, onChange }: {
  label: string
  description: string
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
}) {
  return <div className="flex items-center justify-between gap-3 rounded-[var(--md-sys-shape-corner)] bg-[var(--md-sys-color-surface-container-high)] px-3 py-2">
    <div className="min-w-0">
      <Text className="block text-xs font-medium">{label}</Text>
      <Text type="secondary" className="mt-0.5 block text-[11px] leading-snug">{description}</Text>
    </div>
    <Switch role="switch" aria-label={label} checked={checked} disabled={disabled}
      className="min-h-11 shrink-0" onChange={event => onChange(event.target.checked)} />
  </div>
}
