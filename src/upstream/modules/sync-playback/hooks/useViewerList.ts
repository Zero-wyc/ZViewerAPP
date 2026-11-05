import { useEffect } from 'react'
import { useSocket } from '@/hooks/useSocket'
import { useRoomStore, type Viewer } from '@/store/roomStore'
import { useAuthStore } from '@/store/authStore'
import { message } from '@/components/ui/message'
import type { ViewerJoinedPayload, ViewerLeftPayload } from '../types'
import { SOCKET_EVENT } from '../constants'

export type UseViewerListOptions = Record<string, never>

export type UseViewerListReturn = void

/**
 * 观众在线列表同步 Hook：房主与观众均监听 `viewer-joined` / `viewer-left` 事件，
 * 更新 useRoomStore.viewers 以驱动房主端 RoomInfoPanel 的在线观众列表。
 *
 * 后端在观众加入/离开房间时广播这两个事件（详见 routes/room.ts）。
 */
export function useViewerList(roomId?: string): UseViewerListReturn {
  const { socket } = useSocket()

  useEffect(() => {
    if (!socket || !roomId) return
    let active = true
    let requestPending = false
    let revision = 0
    interface MembersSnapshot {
      roomId: string
      viewers: Viewer[]
      moderators: number[]
      mutedViewerIds: number[]
    }
    const applySnapshot = (payload: MembersSnapshot) => {
      if (!active || payload?.roomId !== roomId || !Array.isArray(payload.viewers) ||
        !Array.isArray(payload.moderators) || !Array.isArray(payload.mutedViewerIds)) return
      useRoomStore.setState({
        viewers: payload.viewers,
        moderators: payload.moderators,
        mutedViewerIds: payload.mutedViewerIds,
      })
    }
    const requestSnapshot = () => {
      if (!active || !socket.connected || requestPending) return
      requestPending = true
      const socketId = socket.id
      const requestRevision = revision
      socket.timeout(5000).emit('get-room-members', { roomId },
        (error: Error | null, response?: { success: boolean; data?: MembersSnapshot }) => {
          if (!active || socket.id !== socketId) return
          requestPending = false
          if (error || requestRevision !== revision || !response?.success || !response.data) return
          applySnapshot(response.data)
        })
    }

    const handleViewerJoined = (payload: ViewerJoinedPayload) => {
      if (!payload?.viewerSocketId) return
      revision++
      useRoomStore.getState().addViewer({
        socketId: payload.viewerSocketId,
        userId: payload.userId,
        username: payload.username,
        role: payload.role,
      })
    }
    const handleViewerLeft = (payload: ViewerLeftPayload) => {
      if (!payload?.viewerSocketId) return
      revision++
      useRoomStore.getState().removeViewer(payload.viewerSocketId)
    }
    const handleMembers = (payload: MembersSnapshot) => {
      if (payload?.roomId !== roomId) return
      revision++
      applySnapshot(payload)
    }
    const handleModerators = (payload: { roomId: string; moderators: number[] }) => {
      if (payload?.roomId !== roomId || !Array.isArray(payload.moderators)) return
      revision++
      const store = useRoomStore.getState()
      const userId = Number(useAuthStore.getState().user?.id)
      const previous = store.moderators.includes(userId)
      store.setModerators(payload.moderators)
      if (previous !== payload.moderators.includes(userId)) {
        if (previous) message.info('您的房管权限已被撤销')
        else message.success('您已被任命为房管')
      }
    }
    const handleMuted = (payload: { userId: number; muted: boolean }) => {
      if (typeof payload?.userId !== 'number') return
      revision++
      const store = useRoomStore.getState()
      if (payload.muted) store.addMutedViewer(payload.userId)
      else store.removeMutedViewer(payload.userId)
      if (String(payload.userId) === String(useAuthStore.getState().user?.id)) {
        if (payload.muted) message.warning('您已被房主禁言')
        else message.success('您已被解除禁言')
      }
    }
    const onConnect = () => {
      revision++
      requestPending = false
      requestSnapshot()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') requestSnapshot()
    }

    socket.on(SOCKET_EVENT.VIEWER_JOINED, handleViewerJoined)
    socket.on(SOCKET_EVENT.VIEWER_LEFT, handleViewerLeft)
    socket.on('room-members', handleMembers)
    socket.on('moderators-changed', handleModerators)
    socket.on('viewer-muted', handleMuted)
    socket.on('connect', onConnect)
    socket.on('join-approved', requestSnapshot)
    document.addEventListener('visibilitychange', onVisibility)
    const timer = setInterval(requestSnapshot, 30_000)
    requestSnapshot()

    return () => {
      active = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      socket.off(SOCKET_EVENT.VIEWER_JOINED, handleViewerJoined)
      socket.off(SOCKET_EVENT.VIEWER_LEFT, handleViewerLeft)
      socket.off('room-members', handleMembers)
      socket.off('moderators-changed', handleModerators)
      socket.off('viewer-muted', handleMuted)
      socket.off('connect', onConnect)
      socket.off('join-approved', requestSnapshot)
    }
  }, [socket, roomId])
}
