interface Selection {
  roomId: string
  roomSessionRevision: number
  currentMovieId: number | null
  movies: { id: number; cid?: number }[]
}

interface SourceIdentity {
  currentMovieId?: number
  sourceType?: string
  cid?: number
  isPreview?: boolean
}

/** Initial playback and playlist metadata arrive independently when joining. */
export function isPlaybackSessionCurrent(before: Selection, after: Selection, source?: SourceIdentity | null): boolean {
  if (before.roomId !== after.roomId || before.roomSessionRevision !== after.roomSessionRevision) return false
  if (after.currentMovieId != null && !source?.isPreview && source?.currentMovieId != null && source.currentMovieId !== after.currentMovieId) return false
  const movie = after.movies.find(item => item.id === after.currentMovieId)
  if (source?.sourceType === 'bilibili' && source.cid != null && movie?.cid != null && source.cid !== movie.cid) return false
  if (before.currentMovieId === after.currentMovieId) return true
  // A known selection changing is a genuine switch, including clearing it.
  if (before.currentMovieId != null || after.currentMovieId == null || source?.isPreview) return false
  if (source?.currentMovieId != null) return source.currentMovieId === after.currentMovieId
  // Older broadcasts may omit currentMovieId; Bilibili CID still anchors the first selection.
  return source?.sourceType === 'bilibili' && source.cid != null && movie?.cid === source.cid
}
