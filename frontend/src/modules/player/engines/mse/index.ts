/**
 * MSE 引擎入口（v2 重写）。
 *
 * 模块划分：
 * - player.ts     MsePlayer 门面（状态机 + 双轨编排：attach / seekTo / cleanup）
 * - track.ts      MediaTrack（单条流的生命周期：head → init → 流式下载 → seek 重载）
 * - processor.ts  processStream（ReadableStream → SourceBuffer 流式写入管线）
 * - downloader.ts Range 下载（重试 + 代理包装）
 * - parser.ts     MP4 头部解析（init segment / sidx / seek 偏移计算）
 * - types.ts      共享类型与常量
 *
 * 缓存说明：仅依赖 SourceBuffer 实时缓冲（MSE 原生），不再做 IndexedDB 持久化。
 */
export { MsePlayer } from './player'
export type { MsePlayerOptions } from './types'
// SeekResult 已上移到 player/types.ts 作为公共 PlayerController 接口的一部分
export type { SeekResult } from '../../types'
