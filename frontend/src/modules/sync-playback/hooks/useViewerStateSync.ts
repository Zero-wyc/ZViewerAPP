import { useEffect, useRef } from 'react'
import type { RefObject, MutableRefObject } from 'react'
import { useSocket } from '@/hooks/useSocket'
import { message } from '@/components/ui/message'
import { useRoomStore } from '@/store/roomStore'
import type {
  WatchTogetherState,
  StatePayload,
  ControlPayload,
  SyncHeartbeatPayload,
} from '../types'
import { SOCKET_EVENT } from '../constants'
import { safePlay } from '../safePlay'
import {
  executeSeek,
  mergeStateDiff,
  shouldSoftSync,
  getCatchUpRate,
  getAdaptiveSeekThreshold,
} from '../services'
import type { SeekToResult } from '../services'
import {
  fetchBlobsForBufferMode,
  DownloadError,
  UrlExpiredError,
  DownloadAbortedError,
} from '@/modules/player/services/buffer-mode'

export interface UseViewerStateSyncOptions {
  roomId: string
  isHostRef: MutableRefObject<boolean>
  videoRef: RefObject<HTMLVideoElement | null>
  suppressEventsRef: MutableRefObject<boolean>
  setWatchTogether: (state: WatchTogetherState) => void
  applySourceToVideo: (
    video: HTMLVideoElement,
    state: WatchTogetherState,
    startTime?: number,
    blobs?: { videoBlob: Blob; audioBlob: Blob }
  ) => Promise<void>
  /** seek 到目标时间（MSE 流不重建 MediaSource，由 useVideoSource 提供） */
  seekTo: (video: HTMLVideoElement, targetTime: number) => Promise<SeekToResult>
  /** MSE seek 失败时调用（如 video.error），用 forceReload 重新加载 */
  reloadVideo: (video: HTMLVideoElement) => Promise<void>
  /**
   * 已应用 sourceUrl 的共享 ref（由 useViewerSync 提升，与 usePlaybackStateRequest 共享）。
   * 观众首次加入时 usePlaybackStateRequest 完成 attach 后会写入此 ref，
   * 避免后续 useViewerStateSync 收到同 sourceUrl 的 state 时误判为 source 变化，
   * 重复触发 applySourceToVideo 覆盖已缓冲的 blob 源。
   */
  lastAppliedSourceUrlRef: MutableRefObject<string | null>
}

export type UseViewerStateSyncReturn = void

/**
 * 观众状态同步 Hook：接收房主的 `watch-together-state` 与 `watch-together-control` 事件，
 * 并应用到本地 video 元素。
 *
 * v3 重构（解决观众端频繁卡顿）：
 *
 * 1. **分离字段同步**：
 *    旧实现每次收到 state 都执行 applySourceToVideo + currentTime 设置 + play/pause，
 *    即使 sourceUrl / isPlaying / playbackRate 都没变也会强制设置 currentTime，
 *    导致视频每 500ms 被打断一次。
 *    新实现按字段变化类型决定操作：
 *    - sourceUrl 变化 → applySourceToVideo（含完整同步）
 *    - isPlaying 变化 → play/pause
 *    - playbackRate 变化 → 设置 playbackRate
 *    - currentTime 不再单独设置（由 host-heartbeat 校正）
 *
 * 2. **串行化 applySourceToVideo（Bug #8 修复）**：
 *    sourceUrl 变化时用 isApplyingRef 锁 + pendingStateRef 缓存最新 state，串行处理。
 *
 * 3. **进度校正由 host-heartbeat 驱动**：
 *    收到 state 时不再设置 currentTime，进度校正完全由 useViewerHeartbeat 处理
 *    （差异 > SEEK_FOLLOW_THRESHOLD=3s 才 seek，小差异让视频自然播放）。
 *
 * 4. **seek 到未缓冲区域的 MSE seek**：
 *    观众端跟随房主 seek 时（通过 control 事件），若目标位置不在缓冲范围内且为 MSE 流，
 *    调用 executeSeek → MsePlayer.seekTo（不重建 MediaSource）。用 isReloadingRef 锁防止并发。
 */
