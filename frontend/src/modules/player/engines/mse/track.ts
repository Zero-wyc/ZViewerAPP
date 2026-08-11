/**
 * MediaTrack：单条媒体流（视频轨或音频轨）的完整生命周期。
 *
 * 从旧 MsePlayer 中抽取：旧实现把「下载调度 + moof 对齐 + 缓冲水位控制 +
 * seek 快速路径」对视频/音频两条轨各写一遍，attach 与 seekTo 又各自重复
 * 双轨编排。MediaTrack 将单轨行为收敛为三个方法：
 *
 * - loadHead(signal, startTime?)  下载并解析头部，append init segment，
 *                                 返回媒体数据的起始字节偏移
 * - stream(offset, signal, opts)  主下载循环：流式下载 → 缓冲满暂停 → 消耗后续传
 * - seekStream(targetTime, ...)   seek 重载：256KB 快速路径找 moof 立即 flush，
 *                                 失败回退普通流式下载
 *
 * 双轨并行、首次 flush 等待、AbortController 管理由 MsePlayer 统一编排。
 */
import {
  appendBuffer,
  clearSourceBuffer,
  getBufferedAhead,
} from '../../services/buffer-manager'
import {
  findFirstMoof,
  findLastCompleteFragmentEnd,
} from '../../services/mp4-parser'
import {
  downloadHead,
  downloadRange,
  downloadStreamWithRetry,
} from './downloader'
import { processStream } from './processor'
import { parseHead, calculateSeekOffset, calculateFlushSize } from './parser'
import {
  createStreamMeta,
  RESUME_BUFFER_THRESHOLD,
  FORWARD_SEEK_TOLERANCE_SEC,
  MIN_SEEK_FLUSH,
  SEEK_HEAD_SIZE,
  SEEK_HEAD_SIZE_PRECISE,
  type StreamMeta,
} from './types'

export interface TrackContext {
  sb: SourceBuffer
  url: string
  video: HTMLVideoElement
  /** 实例已被取代（cleanup / 新 attach）时返回 true，所有循环立即退出 */
  isSuperseded: () => boolean
}

export interface StreamOptions {
  needFindMoof?: boolean
  customFlushSize?: number
  onInitialAppend?: () => void
  /**
   * 下载停止字节位置：seek 保留了目标点之后的缓冲区间时，
   * 下载到该区间起点对应字节即正常结束（不进入水位等待），
   * 避免重复下载已缓冲数据。无 sidx 时为膨胀后的估算值（宁多勿少）。
   */
  stopAtByte?: number
}

export class MediaTrack {
  readonly meta: StreamMeta = createStreamMeta()
  private readonly sb: SourceBuffer
  private readonly url: string
  private readonly video: HTMLVideoElement
  private readonly isSuperseded: () => boolean

  constructor(ctx: TrackContext) {
    this.sb = ctx.sb
    this.url = ctx.url
    this.video = ctx.video
    this.isSuperseded = ctx.isSuperseded
  }

  /**
   * 下载并解析文件头部，append init segment。
   *
   * @returns 媒体数据的起始字节偏移：
   *   - startTime > 0 时为估算的 seek 偏移
   *   - 否则返回 initSize（init segment 末尾），让 stream 从该位置继续下载
   *
   * 注意：旧实现返回 0，导致 stream(0) 从文件头重新下载，与 loadHead 已 append 的
   * init segment 重复。runDualStream 中 needFindMoof: offset > 0 在 offset=0 时为 false，
   * processStream 不扫描 moof 边界直接 append 整个 head（含 ftyp+moov），
   * 触发 CHUNK_DEMUXER_ERROR_APPEND_FAILED (video.error code=3) 导致视频永久黑屏。
   * 修复：返回 initSize，stream 从 init segment 末尾继续下载，needFindMoof 自动启用。
   */
  async loadHead(signal: AbortSignal, startTime?: number): Promise<number> {
    // init segment 已缓存（本实例内重复 attach/seek）：直接 append
    if (this.meta.initSegment) {
      await appendBuffer(this.sb, this.meta.initSegment)
      if (startTime && startTime > 0) {
        return calculateSeekOffset(this.meta, startTime)
      }
      // 返回 initSize：stream 从 init segment 末尾继续下载，
      // 避免重复下载 init segment 触发 CHUNK_DEMUXER_ERROR
      return this.meta.initSize ?? 0
    }

    try {
      const { response: resp, data } = await downloadHead(this.url, signal)
      parseHead(data, resp, this.meta)
      console.warn(
        `[MediaTrack] loadHead 完成: initSize=${this.meta.initSize} duration=${this.meta.duration} totalSize=${this.meta.totalSize} sidx=${!!this.meta.sidx} initSeg=${this.meta.initSegment?.byteLength ?? 0}B headSize=${data.byteLength}B`
      )
      if (this.meta.initSegment) {
        await appendBuffer(this.sb, this.meta.initSegment)
      }
      if (startTime && startTime > 0) {
        return calculateSeekOffset(this.meta, startTime)
      }
      // 返回 initSize：stream 从 init segment 末尾继续下载，
      // 避免重复下载 init segment 触发 CHUNK_DEMUXER_ERROR
      return this.meta.initSize ?? data.byteLength
    } catch (err) {
      if (signal.aborted) return 0
      console.warn('[MediaTrack] 头部解析失败，退回到从头下载:', err)
      if (this.sb.buffered.length > 0) await clearSourceBuffer(this.sb)
      return 0
    }
  }

