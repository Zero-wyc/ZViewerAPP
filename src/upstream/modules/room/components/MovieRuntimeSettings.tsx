import { useState } from 'react'
import { ChevronDown, Cpu, Network, Settings } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useRoomStore, type Movie } from '@/store/roomStore'
import { message } from '@/components/ui/message'
import { PlaybackOptionButton } from './PlaybackOptionButton'
import { canSwitchEmbyPlayback } from '@/modules/emby/playbackMode'

export function MovieRuntimeSettings({ movie, isHost }: { movie: Movie; isHost: boolean }) {
  const [open, setOpen] = useState(false)
  const user = useAuthStore(state => state.user)
  const owner = useRoomStore(state => state.roomOwnerUserId)
  const operation = useRoomStore(state => state.movieSettingsOperations[movie.id])
  const canEdit = isHost && !!user && (user.role === 'root' || String(user.id) === String(owner))
  const busy = operation?.status === 'saving' || operation?.status === 'applying'
  const embyLike = movie.sourceType === 'emby' || movie.sourceType === 'jellyfin'
  const showServerProxy = ['anime', 'kazumi', 'cms'].includes(movie.sourceType) || canSwitchEmbyPlayback(movie)
  const serverProxy = embyLike ? movie.directLink !== true : movie.serverProxy === true
  const save = async (payload: { serverProxy?: boolean; playsvideoEnabled?: boolean }) => {
    if (!canEdit) return
    try { await useRoomStore.getState().saveMoviePlaybackSettings(movie.id, payload) }
    catch (error) { message.error(error instanceof Error ? error.message : '保存播放设置失败') }
  }
  return <div className="min-w-0">
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
      className="flex min-h-11 w-full items-center gap-2 text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">
      <Settings aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />播放设置
      <ChevronDown aria-hidden="true" className={`ml-auto h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && <div className="playback-option-group flex min-w-0 flex-wrap pb-1">
      {showServerProxy && <PlaybackOptionButton
        icon={Network} label="服务器中转" pressed={serverProxy}
        disabled={!canEdit || busy} busy={busy} onPressedChange={serverProxy => void save({ serverProxy })} />}
      <PlaybackOptionButton icon={Cpu} label="浏览器转码" pressed={movie.playsvideoEnabled !== false}
        disabled={!canEdit || busy} busy={busy} onPressedChange={playsvideoEnabled => void save({ playsvideoEnabled })} />
    </div>}
    {operation?.error && <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-[var(--md-sys-color-error)]">
      <span>{operation.error}</span>
      <button type="button" disabled={!canEdit || busy} className="min-h-11 font-bold underline"
        onClick={() => void save(operation.requested || { playsvideoEnabled: movie.playsvideoEnabled !== false })}>重试</button>
    </div>}
  </div>
}
