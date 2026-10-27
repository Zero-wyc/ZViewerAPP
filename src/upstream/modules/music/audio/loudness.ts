/**
 * 响度（LUFS 近似）与增益换算 —— 纯函数，无 DOM、无副作用。
 *
 * 一起听的「音量均衡」只做衰减、不做提升（增益上限 1），所以不需要限幅器，
 * 也不会把本机音量推到削波。
 *
 * 响度口径按 BS.1770：K 计权（高架 + RLB 高通）后取均方能量，
 * LUFS ≈ -0.691 + 10·log10(均方)。与 ffmpeg ebur128 / 流媒体平台一致到
 * ±1 LU 量级，用于「让每首歌听起来差不多响」足够。
 */

/** 目标响度（LUFS）：-14 与主流流媒体平台对齐 */
export const LOUDNESS_TARGET_LUFS = -14
/** 最小增益（dB）：最多把偏响的歌压低 12 dB */
export const MIN_GAIN_DB = -12
/** 绝对门限（LUFS）：低于该值的块不计入积分（前奏 / 间奏 / 淡出） */
export const SILENCE_GATE_LUFS = -50
/** 积分时间常数（ms）：越小收敛越快、越易被段落带偏 */
export const INTEGRATE_TAU_MS = 3000
/** 增益平滑时间常数（ms）：越大越平滑、越不容易听出「呼吸感」 */
export const GAIN_TAU_MS = 2000
/** 增益死区（dB）：目标与当前差值小于该值时不动作 */
export const GAIN_DEADBAND_DB = 0.3
/** 统计块时长（ms）：与采样定时器一致 */
export const BLOCK_MS = 100
/** 写入增益缓存前要求的最短累计测量时长（ms） */
export const CACHE_MIN_MEASURED_MS = 8000

/** 数值夹取到 [min, max] */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

/** 均方能量（0–1）→ LUFS；无信号时返回 -Infinity */
export function meanSquareToLufs(meanSquare: number): number {
  if (!(meanSquare > 0)) return Number.NEGATIVE_INFINITY
  return -0.691 + 10 * Math.log10(meanSquare)
}

/** dB → 线性增益 */
export function dbToGain(db: number): number {
  return Math.pow(10, db / 20)
}

/** 线性增益 → dB（0 及以下返回 -Infinity） */
export function gainToDb(gain: number): number {
  return gain > 0 ? 20 * Math.log10(gain) : Number.NEGATIVE_INFINITY
}

/**
 * 由测得响度求目标增益（线性，0 < g ≤ 1）。
 * 测不出来、或该曲本来就不够响时返回 1 —— 只衰减，不提升。
 */
export function targetGainFromLufs(
  lufs: number,
  targetLufs: number = LOUDNESS_TARGET_LUFS
): number {
  if (!Number.isFinite(lufs)) return 1
  return dbToGain(clamp(targetLufs - lufs, MIN_GAIN_DB, 0))
}

/**
 * 一阶指数平滑：让增益在 tauMs 的时间尺度上趋近目标（防泵动）。
 * dtMs 为实际经过的时间（后台定时器被节流时也要如实传）。
 */
export function smoothGain(
  prev: number,
  next: number,
  dtMs: number,
  tauMs: number = GAIN_TAU_MS
): number {
  if (tauMs <= 0) return next
  if (!(dtMs > 0)) return prev
  const k = 1 - Math.exp(-dtMs / tauMs)
  return prev + (next - prev) * k
}

/**
 * 响度积分器：能量域一阶低通 + 静音门限。
 *
 * 直接对 dB 求平均会被静音段和极轻段落拉偏，因此在均方能量域累积；
 * 低于 SILENCE_GATE_LUFS 的块直接丢弃（不推进 weight）。
 */
export class LoudnessAccumulator {
  /** 累积的均方能量（能量域均值） */
  private energy = 0
  /** 已计入的总时长（ms），用于判断是否收敛 */
  private weight = 0

