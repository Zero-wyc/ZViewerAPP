/**
 * 一起听「音量均衡」——B 方案：只衰减，不接管音频输出。
 *
 * 为什么不用 MediaElementAudioSourceNode：
 * 一旦把媒体元素接进 Web Audio 图，出声就完全依赖 AudioContext 是否 running
 * （上下文挂起 = 进度在走但没声音），而后台/锁屏播放是一起听的刚需。
 * 这里改用 captureStream 旁路取流测响度（与 AudioVisualizer 同思路），
 * 再把增益乘进 audio.volume：AudioContext 出问题最多是「不再自动调整」，
 * 绝不会把声音弄没。
 *
 * 关键前提（已实测）：captureStream 取到的是**音量之前**的信号 ——
 * 元素 volume=0.25 / muted=true 时 analyser 的 RMS 不变。因此测量结果与
 * 用户音量、与自身施加的增益都无关，不会形成「压低 → 测得更低 → 再压低」
 * 的反馈环。
 *
 * 生命周期：元素创建时 attach，退役时 detach；当前播放元素按需建立 tap
 * （captureStream + K 计权 + analyser），每 100ms 读一块算一次响度。
 * 关闭开关时不建 AudioContext、不跑定时器（零开销）。
 */
import {
  CACHE_MIN_MEASURED_MS,
  GAIN_DEADBAND_DB,
  LoudnessAccumulator,
  kWeightingCoefficients,
  targetGainFromLufs,
  gainToDb,
  smoothGain,
  dbToGain,
  MIN_GAIN_DB,
} from './loudness'

/** 采样间隔（ms）；后台标签页被节流到 1s 也能如实计时 */
const TICK_MS = 100
/** analyser 窗口：4096 样本（48kHz 约 85ms），比定时器间隔略短即可 */
const FFT_SIZE = 4096
/** captureStream 拿不到音轨时的重试上限（元素尚未加载元数据）与退避间隔 */
const MAX_ATTACH_RETRIES = 20
const ATTACH_RETRY_MS = 250
/** 增益缓存（localStorage）key 与容量上限 */
const STORAGE_KEY = 'zc-music-loudness-v1'
const CACHE_LIMIT = 800

type CaptureCapableMedia = HTMLAudioElement & {
  captureStream?: () => MediaStream
  mozCaptureStream?: () => MediaStream
}

interface Tap {
  stream: MediaStream
  source: MediaStreamAudioSourceNode
  shelf: IIRFilterNode
  highpass: IIRFilterNode
  analyser: AnalyserNode
  sink: GainNode
  buffer: Float32Array<ArrayBuffer>
}

interface GainEntry {
  gain: number
  lufs: number
  ts: number
}

type GainListener = (gain: number) => void

export class LoudnessNormalizer {
  private enabled = false
  /** 当前浏览器是否支持 captureStream（不支持则整个功能静默失效） */
  private supported = true
  private ctx: AudioContext | null = null
  private taps = new Map<HTMLAudioElement, Tap>()
  private retries = new Map<HTMLAudioElement, number>()
  private lastAttemptAt = new Map<HTMLAudioElement, number>()
  private elements = new Set<HTMLAudioElement>()
  private timer: ReturnType<typeof setInterval> | null = null
  private acc = new LoudnessAccumulator()
  /** 当前施加的线性增益（0–1） */
  private gain = 1
  private lastTickAt = 0
  private lastResumeAt = 0
  private trackKey: string | null = null
  private listener: GainListener | null = null
  private cache = new Map<string, GainEntry>()
  private cacheLoaded = false
  private cacheWritten = false

