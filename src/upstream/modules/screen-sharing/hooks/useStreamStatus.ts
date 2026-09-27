import { useEffect } from 'react'
import type { Socket } from 'socket.io-client'
import { useRoomStore, type StreamStatus } from '@/store/roomStore'

export type { StreamStatus }

/**
 * 订阅 stream-status 事件，同步推流状态到 roomStore。
 *
 * 职责单一：仅监听 NMS 广播的 stream-status 事件并更新全局 store。
 * 房主和观众端均可使用，无角色差异。
 *
 * 从 useStreamPush.ts 中拆分，实现 OBS 推流与子模式切换的职责分离。
 */
export function useStreamStatus(
  socket: Socket | null,
  roomId: string
): StreamStatus {
  const streamStatus = useRoomStore((state) => state.streamStatus)
  const setStreamStatus = useRoomStore((state) => state.setStreamStatus)

  useEffect(() => {
    if (!socket || !roomId) return
    const handleStreamStatus = (payload: {
      roomId: string
      status: 'live' | 'offline'
    }) => {
      if (payload.roomId !== roomId) return
      setStreamStatus(payload.status)
    }
    socket.on('stream-status', handleStreamStatus)
    return () => {
      socket.off('stream-status', handleStreamStatus)
    }
  }, [socket, roomId, setStreamStatus])

  return streamStatus
}
