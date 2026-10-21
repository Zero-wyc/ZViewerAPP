/**
 * useViewerSync Hook
 *
 * 观众侧同步编排 Hook：组合所有观众需要的同步子 hook，提供统一入口。
 *
 * 组合的子 hook：
 * - useViewerStateSync: 接收房主 state/control 事件（源信息 + 即时操作事件通道）
 * - usePlaybackStateRequest: 从服务器请求初始状态（ack 直返，房主离线时也能获取）
 * - useServerHeartbeat: 订阅服务器心跳（Step 2：观众进度的唯一权威路径）
 *
 * 服务器权威化架构（Step 2）：
 * - 服务器每 2s 恒定广播 sync-heartbeat(source='server')，房主在线/离线同一条进度路径
 * - 观众进度校正（软同步追赶 / 硬 seek）统一由 useServerHeartbeat 处理
 * - 房主侧 state/control 仅承载源信息与 play/pause/seek/rate 即时操作
 * - 房主离线时观众进入自主控制模式（不应用服务器心跳），URL 过期由 video error 兜底
 *
 * 广播、请求 ACK 与网页预览共用 useViewerStateSync 的串行状态接收器。
 * 只在 attach 成功后记录源与策略，避免同 URL 的策略变化被跳过。
 *
 * 调用方（useWatchTogether）只需调用一次 useViewerSync 即可启用所有观众同步逻辑。
 *
 * 该 hook 无返回值：观众端不需要主动调用同步 API，所有逻辑通过副作用执行。
 */
import type { RefObject, MutableRefObject } from 'react'
import type { WatchTogetherState, ViewerStateReceiver } from '../types'
import type { SeekToResult } from '../services'
import { useViewerStateSync } from './useViewerStateSync'
import {
  useServerHeartbeat,
  usePlaybackStateRequest,
} from '@/modules/playback-memory'

export interface UseViewerSyncOptions {
  roomId: string
  isHostRef: MutableRefObject<boolean>
  videoRef: RefObject<HTMLVideoElement>
  suppressEventsRef: MutableRefObject<boolean>
  setWatchTogether: (state: WatchTogetherState) => void
  applySourceToVideo: (
    video: HTMLVideoElement,
    state: WatchTogetherState,
    startTime?: number,
    blobs?: { videoBlob: Blob; audioBlob: Blob }
  ) => Promise<void>
  /** 当前播放状态（用于服务器心跳的 URL 过期检测） */
  watchTogether: WatchTogetherState
  /** seek 到目标时间（MSE 流不重建 MediaSource，由 useVideoSource 提供） */
  seekTo: (video: HTMLVideoElement, targetTime: number) => Promise<SeekToResult>
  /** MSE seek 失败时调用（如 video.error），用 forceReload 重新加载 */
  reloadVideo: (video: HTMLVideoElement) => Promise<void>
}

export type UseViewerSyncReturn = MutableRefObject<ViewerStateReceiver | null>

export function useViewerSync({
  roomId,
  isHostRef,
  videoRef,
  suppressEventsRef,
  setWatchTogether,
  applySourceToVideo,
  watchTogether,
  seekTo,
  reloadVideo,
}: UseViewerSyncOptions): UseViewerSyncReturn {
  // 1. 接收房主实时状态（源信息 + 即时操作事件通道）
  const receiverRef = useViewerStateSync({
    roomId,
    isHostRef,
    videoRef,
    suppressEventsRef,
    setWatchTogether,
    applySourceToVideo,
    seekTo,
    reloadVideo,
  })

  // 2. 从服务器请求初始状态（加入房间时，ack 直返）
  usePlaybackStateRequest({ roomId, isHostRef, receiverRef })

  // 3. 订阅服务器心跳（Step 2：观众进度的唯一权威路径，两阶段自适应校正）
  useServerHeartbeat({
    roomId,
    isHostRef,
    videoRef,
    suppressEventsRef,
    setWatchTogether,
    watchTogether,
    seekTo,
    reloadVideo,
  })
  return receiverRef
}
