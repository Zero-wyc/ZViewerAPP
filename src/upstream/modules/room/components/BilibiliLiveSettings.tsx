import { useEffect, useRef, useState } from 'react'
import { Radio, Server } from 'lucide-react'
import { useRoomStore } from '@/store/roomStore'
import { getApiUrl } from '@/lib/api'
import { message } from '@/components/ui/message'
import { PlaybackOptionButton } from './PlaybackOptionButton'

/** Route changes use confirmed movie data, irrespective of REST/socket arrival order. */
export function BilibiliLiveSettings({ movieId, isHost }: { movieId: number; isHost: boolean }) {
  const movie = useRoomStore(s => s.movies.find(m => m.id === movieId))
  const session = useRoomStore(s => s.roomSessionRevision)
  const [saving, setSaving] = useState(false)
  const operation = useRef(0)
  useEffect(() => {
    setSaving(false)
    return () => { operation.current++ }
  }, [movieId, session])
  if (!movie) return null
  const serverProxy = movie.serverProxy === true
  const apply = async (target: boolean) => {
    if (!isHost || saving || target === serverProxy) return
    const context = useRoomStore.getState()
    if (!context.roomId) return
    const token = ++operation.current
    const server = getApiUrl()
    const current = () => operation.current === token && getApiUrl() === server &&
      useRoomStore.getState().roomId === context.roomId &&
      useRoomStore.getState().roomSessionRevision === context.roomSessionRevision
    setSaving(true)
    try {
      await context.updateMovie(context.roomId, movieId, { serverProxy: target })
      if (!current()) return
      // The broadcast can precede the PUT response. Refresh also covers a lost broadcast.
      await context.fetchMovies(context.roomId)
      if (!current()) return
      const state = useRoomStore.getState()
      const confirmed = state.movies.find(m => m.id === movieId)
      if (!confirmed || (confirmed.serverProxy === true) !== target) throw new Error('播放线路已变化，请重试')
      if (state.currentMovieId === movieId) state.triggerReloadBilibili()
      message.success(target ? '已切换为服务器中转' : '已切换为优先直连，连接失败时自动中转')
    } catch (err) {
      if (current()) message.error(err instanceof Error ? err.message : '切换播放线路失败')
    } finally {
      if (current()) setSaving(false)
    }
  }
  return <div className="flex flex-wrap items-center gap-2" aria-label="直播播放线路">
    <PlaybackOptionButton icon={Radio} label="优先直连" pressed={!serverProxy}
      disabled={!isHost || saving} busy={saving && serverProxy} onPressedChange={() => void apply(false)} />
    <PlaybackOptionButton icon={Server} label="服务器中转" pressed={serverProxy}
      disabled={!isHost || saving} busy={saving && !serverProxy} onPressedChange={() => void apply(true)} />
  </div>
}
