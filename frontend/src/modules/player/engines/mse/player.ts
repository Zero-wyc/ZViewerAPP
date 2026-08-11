/**
 * MsePlayer：MSE 播放器门面（v2 重写）。
 *
 * 职责：
 * 1. 管理 MediaSource / SourceBuffer / AbortController 生命周期（显式状态机）
 * 2. attach：创建 MediaSource → 双轨 loadHead → 启动双轨流式下载
 * 3. seekTo：abort 旧下载 → 清空缓冲 → append 缓存的 init → 双轨从目标位置续传
 * 4. 对外暴露 attach / seekTo / cleanup 三个方法与 isAttached / isSeeking 状态
 *
 * 相比 v1 的改进：
 * - 显式状态机（idle/attaching/attached/seeking/disposed）替代分散的布尔 flag；
 * - 单轨行为下沉到 MediaTrack，attach 与 seekTo 共用同一套双轨编排；
 * - 首次 append 等待改为 deferred Promise + 超时 race，替代 50ms 轮询；
 * - 不再把 AbortController 挂到 video 元素上（消除 _mseAbortController hack），
 *   外部强制中断统一通过 cleanup()。
 *
 * 依赖模块：
 * - track.ts      MediaTrack（单轨下载调度）
 * - processor.ts  processStream（ReadableStream → SourceBuffer）
 * - downloader.ts Range 下载（重试 + 缓存）
 * - parser.ts     MP4 头部解析 + seek 偏移
 */
import {
  waitForSourceBufferIdle,
  clearSourceBufferBefore,
  getFirstBufferedStartAfter,
} from '../../services/buffer-manager'
import { MediaTrack } from './track'
import type { PlayerController } from '../../types'
import {
  INITIAL_APPEND_TIMEOUT_MS,
  SEEK_FLUSH_TIMEOUT_MS,
  MEDIA_SOURCE_OPEN_TIMEOUT_MS,
  type MsePlayerOptions,
  type SeekResult,
} from './types'

type PlayerState = 'idle' | 'attaching' | 'attached' | 'seeking' | 'disposed'

/** 构造一个可被外部 resolve 的 Promise */
function createDeferred<T>(): {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
} {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError'
}

function fail(message: string, needReload = false): SeekResult {
  return { success: false, message, needReload }
}

export class MsePlayer implements PlayerController {
  private readonly video: HTMLVideoElement
  private readonly videoUrl: string
  private readonly audioUrl: string
  private readonly videoCodec?: string
  private readonly audioCodec?: string
  private readonly duration?: number

  private mediaSource: MediaSource | null = null
  private objectUrl: string | null = null
  private videoTrack: MediaTrack | null = null
  private audioTrack: MediaTrack | null = null
  private videoSb: SourceBuffer | null = null
  private audioSb: SourceBuffer | null = null

  private abortController: AbortController | null = null
  private state: PlayerState = 'idle'
  private readonly onError: (e: Event) => void

  constructor(options: MsePlayerOptions) {
    this.video = options.video
    this.videoUrl = options.videoUrl
    this.audioUrl = options.audioUrl
    this.videoCodec = options.videoCodec
    this.audioCodec = options.audioCodec
    this.duration = options.duration

    // 诊断：监听 video.error 事件，记录 error code / message 与当前播放器状态，
    // 便于定位 CHUNK_DEMUXER_ERROR_APPEND_FAILED 等致命错误的发生时机。
    this.onError = (e: Event) => {
      const v = e.target as HTMLVideoElement
      const err = v.error
      if (err) {
        console.error(
          `[MsePlayer] video.error 事件: code=${err.code} message=${err.message} state=${this.state} currentTime=${v.currentTime.toFixed(2)}s readyState=${v.readyState}`
        )
      }
    }
    this.video.addEventListener('error', this.onError)
  }

  // ── 公开 API ──────────────────────────────────────