  /**
   * 主下载循环：从 startByte 开始流式下载。
   *
   * 缓冲前瞻达高水位时 processStream 主动断流返回，本循环等待消耗到
   * 低水位后从断点 Range 续传，直到文件下载完成或被 abort。
   */
  async stream(
    startByte: number,
    signal: AbortSignal,
    opts: StreamOptions = {}
  ): Promise<void> {
    let offset = startByte
    let first = true

    while (true) {
      if (signal.aborted || this.isSuperseded()) return
      // video.error 已设置时继续下载无意义：appendBuffer 会同步抛 InvalidStateError，
      // 循环内每个 chunk 都会失败并制造错误日志。提前退出让上层（runDualStream）
      // 识别为不可恢复错误，触发 stalled/error 事件 → reloadBilibili 恢复。
      if (this.video.error) {
        throw new Error(
          `video.error 已设置 (code=${this.video.error.code}): ${this.video.error.message}`
        )
      }
      // 已追上保留的缓冲区间：缺口填补完成，正常结束（不做水位等待）。
      // 首次循环豁免：seek 快速路径从 moof 起点开始下载时，moof 起点可能
      // 已接近或超过 stopAtByte（线性估算偏差导致），此时必须至少下载一个
      // fragment 触发 onInitialAppend，否则 seek 永久卡死在等待首次 flush。
      if (!first && opts.stopAtByte !== undefined && offset >= opts.stopAtByte)
        return

      console.warn(
        `[MediaTrack] stream 下载 offset=${offset} first=${first} needFindMoof=${first ? opts.needFindMoof : false}`
      )
      const { response } = await downloadStreamWithRetry(this.url, {
        startByte: offset,
        signal,
        check: { signal, superseded: this.isSuperseded },
      })
      if (!response.body) throw new Error('响应体为空')

      // 诊断：记录响应头，验证 Range 请求是否被服务端正确处理
      const contentRange = response.headers.get('content-range')
      const contentLength = response.headers.get('content-length')
      console.warn(
        `[MediaTrack] stream 响应 status=${response.status} content-range=${contentRange ?? 'none'} content-length=${contentLength ?? 'none'}`
      )

      const reader = response.body.getReader()
      const result = await processStream(
        {
          sb: this.sb,
          reader,
          signal,
          video: this.video,
          isSuperseded: this.isSuperseded,
          // 缺口填补期间豁免水位暂停；追上保留区间后恢复正常水位控制
          freeProgressBytes:
            opts.stopAtByte !== undefined
              ? Math.max(0, opts.stopAtByte - offset)
              : 0,
        },
        first ? opts.needFindMoof : false,
        first ? opts.customFlushSize : undefined,
        first ? opts.onInitialAppend : undefined
      )
      first = false
      offset += result.downloadedBytes

      if (signal.aborted || this.isSuperseded()) return
      if (opts.stopAtByte !== undefined && offset >= opts.stopAtByte) return
      if (this.meta.totalSize !== null && offset >= this.meta.totalSize) return

      await this.waitForBufferDrain(signal)
    }
  }

