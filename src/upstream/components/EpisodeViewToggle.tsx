import { LayoutGrid, List } from 'lucide-react'
import { useEpisodeViewMode } from '@/hooks/useEpisodeViewMode'
import { cn } from '@/lib/utils'

export function EpisodeViewToggle() {
  const { episodeViewMode, setEpisodeViewMode } = useEpisodeViewMode()
  return (
    <div className="inline-flex shrink-0 rounded-[var(--md-sys-shape-corner)] border border-[var(--md-sys-color-outline-variant)] p-0.5" role="group" aria-label="选集显示方式">
      {(['list', 'grid'] as const).map(mode => {
        const Icon = mode === 'list' ? List : LayoutGrid
        const label = mode === 'list' ? '列表' : '网格'
        return <button key={mode} type="button" aria-label={`选集${label}`} aria-pressed={episodeViewMode === mode}
          onClick={() => setEpisodeViewMode(mode)}
          className={cn('flex min-h-8 items-center gap-1.5 rounded-[calc(var(--md-sys-shape-corner)-2px)] px-2.5 py-1 text-xs font-medium',
            episodeViewMode === mode ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]' : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]')}>
          <Icon className="h-3.5 w-3.5" />{label}
        </button>
      })}
    </div>
  )
}
