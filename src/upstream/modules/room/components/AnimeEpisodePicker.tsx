import { useState } from 'react'
import { CheckSquare, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EpisodeCard } from '@/components/EpisodeCard'
import { EpisodeViewToggle } from '@/components/EpisodeViewToggle'
import { episodeGridColumns, useEpisodeViewMode } from '@/hooks/useEpisodeViewMode'
import { useFullMediaNames } from '@/hooks/useFullMediaNames'
import type { AniSubsEpisode } from '@/modules/anisubs'

export interface AnimeEpisodeSelection {
  sourceId: string
  episode: AniSubsEpisode
  title: string
}

interface Props {
  episodes: AniSubsEpisode[]
  sourceId: string
  title: string
  disabled?: boolean
  onSelect: (episode: AniSubsEpisode) => void
  onSelectMany: (items: AnimeEpisodeSelection[]) => Promise<string[]>
}

export function AnimeEpisodePicker({
  episodes,
  sourceId,
  title,
  disabled,
  onSelect,
  onSelectMany,
}: Props) {
  const [multiSelect, setMultiSelect] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)
  const busy = disabled || adding
  const { episodeViewMode } = useEpisodeViewMode()
  const { showFullNames } = useFullMediaNames()

  const toggle = (id: string) => {
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const addSelected = async () => {
    setAdding(true)
    try {
      const added = await onSelectMany(
        episodes
          .filter((episode) => selected.has(episode.id))
          .map((episode) => ({
            sourceId,
            episode,
            title: `${title} - ${episode.title}`,
          }))
      )
      setSelected((previous) => {
        const next = new Set(previous)
        added.forEach((id) => next.delete(id))
        return next
      })
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="mt-2">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <EpisodeViewToggle />
        <Button
          size="sm"
          variant={multiSelect ? 'primary' : 'secondary'}
          icon={<CheckSquare className="h-4 w-4" />}
          disabled={busy}
          onClick={() => {
            setMultiSelect(!multiSelect)
            setSelected(new Set())
          }}
        >
          {multiSelect ? '退出多选' : '多选'}
        </Button>
        {multiSelect && (
          <>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                setSelected(new Set(episodes.map((episode) => episode.id)))
              }
            >
              全选
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || selected.size === 0}
              onClick={() => setSelected(new Set())}
            >
              清空
            </Button>
          </>
        )}
      </div>
      <div className="grid max-h-[200px] items-start gap-1.5 overflow-y-auto" style={{ gridTemplateColumns: episodeGridColumns(episodeViewMode) }}>
        {episodes.map((episode) => (
          <EpisodeCard
            key={episode.id}
            title={episode.title}
            mode={episodeViewMode}
            showFullName={showFullNames}
            selected={multiSelect ? selected.has(episode.id) : undefined}
            disabled={busy}
            onClick={() => multiSelect ? toggle(episode.id) : onSelect(episode)}
          />
        ))}
      </div>
      {multiSelect && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs">已选 {selected.size} 集</span>
          <Button
            size="sm"
            variant="primary"
            icon={<Plus className="h-4 w-4" />}
            loading={adding}
            disabled={busy || selected.size === 0}
            onClick={() => void addSelected()}
          >
            添加所选
          </Button>
        </div>
      )}
    </div>
  )
}