  /**
   * seek 重载：从目标时间附近恢复流式下载。
   *
   * 三条路径（按优先级）：
   * 1. sidx 精确路径：有 sidx 时，直接用 Range 下载完整 fragment，
   *    首次 flush 即完整 fragment，无需累积等待。
   * 2. 快速路径：下载小块找 moof，从 moof 起点流式下载，累积到 flushSize 后 flush。
   * 3. 回退路径：从 seekOffset 流式下载，内部扫描 moof 对齐。
   *
   * **并行优化**：range 下载与 init segment append 并行执行。
   * init append 走 SourceBuffer 串行队列（CPU），range 下载走网络 I/O，
   * 两者无依赖关系，并行可节省一个 RTT 的首帧等待时间。
   * SourceBuffer 串行队列保证 init 先于 moof 数据被消费。
   *
   * @param stopAtTime 目标点之后首个保留缓冲区间的起点（秒）。
   *                   提供时下载到该时间对应的字节位置即停止，
   *                   缺口填补完成，避免重复下载已缓冲数据。
   */
  async seekStream(
    targetTime: number,
    signal: AbortSignal,
    onInitialAppend: () => void,
    stopAtTime?: number
  ): Promise<void> {
    const seekOffset = calculateSeekOffset(this.meta, targetTime)
    const flushSize = calculateFlushSize(this.meta, targetTime, MIN_SEEK_FLUSH)
    const stopAtByte = this.resolveStopAtByte(stopAtTime, seekOffset)

    console.warn(
      `[MediaTrack] seekStream target=${targetTime.toFixed(1)}s offset=${seekOffset} flushSize=${flushSize} sidx=${!!this.meta.sidx} stopAtByte=${stopAtByte ?? 'none'} meta={initSize=${this.meta.initSize} duration=${this.meta.duration} totalSize=${this.meta.totalSize} initSeg=${this.meta.initSegment?.byteLength ?? 0}B}`
    )

    // audio 轨等无 sidx 流的兜底：若 seekOffset 为 0 但目标时间较大，
    // 说明 meta 未正确解析（loadHead 失败或 initSize 为 null），
    // 会导致从文件头下载到目标位置——大幅跳转卡死的根因。
    // 此处重新下载头部解析，确保能用线性估算定位。
    if (
      seekOffset === 0 &&
      targetTime > 5 &&
      !this.meta.sidx &&
      (!this.meta.initSize || !this.meta.duration || !this.meta.totalSize)
    ) {
      console.warn(
        `[MediaTrack] seekOffset=0 但 targetTime=${targetTime.toFixed(1)}s，meta 不完整，重新解析头部`
      )
      try {
        const { response: resp, data } = await downloadHead(this.url, signal)
        parseHead(data, resp, this.meta)
        console.warn(
          `[MediaTrack] 重新解析头部完成: initSize=${this.meta.initSize} duration=${this.meta.duration} totalSize=${this.meta.totalSize} sidx=${!!this.meta.sidx}`
        )
        // 重新计算 seekOffset
        const newSeekOffset = calculateSeekOffset(this.meta, targetTime)
        if (newSeekOffset > 0) {
          console.warn(
            `[MediaTrack] 重新计算 seekOffset: ${seekOffset} → ${newSeekOffset}`
          )
          // 重新走完整 seekStream 流程
          return this.seekStream(
            targetTime,
            signal,
            onInitialAppend,
            stopAtTime
          )
        }
      } catch (err) {
        if (signal.aborted) return
        console.warn('[MediaTrack] 重新解析头部失败:', err)
      }
    }

    // ── 路径 1：sidx 精确 fragment 下载 ─────────────────────────
    // 有 sidx 时直接用 Range 下载目标时间所在 fragment 的完整数据，
    // 避免流式累积大 fragment（1080P 可达 2MB+）导致的首次 flush 等待。
    // 完整 fragment 下载后立即 flush，onInitialAppend 即时触发。
    //
    // 注意：部分 B站 fMP4 流的 sidx reference size 偏小（不包含完整 mdat），
    // 此时 completeEnd=0，直接回退快速路径由 processStream 流式累积处理。
    // 不扩展下载——扩展后 flush 跨 sidx boundary 的数据会触发 CHUNK_DEMUXER_ERROR。
    if (this.meta.sidx) {
      const frag = this.findFragmentByTime(targetTime)
      if (frag) {
        console.warn(
          `[MediaTrack] sidx 精确路径: fragment offset=${frag.offset} size=${frag.size}B sidx.end=${this.meta.sidx.end} firstOffset=${this.meta.sidx.firstOffset} refs=${this.meta.sidx.references.length}`
        )
        try {
          // 并行：init append（CPU） + fragment 下载（网络）
          const initPromise = this.meta.initSegment
            ? appendBuffer(this.sb, this.meta.initSegment)
            : Promise.resolve()

          console.warn(
            `[MediaTrack] sidx 精确路径: 开始 downloadRange ${frag.offset}-${frag.offset + frag.size - 1} (${frag.size}B)`
          )
          const rangeStart = Date.now()
          const { data: fragData, response: fragResp } = await downloadRange(
            this.url,
            frag.offset,
            frag.offset + frag.size - 1,
            signal
          )
          console.warn(
            `[MediaTrack] sidx 精确路径: downloadRange 完成 ${fragData.byteLength}B status=${fragResp.status} 耗时=${Date.now() - rangeStart}ms`
          )
          await initPromise

          if (this.isSuperseded() || signal.aborted) return
          if (this.video.error) {
            throw new Error(
              `video.error 已设置 (code=${this.video.error.code}): ${this.video.error.message}`
            )
          }

          // 验证 fragment 数据完整性：使用 findLastCompleteFragmentEnd
          // 确保只 append 完整的 moof+mdat fragment，避免 CHUNK_DEMUXER_ERROR
          const fragView = fragData as Uint8Array<ArrayBuffer>
          const completeEnd = findLastCompleteFragmentEnd(fragView)
          const headHex = Array.from(fragView.subarray(0, 32))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join(' ')

          if (completeEnd <= 0) {
            // sidx 指定的范围内无完整 fragment：sidx reference size 偏小，
            // 回退到快速路径由 processStream 边下边扫 moof 对齐
            console.warn(
              `[MediaTrack] sidx fragment 无完整 moof+mdat (size=${fragData.byteLength}B head: ${headHex})，回退快速路径`
            )
            throw new Error('sidx fragment 无完整 fragment 边界')
          }

          // 只 flush 完整 fragment 部分，保留残余数据
          const toFlush = fragView.subarray(0, completeEnd)
          console.warn(
            `[MediaTrack] sidx fragment flush ${completeEnd}B/${fragData.byteLength}B (head: ${headHex})`
          )
          await appendBuffer(
            this.sb,
            toFlush.slice() as Uint8Array<ArrayBuffer>,
            this.video.currentTime
          )
          console.warn(`[MediaTrack] 首个 fragment 已 flush (${completeEnd}B)`)
          onInitialAppend()

          // 从 flush 边界继续流式下载（而非 frag.offset + frag.size），
          // 确保残余数据（可能含下一 fragment 开头）被 processStream 重新对齐
          const nextOffset = frag.offset + completeEnd
          if (stopAtByte !== undefined && nextOffset >= stopAtByte) return
          if (this.meta.totalSize !== null && nextOffset >= this.meta.totalSize)
            return

          await this.stream(nextOffset, signal, {
            needFindMoof: true,
            stopAtByte,
          })
          return
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') return
          if (this.isSuperseded() || signal.aborted) return
          if (this.video.error) throw err
          console.warn('[MediaTrack] sidx 精确路径失败，回退快速路径:', err)
        }
      }
    }

    // ── 路径 2/3：快速路径 / 回退路径 ─────────────────────────
    const headSize = this.meta.sidx ? SEEK_HEAD_SIZE_PRECISE : SEEK_HEAD_SIZE

    // 并行 append init（与 range 下载同时进行）
    const rangePromise = downloadRange(
      this.url,
      seekOffset,
      seekOffset + headSize - 1,
      signal
    )

    if (this.meta.initSegment) {
      await appendBuffer(this.sb, this.meta.initSegment)
    }

    let moofFoundAt: number | null = null
    try {
      const { data: headData } = await rangePromise
      if (this.isSuperseded() || signal.aborted) return
      if (this.video.error) {
        throw new Error(
          `video.error 已设置 (code=${this.video.error.code}): ${this.video.error.message}`
        )
      }

      moofFoundAt = findFirstMoof(headData)
      console.warn(
        `[MediaTrack] seek head 下载 ${headData.byteLength}B moofFoundAt=${moofFoundAt ?? 'null'}`
      )
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      if (this.isSuperseded() || signal.aborted) return
      if (this.video.error) throw err
      console.warn('[MediaTrack] seek 快速路径失败，回退普通流:', err)
    }

    if (moofFoundAt !== null) {
      const streamStart = seekOffset + moofFoundAt
      console.warn(
        `[MediaTrack] 快速路径: 从 moof 起点流式下载 offset=${streamStart}`
      )
      await this.stream(streamStart, signal, {
        needFindMoof: false,
        customFlushSize: flushSize,
        onInitialAppend,
        stopAtByte,
      })
      return
    }

    console.warn(
      `[MediaTrack] 回退路径: 从 seekOffset 流式下载 offset=${seekOffset}`
    )
    await this.stream(seekOffset, signal, {
      needFindMoof: true,
      customFlushSize: flushSize,
      onInitialAppend,
      stopAtByte,
    })
  }

