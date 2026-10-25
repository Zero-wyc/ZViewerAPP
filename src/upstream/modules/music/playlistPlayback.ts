/** 顺序入队，首曲确认后立即播放；页面/会话失效后不再发起后续操作。 */
export async function enqueuePlaylistAndPlay<T>(songs: readonly T[], deps: {
  enqueue: (song: T) => Promise<void>
  play: (song: T) => void
  isCurrent: () => boolean
  onAdded: (count: number) => void
}): Promise<void> {
  for (let index = 0; index < songs.length; index++) {
    if (!deps.isCurrent()) return
    await deps.enqueue(songs[index])
    if (!deps.isCurrent()) return
    deps.onAdded(index + 1)
    if (index === 0) deps.play(songs[index])
  }
}
