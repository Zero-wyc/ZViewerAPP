import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react'
import type { Socket } from 'socket.io-client'
import { useRoomStore, type RoomMode } from '@/store/roomStore'
import { useDanmakuStore } from '@/store/danmakuStore'
import { dispatchRoomMediaTeardown } from '@/lib/mediaTeardown'
import type { WatchTogetherPanel } from '@/modules/room/watch-together/WatchTogetherPanel'

type Playback = ComponentProps<typeof WatchTogetherPanel>['initialPlayback']
type RoomData = {
  roomId?: string
  mode?: RoomMode
  name?: string
  isHost?: boolean
  shareMethod?: 'webrtc' | 'stream-push'
  streamKey?: string | null
  requireApproval?: boolean
  playback?: Playback
}
type Ack = { success: boolean; message?: string; code?: string; data?: RoomData }
export type JoinPhase = 'connecting' | 'password' | 'joining' | 'waiting' | 'ready' | 'error' | 'closed'

export function useMobileRoom(socket: Socket | null, roomId: string, options: { asHost?: boolean; hasPassword?: boolean; name?: string }) {
  const [phase, setPhase] = useState<JoinPhase>(options.hasPassword && !options.asHost ? 'password' : 'connecting')
  const [error, setError] = useState('')
  const [isHost, setIsHost] = useState(false)
  const [playback, setPlayback] = useState<Playback>(null)
  const password = useRef('')
  const host = useRef(Boolean(options.asHost))
  const attempted = useRef(!options.hasPassword || Boolean(options.asHost))
  const request = useRef<(asHost: boolean) => void>(() => {})
  const generation = useRef(0)
  const initial = useRef(options)

  useEffect(() => {
    const store = useRoomStore.getState()
    store.reset()
    store.setRoomId(roomId)
    store.setActiveRoomId(roomId)
    store.setRoomName(initial.current.name || roomId)
    useDanmakuStore.getState().setRoomId(roomId)
    return () => {
      generation.current++
      dispatchRoomMediaTeardown(true)
      // The server has no viewer-leave event; disconnect releases its session.
      socket?.disconnect()
      useRoomStore.getState().exitRoom()
      useDanmakuStore.getState().setRoomId(null)
    }
  }, [roomId, socket])

  useEffect(() => {
    if (!socket) return
    let disposed = false
    let retries = 0
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    const apply = (data: RoomData = {}) => {
      const store = useRoomStore.getState()
      if (data.mode) store.setMode(data.mode)
      if (data.name) store.setRoomName(data.name)
      if (data.shareMethod) store.setShareMethod(data.shareMethod)
      if (data.streamKey !== undefined) store.setStreamKey(data.streamKey)
      if (data.requireApproval !== undefined) store.setRoomSettings({ requireApproval: data.requireApproval })
    }
    const ready = (data: RoomData = {}) => {
      apply(data)
      setError('')
      setPhase('ready')
      retries = 0
      const danmaku = useDanmakuStore.getState()
      void danmaku.loadTracks(roomId)
      void danmaku.loadMeta(roomId)
    }
    const join = (asHost: boolean) => {
      if (!socket.connected || disposed) { setPhase('connecting'); return }
      const version = ++generation.current
      setError('')
      setPhase('joining')
      socket.timeout(12000).emit(asHost ? 'register-host' : 'request-join',
        { roomId, ...(!asHost ? { password: password.current } : {}) },
        (timeout: Error | null, ack?: Ack) => {
          if (disposed || version !== generation.current) return
          if (timeout || !ack) { setError('加入房间超时，请重试'); setPhase('error'); return }
          if (!ack.success) {
            if (ack.code === 'ALREADY_IN_ROOM' && retries++ < 3) {
              retryTimer = setTimeout(() => join(asHost), 1500)
              return
            }
            setError(ack.message || '无法加入房间')
            setPhase(ack.message?.includes('密码') ? 'password' : 'error')
            return
          }
          apply(ack.data)
          if (!asHost && ack.data?.isHost) {
            host.current = true
            join(true)
            return
          }
          if (asHost) {
            host.current = true
            setIsHost(true)
            setPlayback(ack.data?.playback ?? null)
            ready(ack.data)
          } else if (ack.message === '已加入房间') {
            ready(ack.data)
          } else {
            setPhase(current => current === 'ready' ? current : 'waiting')
          }
        })
    }
    request.current = join
    const connect = () => {
      if (attempted.current) join(host.current)
      else setPhase('password')
    }
    const disconnect = () => {
      generation.current++
      clearTimeout(retryTimer)
      dispatchRoomMediaTeardown(false)
      setPhase('connecting')
    }
    const approved = (data: RoomData) => {
      if (data.roomId !== roomId || host.current) return
      ready(data)
    }
    const rejected = (data: RoomData) => {
      if (data.roomId !== roomId) return
      generation.current++
      setError('房主拒绝了加入申请')
      setPhase('error')
    }
    const closed = (data: RoomData) => {
      if (data.roomId !== roomId) return
      generation.current++
      clearTimeout(retryTimer)
      dispatchRoomMediaTeardown(true)
      setPhase('closed')
      setError('房间已关闭')
    }
    const update = (data: RoomData) => {
      if (data.roomId && data.roomId !== roomId) return
      apply(data)
    }
    const kicked = (data: { reason?: string }) => {
      generation.current++
      clearTimeout(retryTimer)
      dispatchRoomMediaTeardown(true)
      setError(data.reason || '您已被移出房间')
      setPhase('closed')
    }
    const transferred = (data: { newHostSocketId: string; oldHostSocketId: string }) => {
      if (data.newHostSocketId === socket.id || data.oldHostSocketId === socket.id) {
        host.current = data.newHostSocketId === socket.id
        setIsHost(host.current)
        dispatchRoomMediaTeardown(true)
        join(host.current)
      }
    }
    socket.on('connect', connect)
    socket.on('disconnect', disconnect)
    socket.on('join-approved', approved)
    socket.on('join-rejected', rejected)
    socket.on('room-closed', closed)
    socket.on('room-mode-changed', update)
    socket.on('room-name-updated', update)
    socket.on('viewer-kicked', kicked)
    socket.on('host-transferred', transferred)
    socket.on('danmaku-tracks-updated', tracksUpdated)
    socket.on('danmaku-meta-updated', metaUpdated)
    function tracksUpdated(data: { roomId: string; tracks: Parameters<ReturnType<typeof useDanmakuStore.getState>['setTracks']>[0] }) {
      if (data.roomId === roomId) useDanmakuStore.getState().setTracks(data.tracks)
    }
    function metaUpdated(data: { roomId: string; meta: Parameters<ReturnType<typeof useDanmakuStore.getState>['setMeta']>[0] }) {
      if (data.roomId === roomId) useDanmakuStore.getState().setMeta(data.meta)
    }
    if (socket.connected) connect()
    else socket.connect()
    return () => {
      disposed = true
      generation.current++
      clearTimeout(retryTimer)
      socket.off('connect', connect)
      socket.off('disconnect', disconnect)
      socket.off('join-approved', approved)
      socket.off('join-rejected', rejected)
      socket.off('room-closed', closed)
      socket.off('room-mode-changed', update)
      socket.off('room-name-updated', update)
      socket.off('viewer-kicked', kicked)
      socket.off('host-transferred', transferred)
      socket.off('danmaku-tracks-updated', tracksUpdated)
      socket.off('danmaku-meta-updated', metaUpdated)
    }
  }, [socket, roomId])

  const join = useCallback((value?: string) => {
    if (value !== undefined) password.current = value
    attempted.current = true
    request.current(host.current)
  }, [])
  return { phase, error, isHost, playback, join }
}
