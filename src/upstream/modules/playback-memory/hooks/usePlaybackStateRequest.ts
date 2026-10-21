/**
 * usePlaybackStateRequest Hook
 *
 * 观众加入房间或房主重连时，向服务器请求当前播放状态。
 *
 * 旧架构：emit watch-together-request-state，后端广播给房主，房主响应。
 * 新架构：emit watch-together-request-state，后端直接通过 ack 返回推算后的状态。
 *
 * 优势：
 * - 房主离线时观众仍可获取状态（从服务器持久化读取）
 * - 减少一次 socket 往返（ack vs 广播+响应）
 */
import { useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'
import { useSocket } from '@/hooks/useSocket'
import { useRoomStore } from '@/store/roomStore'
import type { ViewerStateReceiver } from '@/modules/sync-playback/types'
import { SOCKET_EVENT } from '@/modules/sync-playback/constants'
import { isPlaybackSessionCurrent } from '@/modules/sync-playback/playbackIdentity'
import type { RequestStateAckData } from '../types'
export interface UsePlaybackStateRequestOptions {
  roomId: string
  isHostRef: MutableRefObject<boolean>
  receiverRef: MutableRefObject<ViewerStateReceiver | null>
}

export type UsePlaybackStateRequestReturn = void

export function usePlaybackStateRequest({
  roomId,
  isHostRef,
  receiverRef,
}: UsePlaybackStateRequestOptions): UsePlaybackStateRequestReturn {
  const { socket } = useSocket()
  const requestedRef = useRef(false)
  // 服务器暂无播放状态时的重试（房主可能刚开始播放 / 状态尚未持久化）
  const retryCountRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!socket || isHostRef.current) return
    if (requestedRef.current) return
    requestedRef.current = true

    let disposed = false
    let requestSerial = 0
    const requestState = () => {
      if (disposed || isHostRef.current) return
      const serial = ++requestSerial
      const selection = useRoomStore.getState()
      const receiver = receiverRef.current
      const revision = receiver?.revision
      retryTimerRef.current = setTimeout(() => { if (serial === requestSerial && retryCountRef.current++ < 10) requestState() }, 5000)
      // emit 请求状态，ack 回调直接返回推算后的状态
      socket.emit(
        SOCKET_EVENT.REQUEST_STATE,
        { roomId },
        (response: {
          success: boolean
          data?: RequestStateAckData | null
          message?: string
        }) => {
          if (disposed || serial !== requestSerial || !isPlaybackSessionCurrent(selection, useRoomStore.getState(), response.data?.state) || isHostRef.current) return
          clearTimeout(retryTimerRef.current ?? undefined)
          if (typeof response.data?.hostOnline === 'boolean') useRoomStore.getState().setHostOffline(!response.data.hostOnline)
          if (!response.success || !response.data?.state) {
            // 服务器无播放状态：短间隔重试，避免观众加入后一直黑屏等待
            if (retryCountRef.current < 10) {
              retryCountRef.current += 1
              retryTimerRef.current = setTimeout(requestState, 1500)
            }
            return
          }

          retryCountRef.current = 10 // 拿到状态后停止重试
          // A broadcast or preview received after this request is newer than its ACK.
          if (!receiver || receiverRef.current !== receiver || receiver.revision !== revision) return

          receiver.receive({ state: response.data.state })
        }
      )
    }

    requestState()
    socket.on('connect', requestState)

    return () => {
      disposed = true
      requestedRef.current = false
      retryCountRef.current = 0
      socket.off('connect', requestState)
      requestSerial++
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
    }
  }, [
    socket,
    roomId,
    isHostRef,
    receiverRef,
  ])
}
