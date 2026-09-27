/**
 * Sync Playback Services Barrel Export
 *
 * 服务划分：
 * - state-merge: 状态构建与比较（buildStateFromVideo / isStateEqual）
 * - seek-strategy: seek 判断函数（缓冲检测 / MSE 流检测 / 自适应阈值）
 * - seek-service: 统一 seek 入口（调用 引擎 seekTo，不重建 MediaSource）
 */
export {
  buildStateFromVideo,
  isStateEqual,
  computeStateDiff,
  mergeStateDiff,
} from './state-merge'

export {
  getAdaptiveSeekThreshold,
  shouldSeekToHost,
  isInBufferedRange,
  isMseStream,
  getGapFromLiveEdge,
  FORWARD_BUFFER_TOLERANCE_SEC,
  HARD_SEEK_THRESHOLD_SEC,
  getCatchUpRate,
  shouldSoftSync,
} from './seek-strategy'

export { executeSeek } from './seek-service'
export type { ExecuteSeekParams, SeekToResult } from './seek-service'