  /**
   * 从 sidx 中查找目标时间所在的 fragment，返回其字节偏移与大小。
   *
   * sidx 的 references 描述了每个 subsegment 的 startTime / duration / size，
   * 累加 size 即可得到各 fragment 的字节偏移。
   */
  private findFragmentByTime(
    targetTime: number
  ): { offset: number; size: number } | null {
    if (!this.meta.sidx || this.meta.sidx.references.length === 0) return null
    let offset = this.meta.sidx.end + this.meta.sidx.firstOffset
    for (const ref of this.meta.sidx.references) {
      if (
        targetTime >= ref.startTime &&
        targetTime < ref.startTime + ref.duration
      ) {
        return { offset, size: ref.size }
      }
      offset += ref.size
    }
    // 目标时间超过最后一个 fragment：返回最后一个
    const lastRef =
      this.meta.sidx.references[this.meta.sidx.references.length - 1]
    return {
      offset: offset - lastRef.size,
      size: lastRef.size,
    }
  }

  /**
   * 将保留区间起点时间换算为下载停止字节位置。
   *
   * 有 sidx 时精确；无 sidx 时线性估算存在偏差，膨胀 15% 确保宁多下载
   * 也不少下载（少下载会留下无法填补的缺口导致播放卡死）。
   */
  private resolveStopAtByte(
    stopAtTime: number | undefined,
    seekOffset: number
  ): number | undefined {
    if (stopAtTime === undefined || !Number.isFinite(stopAtTime))
      return undefined
    let byte = calculateSeekOffset(this.meta, stopAtTime)
    if (!this.meta.sidx) byte = Math.ceil(byte * 1.15)
    if (this.meta.totalSize !== null) byte = Math.min(byte, this.meta.totalSize)
    // 停止点必须超过 seek 起点，否则无意义
    return byte > seekOffset ? byte : undefined
  }

