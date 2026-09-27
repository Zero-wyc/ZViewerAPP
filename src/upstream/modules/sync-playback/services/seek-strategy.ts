/**
 * Seek 策略服务
 *
 * 提供观众端 seek 跟随与缓冲检测的纯函数。
 *
 * - `getAdaptiveSeekThreshold`: 按播放倍速自适应的 seek 跟随阈值
 * - `shouldSeekToHost`: 判断观众是否需要 seek 到房主进度
 * - `isInBufferedRange`: 检查指定时间是否在 video 的缓冲范围内
 * - `isMseStream`: 判断当前源是否为 MSE 流
 */
import type { WatchTogetherState } from '../types'
import { SEEK_FOLLOW_THRESHOLD } from '../constants'

/** 硬 seek 阈值（秒）。差异超过此值才执行硬跳转，小幅差异走软同步追赶。 */
export const HARD_SEEK_THRESHOLD_SEC = 6

/** 软同步追赶倍速增量。基准倍速 + 该增量，渐进追赶差异。 */
export const CATCH_UP_RATE_DELTA = 0.1

/** 软同步最大倍速（防止过度加速）。 */
export const CATCH_UP_MAX_RATE = 2.0

/**
 * 计算软同步追赶倍速。
 *
 * P2-Opt#9：观众端进度与房主差异在"阈值以上但未超过硬 seek 阈值"时，
 * 用略微提高的 playbackRate 渐进追赶，避免频繁硬 seek 打断播放连续性。
 *
 * @param baseRate 房主广播的基准倍速
 * @returns 轻柔的追赶倍速（baseRate + 0.1，封顶 CATCH_UP_MAX_RATE）
 */
export function getCatchUpRate(baseRate: number): number {
  const rate = (baseRate || 1) + CATCH_UP_RATE_DELTA
  return Math.min(rate, CATCH_UP_MAX_RATE)
}

/**
 * 判断差异是否落在软同步区间（threshold < diff ≤ HARD_SEEK_THRESHOLD_SEC）。
 * 该区间内通过调整 playbackRate 渐进追赶；超出硬 seek 阈值则直接 seek。
 */
export function shouldSoftSync(
  localTime: number,
  hostTime: number,
  playbackRate: number
): boolean {
  const threshold = getAdaptiveSeekThreshold(playbackRate)
  const diff = Math.abs(localTime - hostTime)
  return diff > threshold && diff <= HARD_SEEK_THRESHOLD_SEC
}

/**
 * 按播放倍速自适应的 seek 跟随阈值。
 *
 * 旧实现使用固定 0.5s 阈值，在 2x/4x 倍速下会高频 seek 导致抖动。
 * v2 实现：`max(SEEK_FOLLOW_THRESHOLD, playbackRate * 0.5)`
 * v3 调优：SEEK_FOLLOW_THRESHOLD 提升至 3s，避免小幅漂移触发 seek 卡顿。
 *   - 1x 倍速：3s（基准阈值）
 *   - 2x 倍速：3s（2*0.5=1 < 3，取基准）
 *   - 4x 倍速：3s（4*0.5=2 < 3，取基准）
 *   - 6x+ 倍速：playbackRate * 0.5（超过基准时按倍速放大）
 */
export function getAdaptiveSeekThreshold(playbackRate: number): number {
  return Math.max(SEEK_FOLLOW_THRESHOLD, playbackRate * 0.5)
}

/**
 * 判断观众是否需要 seek 到房主进度。
 */
export function shouldSeekToHost(
  localTime: number,
  hostTime: number,
  playbackRate: number
): boolean {
  const threshold = getAdaptiveSeekThreshold(playbackRate)
  return Math.abs(localTime - hostTime) > threshold
}

/**
 * 检查指定时间是否在 video 元素的缓冲范围内。
 *
 * 用于判断 seek 目标位置是否已有数据可播放：
 * - true：浏览器可直接 seek，无需 MSE seek
 * - false：需要调用 引擎 seekTo 重新加载
 */
export function isInBufferedRange(
  video: HTMLVideoElement,
  time: number
): boolean {
  for (let i = 0; i < video.buffered.length; i++) {
    if (time >= video.buffered.start(i) && time <= video.buffered.end(i)) {
      return true
    }
  }
  return false
}

/**
 * 判断当前源是否为 MSE 流。
 *
 * MSE 流（DASH / 含 audioUrl）的 seek 需要调用 引擎 seekTo，
 * 普通mp4 直链由浏览器原生处理。
 */
export function isMseStream(state: WatchTogetherState): boolean {
  return state.format === 'dash' || !!state.audioUrl
}

/**
 * 向前跳转的缓冲容差（秒）。
 *
 * 目标位置紧贴活动缓冲边缘（下载流正在向前延伸的边缘）时，
 * 走普通 seek 让顺序下载自然补上缺口，避免全量 MSE 重载的
 * 清理 + init 重建开销（小范围 overshoot 场景下比重载更快、更顺滑）。
 */
export const FORWARD_BUFFER_TOLERANCE_SEC = 10

/**
 * 计算目标时间距离"活动缓冲边缘"的缺口（秒）。
 *
 * 活动缓冲边缘 = 最后一个缓冲区间的末尾（MSE 下载流持续从该位置向前延伸）。
 * - 目标在任意缓冲区间内 → 返回 null（调用方按普通 seek 处理）
 * - 目标在活动边缘之后 → 返回缺口大小（正数）
 * - 目标在活动边缘之前（回退）或无任何缓冲 → 返回 null
 *
 * 缺口 ≤ FORWARD_BUFFER_TOLERANCE_SEC 时，普通 seek 等下载补上即可；
 * 缺口过大时必须走 MSE Range seek 直接定位到目标点，
 * 否则要干等下载穿过整个缺口（跳转等待过长的根因）。
 */
export function getGapFromLiveEdge(
  video: HTMLVideoElement,
  time: number
): number | null {
  if (isInBufferedRange(video, time)) return null
  if (video.buffered.length === 0) return null
  const liveEnd = video.buffered.end(video.buffered.length - 1)
  const gap = time - liveEnd
  return gap > 0 ? gap : null
}