  /** 创建 MediaSource 并开始下载。返回 blob URL。 */
  async attach(startTime?: number): Promise<string> {
    if (this.state !== 'idle') {
      throw new Error(`MsePlayer 状态不允许 attach: ${this.state}`)
    }
    this.state = 'attaching'
    this.abortController = new AbortController()
    const signal = this.abortController.signal

    try {
      // 1. 创建 MediaSource + SourceBuffers
      const { mediaSource, objectUrl, videoSb, audioSb } =
        await this.createMediaSource()
      this.mediaSource = mediaSource
      this.objectUrl = objectUrl
      this.videoSb = videoSb
      this.audioSb = audioSb

      // 2. 构建双轨
      this.videoTrack = new MediaTrack({
        sb: videoSb,
        url: this.videoUrl,
        video: this.video,
        isSuperseded: () => this.state === 'disposed',
      })
      this.audioTrack = new MediaTrack({
        sb: audioSb,
        url: this.audioUrl,
        video: this.video,
        isSuperseded: () => this.state === 'disposed',
      })

      // 3. 下载并解析头部（并行）
      const [videoOffset, audioOffset] = await Promise.all([
        this.videoTrack.loadHead(signal, startTime),
        this.audioTrack.loadHead(signal, startTime),
      ])
      if (signal.aborted || this.isDisposed()) {
        throw new Error('attach 被取消')
      }

      // 3.5 用权威 duration 覆盖 meta.duration（如果 mvhd 解析值不可靠）。
      //   B站 fMP4 流的 mvhd.duration 为 0（fMP4 整体 duration 在 moof 累积），
      //   导致 calculateSeekOffset / calculateFlushSize 的线性估算 fallback 失效：
      //   meta.duration=0 时 ratio=targetTime/0=Infinity，offset≈totalSize*0.99，
      //   seek 到末尾附近时请求 Range 超出文件大小触发 416。
      //   此处用后端权威值覆盖，确保 seek 计算正确。
      this.applyAuthoritativeDuration()

      // 4. 启动双轨流式下载（后台），并等待首次 append
      const firstAppend = this.runDualStream(signal, [
        { track: this.videoTrack, offset: videoOffset },
        { track: this.audioTrack, offset: audioOffset },
      ])
      // attach 路径超时仅告警（慢网络下不阻断），由调用方继续等待 metadata
      await this.waitFirstAppend(firstAppend, INITIAL_APPEND_TIMEOUT_MS, false)

      // 等待期间可能被 cleanup（React Strict Mode 双挂载 / 清晰度切换 / 源切换），
      // 此时 MediaSource 已释放、objectUrl 已 revoke，继续执行会导致状态错乱
      // （disposed → attached）及后续 appendBuffer 抛 InvalidStateError。
      if (signal.aborted || this.isDisposed()) {
        throw new Error('attach 被取消')
      }

      // 5. 显式设置 MediaSource.duration（B站 fMP4 流 mvhd.duration=0，
      //    浏览器从 mvhd 推断的 video.duration 不可靠）。
      //    必须在首次 append 后设置：MediaSource 需处于 'open' 状态且 SourceBuffer
      //    已有数据，否则 duration 设置可能被忽略或触发 updateend 异常。
      //    设置后浏览器会触发 durationchange 事件，video.duration 同步更新。
      this.setMediaSourceDuration()

      this.state = 'attached'
      return objectUrl
    } catch (err) {
      if (!this.isDisposed()) this.state = 'idle'
      throw err
    }
  }

