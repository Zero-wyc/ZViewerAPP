import { Switch } from './ui/Switch'
import { useFullMediaNames } from '@/hooks/useFullMediaNames'

export function FullMediaNameToggle() {
  const { showFullNames, setShowFullNames } = useFullMediaNames()
  return (
    <Switch
      role="switch"
      aria-label="完整显示"
      checked={showFullNames}
      onChange={event => setShowFullNames(event.target.checked)}
      className="min-h-8 shrink-0 gap-1.5 [&>span]:text-xs [&>span]:whitespace-nowrap"
      label="完整显示"
    />
  )
}
