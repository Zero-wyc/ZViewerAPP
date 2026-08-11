/**
 * 流式写入管线（v2 重写）：ReadableStream → SourceBuffer。
 *
 * 从网络流读取数据，扫描 moof 边界对齐，累积到阈值后 flush 到 SourceBuffer。
 * 缓冲前瞻达到高水位时主动 cancel reader 返回，由调用方等待消耗后 Range 续传，
 * 避免 HTTP 长连接被服务端关闭。
 *
 * append 统一走 buffer-manager 的串行队列（含 QuotaExceededError 自动恢复），
 * 本模块不再单独处理配额溢出。
 */
import {
  appendBuffer,
  getBufferedAhead,
  pruneSourceBuffer,
} from '../../services/buffer-manager'
import {
  findFirstMoof,
  findLastCompleteFragmentEnd,
} from '../../services/mp4-parser'
import {
  STREAM_CHUNK_SIZE,
  TARGET_BUFFER_AHEAD,
  FORWARD_SEEK_TOLERANCE_SEC,
  MOOF_SCAN_LIMIT,
} from './types'
import { isInvalidStateError } from './downloader'

export interface ProcessorInput {
  sb: SourceBuffer
  reader: ReadableStreamDefaultReader<Uint8Array>
  signal: AbortSignal
  video: HTMLVideoElement
  isSuperseded?: () => boolean
  /**
   * 本次调用的"填补缺口"字节额度：下载量在该额度内时跳过前瞻高水位暂停。
   *
   * seek 保留了目标点之后的缓冲区间时，getBufferedAhead 会因保留区间而虚高，
   * 若不做豁免，水位检查会在缺口（目标点 → 保留区间起点）填满前就断流，
   * 导致缺口永远填不上。该额度 = 缺口字节数，额度耗尽后恢复正常水位控制。
   */
  freeProgressBytes?: number
}

export interface ProcessorOutput {
  /** 本次下载字节数 */
  downloadedBytes: number
  /** true 表示缓冲满，调用方需等待消耗后 Range 续传 */
  bufferFull: boolean
}

/** 增长式字节缓冲：避免每读一块就按最终大小重新分配 */
class ChunkBuffer {
  private buf: Uint8Array<ArrayBuffer> = new Uint8Array(STREAM_CHUNK_SIZE)
  private len = 0

  get length(): number {
    return this.len
  }

  append(chunk: Uint8Array): void {
    if (this.len + chunk.byteLength > this.buf.byteLength) {
      const grown: Uint8Array<ArrayBuffer> = new Uint8Array(
        Math.max(this.buf.byteLength * 2, this.len + chunk.byteLength)
      )
      grown.set(this.buf.subarray(0, this.len))
      this.buf = grown
    }
    this.buf.set(chunk, this.len)
    this.len += chunk.byteLength
  }

  /** 当前积累数据的只读视图（不重置状态） */
  view(): Uint8Array {
    return this.buf.subarray(0, this.len)
  }

  /** 丢弃 offset 之前的数据（moof 对齐用），保留其后的内容 */
  retainFrom(offset: number): void {
    // 用 copyWithin 原地搬移，避免 slice + set 两次拷贝
    const remaining = this.len - offset
    if (remaining <= 0) {
      this.len = 0
      return
    }
    this.buf.copyWithin(0, offset, this.len)
    this.len = remaining
  }

  /** 取出当前全部数据（拷贝），并重置为空 */
  take(): Uint8Array<ArrayBuffer> {
    // slice 触发拷贝；appendBuffer 会持有引用直到 updateend，拷贝是必要的（buf 会被复用）
    const out = this.buf.slice(0, this.len)
    this.len = 0
    return out
  }
}

/**
 * 处理 ReadableStream 数据，flush 到 SourceBuffer。
 *
 * @param needFindMoof 从文件中间开始下载时为 true：先扫描第一个 moof 边界对齐
 * @param customFlushSize 自定义首次 flush 阈值（seek 时用较小值加速首帧）
 * @param onInitialAppend 首次 flush 完成回调（仅触发一次）
 */
