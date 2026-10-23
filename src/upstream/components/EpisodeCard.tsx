import { useState, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import './EpisodeCard.css'

export interface EpisodeCoverProps {
  className: string
  /** Custom image loaders call this only after their final fallback fails. */
  onError: () => void
}

interface EpisodeCardProps {
  title: string
  cover?: string
  mode: 'list' | 'grid'
  showFullName?: boolean
  selected?: boolean
  disabled?: boolean
  onClick: () => void
  children?: ReactNode
  className?: string
  renderCover?: (props: EpisodeCoverProps) => ReactNode
  'data-media-entry'?: string
}

/** A real cover is optional; missing or failed images never leave a placeholder. */
export function EpisodeCard({
  title, cover, mode, showFullName = true, selected, disabled, onClick,
  children, className, renderCover, 'data-media-entry': mediaEntry,
}: EpisodeCardProps) {
  const [failedCover, setFailedCover] = useState<string>()
  const showCover = !!cover && failedCover !== cover
  const imageProps: EpisodeCoverProps = {
    className: 'episode-card__image',
    onError: () => setFailedCover(cover),
  }

  return (
    <button
      type="button"
      data-media-entry={mediaEntry}
      data-episode-card={mode}
      data-has-cover={showCover || undefined}
      className={cn('episode-card', `episode-card--${mode}`, selected && 'episode-card--selected', className)}
      aria-label={title}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      title={title}
    >
      {showCover && (
        <span className="episode-card__cover">
          {renderCover ? renderCover(imageProps) : (
            <img key={cover} src={cover} alt="" loading="lazy" referrerPolicy="no-referrer" {...imageProps} />
          )}
        </span>
      )}
      <span className="episode-card__body">
        <span data-media-name className={cn('episode-card__title', !showFullName && 'episode-card__title--clamped')}>
          {title}
        </span>
        {children && <span className="episode-card__details">{children}</span>}
      </span>
      {selected && <Check className="episode-card__check" aria-hidden="true" strokeWidth={3} />}
    </button>
  )
}
