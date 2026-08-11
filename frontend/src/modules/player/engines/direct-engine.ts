/**
 * Direct 引擎：直接设置 video.src 播放原生支持的格式（mp4/webm/mov/mkv）。
 *
 * 无需 MSE / hls.js / flv.js，浏览器原生解码。
 * Chrome 91+ 支持 MKV 容器（需 H.264/AAC 编码）。
 *
 * 代理策略由 url-proxy.ts 统一控制（分离式架构）：
 * - B站 DASH m4s / 带防盗链 headers 的源走服务器代理
 * - 其他源（B站 MP4 直链 / webdav / ftp / 用户直链）直连
 *
 * attach 在 metadata 就绪后 resolve，cleanup 无需额外操作
 * （video 元素本身由调用方管理）。
 *
 * 对于转码流（fragmented MP4），video.duration 可能为 Infinity。
 * 引擎会先发 HEAD 请求获取 X-Content-Duration header，
 * 并存储到 video.dataset.serverDuration 供 useVideoDuration 回退使用。
 */
import type { PlayerEngine, PlayerSource, EngineAttachResult } from '../types'
import { resetVideoElement, waitForMetadata } from '../utils'
import { resolveProxyUrl } from '../services/url-proxy'

export const directEngine: PlayerEngine = {
  type: 'direct',

  async attach(
    video: HTMLVideoElement,
    source: PlayerSource
  ): Promise<EngineAttachResult> {
    resetVideoElement(video)
    // 统一代理策略：由 url-proxy.ts 根据 URL 特征与源格式决定
    const targetUrl = resolveProxyUrl(source.url, source.headers, source.format)

    // 先发 HEAD 请求尝试获取 X-Content-Duration（转码流场景）
    // 不阻塞播放，失败时静默跳过
    // 相对路径直接使用（浏览器用当前页面 origin 解析，同域请求携带 cookie）
    try {
      const headRes = await fetch(targetUrl, { method: 'HEAD' })
      const contentDuration = headRes.headers.get('X-Content-Duration')
      if (contentDuration) {
        const d = parseFloat(contentDuration)
        if (Number.isFinite(d) && d > 0) {
          video.dataset.serverDuration = d.toString()
        }
      }
    } catch {
      // HEAD 请求失败（如 CORS 限制），静默跳过
    }

    video.src = targetUrl
    video.load()
    await waitForMetadata(video)
    return { cleanup: () => { delete video.dataset.serverDuration } }
  },
}
