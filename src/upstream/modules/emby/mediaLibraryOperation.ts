let sequence = 0
const latest = new Map<number, number>()

/** Episode and version requests for the same movie supersede each other. */
export function beginMediaLibraryChange(movieId: number): () => boolean {
  const token = ++sequence
  latest.set(movieId, token)
  return () => latest.get(movieId) === token
}
