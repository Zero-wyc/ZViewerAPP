/**
 * MSE 引擎共享类型与常量（v2 重写）。
 *
 * 模块划分：
 * - player.ts     MsePlayer 门面（状态机 + 双轨编排：attach / seekTo / cleanup）
 * - track.ts      MediaTrack（单条流的完整生命周期：head → init → 流式下载 → seek 重载）
 * - processor.ts  appendPipeline（ReadableStream → SourceBuffer 的流式写入管线）
 * - downloader.ts HTTP Range 下载（重试 + 代理包装）
 * - parser.ts     MP4 头部解析（init segment / sidx / seek 偏移计算）
 */
import type { SidxInfo } from '../../services/mp4-parser'

// ── 常量 ──────────────────────────────────────────────

/** 流下载分块大小 512KB：达到该积累量即 flush 到 SourceBuffer（较小分块减少主线程压力） */
export const STREAM_CHUNK_SIZE = 512 * 1024
/**
 * 前瞻缓冲高水位 60s（1min）。
 *
 * 1080P 5Mbps 下 60s ≈ 37.5MB/轨，双轨 ≈ 75MB，远低于 Chrome SourceBuffer
 * 150MB 总上限。旧值 120s 在 1080P 下双轨即达 150MB，频繁触发
 * QuotaExceededError 导致连环 abort 与播放卡死。
 */
export const TARGET_BUFFER_AHEAD = 60
/** 缓冲恢复低水位 30s（0.5min），低于此值后恢复下载 */
export const RESUME_BUFFER_THRESHOLD = 30
/**
 * 前进 seek 容差（秒）。
 *
 * currentTime 距离 buffered.end 在该容差内时，认为是"小缺口前进 seek"，
 * waitForBufferDrain / processStream 应返回让 stream 继续下载填补缺口，
 * 而不是无限等待 MsePlayer.seekTo 接管。
 *
 * 与 sync-playback/services/seek-strategy.ts 的 FORWARD_BUFFER_TOLERANCE_SEC
 * 保持一致：executeSeek 对 gap ≤ 该值的 seek 走普通 seek，此处也必须配合返回。
 */
export const FORWARD_SEEK_TOLERANCE_SEC = 10
/** 头部下载大小 512KB，用于解析 init segment + sidx */
export const HEAD_SIZE = 512 * 1024
/** 扫描 moof 最大积累量 8MB，超限则放弃对齐直接 append */
export const MOOF_SCAN_LIMIT = 8 * 1024 * 1024
/** seek 首次 flush 最小字节数 256KB */
export const MIN_SEEK_FLUSH = 256 * 1024
/** seek 快速路径：先下载 256KB 找 moof，找到后立即 flush 减少首帧等待 */
export const SEEK_HEAD_SIZE = 256 * 1024
/**
 * seek 快速路径（有 sidx 时）：64KB 小块下载。
 * sidx 提供精确字节偏移，moof 在 range 起点附近，只需覆盖 moof 头 + mdat 首帧数据。
 * 相比 256KB 减少 4 倍下载量，显著缩短大跨度 seek 的首帧等待。
 */
export const SEEK_HEAD_SIZE_PRECISE = 64 * 1024
/** seek 首次 flush 上限 512KB，超过会延迟首帧 */
export const MAX_SEEK_FLUSH = 512 * 1024
/** fetch 最大重试次数 */
export const MAX_FETCH_RETRIES = 3
/** 首次数据就绪等待超时（attach 30s / seek 30s）。
 *  seek 超时从 15s 提升到 30s：1080P 大 fragment（2MB+）在代理链路下
 *  下载需更长时间，15s 易超时导致 needReload 循环。 */
export const INITIAL_APPEND_TIMEOUT_MS = 30000
export const SEEK_FLUSH_TIMEOUT_MS = 30000
/** MediaSource 打开超时 */
export const MEDIA_SOURCE_OPEN_TIMEOUT_MS = 30000

// ── 类型 ──────────────────────────────────────────────

/** 单条流元数据（init segment / sidx / duration / totalSize）。 */
export interface StreamMeta {
  initSegment: ArrayBuffer | null
  sidx: SidxInfo | null
  duration: number | null
  totalSize: number | null
  initSize: number | null
}

export function createStreamMeta(): StreamMeta {
  return {
    initSegment: null,
    sidx: null,
    duration: null,
    totalSize: null,
    initSize: null,
  }
}

/** MsePlayer 构造参数。 */
export interface MsePlayerOptions {
  video: HTMLVideoElement
  videoUrl: string
  audioUrl: string
  videoCodec?: string
  audioCodec?: string
  /**
   * 媒体总时长（秒），来自后端 resolve 接口的权威值。
   *
   * B站 fMP4 流的 mvhd.duration 为 0，浏览器从 mvhd 推断的 video.duration 不可靠。
   * 此值用于在 SourceBuffer 首次 append 后显式设置 MediaSource.duration，
   * 确保控制栏时间显示、进度条比例、seek 行为正确。
   *
   * 若未提供，则依赖浏览器从已 append 的数据自动推断（可能不准确）。
   */
  duration?: number
}

/**
 * seek 返回结果。
 *
 * 类型定义已上移到 player/types.ts 作为公共 PlayerController 接口的一部分，
 * 此处 re-export 保持现有 import 路径（'./types'）向后兼容。
 */
export type { SeekResult } from '../../types'

/** 下载器选项。 */
export interface DownloadOptions {
  startByte?: number
  signal: AbortSignal
}
