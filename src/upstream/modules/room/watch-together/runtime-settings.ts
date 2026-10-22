import type { Movie } from '@/store/roomStore'

export interface PlaybackPolicy {
  serverProxy?: boolean
  playsvideoEnabled?: boolean
}

export interface MovieSettingsOperation {
  token: number
  status: 'saving' | 'applying' | 'idle' | 'error'
  confirmed?: PlaybackPolicy
  error?: string
}

export function samePlaybackPolicy(a: PlaybackPolicy, b: PlaybackPolicy): boolean {
  return (a.serverProxy === true) === (b.serverProxy === true) &&
    (a.playsvideoEnabled !== false) === (b.playsvideoEnabled !== false)
}

/** Socket snapshots have no revision. Hold a confirmed policy until a fresh GET
 * resolves a conflict; never assign an artificial server revision to a local token. */
export function reconcilePlaybackPolicies<T extends PlaybackPolicy & { id: number }>(
  incoming: T[], previous: T[], operations: Record<number, MovieSettingsOperation>,
) {
  let conflict = false
  const movies = incoming.map(movie => {
    const operation = operations[movie.id]
    const retained = operation?.status === 'saving'
      ? previous.find(item => item.id === movie.id) : operation?.confirmed
    if (!retained || samePlaybackPolicy(movie, retained)) return movie
    conflict = true
    return { ...movie, serverProxy: retained.serverProxy === true,
      playsvideoEnabled: retained.playsvideoEnabled !== false }
  })
  return { movies, conflict }
}

/** Ignore update timestamps and display-only fields when deciding to reload. */
export function moviePlaybackKey(movie: Movie): string {
  const { id, url, sourceType, audioUrl, format, videoCodec, audioCodec, cid,
    path, directLink, sourceMountId, sourceMeta, currentPage } = movie
  return JSON.stringify([id, url, sourceType, audioUrl, format, videoCodec, audioCodec,
    cid, path, directLink, sourceMountId, sourceMeta, currentPage,
    movie.serverProxy === true, movie.playsvideoEnabled !== false])
}
