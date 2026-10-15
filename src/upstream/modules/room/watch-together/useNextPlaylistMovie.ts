import { useCallback, useEffect, useRef, useState } from 'react'
import { useSocket } from '@/hooks/useSocket'
import { useRoomStore } from '@/store/roomStore'
import { useAuthStore } from '@/store/authStore'
import { canRoomViewerPerform, useSystemSettingsStore } from '@/store/systemSettingsStore'
import { message } from '@/components/ui/message'
import { nextPlaylistMovie } from './autoContinue'
import { requestPlaylistMovie } from './playlistPlayback'

export function useNextPlaylistMovie(roomId: string, isHost: boolean) {
  const { socket } = useSocket()
  const movies = useRoomStore(state => state.movies)
  const currentId = useRoomStore(state => state.currentMovieId)
  const preview = useRoomStore(state => state.watchTogether.isPreview)
  const moderators = useRoomStore(state => state.moderators)
  const user = useAuthStore(state => state.user)
  const matrix = useSystemSettingsStore(state => state.roomPermissionMatrix)
  const allowed = canRoomViewerPerform(matrix, 'manageMovie', {
    isHost, isModerator: !!user && moderators.includes(Number(user.id)), role: user?.role,
  })
  const latest = useRef({ allowed, isHost, socket })
  latest.current = { allowed, isHost, socket }
  const mounted = useRef(true), busy = useRef(false)
  const [pending, setPending] = useState(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const next = nextPlaylistMovie(movies, currentId)
  const playNext = useCallback(async () => {
    const snapshot = useRoomStore.getState(), control = latest.current
    const target = nextPlaylistMovie(snapshot.movies, snapshot.currentMovieId)
    if (busy.current || !control.allowed || !target || snapshot.roomId !== roomId ||
      snapshot.mode !== 'watch-together' || snapshot.watchTogether.isPreview || snapshot.pendingPreviewPlay) return
    if (!control.socket?.connected) { message.error('未连接房间'); return }
    const stillCurrent = () => {
      const state = useRoomStore.getState()
      return mounted.current && latest.current.allowed && latest.current.socket === control.socket &&
        latest.current.isHost === control.isHost && state.roomId === roomId &&
        state.roomSessionRevision === snapshot.roomSessionRevision && state.mode === 'watch-together' &&
        !state.watchTogether.isPreview && !state.pendingPreviewPlay &&
        state.currentMovieId === snapshot.currentMovieId &&
        nextPlaylistMovie(state.movies, state.currentMovieId)?.id === target.id
    }
    busy.current = true; setPending(true)
    try { await requestPlaylistMovie(control.socket, roomId, target.id, control.isHost, stillCurrent) }
    catch (error) { if (stillCurrent()) message.error(error instanceof Error ? error.message : '切换影片失败') }
    finally { busy.current = false; if (mounted.current) setPending(false) }
  }, [roomId])
  return { playNext, pending, visible: allowed, available: !!next && !preview }
}
