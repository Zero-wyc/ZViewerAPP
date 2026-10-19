export function canReorderPlaylist(role: string | undefined, userId: string | undefined, ownerId: number | null | undefined) {
  return role === 'root' || ((role === 'user' || role === 'admin') && Number(userId) > 0 && Number(ownerId) > 0 && String(ownerId) === String(userId))
}

/** Always builds a complete permutation; filtered lists and missing/edge items cannot submit. */
export function movePlaylistItem(movies: { id: number }[], movieId: number, direction: -1 | 1, search: string): number[] | null {
  if (search.trim()) return null
  const ids = movies.map(movie => movie.id)
  const index = ids.indexOf(movieId)
  const target = index + direction
  if (index < 0 || target < 0 || target >= ids.length) return null
  ;[ids[index], ids[target]] = [ids[target], ids[index]]
  return ids
}