export function useViewerStateSync({
  roomId,
  isHostRef,
  videoRef,
  suppressEventsRef,
  setWatchTogether,
  applySourceToVideo,
  seekTo,
  reloadVideo,
  lastAppliedSourceUrlRef,
}: UseViewerStateSyncOptions): UseViewerStateSyncReturn {
  const { socket } = useSocket()

  // Bug #8 修复：handleState 串行化处理
  const isApplyingRef = useRef(false)
  const pendingStateRef = useRef<WatchTogetherState | null>(null)
  // seek 并发锁：防止 executeSeek 期间重复触发
  const isReloadingRef = useRef(false)
  // 缓存上次应用的 isPlaying，用于判断是否需要 play/pause
  const lastAppliedIsPlayingRef = useRef<boolean | null>(null)
  // 缓存上次应用的 playbackRate，用于判断是否需要设置 playbackRate
  const lastAppliedPlaybackRateRef = useRef<number | null>(null)
  // 缓冲模式：下载取消器，新 source 到来时取消未完成下载避免竞态
  const downloadAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!socket || isHostRef.current) return

    /**
     * 应用状态变化：按字段分离同步，避免不必要的操作导致视频卡顿。
     *
     * @param state 房主广播的完整状态
     * @param isSourceChange 是否为 sourceUrl 变化触发的调用（需要 applySourceToVideo）
     */
    const applyStateChanges = async (
      state: WatchTogetherState,
      isSourceChange: boolean
    ) => {
      const video = videoRef.current
      if (!video) return

      // 1. sourceUrl 变化 → applySourceToVideo（含完整同步）
      if (isSourceChange) {
        // 缓冲模式：先下载完整 m4s 到 IndexedDB，再用 blob URL 播放
        // 避免播放过程中 B站 URL 过期或网络波动导致卡顿
        let blobs: { videoBlob: Blob; audioBlob: Blob } | undefined
        if (state.bufferMode) {
          // 取消上一个未完成的下载（切换影片时常见竞态）
          if (downloadAbortRef.current) {
            downloadAbortRef.current.abort()
          }
          const controller = new AbortController()
          downloadAbortRef.current = controller

          const setBufferProgress = useRoomStore.getState().setBufferProgress
          setBufferProgress({
            downloaded: 0,
            total: 1,
            title: state.previewTitle || '当前视频',
          })

          try {
            const result = await fetchBlobsForBufferMode({
              state,
              title: state.previewTitle,
              onProgress: (p) => setBufferProgress(p),
              signal: controller.signal,
            })
            blobs = { videoBlob: result.videoBlob, audioBlob: result.audioBlob }
          } catch (err) {
            if (err instanceof DownloadAbortedError) {
              console.log('[useViewerStateSync] 缓冲下载已取消')
            } else if (err instanceof UrlExpiredError) {
              message.error('B站 URL 已过期，请等待房主重新解析')
            } else if (err instanceof DownloadError) {
              message.error(`缓冲下载失败: ${err.message}`)
            } else {
              console.error('[useViewerStateSync] 缓冲下载失败:', err)
              message.error('缓冲下载失败，请等待房主重新广播')
            }
            // 缓冲失败：不应用源（避免半成品导致黑屏），等待房主重新广播
            // 但需要释放 suppressEventsRef 与 isApplyingRef，否则后续事件被吞
            setBufferProgress(null)
            downloadAbortRef.current = null
            // 标记 sourceUrl 已处理（避免下次同 source 再触发），等房主重新广播
            lastAppliedSourceUrlRef.current = state.sourceUrl
            return
          } finally {
            if (downloadAbortRef.current === controller) {
              downloadAbortRef.current = null
            }
          }
          // 下载完成，清空进度覆盖层
          useRoomStore.getState().setBufferProgress(null)
        }

        await applySourceToVideo(video, state, undefined, blobs)
        // applySourceToVideo 后视频元素可能已替换，重新获取
        const currentVideo = videoRef.current
        if (!currentVideo) return

        // 源变化时完整同步所有字段
        if (state.currentTime > 0) {
          try {
            currentVideo.currentTime = state.currentTime
          } catch {
            // ignore
          }
        }
        if (
          state.playbackRate > 0 &&
          currentVideo.playbackRate !== state.playbackRate
        ) {
          currentVideo.playbackRate = state.playbackRate
        }
        if (state.isPlaying && currentVideo.paused) {
          void safePlay(currentVideo)
        } else if (!state.isPlaying && !currentVideo.paused) {
          currentVideo.pause()
        }

        // 更新缓存
        lastAppliedSourceUrlRef.current = state.sourceUrl
        lastAppliedIsPlayingRef.current = state.isPlaying
        if (state.playbackRate > 0) {
          lastAppliedPlaybackRateRef.current = state.playbackRate
        }
        return
      }

      // 2. 非 sourceUrl 变化：按字段分离同步
      // 2.1 isPlaying 变化 → play/pause
      if (lastAppliedIsPlayingRef.current !== state.isPlaying) {
        if (state.isPlaying && video.paused) {
          void safePlay(video)
        } else if (!state.isPlaying && !video.paused) {
          video.pause()
        }
        lastAppliedIsPlayingRef.current = state.isPlaying
      }

      // 2.2 playbackRate 变化 → 设置 playbackRate
      if (
        lastAppliedPlaybackRateRef.current === null ||
        Math.abs(
          (lastAppliedPlaybackRateRef.current as number) - state.playbackRate
        ) > 0.01
      ) {
        if (state.playbackRate > 0) {
          if (video.playbackRate !== state.playbackRate) {
            video.playbackRate = state.playbackRate
          }
          lastAppliedPlaybackRateRef.current = state.playbackRate
        }
      }

      // 2.3 currentTime 不再单独设置（由 host-heartbeat 校正）
      // 进度校正由 useViewerHeartbeat 处理，避免高频 seek 卡顿
    }

    const handleState = (payload: StatePayload) => {
      // P1-Opt#7：增量状态合并——优先使用 diff 合并到现有 state，避免全量替换
      const state = payload.diff
        ? mergeStateDiff(
            useRoomStore.getState().watchTogether,
            payload.diff as Partial<WatchTogetherState>
          )
        : payload.state
      suppressEventsRef.current = true
      setWatchTogether(state)

      // 判断是否为 sourceUrl 变化
      const isSourceChange = lastAppliedSourceUrlRef.current !== state.sourceUrl

      // 串行化 applySourceToVideo：若上一次 apply 还在进行中，
      // 仅缓存最新 state，等上一次完成后处理最新值。
      if (isSourceChange) {
        pendingStateRef.current = state
        if (isApplyingRef.current) return
      }

      const processState = async (s: WatchTogetherState) => {
        isApplyingRef.current = true
        try {
          await applyStateChanges(s, isSourceChange)
        } catch (err: unknown) {
          console.error('[useViewerStateSync] applyStateChanges failed:', err)
          message.error(err instanceof Error ? err.message : '视频源加载失败')
        } finally {
          isApplyingRef.current = false
        }
      }

      const drain = async () => {
        // 持续消费 pendingStateRef，直到清空
        while (pendingStateRef.current) {
          const next = pendingStateRef.current
          pendingStateRef.current = null
          await processState(next)
        }
        suppressEventsRef.current = false
      }

      if (isSourceChange) {
        void drain()
      } else {
        // 非 sourceUrl 变化：直接同步，不需要串行化
        void processState(state).then(() => {
          suppressEventsRef.current = false
        })
      }
    }

    const handleControl = (payload: ControlPayload) => {
      const video = videoRef.current
      if (!video) return

      // seek 到未缓冲区域：交给 executeSeek 处理（内部管理锁 + suppressEventsRef）
      if (payload.action === 'seek' && typeof payload.value === 'number') {
        const targetTime = payload.value
        const state = useRoomStore.getState().watchTogether
        void executeSeek({
          video,
          targetTime,
          state,
          seekTo,
          suppressEventsRef,
          isReloadingRef,
          onSeekFailed: reloadVideo,
        }).then((didSeek) => {
          // 未触发 MSE seek 时执行普通 seek
          if (!didSeek) {
            suppressEventsRef.current = true
            video.currentTime = targetTime
            suppressEventsRef.current = false
          }
        })
        return
      }

      // 普通控制：使用 suppressEventsRef 包围，防止本地事件回环
      suppressEventsRef.current = true
      switch (payload.action) {
        case 'play':
          void safePlay(video)
          lastAppliedIsPlayingRef.current = true
          break
        case 'pause':
          video.pause()
          lastAppliedIsPlayingRef.current = false
          break
        case 'rate':
          if (typeof payload.value === 'number' && payload.value > 0) {
            video.playbackRate = payload.value
            lastAppliedPlaybackRateRef.current = payload.value
          }
          break
      }
      suppressEventsRef.current = false
    }

    socket.on(SOCKET_EVENT.STATE, handleState)
    socket.on(SOCKET_EVENT.CONTROL, handleControl)

    // 初始状态请求由 usePlaybackStateRequest 通过 ack 直接获取（不在此处重复 emit）

    return () => {
      socket.off(SOCKET_EVENT.STATE, handleState)
      socket.off(SOCKET_EVENT.CONTROL, handleControl)
    }
  }, [
    socket,
    roomId,
    videoRef,
    setWatchTogether,
    applySourceToVideo,
    seekTo,
    reloadVideo,
    suppressEventsRef,
    isHostRef,
    lastAppliedSourceUrlRef,
  ])
}

