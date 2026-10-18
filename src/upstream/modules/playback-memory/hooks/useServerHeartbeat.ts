import { useEffect, useRef } from 'react'
import type { RefObject, MutableRefObject } from 'react'
import { useSocket } from '@/hooks/useSocket'
import { useRoomStore } from '@/store/roomStore'
import { message } from '@/components/ui/message'
import { SOCKET_EVENT, CHECK_STATUS_INTERVAL_MS } from '@/modules/sync-playback/constants'
import type { WatchTogetherState, SyncHeartbeatPayload } from '@/modules/sync-playback/types'
import { executeSeek, getAdaptiveSeekThreshold, shouldSoftSync } from '@/modules/sync-playback/services'
import type { SeekToResult } from '@/modules/sync-playback/services'
import { safePlay } from '@/modules/sync-playback/safePlay'
import { createAckGuard } from '@/modules/sync-playback/ackGuard'
import { isBilibiliUrlExpired } from '../services/url-expiry'
import type { CheckStatusAckData } from '../types'

export interface UseServerHeartbeatOptions {
  roomId: string
  isHostRef: MutableRefObject<boolean>
  videoRef: RefObject<HTMLVideoElement>
  suppressEventsRef: MutableRefObject<boolean>
  setWatchTogether: (state: WatchTogetherState) => void
  watchTogether: WatchTogetherState
  seekTo: (video: HTMLVideoElement, time: number) => Promise<SeekToResult>
  reloadVideo: (video: HTMLVideoElement) => Promise<void>
}
export type UseServerHeartbeatReturn = void