  /** seek 到目标时间。不重建 MediaSource。 */
  async seekTo(targetTime: number): Promise<SeekResult> {
    console.warn(
      `[MsePlayer] seekTo target=${targetTime.toFixed(1)}s state=${this.state}`
    )
    // 已有 seek 在进行：标记 busy 让调用方把目标挂起（由进行中的流程接续），
    // 而不是走失败兜底（兜底回设 currentTime 会把进度拉回旧目标）
    if (this.state === 'seeking') {
      return { success: false, busy: true, message: '已有 seek 在进行' }
    }
    if (this.state !== 'attached' || !this.videoSb || !this.audioSb) {
      return fail('MSE 未初始化')
    }
    if (!this.abortController || !this.videoTrack || !this.audioTrack) {
      return fail('MSE 未初始化')
    }
    if (this.video.error) {
      return fail('video.error: 需要重载', true)
    }

    this.state = 'seeking'
    const wasPlaying = !this.video.paused

    // 1. abort 旧下载，创建新 controller
    this.abortController.abort()
    const ctrl = new AbortController()
    this.abortController = ctrl
    const { signal } = ctrl

    // 等待可能进行中的 play() Promise 完成后再 pause()，
    // 避免 "play() interrupted by pause()" AbortError。
    // play() Promise 在 microtask 内 resolve/reject，一个 tick 即可。
    if (wasPlaying) {
      await new Promise((r) => setTimeout(r, 0))
    }
    this.video.pause()

    try {
      const { videoSb, audioSb, videoTrack, audioTrack } = this

      // 2. 等待双轨 idle（防御：abort 后可能有在途 append）
      await Promise.all([
        waitForSourceBufferIdle(videoSb),
        waitForSourceBufferIdle(audioSb),
      ])
      if (this.aborted(ctrl)) return fail('跳转被取消')

      // 3. 窗口化清理：仅移除目标点之前的旧数据，保留目标点之后已缓冲的区间。
      //    全量清空会在主线程 remove 大量数据（seek 卡顿的主要来源），
      //    且浪费已下载数据；保留的区间让回退 seek 只需填补缺口。
      await Promise.all([
        clearSourceBufferBefore(videoSb, targetTime),
        clearSourceBufferBefore(audioSb, targetTime),
      ])

      // 4. 目标点之后首个保留区间的起点（缺口终点），用于限制下载范围：
      //    填补到该位置即停，不重复下载已缓冲数据
      const stopAtTime =
        getFirstBufferedStartAfter(videoSb, targetTime) ?? undefined

      // 5. 提前设置 currentTime：UI 立即响应新位置，
      //    且缓冲水位计算以目标位置为基准（否则缺口期间水位虚高）。
      //    设置后等待 seeked 事件，避免在浏览器 seeking 状态下 append 数据
      //    导致 decode error / video.error。
      try {
        this.video.currentTime = targetTime
      } catch {
        /* ignore */
      }
      await this.waitForSeeked(signal)
      if (this.aborted(ctrl)) return fail('跳转被取消')

      // 6. 双轨从目标位置续传（填补到 stopAtTime 即停），等待首次 flush。
      //    init segment append 已移入 seekStream 内部，与 range 下载并行执行，
      //    节省一个 RTT 的首帧等待时间。
      const seekGate = this.runDualSeek(signal, [
        { track: videoTrack, targetTime, stopAtTime },
        { track: audioTrack, targetTime, stopAtTime },
      ])
      const flushed = await this.waitFirstAppend(
        seekGate.promise,
        SEEK_FLUSH_TIMEOUT_MS,
        true
      )

      if (this.aborted(ctrl)) return fail('跳转被取消')
      if (!flushed || this.video.error) {
        const reason = seekGate.error?.message
        return fail(
          reason ? `seek 下载失败: ${reason}` : 'video.error: 需要重载',
          true
        )
      }

      // 8. 恢复播放。
      //    currentTime 在第 5 步已经设置；首次 flush 成功后浏览器应该已经
      //    seek 到目标位置。此处不要再设置 currentTime，避免再次触发
      //    seeking 事件，与 play() Promise 形成竞态，导致 play() interrupted
      //    或反复 seek 卡死。
      if (wasPlaying) this.video.play().catch(() => {})

      // seek 后重新设置 duration：clearSourceBufferBefore 可能清空了所有数据，
      // 导致 MediaSource.duration 被浏览器重置为 NaN，需重新设置以确保 UI 正确
      this.setMediaSourceDuration()

      this.state = 'attached'
      return { success: true }
    } catch (err) {
      if (this.isDisposed()) return fail('已被取代')
      if (isAbortError(err)) return fail('下载被取消')
      if (this.video.error) return fail('video.error: 需要重载', true)
      return fail((err as Error).message, true)
    } finally {
      // seek 被取消/失败时恢复 attached 状态（实例仍可用）
      if (this.state === 'seeking') this.state = 'attached'
    }
  }

