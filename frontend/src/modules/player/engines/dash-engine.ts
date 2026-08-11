/**
 * DASH 引擎适配器（基于 dash.js）。
 *
 * 使用 DashPlayer 实现 PlayerEngine 接口。
 * DashPlayer 内部动态生成 MPD manifest，将 B站分离的 video/audio m4s 包装为
 * dash.js 可识别的 DASH 源，由 dash.js 接管 MSE 生命周期与 seek 逻辑。
 *
 * 降级策略：
 * - 无 audioUrl：无法双轨合并，DASH 源抛错（m4s 不能直连播放）；
 *   非 DASH 源退化为 direct 引擎
 * - dash.js 加载失败：DASH 源直接抛错（自研 MSE 引擎暂时禁用）；
 *   非 DASH 源降级为 direct + audio-sync
 */
import type { PlayerEngine, PlayerSource, EngineAttachResult } from '../types'
import { resetVideoElement, waitForMetadata } from '../utils'
import { DashPlayer } from './dash'
import { createAudioSync } from '../services/audio-sync'

export const dashEngine: PlayerEngine = {
  type: 'dash',

  async attach(
    video: HTMLVideoElement,
    source: PlayerSource
  ): Promise<EngineAttachResult> {
    const audioUrl = source.audioUrl || ''

    // 无音频 URL 时无法双轨合并
    if (!audioUrl) {
      // DASH 源的 sourceUrl 是 m4s 片段，不能直接作为 video.src 播放
      if (source.format === 'dash') {
        throw new Error('DASH 源缺少 audioUrl，无法播放')
      }
      // 非 DASH 格式退化为 direct 引擎
      resetVideoElement(video)
      video.src = source.url
      video.load()
      await waitForMetadata(video)
      return { cleanup: () => {} }
    }

    // DASH 源：仅使用 dash.js（自研 MSE 引擎暂时禁用）
    if (source.format === 'dash') {
      const dashPlayer = new DashPlayer({
        video,
        videoUrl: source.url,
        audioUrl,
        videoCodec: source.videoCodec,
        audioCodec: source.audioCodec,
        duration: source.duration,
        // 缓冲模式：从 IndexedDB 读取的 Blob 数据，传入后 dash.js 用 blob URL 加载
        videoBlob: source.videoBlob,
        audioBlob: source.audioBlob,
        // P2P 传输：仅在流模式启用，DashPlayer 内部会检查 isBufferMode
        p2pEnabled: source.p2pEnabled,
      })
      try {
        const blobUrl = await dashPlayer.attach(source.startTime)
        return {
          blobUrl,
          player: dashPlayer,
          cleanup: () => {
            dashPlayer.cleanup()
          },
        }
      } catch (err) {
        dashPlayer.cleanup()
        throw new Error('dash.js 加载 DASH 源失败', { cause: err })
      }
    }

    // 非 DASH 格式（含独立音频轨）：使用 dash.js，失败降级为 direct + audio-sync
    const dashPlayer = new DashPlayer({
      video,
      videoUrl: source.url,
      audioUrl,
      videoCodec: source.videoCodec,
      audioCodec: source.audioCodec,
      duration: source.duration,
      videoBlob: source.videoBlob,
      audioBlob: source.audioBlob,
      p2pEnabled: source.p2pEnabled,
    })
    try {
      const blobUrl = await dashPlayer.attach(source.startTime)
      return {
        blobUrl,
        player: dashPlayer,
        cleanup: () => {
          dashPlayer.cleanup()
        },
      }
    } catch (err) {
      dashPlayer.cleanup()
      console.warn(
        '[dash-engine] dash.js 加载失败，降级为 direct + audio-sync:',
        err
      )
      resetVideoElement(video)
      video.src = source.url
      video.load()
      await waitForMetadata(video)
      const audioCleanup = createAudioSync(video, audioUrl)
      return { cleanup: audioCleanup }
    }
  },
}