  /**
   * 推入一块统计结果。
   * @returns 是否被计入（静音块返回 false）
   */
  push(meanSquare: number, dtMs: number = BLOCK_MS): boolean {
    if (!(meanSquare > 0) || !(dtMs > 0)) return false
    if (meanSquareToLufs(meanSquare) < SILENCE_GATE_LUFS) return false
    const k = 1 - Math.exp(-dtMs / INTEGRATE_TAU_MS)
    this.energy =
      this.weight === 0
        ? meanSquare
        : this.energy + (meanSquare - this.energy) * k
    // 上限只用于「是否已收敛」的判断，避免长时间播放后数值无界增长
    this.weight = Math.min(this.weight + dtMs, INTEGRATE_TAU_MS * 4)
    return true
  }

  /** 当前积分响度（LUFS）；尚无有效块时为 -Infinity */
  get lufs(): number {
    return this.weight === 0
      ? Number.NEGATIVE_INFINITY
      : meanSquareToLufs(this.energy)
  }

  /** 已累计的有效时长（ms） */
  get measuredMs(): number {
    return this.weight
  }

  reset(): void {
    this.energy = 0
    this.weight = 0
  }
}

/** 二阶 IIR 系数（createIIRFilter 的两组入参，已按 a0 归一化） */
export interface BiquadCoefficients {
  /** 前馈 [b0, b1, b2] */
  feedforward: [number, number, number]
  /** 反馈 [1, a1, a2] */
  feedback: [number, number, number]
}

/**
 * BS.1770 的 K 计权两级系数（按采样率现算）。
 *
 * - 第一级：高架滤波 f0=1681.97 Hz / +3.999 dB / Q=0.7072
 * - 第二级：RLB 高通 f0=38.13 Hz / Q=0.5003
 *
 * 48 kHz 下与标准给出的常量一致（b0≈1.53512 / a1≈-1.69066 / a2≈0.73248，
 * 高通 a1≈-1.99005 / a2≈0.99007），单测有覆盖。
 */
export function kWeightingCoefficients(sampleRate: number): {
  shelf: BiquadCoefficients
  highpass: BiquadCoefficients
} {
  const sr = sampleRate > 0 ? sampleRate : 48000
  // 第一级：高架（BS.1770-4 参考实现的换算方式）
  const shelfF0 = 1681.974450955533
  const shelfGain = 3.999843853973347
  const shelfQ = 0.7071752369554196
  const kShelf = Math.tan((Math.PI * shelfF0) / sr)
  const vh = Math.pow(10, shelfGain / 20)
  const vb = Math.pow(vh, 0.4996667741545416)
  const shelfA0 = 1 + kShelf / shelfQ + kShelf * kShelf
  const shelf: BiquadCoefficients = {
    feedforward: [
      (vh + (vb * kShelf) / shelfQ + kShelf * kShelf) / shelfA0,
      (2 * (kShelf * kShelf - vh)) / shelfA0,
      (vh - (vb * kShelf) / shelfQ + kShelf * kShelf) / shelfA0,
    ],
    feedback: [
      1,
      (2 * (kShelf * kShelf - 1)) / shelfA0,
      (1 - kShelf / shelfQ + kShelf * kShelf) / shelfA0,
    ],
  }

  // 第二级：RLB 高通。分子固定为 (1, -2, 1)（BS.1770 标准形式，
  // 不要按 a0 归一化，否则通带会整体偏 -0.04 dB）
  const hpF0 = 38.13547087602444
  const hpQ = 0.5003270373238773
  const kHp = Math.tan((Math.PI * hpF0) / sr)
  const hpA0 = 1 + kHp / hpQ + kHp * kHp
  const highpass: BiquadCoefficients = {
    feedforward: [1, -2, 1],
    feedback: [
      1,
      (2 * (kHp * kHp - 1)) / hpA0,
      (1 - kHp / hpQ + kHp * kHp) / hpA0,
    ],
  }

  return { shelf, highpass }
}
