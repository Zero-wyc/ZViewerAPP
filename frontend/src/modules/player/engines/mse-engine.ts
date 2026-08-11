/**
 * MSE 引擎适配器（v2 重写）。
 *
 * 使用 MsePlayer 实现 PlayerEngine 接口。
 * MsePlayer 是有状态的播放器：seek 时不重建 MediaSource，
 * 而是清空 SourceBuffer + 用缓存的 init segment + 从目标位置 Range 下载。
 *
 * 降级策略：
 * - 无 audioUrl：无法双轨合并，直接 video.src 播放；
 * - MSE 合并失败且为 DASH 源：m4s 片段不能直连播放，抛错；
 * - MSE 合并失败且非 DASH 源（如带独立音频轨的 mp4）：
 *   降级为 direct 视频 + 独立 Audio 元素音频同步。
 */
import type { PlayerEngine, PlayerSource, EngineAttachResult } from '../types'
import { resetVideoElement, waitForMetadata } from '../utils'
import { MsePlayer } from './mse'
import { createAudioSync } from '../services/audio-sync'

export const mseEngine: PlayerEngine = {
  type: 'mse',

  async attach(
    video: HTMLVideoElement,
    source: PlayerSource
  ): Promise<EngineAttachResult> {
    const audioUrl = source.audioUrl || ''

    // 无音频 URL 时无法 MSE 合并，直接走 direct
    if (!audioUrl) {
      resetVideoElement(video)
      video.src = source.url
      video.load()
      await waitForMetadata(video)
      return { cleanup: () => {} }
    }

    const player = new MsePlayer({
      video,
      videoUrl: source.url,
      audioUrl,
      videoCodec: source.videoCodec,
      audioCodec: source.audioCodec,
      duration: source.duration,
    })

    try {
      const blobUrl = await player.attach(source.startTime)
      return {
        blobUrl,
        player,
        cleanup: () => {
          player.cleanup()
        },
      }
    } catch (err) {
      player.cleanup()
      // DASH 源的 sourceUrl 是 m4s 片段，不能直接作为 video.src 播放
      if (source.format === 'dash') {
        throw new Error('MSE 合并失败，DASH 源无法直接播放', { cause: err })
      }
      // 非 DASH 格式（如 anime 带独立音频轨）降级为 direct + audio-sync
      console.warn('[mse-engine] MSE 合并失败，降级为音频同步:', err)
      resetVideoElement(video)
      video.src = source.url
      video.load()
      await waitForMetadata(video)
      const audioCleanup = createAudioSync(video, audioUrl)
      return { cleanup: audioCleanup }
    }
  },
}
