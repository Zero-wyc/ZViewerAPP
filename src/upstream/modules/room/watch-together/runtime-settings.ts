import type { Movie } from '@/store/roomStore'

export interface PlaybackPolicy {
  serverProxy?: boolean
  playsvideoEnabled?: boolean
  sourceType?: string
  directLink?: boolean
  url?: string
  format?: Movie['format']
  audioCodec?: string
  multiVersion?: boolean
}

export function moviePlaybackPolicy(movie: PlaybackPolicy): PlaybackPolicy {
  return { serverProxy: movie.serverProxy, playsvideoEnabled: movie.playsvideoEnabled,
    ...((movie.sourceType === 'emby' || movie.sourceType === 'jellyfin') ? {
      sourceType: movie.sourceType, directLink: movie.directLink === true, url: movie.url,
      format: movie.format, audioCodec: movie.audioCodec, multiVersion: movie.multiVersion,
    } : {}) }
}

export interface MovieSettingsOperation {
  token: number
  status: 'saving' | 'applying' | 'idle' | 'error'
  confirmed?: PlaybackPolicy
  error?: string
  requested?: { serverProxy?: boolean; playsvideoEnabled?: boolean }
}

export function samePlaybackPolicy(a: PlaybackPolicy, b: PlaybackPolicy): boolean {
  return (a.serverProxy === true) === (b.serverProxy === true) &&
    (a.playsvideoEnabled !== false) === (b.playsvideoEnabled !== false) &&
    ((b.sourceType !== 'emby' && b.sourceType !== 'jellyfin') ||
      (a.sourceType === b.sourceType && (a.directLink === true) === (b.directLink === true) &&
        a.url === b.url && a.format === b.format && a.audioCodec === b.audioCodec))
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
    return { ...movie, ...moviePlaybackPolicy(retained) }
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
