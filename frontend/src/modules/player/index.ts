/**
 * 播放器模块公共 API（v2 重写，导出契约保持不变）。
 *
 * 模块结构（分离式架构）：
 * ```
 * player/
 * ├── types.ts                    引擎接口 + 源数据结构
 * ├── utils.ts                    视频元素工具（resetVideoElement / waitForMetadata）
 * ├── engine-selector.ts          引擎选择器（按 format + audioUrl 选择）
 * ├── engines/
 * │   ├── mse-engine.ts           MSE DASH 引擎适配器（含降级策略）
 * │   ├── hls-engine.ts           HLS 引擎（hls.js / Safari 原生）
 * │   ├── flv-engine.ts           FLV 引擎（flv.js）
 * │   ├── direct-engine.ts        Direct 引擎（浏览器原生播放）
 * │   └── mse/
 * │       ├── player.ts           MsePlayer 门面（状态机 + 双轨编排）
 * │       ├── track.ts            MediaTrack 单轨生命周期
 * │       ├── processor.ts        ReadableStream → SourceBuffer 管线
 * │       ├── downloader.ts       Range 下载（重试 + 代理）
 * │       ├── parser.ts           MP4 头部解析 + seek 偏移
 * ├── services/
 * │   ├── buffer-manager.ts       SourceBuffer 串行队列（append / prune / quota 恢复）
 * │   ├── mp4-parser.ts           fMP4 box 解析（纯函数）
 * │   ├── audio-sync.ts           独立 Audio 元素音频同步
 * │   └── url-proxy.ts            B站 CDN 代理检测
 * └── index.ts                    本文件：公共 API 入口
 * ```
 */

// 引擎
export { dashEngine } from './engines/dash-engine'
export { mseEngine } from './engines/mse-engine'
export { hlsEngine } from './engines/hls-engine'
export { flvEngine } from './engines/flv-engine'
export { directEngine } from './engines/direct-engine'
export { selectEngine } from './engine-selector'

// 工具函数
export { resetVideoElement, waitForMetadata } from './utils'

// 服务（供高级用例直接调用）
export { createAudioSync } from './services/audio-sync'
export {
  isBilibiliMediaUrl,
  buildProxyUrl,
  resolveProxyUrl,
  isLocalUrl,
  isRelativeUrl,
  isCliProxyUrl,
} from './services/url-proxy'
export {
  appendBuffer,
  isQuotaExceededError,
  getBufferedEnd,
  getBufferedAhead,
  forcePruneSourceBuffer,
  pruneSourceBuffer,
  clearSourceBuffer,
} from './services/buffer-manager'

// MSE 专用导出
export { MsePlayer } from './engines/mse'
export type { MsePlayerOptions } from './engines/mse'

// DASH (dash.js) 专用导出
export { DashPlayer } from './engines/dash'
export type { DashPlayerOptions } from './engines/dash'

// Hooks
export { usePlayerSource } from './hooks'
export type { UsePlayerSourceOptions, UsePlayerSourceReturn } from './hooks'

// 类型
export type {
  EngineType,
  PlayerSource,
  EngineAttachResult,
  PlayerEngine,
  PlayerController,
  SeekResult,
} from './types'
