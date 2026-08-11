/**
 * B站 缓冲模式服务：协调 IndexedDB 缓存与 m4s 下载。
 *
 * 房主端和观众端共用此模块，避免代码重复：
 * - 房主端：解析视频后调用此服务缓存 m4s，缓存完成后 attach
 * - 观众端：收到 bufferMode=true 的 state 后调用此服务缓存，缓存完成后 attach
 *
 * 缓存键策略：
 * - 房主端：使用 movie.url（含 BV 号）+ cid + qn
 * - 观众端：无 movie 对象时使用空串 + cid + qn
 * - 同一 cid+qn 对应同一视频流，跨用户缓存键一致（但 IndexedDB 是各自独立存储）
 */
import type { WatchTogetherState } from '@/modules/sync-playback/types'
import {
  buildCacheKey,
  getCacheEntry,
  setCacheEntry,
  deleteCacheEntry,
  type BufferCacheEntry,
} from './buffer-cache'
import {
  downloadBilibiliDashStreams,
  DownloadError,
  UrlExpiredError,
  DownloadAbortedError,
} from './bilibili-downloader'

export interface BufferProgress {
  /** 已下载字节数 */
  downloaded: number
  /** 总字节数（未知时等于 downloaded） */
  total: number
  /** 视频标题（用于 UI 显示） */
  title: string
}

export interface FetchBlobsOptions {
  /** 房主广播的播放状态（含 sourceUrl/audioUrl/cid/currentQn 等） */
  state: WatchTogetherState
  /** B站 BV 号或影片 URL（房主端可传，观众端可不传） */
  bvid?: string
  /** 视频标题（用于 UI 显示，未提供时使用 "当前视频"） */
  title?: string
  /** 下载进度回调 */
  onProgress?: (progress: BufferProgress) => void
  /** 取消信号 */
  signal?: AbortSignal
}

export interface FetchBlobsResult {
  videoBlob: Blob
  audioBlob: Blob
  /** 缓存键（用于后续清理或追踪） */
  cacheKey: string
  /** 是否命中缓存（true=直接复用，false=刚下载） */
  fromCache: boolean
}

/**
 * 缓冲模式：从 B站 CDN 下载完整 m4s 流到 IndexedDB，缓存命中时直接复用。
 *
 * 流程：
 * 1. 检查 IndexedDB 缓存，命中则直接返回 Blob（fromCache=true）
 * 2. 未命中则下载 video + audio m4s 并存入 IndexedDB
 * 3. 进度通过 onProgress 反馈到 UI（每下载 1MB 触发一次）
 * 4. 失败时清理半成品缓存（避免下次命中损坏数据）
 *
 * 错误处理：调用方负责捕获 DownloadError / UrlExpiredError / DownloadAbortedError
 * 并向用户展示对应提示。
 */
export async function fetchBlobsForBufferMode(
  options: FetchBlobsOptions
): Promise<FetchBlobsResult> {
  const { state, bvid = '', title, onProgress, signal } = options

  if (!state.audioUrl || !state.cid) {
    throw new Error('缓冲模式需要 DASH 源的 audioUrl 和 cid')
  }

  const cacheKey = buildCacheKey(bvid, state.cid, state.currentQn)
  const displayTitle = title || '当前视频'

  // 命中缓存：直接返回 Blob
  const cached = await getCacheEntry(cacheKey)
  if (cached) {
    console.log(
      `[buffer-mode] 缓冲模式命中缓存: ${cacheKey}, ` +
        `video=${(cached.videoBlob.size / 1024 / 1024).toFixed(1)}MB, ` +
        `audio=${(cached.audioBlob.size / 1024 / 1024).toFixed(1)}MB`
    )
    return {
      videoBlob: cached.videoBlob,
      audioBlob: cached.audioBlob,
      cacheKey,
      fromCache: true,
    }
  }

  // 未命中：下载 m4s 流
  console.log(`[buffer-mode] 缓冲模式开始下载: ${cacheKey}`)

  try {
    onProgress?.({ downloaded: 0, total: 1, title: displayTitle })

    const { videoBlob, audioBlob, totalBytes } =
      await downloadBilibiliDashStreams(
        state.sourceUrl,
        state.audioUrl,
        (downloaded, total) => {
          onProgress?.({
            downloaded,
            total: total || downloaded,
            title: displayTitle,
          })
        },
        signal
      )

    // 写入 IndexedDB
    const entry: BufferCacheEntry = {
      key: cacheKey,
      bvid,
      cid: state.cid,
      qn: state.currentQn ?? 0,
      videoBlob,
      audioBlob,
      videoCodec: state.videoCodec,
      audioCodec: state.audioCodec,
      duration: state.duration,
      title,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    }
    await setCacheEntry(entry)

    console.log(
      `[buffer-mode] 缓冲模式下载完成: ${(totalBytes / 1024 / 1024).toFixed(1)}MB`
    )
    return { videoBlob, audioBlob, cacheKey, fromCache: false }
  } catch (err) {
    // 清理半成品缓存（如果有）
    await deleteCacheEntry(cacheKey)
    throw err
  }
}

export { DownloadError, UrlExpiredError, DownloadAbortedError }