/**
 * 观众心跳订阅 Hook：监听房主的 `host-heartbeat` 事件，
 * 用于进度校正与房主离线检测。
 *
 * v3 新增：之前观众端未订阅 host-heartbeat，导致：
 * - 房主在线时观众端无法校正进度漂移
 * - 房主心跳超时检测失效（虽然有 server-heartbeat 兜底）
 *
 * 行为：
 * - 收到 host-heartbeat 时，重置房主离线计时器
 * - 进度差异 > SEEK_FOLLOW_THRESHOLD（3s）时 seek 到房主进度
 * - 小差异不操作，让视频自然播放
 * - isPlaying 变化时同步 play/pause
 */
export function useViewerHeartbeat({
  isHostRef,
  videoRef,
  suppressEventsRef,
}: {
  isHostRef: MutableRefObject<boolean>
  videoRef: RefObject<HTMLVideoElement | null>
  suppressEventsRef: MutableRefObject<boolean>
}): void {
  const { socket } = useSocket()
  // seek 并发锁
  const isReloadingRef = useRef(false)
  // 缓存上次应用的 isPlaying，用于判断是否需要 play/pause
  const lastAppliedIsPlayingRef = useRef<boolean | null>(null)

  // P2-Opt#9：软同步追赶状态
  const catchUpActiveRef = useRef(false)
  const catchUpBaseRateRef = useRef(1)

  useEffect(() => {
    if (!socket || isHostRef.current) return

    const handleHeartbeat = (payload: {
      currentTime: number
      isPlaying: boolean
      playbackRate?: number
      suppressed?: boolean
    }) => {
      const video = videoRef.current
      if (!video) return
      if (suppressEventsRef.current) return

      // suppressed 标记的心跳仅存活检测，不用于状态同步
      if (payload.suppressed) return

      // 从心跳提取 playbackRate（兼容旧版本缺失，缺省按 1x）
      const rate =
        typeof payload.playbackRate === 'number' && payload.playbackRate > 0
          ? payload.playbackRate
          : 1

      // isPlaying 变化时同步 play/pause
      if (lastAppliedIsPlayingRef.current !== payload.isPlaying) {
        suppressEventsRef.current = true
        if (payload.isPlaying && video.paused) {
          void safePlay(video)
        } else if (!payload.isPlaying && !video.paused) {
          video.pause()
        }
        lastAppliedIsPlayingRef.current = payload.isPlaying
        suppressEventsRef.current = false
      }

      // 进度校正：软同步 + 硬 seek 两阶段策略（P2-Opt#9）
      // 软同步区间：差异 > 阈值 但 ≤ HARD_SEEK_THRESHOLD_SEC → 调整 playbackRate 渐进追赶
      // 硬 seek 区间：差异 > HARD_SEEK_THRESHOLD_SEC → 直接跳转
      const diff = Math.abs(video.currentTime - payload.currentTime)
      const threshold = getAdaptiveSeekThreshold(rate)

      if (diff <= threshold) {
        // 差异已收敛 → 取消软同步，恢复基准倍速
        if (catchUpActiveRef.current) {
          catchUpActiveRef.current = false
          video.playbackRate = catchUpBaseRateRef.current
        }
      } else if (shouldSoftSync(video.currentTime, payload.currentTime, rate)) {
        // 软同步：小幅差异通过微调倍速追赶
        if (!catchUpActiveRef.current) {
          catchUpActiveRef.current = true
          catchUpBaseRateRef.current = video.playbackRate
        }
        const catchUpRate = getCatchUpRate(rate)
        if (video.playbackRate !== catchUpRate) {
          video.playbackRate = catchUpRate
        }
      } else {
        // 硬 seek：大幅差异（> HARD_SEEK_THRESHOLD_SEC）直接跳转
        if (catchUpActiveRef.current) {
          catchUpActiveRef.current = false
          video.playbackRate = catchUpBaseRateRef.current
        }
        const state = useRoomStore.getState().watchTogether
        const targetTime = payload.currentTime
        void executeSeek({
          video,
          targetTime,
          state,
          seekTo: async (_video, time) => {
            try {
              _video.currentTime = time
              return { success: true }
            } catch {
              return { success: false }
            }
          },
          suppressEventsRef,
          isReloadingRef,
        }).then((didSeek) => {
          if (!didSeek) {
            suppressEventsRef.current = true
            try {
              video.currentTime = targetTime
            } catch {
              // ignore
            }
            suppressEventsRef.current = false
          }
        })
      }
    }

    socket.on(SOCKET_EVENT.HOST_HEARTBEAT, handleHeartbeat)
    // 统一心跳协议（#14）：监听从房主发出的 sync-heartbeat（source='host'）
    const handleSyncHeartbeat = (payload: SyncHeartbeatPayload) => {
      if (
        payload.source === 'host' &&
        typeof payload.currentTime === 'number'
      ) {
        handleHeartbeat({
          currentTime: payload.currentTime,
          isPlaying: !!payload.isPlaying,
          playbackRate: payload.playbackRate,
          suppressed: payload.suppressed,
        })
      }
    }
    socket.on(SOCKET_EVENT.SYNC_HEARTBEAT, handleSyncHeartbeat)
    return () => {
      socket.off(SOCKET_EVENT.HOST_HEARTBEAT, handleHeartbeat)
      socket.off(SOCKET_EVENT.SYNC_HEARTBEAT, handleSyncHeartbeat)
    }
  }, [socket, isHostRef, videoRef, suppressEventsRef])
}
