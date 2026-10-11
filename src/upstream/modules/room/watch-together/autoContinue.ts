/** Reads the authoritative, full playlist at ended time. Never updates selection locally. */
export function nextPlaylistMovie<T extends { id: number }>(movies: T[], currentId: number | null): T | null {
  const index = movies.findIndex(movie => movie.id === currentId)
  return index < 0 ? null : movies[index + 1] ?? null
}

export function createAutoContinueHandler(options: {
  read: () => { eligible: boolean; key: string; currentId: number | null; movies: { id: number }[] }
  play: (id: number, stillCurrent: () => boolean) => Promise<void>
  onEnd: () => void
  onError: (error: unknown) => void
}) {
  let disposed = false
  let busy = false
  let consumed: string | null = null
  return {
    dispose: () => { disposed = true },
    ended: async () => {
      const snapshot = options.read()
      if (disposed || busy || !snapshot.eligible || consumed === snapshot.key) return
      const key = snapshot.key
      consumed = key
      const next = nextPlaylistMovie(snapshot.movies, snapshot.currentId)
      if (!next) { options.onEnd(); return }
      busy = true
      const stillCurrent = () => {
        const latest = options.read()
        return !disposed && latest.eligible && latest.key === key && latest.movies.some(movie => movie.id === next.id)
      }
      try { await options.play(next.id, stillCurrent) }
      catch (error) { if (stillCurrent()) options.onError(error) }
      finally { busy = false }
    },
  }
}
