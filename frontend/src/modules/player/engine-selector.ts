/**
 * 引擎选择器
 *
 * 根据源格式与音频轨信息选择合适的播放引擎。
 *
 * 选择逻辑：
 * 1. format='dash' 或 含 audioUrl → DASH 引擎（dash.js，动态生成 MPD 包装 m4s）
 * 2. format='hls' → HLS 引擎
 * 3. format='flv' → FLV 引擎
 * 4. 其他 → Direct 引擎（浏览器原生播放 mp4/webm 等）
 *
 * 注：自研 MSE 引擎（mseEngine）暂时禁用，所有含独立音频轨的源
 *    统一由 dash.js 引擎处理（失败时降级为 direct + audio-sync）。
 *
 * Android 原生 + CLI 代理模式也使用 dash.js：
 * - Android ZViewerPlugin 的 doProxyRequest 已修复重定向丢失 Referer/Origin 的问题
 *   （禁用 auto-redirects 并手动重注入防盗链头）
 * - DashPlayer 的 preloadInitSegment 通过 CLI 代理预下载 init segment，
 *   isCliProxyUrl 正确识别 CLI 代理 URL 并设置 credentials='omit'
 * - dash.js 的 XHR credentials 也根据 isCliProxyUrl 配置
 */
import type { PlayerEngine, PlayerSource, EngineType } from './types'
import { dashEngine } from './engines/dash-engine'
import { mseEngine } from './engines/mse-engine'
import { hlsEngine } from './engines/hls-engine'
import { flvEngine } from './engines/flv-engine'
import { directEngine } from './engines/direct-engine'

/** 所有引擎实例（单例，无需重复创建） */
const ENGINES: Record<EngineType, PlayerEngine> = {
  dash: dashEngine,
  mse: mseEngine,
  hls: hlsEngine,
  flv: flvEngine,
  direct: directEngine,
}

/** 根据源数据选择合适的播放引擎。 */
export function selectEngine(source: PlayerSource): PlayerEngine {
  // DASH 源或含独立音频轨 → dash.js 引擎
  if (source.format === 'dash' || source.audioUrl) {
    return ENGINES.dash
  }
  if (source.format === 'hls') {
    return ENGINES.hls
  }
  if (source.format === 'flv') {
    return ENGINES.flv
  }
  return ENGINES.direct
}
