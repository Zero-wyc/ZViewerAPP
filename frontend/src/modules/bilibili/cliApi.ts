import type { ResolvedSource } from './types'

const BV_REGEX = /BV[0-9A-Za-z]{10}/

/**
 * 从 B站 完整 URL 或 BV 号字符串中提取 BV 号。
 */
export function extractBvid(url: string): string | null {
  if (!url) return null
  const match = url.match(BV_REGEX)
  return match ? match[0] : null
}

/**
 * 将任意 URL 包装为 CLI 本地代理 URL。
 * CLI 代理会注入正确的 Referer/Origin/User-Agent 头，绕过 B站 CDN 防盗链。
 *
 * 若 targetUrl 本身已是该 CLI 代理地址，则直接返回避免双重包装。
 */
export function buildCliProxyUrl(proxyUrl: string, targetUrl: string): string {
  const base = proxyUrl.replace(/\/$/, '')
  const proxyPrefix = `${base}/proxy?url=`
  if (targetUrl.startsWith(proxyPrefix)) {
    return targetUrl
  }
  return `${proxyPrefix}${encodeURIComponent(targetUrl)}`
}

/**
 * 将解析结果中的 B站 CDN URL 全部重写为 CLI 代理 URL。
 *
 * 重写后：
 * - 视频流（videoUrl）走本地 CLI 代理
 * - 音频流（audioUrl）走本地 CLI 代理
 * - 播放器/下载器无需感知代理细节，直接请求 localhost 即可
 */
export function wrapResolvedSourceWithCliProxy(
  proxyUrl: string,
  resolved: ResolvedSource
): ResolvedSource {
  return {
    ...resolved,
    videoUrl: buildCliProxyUrl(proxyUrl, resolved.videoUrl),
    audioUrl: resolved.audioUrl
      ? buildCliProxyUrl(proxyUrl, resolved.audioUrl)
      : undefined,
  }
}

interface CliResolveResponse {
  success?: boolean
  message?: string
  title?: string
  duration?: number
  cid?: number
  videoUrl?: string
  audioUrl?: string
  videoCodec?: string
  audioCodec?: string
  format?: 'mp4' | 'dash' | string
  loggedIn?: boolean
  vipStatus?: number
  currentQn?: number
  acceptQuality?: Array<{
    id: number
    label: string
    resolution?: string
  }>
  pages?: Array<{
    page: number
    cid: number
    part: string
    duration: number
  }>
  currentPage?: number
}

// ===================== 解析结果短期缓存 =====================
//
// 切换清晰度时，用户可能在短时间内来回切换多个清晰度。
// 缓存解析结果（30 秒）可以避免重复请求 CLI /resolve，提升切换速度。
// 缓存 key 为 bvid+cid+qn+preferMp4+forceDash 的组合。

interface ResolveCacheEntry {
  resolved: ResolvedSource
  timestamp: number
}

const RESOLVE_CACHE_TTL_MS = 30_000 // 30 秒
const resolveCache = new Map<string, ResolveCacheEntry>()

function buildResolveCacheKey(
  proxyUrl: string,
  bvid: string,
  cid?: number,
  qn?: number,
  preferMp4?: boolean,
  forceDash?: boolean
): string {
  return [proxyUrl, bvid, cid ?? '', qn ?? '', preferMp4 ? '1' : '0', forceDash ? '1' : '0'].join('|')
}

function getCachedResolve(key: string): ResolvedSource | null {
  const entry = resolveCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > RESOLVE_CACHE_TTL_MS) {
    resolveCache.delete(key)
    return null
  }
  return entry.resolved
}

function setCachedResolve(key: string, resolved: ResolvedSource): void {
  resolveCache.set(key, { resolved, timestamp: Date.now() })
  // 清理过期条目，避免内存泄漏
  if (resolveCache.size > 20) {
    const now = Date.now()
    for (const [k, v] of resolveCache) {
      if (now - v.timestamp > RESOLVE_CACHE_TTL_MS) {
        resolveCache.delete(k)
      }
    }
  }
}

/** 清除解析缓存（切换影片、CLI 重连时调用） */
export function clearResolveCache(): void {
  resolveCache.clear()
}

// ===================== fetch 超时控制 =====================

const CLI_RESOLVE_TIMEOUT_MS = 15_000 // 15 秒超时

/**
 * 通过本地 CLI 代理解析 B站 视频。
 *
 * CLI 使用用户自己的 Cookie 向后端 /api/cli/resolve 请求，可获取大会员等高画质地址。
 * 解析成功后，本函数将返回的 CDN URL 重写为 CLI 代理 URL，浏览器直接请求本地即可播放。
 *
 * 性能优化：
 * - 15 秒 fetch 超时，避免 Android 端解析慢时前端无限等待
 * - 30 秒解析结果缓存，短时间内重复切换同一清晰度时直接返回缓存
 *
 * @param proxyUrl CLI 本地代理地址，例如 http://127.0.0.1:9333
 * @param bvid BV 号
 * @param cid 视频分 P 的 cid（可选，未指定时后端自动使用第一 P）
 * @param qn 清晰度 qn（可选）
 * @param preferMp4 是否优先 MP4（可选，默认 false）
 * @param forceDash 是否强制使用 DASH 并禁用 MP4 降级（CLI 代理已连接时使用）
 */
export async function resolveBilibiliViaCli(
  proxyUrl: string,
  bvid: string,
  cid?: number,
  qn?: number,
  preferMp4?: boolean,
  forceDash?: boolean
): Promise<ResolvedSource> {
  // 1. 检查缓存
  const cacheKey = buildResolveCacheKey(proxyUrl, bvid, cid, qn, preferMp4, forceDash)
  const cached = getCachedResolve(cacheKey)
  if (cached) {
    return cached
  }

  const base = proxyUrl.replace(/\/$/, '')
  const params = new URLSearchParams({
    bvid,
  })
  if (cid != null && Number.isFinite(cid)) {
    params.set('cid', String(cid))
  }
  if (qn != null && Number.isFinite(qn)) {
    params.set('qn', String(qn))
  }
  if (preferMp4) {
    params.set('preferMp4', 'true')
  }
  if (forceDash) {
    params.set('forceDash', 'true')
  }

  // 2. 带超时的 fetch
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), CLI_RESOLVE_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${base}/resolve?${params.toString()}`, {
      method: 'GET',
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('CLI 解析超时，请检查网络或重启 CLI 代理')
    }
    throw new Error(`CLI 解析请求失败: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    clearTimeout(timeoutId)
  }

  const data = (await res.json()) as CliResolveResponse

  if (!res.ok || data.success === false || !data.videoUrl) {
    throw new Error(data.message || 'CLI 解析 B站 视频失败')
  }

  const resolved: ResolvedSource = {
    title: data.title,
    videoUrl: data.videoUrl,
    audioUrl: data.audioUrl,
    videoCodec: data.videoCodec,
    audioCodec: data.audioCodec,
    duration: data.duration,
    format: (data.format as ResolvedSource['format']) || 'mp4',
    loggedIn: data.loggedIn,
    cid: data.cid ?? cid,
    currentQn: data.currentQn,
    acceptQuality: data.acceptQuality,
    vipStatus: data.vipStatus,
    pages: data.pages,
    currentPage: data.currentPage,
  }

  // CLI /resolve 已返回代理 URL，但本地包装可确保旧版 CLI 与兜底场景也走代理。
  const result = wrapResolvedSourceWithCliProxy(proxyUrl, resolved)

  // 3. 写入缓存
  setCachedResolve(cacheKey, result)

  return result
}