  /** 本机设置；关闭时释放分析资源并恢复用户音量。 */
  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return
    this.enabled = enabled
    if (enabled) {
      this.supported = true
      this.retries.clear()
      this.lastAttemptAt.clear()
      this.acc.reset()
      const cached = this.trackKey ? this.readCache(this.trackKey) : null
      if (cached) this.setGain(cached.gain)
      // 开关点击本身是用户手势：立刻建/唤醒 AudioContext，避免首次采样
      // 落在挂起状态读到静音（之后由定时器兜底重试 resume）
      this.ensureContext()
      if (this.supported) this.startTimer()
      return
    }
    this.stopTimer()
    this.releaseAllTaps()
    this.acc.reset()
    this.setGain(1)
  }

  isEnabled(): boolean {
    return this.enabled
  }

  /** 元素创建后登记（不立即建 tap，等它真的开始播） */
  attach(el: HTMLAudioElement): void {
    this.elements.add(el)
    if (this.enabled && this.supported) this.startTimer()
  }

  /** 元素退役（预载元素丢弃 / 换播元素 / dispose） */
  detach(el: HTMLAudioElement): void {
    this.elements.delete(el)
    this.disposeTap(el)
    this.retries.delete(el)
    this.lastAttemptAt.delete(el)
    if (this.elements.size === 0) {
      this.stopTimer()
      this.releaseAllTaps()
    }
  }

  /**
   * 换曲：命中缓存就直接用上次测得的增益，否则沿用上一首的增益
   * （同一专辑/同一音源通常接近），随后由积分器在数秒内自行收敛。
   */
  beginTrack(key: string | null): void {
    if (key === this.trackKey) return
    this.trackKey = key
    for (const el of [...this.taps.keys()]) this.disposeTap(el)
    this.retries.clear()
    this.lastAttemptAt.clear()
    this.acc.reset()
    this.cacheWritten = false
    if (!key || !this.enabled) { this.setGain(1); return }
    const cached = this.readCache(key)
    if (cached) this.setGain(cached.gain)
  }

  /** 当前增益（线性 0–1）；调用方用它乘用户音量 */
  getGain(): number {
    return this.enabled && this.supported ? this.gain : 1
  }

  /** 增益变化回调（只允许一个消费方：一起听播放链路） */
  setGainListener(listener: GainListener | null): void {
    this.listener = listener
  }

  // ===== 内部：定时采样 =====

  private startTimer(): void {
    if (this.timer != null) return
    this.lastTickAt = performance.now()
    this.timer = setInterval(() => this.tick(), TICK_MS)
  }

  private stopTimer(): void {
    if (this.timer == null) return
    clearInterval(this.timer)
    this.timer = null
  }

  private tick(): void {
    try { this.sample() } catch { this.disableAnalysis() }
  }

  private disableAnalysis(): void {
    this.supported = false
    this.stopTimer()
    this.releaseAllTaps()
    this.setGain(1)
  }

  private sample(): void {
    if (!this.enabled || !this.supported) return
    const now = performance.now()
    // 后台节流时 dt 会拉长：如实传入，让积分与平滑按真实时长推进
    const dt = Math.min(2000, Math.max(TICK_MS, now - this.lastTickAt))
    this.lastTickAt = now
    const el = this.pickActive()
    if (!el) return
    const context = this.ensureContext()
    if (!context || context.state !== 'running') return
    const tap = this.ensureTap(el)
    if (!tap) return

    tap.analyser.getFloatTimeDomainData(tap.buffer)
    let sum = 0
    for (let i = 0; i < tap.buffer.length; i++) {
      const v = tap.buffer[i]
      sum += v * v
    }
    if (!this.acc.push(sum / tap.buffer.length, dt)) return

    const lufs = this.acc.lufs
    const desired = targetGainFromLufs(lufs)
    this.maybeWriteCache(lufs)
    // 死区按「目标与当前的距离」判定，不能按每步的位移（否则永远迈不过去）
    if (Math.abs(gainToDb(desired) - gainToDb(this.gain)) < GAIN_DEADBAND_DB)
      return
    this.setGain(smoothGain(this.gain, desired, dt))
  }

  /** 当前真正在播的元素（预载元素 paused，自然不会选中） */
  private pickActive(): HTMLAudioElement | null {
    for (const el of this.elements) {
      if (!el.paused && !el.ended && el.readyState >= 2 && !el.muted) return el
    }
    return null
  }

  private setGain(next: number): void {
    const value = Math.min(1, Math.max(0, next))
    if (Math.abs(value - this.gain) < 1e-4) return
    this.gain = value
    this.listener?.(value)
  }

  // ===== 内部：Web Audio 图 =====

  private ensureContext(): AudioContext | null {
    if (this.ctx) {
      // 无手势创建会挂起；每秒尝试唤醒一次即可（挂起只影响「能不能自动调」，
      // 不影响出声，所以失败无需处理）
      if (
        this.ctx.state === 'suspended' &&
        performance.now() - this.lastResumeAt > 1000
      ) {
        this.lastResumeAt = performance.now()
        void this.ctx.resume().catch(() => {})
      }
      return this.ctx
    }
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!Ctor) {
      this.disableAnalysis()
      return null
    }
    try {
      this.ctx = new Ctor()
    } catch {
      this.disableAnalysis()
      return null
    }
    this.lastResumeAt = performance.now()
    void this.ctx.resume().catch(() => {})
    return this.ctx
  }

  private ensureTap(el: HTMLAudioElement): Tap | null {
    const existing = this.taps.get(el)
    if (existing) return existing
    const ctx = this.ctx
    if (!ctx) return null
    const captureEl = el as CaptureCapableMedia
    const capture =
      captureEl.captureStream?.bind(el) ?? captureEl.mozCaptureStream?.bind(el)
    if (!capture) {
      // Safari 等不支持 captureStream 的浏览器：功能静默失效，播放不受影响
      this.disableAnalysis()
      return null
    }
    // 元素尚未产生音轨（元数据没到 / 刚换源）时按 250ms 退避重试，避免每 100ms
    // 调一次 captureStream；总时长约 5s，仍拿不到就放弃本元素
    const attempts = this.retries.get(el) ?? 0
    if (attempts >= MAX_ATTACH_RETRIES) return null
    if (
      performance.now() - (this.lastAttemptAt.get(el) ?? 0) <
      ATTACH_RETRY_MS
    ) {
      return null
    }
    this.lastAttemptAt.set(el, performance.now())
    let stream: MediaStream | undefined
    try {
      stream = capture()
    } catch {
      // 元素还没准备好（或浏览器拒绝）：按退避策略下次再试
    }
    const tracks = stream?.getAudioTracks() ?? []
    if (!stream || tracks.length === 0) {
      // 失败流也要停掉音轨，避免反复建 MediaStream 泄漏
      stream?.getTracks().forEach((track) => track.stop())
      this.retries.set(el, attempts + 1)
      return null
    }

    const { shelf, highpass } = kWeightingCoefficients(ctx.sampleRate)
    const nodes: AudioNode[] = []
    const keep = <T extends AudioNode>(node: T): T => { nodes.push(node); return node }
    try {
      const source = keep(ctx.createMediaStreamSource(stream))
      const shelfNode = keep(ctx.createIIRFilter(shelf.feedforward, shelf.feedback))
      const hpNode = keep(ctx.createIIRFilter(highpass.feedforward, highpass.feedback))
      const analyser = keep(ctx.createAnalyser())
      analyser.fftSize = FFT_SIZE
      // 末端挂一个 0 增益的汇点：保证分析节点在图上被持续驱动，且不额外出声
      const sink = keep(ctx.createGain())
      sink.gain.value = 0
      source.connect(shelfNode)
      shelfNode.connect(hpNode)
      hpNode.connect(analyser)
      analyser.connect(sink)
      sink.connect(ctx.destination)

      const tap: Tap = {
        stream,
        source,
        shelf: shelfNode,
        highpass: hpNode,
        analyser,
        sink,
        buffer: new Float32Array(new ArrayBuffer(analyser.fftSize * 4)),
      }
      this.taps.set(el, tap)
      this.retries.delete(el)
      return tap
    } catch (error) {
      for (const node of nodes) { try { node.disconnect() } catch { /* released */ } }
      stream.getTracks().forEach(track => track.stop())
      throw error
    }
  }

  private disposeTap(el: HTMLAudioElement): void {
    const tap = this.taps.get(el)
    if (!tap) return
    this.taps.delete(el)
    try {
      tap.stream.getTracks().forEach((track) => track.stop())
    } catch {
      // ignore
    }
    for (const node of [
      tap.source,
      tap.shelf,
      tap.highpass,
      tap.analyser,
      tap.sink,
    ]) {
      try {
        node.disconnect()
      } catch {
        // ignore
      }
    }
  }

  private releaseAllTaps(): void {
    for (const el of [...this.taps.keys()]) this.disposeTap(el)
    if (this.ctx) {
      const ctx = this.ctx
      this.ctx = null
      void ctx.close().catch(() => {})
    }
  }

  // ===== 内部：增益缓存（localStorage，跨会话语义） =====

  private loadCache(): void {
    if (this.cacheLoaded) return
    this.cacheLoaded = true
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as Record<string, GainEntry>
      for (const [key, entry] of Object.entries(parsed)) {
        if (
          entry &&
          Number.isFinite(entry.gain) &&
          entry.gain >= dbToGain(MIN_GAIN_DB) &&
          entry.gain <= 1 && Number.isFinite(entry.lufs) && Number.isFinite(entry.ts)
        ) {
          this.cache.set(key, entry)
        }
      }
    } catch {
      // 隐私模式 / 脏数据：当作没有缓存
    }
  }

  private readCache(key: string): GainEntry | null {
    this.loadCache()
    return this.cache.get(key) ?? null
  }

  private maybeWriteCache(lufs: number): void {
    if (this.cacheWritten || !this.trackKey) return
    if (this.acc.measuredMs < CACHE_MIN_MEASURED_MS) return
    this.cacheWritten = true
    this.loadCache()
    this.cache.set(this.trackKey, {
      // 存「目标增益」而非平滑中的当前值，下次进入直接到位
      gain: targetGainFromLufs(lufs),
      lufs,
      ts: Date.now(),
    })
    if (this.cache.size > CACHE_LIMIT) {
      const sorted = [...this.cache.entries()].sort((a, b) => a[1].ts - b[1].ts)
      const overflow = sorted.length - CACHE_LIMIT
      for (let i = 0; i < overflow; i++) this.cache.delete(sorted[i][0])
    }
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(Object.fromEntries(this.cache))
      )
    } catch {
      // 配额不足等：下次再试
    }
  }
}

/** 单例：一起听同一时刻只有一个播放链路 */
export const loudnessNormalizer = new LoudnessNormalizer()