/** A single correction path: v4.5.9 server authority, bounded v4.5.3 host fallback. */
export function useServerHeartbeat(options: UseServerHeartbeatOptions): void {
  const { socket } = useSocket()
  const latest = useRef(options)
  latest.current = options
  const { roomId, isHostRef, watchTogether } = options
  useEffect(() => {
    if (!socket || isHostRef.current) return
    let disposed = false
    let serverAuthority = false
    let disconnectedUntil = 0
    let catchUp = false
    const lock = { current: false }
    let baseRate = 1
    const identity = () => `${useRoomStore.getState().currentMovieId}|${useRoomStore.getState().watchTogether.sourceUrl}`
    let media = identity()
    let stall = { time: -1, advancedAt: Date.now(), reloadedAt: 0 }
    const guard = createAckGuard(identity)
    const online = (value?: boolean) => {
      if (typeof value !== 'boolean') return
      // v4.5.9 caches hostOnline for 5s. A fresh disconnect outranks that cached true.
      if (value && Date.now() < disconnectedUntil) return
      const store = useRoomStore.getState()
      if (store.hostOffline === value && !value) message.info('房主已离开，您可以自主控制播放')
      store.setHostOffline(!value)
      if (!value) {
        guard.cancel()
        const video = latest.current.videoRef.current
        if (catchUp && video) video.playbackRate = baseRate
        catchUp = false
      }
    }
    const apply = (state: WatchTogetherState) => {
      const o = latest.current
      const video = o.videoRef.current
      const store = useRoomStore.getState()
      if (disposed || isHostRef.current || store.hostOffline || o.suppressEventsRef.current || !video || !video.currentSrc) return
      // Source attachment belongs to the state channel; never resurrect a delayed old source.
      if (state.sourceUrl !== store.watchTogether.sourceUrl) return
      if (!Number.isFinite(state.currentTime) || state.currentTime < 0) return
      if (media !== identity()) {
        media = identity(); guard.cancel(); catchUp = false
        stall = { time: -1, advancedAt: Date.now(), reloadedAt: 0 }
      }
      if (!state.bufferMode && isBilibiliUrlExpired(state.sourceUrl)) return
      baseRate = state.playbackRate > 0 ? state.playbackRate : 1
      o.suppressEventsRef.current = true
      try {
        if (state.isPlaying && video.paused) void safePlay(video)
        else if (!state.isPlaying && !video.paused) video.pause()
        const delta = state.currentTime - video.currentTime
        if (Math.abs(delta) <= getAdaptiveSeekThreshold(baseRate)) {
          catchUp = false; video.playbackRate = baseRate
        } else if (state.isPlaying && shouldSoftSync(video.currentTime, state.currentTime, baseRate)) {
          catchUp = true
          // Ahead viewers slow down; behind viewers speed up.
          video.playbackRate = Math.max(0.1, baseRate * (delta > 0 ? 1.05 : 0.95))
        } else if (!lock.current && !video.seeking) {
          catchUp = false; video.playbackRate = baseRate
          const session = identity()
          void executeSeek({ video, targetTime: state.currentTime, state,
            seekTo: (v, t) => !disposed && identity() === session ? latest.current.seekTo(v, t) : Promise.resolve({ success: false }),
            suppressEventsRef: o.suppressEventsRef, isReloadingRef: lock,
            onSeekFailed: async v => { if (!disposed && identity() === session) await latest.current.reloadVideo(v) },
          }).then(done => {
            if (!done && !disposed && session === identity() && video === latest.current.videoRef.current) video.currentTime = state.currentTime
          }).catch(() => {})
        }
      } finally { o.suppressEventsRef.current = false }
      const now = Date.now()
      if (!state.isPlaying || video.seeking || lock.current || Math.abs(video.currentTime - stall.time) > 0.05) {
        stall.time = video.currentTime; stall.advancedAt = now
      } else if (now - stall.advancedAt > 15000 && now - stall.reloadedAt > 30000) {
        stall.advancedAt = now; stall.reloadedAt = now
        void o.reloadVideo(video).catch(() => {})
      }
    }
    const heartbeat = (payload: SyncHeartbeatPayload) => {
      if (payload.roomId && payload.roomId !== roomId) return
      if (payload.source === 'server' && payload.state) {
        if (typeof payload.hostOnline === 'boolean') serverAuthority = true
        // Apply online status before any suppression or autonomous-mode early return.
        online(payload.hostOnline)
        apply(payload.state)
      } else if (payload.source === 'host') {
        disconnectedUntil = 0
        online(true)
        if (serverAuthority || payload.suppressed) return
        apply({ ...useRoomStore.getState().watchTogether, currentTime: payload.currentTime ?? 0,
          isPlaying: !!payload.isPlaying, playbackRate: payload.playbackRate ?? 1 })
      }
    }
    const offline = () => { disconnectedUntil = Date.now() + 6000; online(false) }
    const ready = () => { disconnectedUntil = 0; online(true) }
    const reconnect = () => { serverAuthority = false; guard.cancel() }
    socket.on(SOCKET_EVENT.SYNC_HEARTBEAT, heartbeat)
    socket.on(SOCKET_EVENT.HOST_DISCONNECTED, offline)
    socket.on('sharer-ready', ready)
    socket.on('connect', reconnect)
    const timer = setInterval(() => {
      const { videoRef, suppressEventsRef } = latest.current
      const video = videoRef.current
      if (!video?.currentSrc || video.readyState < 1 || video.seeking || lock.current || suppressEventsRef.current || useRoomStore.getState().hostOffline) return
      const ack = guard.begin<{success: boolean; data?: CheckStatusAckData}>(res => {
        if (res?.success && res.data?.needsSync && res.data.state) apply(res.data.state)
      })
      if (ack) socket.emit(SOCKET_EVENT.CHECK_STATUS, { roomId, currentTime: video.currentTime,
        isPlaying: !video.paused, playbackRate: baseRate, clientTs: Date.now() }, ack)
    }, CHECK_STATUS_INTERVAL_MS)
    return () => {
      disposed = true; guard.dispose(); clearInterval(timer)
      socket.off(SOCKET_EVENT.SYNC_HEARTBEAT, heartbeat)
      socket.off(SOCKET_EVENT.HOST_DISCONNECTED, offline)
      socket.off('sharer-ready', ready); socket.off('connect', reconnect)
      const video = latest.current.videoRef.current
      if (catchUp && video) video.playbackRate = baseRate
    }
  }, [socket, roomId, isHostRef, watchTogether.sourceUrl])
}