export async function processStream(
  input: ProcessorInput,
  needFindMoof = false,
  customFlushSize?: number,
  onInitialAppend?: () => void
): Promise<ProcessorOutput> {
  const {
    sb,
    reader,
    signal,
    video,
    isSuperseded,
    freeProgressBytes = 0,
  } = input

  let downloadedBytes = 0
  // initialDone 与 needFindMoof 解耦：
  // 旧实现中 initialDone = !needFindMoof，导致 needFindMoof=false（快速路径）
  // 时 customFlushSize 被忽略，首次 flush 改用 STREAM_CHUNK_SIZE（512KB），
  // 可能以截断的 mdat 结尾触发 CHUNK_DEMUXER_ERROR_APPEND_FAILED。
  // 现在统一 initialDone=false，首次 flush 后置 true，customFlushSize 在
  // 首次 flush 前始终生效。
  let initialDone = false
  let foundMoof = !needFindMoof
  const chunk = new ChunkBuffer()
  // 首次 flush 阈值：有 customFlushSize 时优先使用（seek 场景），否则用默认分块
  const firstFlushThreshold = customFlushSize ?? STREAM_CHUNK_SIZE
  // 下次 flush 尝试阈值：fragment 不完整时指数增长，避免每 16KB 重复扫描
  let nextFlushThreshold = firstFlushThreshold

  const cancelled = () => signal.aborted || isSuperseded?.() === true

  const cancelReader = () => {
    // reader.cancel() 返回 Promise，reader 已被 abort 时该 Promise 会 reject。
    // 必须用 .catch() 捕获，否则成为未处理 Promise 拒绝（seekTo/cleanup abort 时高频触发）。
    try {
      reader.cancel().catch(() => {})
    } catch {
      /* ignore */
    }
  }

  /** flush 当前积累的数据（串行队列内含配额溢出自动恢复） */
  const flush = async (data: Uint8Array<ArrayBuffer>): Promise<void> => {
    // video.error 已设置时 appendBuffer 会同步抛 InvalidStateError，
    // 连环触发 SourceBuffer error 事件 → waitUpdateEnd reject →
    // "SourceBuffer 更新失败"。提前检测并抛出明确错误，让上层
    // （MediaTrack.stream → runDualStream）能识别为不可恢复并停止下载，
    // 而不是继续循环制造一连串错误日志。
    if (video.error) {
      throw new Error(
        `video.error 已设置 (code=${video.error.code}): ${video.error.message}`
      )
    }
    await appendBuffer(sb, data, video.currentTime)
  }

  while (true) {
    if (cancelled()) {
      cancelReader()
      return { downloadedBytes, bufferFull: false }
    }

    // 缓冲满 → flush 残量 + cancel reader，由调用方等待消耗后续传
    // 填补缺口期间（freeProgressBytes 额度未耗尽）跳过水位检查：
    // seek 保留了目标点之后的缓冲时 ahead 虚高，不能据此暂停缺口下载
    if (initialDone && downloadedBytes >= freeProgressBytes) {
      // 检查 currentTime 是否在任何 buffered range 内。
      let ctInRange = false
      for (let i = 0; i < sb.buffered.length; i++) {
        if (
          video.currentTime >= sb.buffered.start(i) &&
          video.currentTime <= sb.buffered.end(i)
        ) {
          ctInRange = true
          break
        }
      }
      const ahead = getBufferedAhead(sb, video.currentTime)
      if (!ctInRange) {
        // currentTime 不在 buffered range 内。区分 gap 大小：
        // - gap 较小（≤ FORWARD_SEEK_TOLERANCE_SEC）：继续下载填补缺口。
        //   普通前进 seek 到 buffered.end + 5s 这种场景，executeSeek 返回 false 走普通 seek，
        //   此处必须继续下载，否则浏览器等待数据超时 seek 失败。
        // - gap 较大（前进 seek 跳很远）或回退 seek：暂停下载，
        //   让上层 executeSeek → MsePlayer.seekTo 接管，避免从断点顺序下载穿过整个缺口
        //   导致数据过度累积触发 QuotaExceededError。
        if (sb.buffered.length > 0) {
          const bufferedEnd = sb.buffered.end(sb.buffered.length - 1)
          const gap = video.currentTime - bufferedEnd
          if (gap > FORWARD_SEEK_TOLERANCE_SEC) {
            // 前进 seek 距离过大，暂停下载让 MsePlayer.seekTo 接管
            if (chunk.length > 0 && foundMoof) {
              await flushAligned(chunk, flush)
            }
            cancelReader()
            return { downloadedBytes, bufferFull: true }
          }
          // gap 较小或为负（回退 seek）：继续下载填补缺口
        }
        // 无 buffered：继续下载
      } else if (ahead > TARGET_BUFFER_AHEAD) {
        // currentTime 在 buffered range 内，但前瞻过高，暂停下载
        if (chunk.length > 0 && foundMoof) {
          await flushAligned(chunk, flush)
        }
        cancelReader()
        // 仅当有可清理空间时才 prune（避免 seek 后无意义 remove）
        if (ahead > 45) {
          await pruneSourceBuffer(sb, video.currentTime)
        }
        return { downloadedBytes, bufferFull: true }
      }
    }

    // 读取下一块
    let done: boolean
    let value: Uint8Array | undefined
    try {
      const r = await reader.read()
      done = r.done
      value = r.value
    } catch (err) {
      if (cancelled()) {
        cancelReader()
        return { downloadedBytes, bufferFull: false }
      }
      throw err
    }
    if (done) break
    if (!value) continue

    chunk.append(value)
    downloadedBytes += value.byteLength

    // 扫描第一个 moof 边界（仅从中间位置下载时需要对齐）
    if (!foundMoof) {
      const moofOffset = findFirstMoof(chunk.view())
      if (moofOffset !== null) {
        chunk.retainFrom(moofOffset)
        foundMoof = true
      } else if (chunk.length > MOOF_SCAN_LIMIT) {
        // 积累超限仍未找到 moof：放弃对齐，直接按原样 append
        foundMoof = true
      } else {
        continue
      }
    }

    // flush 到 SourceBuffer（确保以完整 fragment 边界结束）
    // 仅在累积量达到阈值时尝试 flush，避免每读 16KB 就扫描一次（大 fragment
    // 需 1.2MB+ 才完整，16KB 间隔扫描产生大量"无完整 fragment"日志且浪费 CPU）
    const threshold = initialDone ? STREAM_CHUNK_SIZE : firstFlushThreshold
    if (chunk.length >= nextFlushThreshold) {
      const flushed = await flushAligned(chunk, flush)
      if (flushed && !initialDone) {
        initialDone = true
        onInitialAppend?.()
      }
      // seek 后缓冲刚清空，prune 无意义且增加主线程负担；
      // 仅缓冲超过 45s（接近高水位 60s）时清理旧数据，保持内存窗口合理
      const ahead = getBufferedAhead(sb, video.currentTime)
      if (ahead > 45) {
        await pruneSourceBuffer(sb, video.currentTime)
      }
      // flushAligned 未 flush（fragment 不完整）：指数提升下次 flush 阈值，
      // 避免每 16KB 重复扫描。完整 fragment（1080P 约 1.2MB）到达后自然会被发现。
      if (!flushed) {
        nextFlushThreshold = Math.max(
          nextFlushThreshold + STREAM_CHUNK_SIZE,
          Math.floor(chunk.length * 1.5)
        )
      } else {
        // flush 成功后恢复默认阈值
        nextFlushThreshold = threshold
      }
    }
  }

  // flush 剩余数据（流自然结束）
  if (chunk.length > 0 && foundMoof) {
    const flushed = await flushAligned(chunk, flush)
    if (flushed && !initialDone) {
      onInitialAppend?.()
    }
    // 流结束后仍有残余数据（不完整 fragment）且 onInitialAppend 从未触发：
    // 强制 flush 作为最后手段。即使触发 CHUNK_DEMUXER_ERROR 也比永久卡死好
    // —— video.error 会被上层捕获并触发 reloadBilibili 恢复。
    if (!flushed && !initialDone && chunk.length > 0) {
      console.warn(
        `[processStream] 流结束时无完整 fragment，强制 flush ${chunk.length} 字节残余数据`
      )
      await flush(chunk.take())
      onInitialAppend?.()
    }
  }

  return { downloadedBytes, bufferFull: false }

  /**
   * flush chunk 中以完整 moof+mdat fragment 边界结束的数据。
   *
   * 为什么需要这个函数：
   * Chrome 的 chunk demuxer 要求 append 的数据以完整 fragment 结束。
   * 如果末尾是截断的 mdat（mdat box 未完整包含在数据内），demuxer 会
   * 尝试解码不完整帧并抛出 CHUNK_DEMUXER_ERROR_APPEND_FAILED
   * (video.error code=3)，导致视频永久黑屏。
   *
   * 此函数扫描 chunk 中的 moof/mdat 边界，只 flush 到最后一个完整
   * fragment 的末尾，保留剩余数据等待下一次 flush。
   *
   * 特殊情况：
   * - 数据中无完整 fragment（累积量不足）：返回 false，调用方继续累积
   * - 流结束时仍有残余数据：调用方传入 forceFlush=true 强制 flush
   * - flush 失败（video.error 等）：抛出错误
   */
  async function flushAligned(
    chunk: ChunkBuffer,
    doFlush: (data: Uint8Array<ArrayBuffer>) => Promise<void>
  ): Promise<boolean> {
    const view = chunk.view()
    const completeEnd = findLastCompleteFragmentEnd(view)
    if (completeEnd <= 0) {
      // 无完整 fragment：记录数据头部 hex 帮助诊断（moof=6d6f6f66, mdat=6d646174, styp=73747970）
      const headHex = Array.from(view.subarray(0, 32))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(' ')
      console.warn(
        `[processStream] 无完整 fragment，继续累积 (chunk=${chunk.length}B head: ${headHex})`
      )
      return false
    }
    const toFlush = view.subarray(0, completeEnd)
    // 诊断日志：记录 flush 大小与数据头部（用于识别 moof/mdat 边界）
    const headHex = Array.from(toFlush.subarray(0, 16))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ')
    console.warn(
      `[processStream] flush ${completeEnd}B (head: ${headHex}) retained=${chunk.length - completeEnd}B video.error=${video.error ? video.error.code : 'none'}`
    )
    await doFlush(toFlush.slice() as Uint8Array<ArrayBuffer>)
    chunk.retainFrom(completeEnd)
    return true
  }
}

// 重新导出，保持旧引用路径（player.ts 历史 import）可用
export { isInvalidStateError }
