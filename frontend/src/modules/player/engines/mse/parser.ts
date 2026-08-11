/**
 * MP4 头部解析与 seek 计算（v2 重写）。
 *
 * 职责单一：从已下载的头部数据中解析 init segment、sidx、duration、totalSize，
 * 并提供 seek 字节偏移 / 首次 flush 大小的纯函数计算。不发起网络请求。
 */
import {
  findInitSegmentSize,
  parseMvhdDuration,
  parseSidx,
  iterBoxes,
  findByteOffsetByTime,
} from '../../services/mp4-parser'
import type { StreamMeta } from './types'

/** seek 时间估算的最大比例（防止越界到最后一个字节） */
const MAX_SEEK_RATIO = 0.99

/**
 * 从 Response 头中提取文件总大小。
 *
 * 优先级：
 * 1. Content-Range: bytes X-Y/TOTAL → TOTAL（完整 206 响应）
 * 2. Content-Range: bytes X-Y/* → null（开放式 Range，总大小未知）
 *    此时不能 fallback 到 Content-Length：开放式 Range 的 Content-Length
 *    是请求范围的大小（如 HEAD_SIZE），不是文件总大小，误用会导致
 *    meta.totalSize 被设为 HEAD_SIZE（512KB），stream 方法中
 *    `offset >= totalSize` 检查会过早终止下载。
 * 3. 无 Content-Range 但有 Content-Length（200 响应）→ Content-Length
 *    仅当响应是完整文件（status=200）时才可靠。
 */
export function parseTotalSize(response: Response): number | null {
  const contentRange = response.headers.get('Content-Range')
  if (contentRange) {
    // Content-Range: bytes X-Y/TOTAL 或 bytes X-Y/*
    const match = contentRange.match(/\/(\d+)$/)
    if (match) return parseInt(match[1], 10)
    // Content-Range: bytes X-Y/* → 总大小未知，返回 null
    // 不 fallback 到 Content-Length（那只是范围大小，不是文件总大小）
    return null
  }
  // 无 Content-Range 头：仅当 200 响应时 Content-Length 才是文件总大小
  // 206 响应无 Content-Range 头是不规范的，Content-Length 不可信
  if (response.status === 200) {
    const contentLength = response.headers.get('Content-Length')
    if (contentLength) return parseInt(contentLength, 10)
  }
  return null
}

/**
 * 解析文件头部：init segment + mvhd + sidx + totalSize，填充到 meta。
 *
 * @param headData 头部数据（通常 0..HEAD_SIZE）
 * @param response 对应 Response，用于读取 Content-Range / Content-Length
 * @param meta 要填充的 StreamMeta
 * @throws 未找到 init segment 时抛错（调用方决定回退策略）
 */
export function parseHead(
  headData: Uint8Array,
  response: Response,
  meta: StreamMeta
): void {
  const initSize = findInitSegmentSize(headData)
  if (initSize === null) throw new Error('未找到 init segment')

  meta.initSize = initSize
  meta.initSegment = headData.subarray(0, initSize).slice()
    .buffer as ArrayBuffer

  const durationInfo = parseMvhdDuration(headData)
  if (durationInfo) {
    meta.duration = durationInfo.duration
  }

  // 解析 sidx（可选）：用于 seek 时精确定位 subsegment 字节偏移
  for (const box of iterBoxes(headData, 0)) {
    if (box.type === 'sidx') {
      meta.sidx = parseSidx(headData, box.offset)
      break
    }
  }

  meta.totalSize = parseTotalSize(response)
}

/**
 * 计算 seek 字节偏移（sidx 优先，线性估算 fallback）。
 *
 * - 有 sidx：精确返回目标时间所在 subsegment 的起始偏移；
 * - 无 sidx 但有 duration + totalSize：按时间比例线性估算（VBR 下有偏差）；
 * - 都没有：返回 init segment 之后（从头下载媒体数据）。
 */
export function calculateSeekOffset(
  meta: StreamMeta,
  targetTime: number
): number {
  if (meta.sidx) {
    const offset = findByteOffsetByTime(meta.sidx, targetTime)
    if (offset !== null) return offset
  }

  if (meta.duration && meta.totalSize && meta.initSize) {
    const ratio = Math.min(
      MAX_SEEK_RATIO,
      Math.max(0, targetTime / meta.duration)
    )
    return Math.max(meta.initSize, Math.floor(ratio * meta.totalSize))
  }

  return meta.initSize ?? 0
}

/**
 * 计算 seek 首次 flush 大小。
 *
 * - 有 sidx：使用完整 fragment size，确保累积到阈值时 fragment 已完整下载。
 *   旧实现用 ref.size * 0.3 且封顶 512KB，对 1080P 大 fragment（2MB+）导致
 *   flushAligned 反复在 512KB/1MB/1.5MB 处被调用但 findLastCompleteFragmentEnd
 *   返回 0（mdat 未完整），onInitialAppend 迟迟不触发，waitFirstAppend 超时。
 * - 无 sidx 但有 duration + totalSize：按 3 秒数据量估算。
 * - 都没有：使用 minFlushSize。
 */
export function calculateFlushSize(
  meta: StreamMeta,
  targetTime: number,
  minFlushSize: number
): number {
  let size = minFlushSize

  if (meta.sidx) {
    const ref = meta.sidx.references.find(
      (r) => targetTime >= r.startTime && targetTime < r.startTime + r.duration
    )
    if (ref) {
      // 使用完整 fragment size：确保 flushAligned 被调用时 fragment 已完整
      size = Math.max(minFlushSize, ref.size)
    }
  } else if (meta.duration && meta.totalSize) {
    const threeSecondsBytes = (3 / meta.duration) * meta.totalSize
    size = Math.max(minFlushSize, Math.floor(threeSecondsBytes))
  }

  return size
}