  /** 等待缓冲前瞻消耗到低水位以下（或 abort） */
  private async waitForBufferDrain(signal: AbortSignal): Promise<void> {
    while (!signal.aborted && !this.isSuperseded()) {
      const ct = this.video.currentTime
      // 检查 currentTime 是否在任何 buffered range 内。
      let inRange = false
      for (let i = 0; i < this.sb.buffered.length; i++) {
        if (ct >= this.sb.buffered.start(i) && ct <= this.sb.buffered.end(i)) {
          inRange = true
          break
        }
      }
      if (!inRange) {
        // currentTime 不在 buffered range 内（如普通 seek 到缓冲边缘外）。
        // 区分 gap 大小：
        // - gap 较小（≤ FORWARD_SEEK_TOLERANCE_SEC）：返回让 stream 继续下载填补缺口。
        //   普通前进 seek 到 buffered.end + 5s 这种场景，executeSeek 返回 false 走普通 seek，
        //   此处必须返回让 attach 路径的 stream 继续下载，否则浏览器等待数据超时 seek 失败。
        // - gap 较大（前进 seek 跳很远，或回退 seek 到已清理区域）：等待，
        //   让上层 executeSeek → MsePlayer.seekTo 接管，避免从断点顺序下载穿过整个缺口
        //   导致数据过度累积触发 QuotaExceededError。
        if (this.sb.buffered.length > 0) {
          const bufferedEnd = this.sb.buffered.end(this.sb.buffered.length - 1)
          const gap = ct - bufferedEnd
          // gap > 0：前进 seek（currentTime 在 buffered 之后）
          // gap < 0：回退 seek（currentTime 在 buffered 之前）
          if (gap > FORWARD_SEEK_TOLERANCE_SEC) {
            // 前进 seek 距离过大，等待 MsePlayer.seekTo 接管
            await new Promise((r) => setTimeout(r, 500))
            continue
          }
          // gap 较小或为负（回退 seek）：返回让 stream 继续下载填补缺口
          // 注意：回退 seek 到已清理区域时，stream 从断点继续下载无法填补，
          // 但 executeSeek 会走 MSE seek 路径（gap < 0 不满足 ≤ FORWARD_BUFFER_TOLERANCE_SEC），
          // 不会走到这里。此处主要处理前进 seek 小缺口场景。
          return
        }
        // 无 buffered，返回让 stream 继续下载
        return
      }
      const ahead = getBufferedAhead(this.sb, ct)
      if (ahead < RESUME_BUFFER_THRESHOLD) return
      await new Promise((r) => setTimeout(r, 500))
    }
  }
}
