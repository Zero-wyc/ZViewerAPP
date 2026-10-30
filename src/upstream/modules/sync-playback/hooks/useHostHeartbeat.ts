import { useEffect, useRef } from 'react'
import type { RefObject, MutableRefObject } from 'react'
import { useSocket } from '@/hooks/useSocket'
import { useRoomStore } from '@/store/roomStore'
import type { HeartbeatPayload } from '../types'
import { SOCKET_EVENT, HEARTBEAT_INTERVAL_MS } from '../constants'
import { buildStateFromVideo } from '../services'
import { wasUserPaused } from '@/modules/player/services/pause-intent'

export interface HostPlaybackSnapshot extends HeartbeatPayload {
  key: string
  duration?: number
  clientTs: number
  userPaused: boolean
  storeState: ReturnType<typeof useRoomStore.getState>['watchTogether']
}

/** Heartbeats and full-state requests share the same frozen recovery clock. */
export function readHostPlaybackSnapshot(
  video: HTMLVideoElement | null,
  suppressed: boolean,
  stableRef: MutableRefObject<HostPlaybackSnapshot | null>
): HeartbeatPayload {
  const store = useRoomStore.getState()
  const state = store.watchTogether
  const key = `${store.roomId}|${store.roomSessionRevision}|${store.currentMovieId}|${state.cid}|${state.isPreview ? state.sourceUrl : state.sourceType === 'bilibili' ? '' : state.sourceUrl}`
  const now = Date.now()
  const userPaused = !!video && wasUserPaused(video)
  let stable = stableRef.current
  if (!suppressed || !stable || stable.key !== key || stable.storeState !== state) {
    const built = buildStateFromVideo(suppressed ? null : video, state)
    stable = {
      key,
      clientTs: now,
      currentTime: Number.isFinite(built.currentTime) ? Math.max(0, built.currentTime) : 0,
      isPlaying: built.isPlaying && !userPaused,
      playbackRate: Number.isFinite(built.playbackRate) && built.playbackRate > 0 ? built.playbackRate : 1,
      duration: built.duration,
      userPaused,
      storeState: state,
    }
  }
  const projectedTime = (sample: HostPlaybackSnapshot) => {
    const time = sample.currentTime + (sample.isPlaying ? Math.max(0, now - sample.clientTs) / 1000 * sample.playbackRate : 0)
    return sample.duration && sample.duration > 0 ? Math.min(time, sample.duration) : time
  }
  if (suppressed && stable.userPaused !== userPaused) {
    stable = { ...stable, currentTime: projectedTime(stable), clientTs: now, userPaused, isPlaying: !userPaused }
  }
  stableRef.current = stable
  return {
    clientTs: now,
    currentTime: suppressed ? projectedTime(stable) : stable.currentTime,
    isPlaying: stable.isPlaying,
    playbackRate: stable.playbackRate,
  }
}

export interface UseHostHeartbeatOptions {
  roomId: string
  isHostRef: MutableRefObject<boolean>
  videoRef: RefObject<HTMLVideoElement>
  /** Source changes retain liveness without publishing temporary media state. */
  suppressEventsRef: MutableRefObject<boolean>
  stablePlaybackRef?: MutableRefObject<HostPlaybackSnapshot | null>
}

export type UseHostHeartbeatReturn = void

/**
 * 房主心跳广播 Hook：每 `HEARTBEAT_INTERVAL_MS` 向房间广播一次
 * `host-heartbeat` 事件，携带当前播放进度与播放状态。
 *
 * v3 重构：
 * - suppress 期间按最近稳定状态发送存活心跳，不读取换源中 video 的零进度/暂停状态
 * - 心跳为轻量事件（仅 currentTime + isPlaying），观众端据此校正进度漂移
 *
 * 观众端通过 useViewerHeartbeat（在 useViewerSync 中组合）监听该事件：
 * - 重置"房主离线"计时器
 * - 进度差异 > SEEK_FOLLOW_THRESHOLD（3s）时 seek 到房主进度
 * - 小差异不操作，让视频自然播放
 *
 * **修复说明**：旧实现前端 emit `host-heartbeat` 但后端无转发 handler，
 * 导致观众端永远收不到心跳，6s 后必然误报"房主已离线"。
 * 新增后端 handler 后该功能恢复正常。
 */
export function useHostHeartbeat({
  roomId,
  isHostRef,
  videoRef,
  suppressEventsRef,
  stablePlaybackRef,
}: UseHostHeartbeatOptions): UseHostHeartbeatReturn {
  const { socket } = useSocket()
  const localStableRef = useRef<HostPlaybackSnapshot | null>(null)
  const stableRef = stablePlaybackRef ?? localStableRef

  useEffect(() => {
    if (!socket) return
    const captureStable = () => {
      if (isHostRef.current) readHostPlaybackSnapshot(videoRef.current, suppressEventsRef.current, stableRef)
    }
    captureStable()
    const video = videoRef.current
    const events = ['timeupdate', 'play', 'pause', 'seeked', 'ratechange']
    events.forEach(event => video?.addEventListener(event, captureStable))

    const intervalId = setInterval(() => {
      if (!isHostRef.current || useRoomStore.getState().roomId !== roomId) return
      const suppressed = suppressEventsRef.current
      const payload = readHostPlaybackSnapshot(videoRef.current, suppressed, stableRef)
      socket.emit(SOCKET_EVENT.HOST_HEARTBEAT, { roomId, ...payload, ...(suppressed ? { suppressed: true } : {}) })
    }, HEARTBEAT_INTERVAL_MS)

    return () => {
      clearInterval(intervalId)
      events.forEach(event => video?.removeEventListener(event, captureStable))
    }
  }, [socket, roomId, videoRef, isHostRef, suppressEventsRef, stableRef])
}
