/**
 * HLS 引擎：通过 hls.js 将 m3u8 流挂载到 <video> 元素。
 *
 * - Safari（含 iOS）原生支持 HLS：直接设置 src，无需 hls.js；
 * - 其他浏览器通过 hls.js（MSE 封装）附加；
 * - metadata 就绪后 resolve；cleanup 销毁 hls 实例。
 */
import Hls from 'hls.js'
import type { PlayerEngine, PlayerSource, EngineAttachResult } from '../types'
import { resetVideoElement, waitForMetadata } from '../utils'
import { resolveProxyUrl } from '../services/url-proxy'

/** Safari 等原生 HLS 支持检测 */
function canPlayNativeHls(video: HTMLVideoElement): boolean {
  return video.canPlayType('application/vnd.apple.mpegurl') !== ''
}

export const hlsEngine: PlayerEngine = {
  type: 'hls',

  async attach(
    video: HTMLVideoElement,
    source: PlayerSource
  ): Promise<EngineAttachResult> {
    resetVideoElement(video)

    // 统一代理策略：由 url-proxy.ts 根据 URL 特征与源格式决定
    const targetUrl = resolveProxyUrl(source.url, source.headers, source.format)

    // Safari 原生 HLS
    if (canPlayNativeHls(video)) {
      video.src = targetUrl
      video.load()
      await waitForMetadata(video)
      return {
        cleanup: () => {
          try {
            video.pause()
          } catch {
            /* ignore */
          }
          video.removeAttribute('src')
          video.load()
        },
      }
    }

    if (!Hls.isSupported()) {
      throw new Error('当前浏览器不支持 HLS 播放且 hls.js 不可用')
    }

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
    })
    hls.attachMedia(video)
    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      hls.loadSource(targetUrl)
    })

    try {
      await waitForMetadata(video)
    } catch (err) {
      // metadata 等待失败时确保实例被销毁，避免泄漏
      try {
        hls.destroy()
      } catch {
        /* ignore */
      }
      throw err
    }

    return {
      cleanup: () => {
        try {
          hls.destroy()
        } catch {
          /* ignore */
        }
      },
    }
  },
}
