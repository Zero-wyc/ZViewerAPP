import { useCallback, useEffect, useRef, useState } from 'react'
import type { Socket } from 'socket.io-client'
import { message } from '@/components/ui/message'
import type { NcmSong } from '../types'
import { enqueuePlaylistAndPlay } from '../playlistPlayback'
import { songToUpsertItem } from './useQueueAdd'
import { useMusicPlayer } from './useMusicPlayer'

export function usePlaylistPlayback(socket: Socket | null, roomId: string | undefined, canManage: boolean, selection: string) {
  const { playSong } = useMusicPlayer()
  const requestRef = useRef(0)
  const busyRef = useRef(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    requestRef.current++
    busyRef.current = false
    setBusy(false)
    return () => { requestRef.current++ }
  }, [socket, roomId, canManage, selection])

  const playAll = useCallback(async (songs: readonly NcmSong[], valid: () => boolean = () => true) => {
    if (!canManage) { message.info('仅房主 / 房管可添加队列'); return }
    if (!socket?.connected || !roomId) { message.error('未连接房间'); return }
    if (!songs.length || busyRef.current) return
    const request = ++requestRef.current
    const isCurrent = () => request === requestRef.current && socket.connected && valid()
    let added = 0
    busyRef.current = true
    setBusy(true)
    try {
      await enqueuePlaylistAndPlay(songs, {
        enqueue: song => new Promise<void>((resolve, reject) => {
          socket.timeout(8000).emit('music:queue-upsert', { roomId, item: songToUpsertItem(song), afterCurrent: false },
            (error: Error | null, response: { success?: boolean; message?: string }) => {
              if (error || !response?.success) reject(new Error(response?.message || '歌曲入队失败，请稍后重试'))
              else resolve()
            })
        }),
        play: song => playSong({ ...song, id: -1, roomId, order: 0, addedBy: '' }),
        isCurrent,
        onAdded: count => { added = count },
      })
      if (isCurrent()) message.success(`已加入 ${added} 首到队列，并从首曲开始播放`)
    } catch (error) {
      if (isCurrent()) message.error(`${added ? `已加入 ${added} 首，` : ''}${error instanceof Error ? error.message : '歌单播放失败'}`)
    } finally {
      if (request === requestRef.current) { busyRef.current = false; setBusy(false) }
    }
  }, [canManage, socket, roomId, playSong])
  return { playAll, busy }
}