  /** 清理所有资源 */
  cleanup(): void {
    this.state = 'disposed'
    this.video.removeEventListener('error', this.onError)
    if (this.abortController) {
      try {
        this.abortController.abort()
      } catch {
        /* ignore */
      }
      this.abortController = null
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl)
      this.objectUrl = null
    }
    this.videoSb = null
    this.audioSb = null
    this.videoTrack = null
    this.audioTrack = null
    this.mediaSource = null
  }

  get isSeeking(): boolean {
    return this.state === 'seeking'
  }
  get isAttached(): boolean {
    return this.state === 'attached' || this.state === 'seeking'
  }

  // ── 私有方法 ──────────────────────────────────────

  /**
   * 实例是否已被 cleanup（disposed）。
   * 通过方法读取避免 TS 控制流窄化：异步等待期间外部可能调用 cleanup 改变状态。
   */
  private isDisposed(): boolean {
    return this.state === 'disposed'
  }

  private aborted(ctrl: AbortController): boolean {
    return this.isDisposed() || ctrl.signal.aborted
  }

  /** 创建 MediaSource + SourceBuffers，等待 sourceopen */
  private async createMediaSource(): Promise<{
    mediaSource: MediaSource
    objectUrl: string
    videoSb: SourceBuffer
    audioSb: SourceBuffer
  }> {
    const ms = new MediaSource()
    const objUrl = URL.createObjectURL(ms)
    this.video.src = objUrl
    this.video.load()

    await new Promise<void>((resolve, reject) => {
      if (ms.readyState === 'open') return resolve()
      let settled = false
      const done = (err?: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (err) reject(err)
        else resolve()
      }
      const timer = setTimeout(
        () => done(new Error('MediaSource 打开超时')),
        MEDIA_SOURCE_OPEN_TIMEOUT_MS
      )
      ms.addEventListener('sourceopen', () => done(), { once: true })
      ms.addEventListener(
        'sourceclose',
        () => done(new Error('MediaSource 已关闭')),
        {
          once: true,
        }
      )
    })

    const vMime = `video/mp4; codecs="${this.videoCodec || 'avc1.64001E'}"`
    const aMime = `audio/mp4; codecs="${this.audioCodec || 'mp4a.40.2'}"`
    if (!MediaSource.isTypeSupported(vMime)) {
      throw new Error(`不支持的视频编码: ${vMime}`)
    }
    if (!MediaSource.isTypeSupported(aMime)) {
      throw new Error(`不支持的音频编码: ${aMime}`)
    }

    return {
      mediaSource: ms,
      objectUrl: objUrl,
      videoSb: ms.addSourceBuffer(vMime),
      audioSb: ms.addSourceBuffer(aMime),
    }
  }

  /**
   * 启动双轨流式下载（attach 路径）。
   * 返回的 Promise 在双轨均完成首次 append 后 resolve；
   * 后台下载完成后尝试 endOfStream。
   *
   * 非 abort 错误（含 video.error）发生时 reject gate，让 attach 路径
   * 的 waitFirstAppend 能感知失败（而非静默超时），加速错误传播与恢复。
   */
  private runDualStream(
    signal: AbortSignal,
    tracks: { track: MediaTrack; offset: number }[]
  ): Promise<void> {
    const gate = this.createAppendGate(tracks.length)
    const errorBox: { error: Error | null } = { error: null }

    const jobs = tracks.map(({ track, offset }) =>
      track
        .stream(offset, signal, {
          needFindMoof: offset > 0,
          onInitialAppend: gate.notify,
        })
        .catch((err: unknown) => {
          if (!isAbortError(err) && this.state !== 'disposed') {
            console.error('[MsePlayer] 后台下载失败:', err)
            errorBox.error = err instanceof Error ? err : new Error(String(err))
            // 非首次 append 前的失败：gate 可能已 resolve，此处 reject 被忽略。
            // 但 gate.promise 已被 waitFirstAppend 消费完毕，此 reject 仅记录。
            // 真正的恢复路径依赖 video error 事件 → stalled/error handler → reload。
            gate.fail(err)
          }
        })
    )

    void Promise.all(jobs).then(() => {
      // 双轨均结束后若发生非 abort 错误（如 video.error），主动触发
      // stalled 事件让上层 useWatchTogether 的 error handler 感知并 reload。
      if (errorBox.error && !signal.aborted && this.state !== 'disposed') {
        console.warn(
          '[MsePlayer] 双轨下载存在错误，可能需要重载:',
          errorBox.error.message
        )
      }
      this.tryEndOfStream(signal)
    })
    return gate.promise
  }

  /**
   * 启动双轨 seek 续传（seekTo 路径）。
   * 返回的 gate.promise 在双轨均完成首次 flush 后 resolve，
   * 任一轨失败时 reject 并记录 gate.error 供诊断；
   * 后台下载完成后尝试 endOfStream。
   */
  private runDualSeek(
    signal: AbortSignal,
    tracks: { track: MediaTrack; targetTime: number; stopAtTime?: number }[]
  ): { promise: Promise<void>; error: Error | null } {
    const gate = this.createAppendGate(tracks.length)
    const errorBox: { error: Error | null } = { error: null }

    const jobs = tracks.map(({ track, targetTime, stopAtTime }) =>
      track
        .seekStream(targetTime, signal, gate.notify, stopAtTime)
        .catch((err: unknown) => {
          if (!isAbortError(err) && this.state !== 'disposed') {
            console.error('[MsePlayer] seek 后台下载失败:', err)
            errorBox.error = err instanceof Error ? err : new Error(String(err))
            gate.fail(err)
          }
        })
    )

    void Promise.all(jobs).then(() => this.tryEndOfStream(signal))
    return {
      promise: gate.promise,
      get error() {
        return errorBox.error
      },
    }
  }

  /** 首次 append 门闩：count 条轨全部 notify 后 resolve */
  private createAppendGate(count: number): {
    promise: Promise<void>
    notify: () => void
    fail: (err: unknown) => void
  } {
    const deferred = createDeferred<void>()
    let remaining = count
    let settled = false
    return {
      promise: deferred.promise,
      notify: () => {
        if (settled) return
        remaining -= 1
        if (remaining <= 0) {
          settled = true
          deferred.resolve()
        }
      },
      fail: (err: unknown) => {
        if (settled) return
        settled = true
        deferred.reject(err)
      },
    }
  }

  /**
   * 等待首次 append（带超时）。
   *
   * @param timeoutIsFailure true（seek 路径）：超时或 gate 失败返回 false；
   *                         false（attach 路径）：超时仅告警并返回 true，
   *                         保持 v1 行为——慢网络下不阻断后续流程；
   *                         gate 失败（首次 append 出错）在两种路径下都返回 false，
   *                         避免实例带着损坏的 SourceBuffer 进入 attached 状态。
   */
  private async waitFirstAppend(
    gate: Promise<void>,
    timeoutMs: number,
    timeoutIsFailure: boolean
  ): Promise<boolean> {
    const timeout = new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), timeoutMs)
    )
    const result = await Promise.race([
      gate.then(
        () => 'ok' as const,
        () => 'error' as const
      ),
      timeout,
    ])
    if (result === 'error') {
      // 首次 append 失败：实例已不可用，不能让 attach 假装成功。
      // attach 路径上层会 catch 并清理；seek 路径会走 needReload 恢复。
      return false
    }
    if (result === 'timeout') {
      if (this.state !== 'disposed') {
        console.warn('[MsePlayer] 首次数据等待超时')
      }
      return !timeoutIsFailure
    }
    return true
  }

  /**
   * 等待 video 的 seeked 事件（或 abort）。
   *
   * 在 seekTo 中设置 currentTime 后调用：浏览器进入 seeking 状态，
   * 此时立刻 append 数据可能触发 decode error。等待 seeked 后再开始
   * Range 下载与 append，可显著降低跳转后的 video.error 概率。
   */
  private async waitForSeeked(signal: AbortSignal): Promise<void> {
    if (!this.video.seeking) return
    return new Promise((resolve) => {
      let settled = false
      const done = () => {
        if (settled) return
        settled = true
        this.video.removeEventListener('seeked', onSeeked)
        signal.removeEventListener('abort', onAbort)
        resolve()
      }
      const onSeeked = () => done()
      const onAbort = () => done()
      this.video.addEventListener('seeked', onSeeked, { once: true })
      signal.addEventListener('abort', onAbort, { once: true })
      // 兜底：即使事件未触发也不永久挂起
      setTimeout(done, 1000)
    })
  }

  /** 双轨全部下载完成后尝试 endOfStream */
  private tryEndOfStream(signal: AbortSignal): void {
    if (
      !signal.aborted &&
      this.state !== 'disposed' &&
      this.mediaSource?.readyState === 'open'
    ) {
      try {
        this.mediaSource.endOfStream()
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * 显式设置 MediaSource.duration。
   *
   * B站 fMP4 流的 mvhd.duration 为 0（fMP4 整体 duration 在 moof 的 tfdt 中累积），
   * 浏览器从 mvhd 推断的 video.duration 不可靠（0 或仅覆盖已缓冲区间）。
   * 使用后端 resolve 接口返回的权威 duration 设置 MediaSource.duration，
   * 确保控制栏时间显示、进度条比例、seek 行为正确。
   *
   * 设置条件：
   * - MediaSource 处于 'open' 状态（关闭后无法设置）
   * - duration 为有限正数（避免 0 / NaN / Infinity 覆盖浏览器推断值）
   * - 当前 duration 与目标差异超过 1 秒（避免无意义更新触发 durationchange 风暴）
   */
  private setMediaSourceDuration(): void {
    if (!this.mediaSource) return
    if (this.mediaSource.readyState !== 'open') return
    const target = this.duration
    if (!Number.isFinite(target) || target <= 0) return
    const current = this.mediaSource.duration
    if (Number.isFinite(current) && Math.abs(current - target) < 1) return
    try {
      this.mediaSource.duration = target
    } catch (err) {
      // 设置失败不阻断播放，浏览器会从已 append 的数据推断 duration
      console.warn('[MsePlayer] 设置 MediaSource.duration 失败:', err)
    }
  }

  /**
   * 用权威 duration 覆盖 meta.duration（当 mvhd 解析值不可靠时）。
   *
   * B站 fMP4 流的 mvhd.duration 为 0，导致 calculateSeekOffset 的线性估算
   * fallback 失效（ratio=Infinity → offset≈totalSize → 416 Range Not Satisfiable）。
   * 在 loadHead 完成后、启动流式下载前调用，确保 seek 计算使用正确时长。
   *
   * 覆盖条件：
   * - 权威 duration 存在且为有限正数
   * - meta.duration 不可靠（null / 0 / 与权威值差异超过 5 秒）
   */
  private applyAuthoritativeDuration(): void {
    const auth = this.duration
    if (!Number.isFinite(auth) || auth <= 0) return
    const override = (track: MediaTrack | null) => {
      if (!track) return
      const meta = track.meta
      if (
        meta.duration === null ||
        meta.duration === 0 ||
        Math.abs(meta.duration - auth) > 5
      ) {
        if (meta.duration !== auth) {
          console.warn(
            `[MsePlayer] 覆盖 meta.duration: ${meta.duration} → ${auth}（mvhd 不可靠，使用后端权威值）`
          )
        }
        meta.duration = auth
      }
    }
    override(this.videoTrack)
    override(this.audioTrack)
  }
}

export type { MsePlayerOptions } from './types'
// SeekResult 已上移到 player/types.ts（PlayerController 接口的一部分）
export type { SeekResult } from '../../types'
