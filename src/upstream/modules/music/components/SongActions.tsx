import { useState } from 'react'
import type { Socket } from 'socket.io-client'
import type { NcmSong } from '../types'
import { useQueueAdd, songToUpsertItem } from '../hooks/useQueueAdd'
import { AddToPlaylistModal } from './AddToPlaylistModal'
import { apiGet } from '../musicApi'
import { useMusicStore } from '../store'
import { message } from '@/components/ui/message'
export function SongActions({ song, socket, roomId, canManage }: { song: NcmSong; socket: Socket | null; roomId?: string; canManage: boolean }) {
  const { add } = useQueueAdd(socket, roomId, canManage)
  const [collect, setCollect] = useState(false)
  const loggedIn = useMusicStore(s => s.loginStatus.loggedIn)
  const album = async () => {
    try {
      const response = await apiGet<{ songs?: { al?: { id: number; name: string; picUrl?: string } }[] }>(`/api/music/ncm/song/detail?ids=${song.songId}`)
      const info = response.data?.songs?.[0]?.al
      if (!info?.id) { message.info('暂无专辑信息'); return }
      const store = useMusicStore.getState()
      store.closePlayerOverlay(); store.setPendingAlbumDetail({ id: info.id, name: info.name, cover: info.picUrl }); store.setPage('mymusic')
    } catch { message.error('获取专辑失败，请重试') }
  }
  return <>
    <button onClick={() => add(songToUpsertItem(song), { afterCurrent: true, notify: true })}>下一首播放</button>
    <button onClick={() => add(songToUpsertItem(song), { notify: true })}>加入队列</button>
    <button onClick={() => { if (loggedIn) setCollect(true); else message.info('请先登录网易云音乐') }}>收藏到歌单</button>
    <button onClick={() => void album()}>查看专辑</button>
    <AddToPlaylistModal open={collect} song={song} onClose={() => setCollect(false)} />
  </>
}
