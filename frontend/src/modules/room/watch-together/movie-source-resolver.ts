/**
 * 影片播放源解析器（从 useWatchTogether.loadMovie 抽取）。
 *
 * 将「影片记录 → 可 attach 的播放源字段」的决策逻辑收敛为纯数据函数：
 * - B站 源：在线解析 playurl（带解析进度回调）；
 * - 房主刷新恢复（recovery）且旧 URL 可用：优先复用旧 URL，
 *   标记 reusedRecoveryUrl，attach 失败时由调用方回退到在线解析；
 * - 其他源（webdav / ftp / url 等）：直接使用影片记录字段。
 *
 * 本模块不触碰 React 状态 / store / message，所有副作用留在调用方。
 */
import type { Movie } from '@/store/roomStore'
import type { MediaFormat } from '@/lib/mediaFormat'
import { resolveBilibiliWithOptions } from '@/modules/bilibili/bilibiliApi'
import { extractBvid, resolveBilibiliViaCli } from '@/modules/bilibili/cliApi'
import { useCliAgentStore } from '@/store/cliAgentStore'
import { getBilibiliParseOptions } from '@/modules/bilibili/parseOptions'
import { useSystemSettingsStore } from '@/store/systemSettingsStore'
import type { QualityOption } from './resolveSource'

/** 房主刷新恢复时由后端返回的最近一次播放状态（源相关子集） */
export interface RecoverySourceInfo {
  currentTime: number
  playbackRate: number
  isPlaying: boolean
  duration?: number
  sourceUrl?: string
  sourceType?: string
  audioUrl?: string
  format?: MediaFormat
  videoCodec?: string
  audioCodec?: string
  cid?: number
  currentQn?: number
  acceptQuality?: QualityOption[]
  currentMovieId?: number
  headers?: Record<string, string>
}

/** 解析出的播放源字段（供构建 WatchTogetherState） */
export interface ResolvedMovieSource {
  sourceUrl: string
  audioUrl?: string
  format?: MediaFormat
  videoCodec?: string
  audioCodec?: string
  cid?: number
  duration: number
  currentQn?: number
  acceptQuality?: QualityOption[]
  headers?: Record<string, string>
  /**
   * true 表示本次复用了 recovery 中的旧 URL（未在线解析）。
   * attach 失败（通常 403/404 deadline 过期）时调用方应回退到
   * resolveBilibiliOnline 重新解析后重试。
   */
  reusedRecoveryUrl: boolean
}

export interface ResolveMovieSourceOptions {
  movie: Movie
  /** 归一化后的源类型（movie.sourceType 中 'mp4' 已映射为 'url'） */
  sourceType: string
  /** 恢复信息；仅当 currentMovieId 与影片匹配时由调用方传入 */
  recovery?: RecoverySourceInfo | null
  /** B站 在线解析进度回调 */
  onProgress?: (step: string, message: string) => void
}

/**
 * 将 CLI 代理 URL 归一化为本地 127.0.0.1 地址。
 *
 * 本地 CLI 的 HTTP 服务始终运行在当前机器上，浏览器应直接请求 127.0.0.1。
 * 某些旧版 CLI 或网络环境下，后端下发的 proxyUrl 可能携带公网/内网 host，
 * 统一替换 hostname 为 127.0.0.1 可防止浏览器跨域拦截。
 */
function normalizeLocalCliProxyUrl(proxyUrl: string): string {
  try {
    const url = new URL(proxyUrl)
    url.hostname = '127.0.0.1'
    return url.toString()
  } catch {
    return proxyUrl
  }
}

/**
 * 获取当前可用的 CLI 代理 URL。
 *
 * 当房间内至少有一个 CLI 代理注册（通过 socket）时返回其 proxyUrl。
 * 不再强制要求 localOnline（本地健康检查通过）：健康检查可能因 CORS、
 * 网络抖动或浏览器安全策略暂时失败，但 CLI 的 HTTP 服务实际可用。
 * 如果 HTTP 服务确实不可用，resolveBilibiliViaCli 的 fetch 会失败并报错。
 */
export function getActiveCliProxyUrl(): string | null {
  const { agents } = useCliAgentStore.getState()
  if (agents.length === 0) return null
  return normalizeLocalCliProxyUrl(agents[0].proxyUrl)
}

/**
 * 获取影片实际生效的 MP4 偏好。
 *
 * 当用户启用 CLI 高画质代理后，强制走 DASH 代理路径，不再降级到 MP4；
 * 即使本地 CLI 暂时未连接，也保持 DASH 请求，由调用方提示连接代理，
 * 避免用户开启 CLI 后因网络问题被自动切回 MP4。
 *
 * 当服务器端 DASH 被禁用（dashDisabled）且 CLI 未启用时，强制 MP4。
 */
export function getEffectivePreferMp4(movieId: number): boolean {
  const { preferMp4, cliEnabled } = getBilibiliParseOptions(movieId)
  if (cliEnabled) {
    // CLI 已启用：强制使用 DASH，不受 dashDisabled 影响
    return false
  }
  // CLI 未启用：检查服务器端是否禁用了 DASH
  const { dashDisabled } = useSystemSettingsStore.getState()
  if (dashDisabled) {
    return true
  }
  return preferMp4
}

function mapResolvedSourceToMovieSource(
  resolved: {
    videoUrl: string
    audioUrl?: string
    format?: MediaFormat
    videoCodec?: string
    audioCodec?: string
    cid?: number
    duration?: number
    currentQn?: number
    acceptQuality?: QualityOption[]
  },
  movie: Movie
): ResolvedMovieSource {
  if (!resolved.videoUrl) {
    throw new Error('未获取到对应清晰度的播放地址')
  }
  return {
    sourceUrl: resolved.videoUrl,
    audioUrl: resolved.audioUrl,
    format: resolved.format,
    videoCodec: resolved.videoCodec,
    audioCodec: resolved.audioCodec,
    cid: resolved.cid,
    duration: resolved.duration ?? movie.duration ?? 0,
    currentQn: resolved.currentQn ?? movie.currentQn,
    acceptQuality: resolved.acceptQuality ?? movie.acceptQuality,
    headers: undefined,
    reusedRecoveryUrl: false,
  }
}

/**
 * 在线解析 B站 视频 playurl。
 * 独立导出供「复用旧 URL 失败后的回退重新解析」复用。
 *
 * 若该影片启用了 CLI 代理且本地 CLI 在线，则通过 CLI 使用用户自己的 Cookie
 * 解析高画质地址；否则回退到服务端解析。
 */
export async function resolveBilibiliOnline(
  movie: Movie,
  onProgress?: (step: string, message: string) => void,
  options?: { preferMp4?: boolean }
): Promise<ResolvedMovieSource> {
  const parsePrefs = getBilibiliParseOptions(movie.id)
  const proxyUrl = parsePrefs.cliEnabled ? getActiveCliProxyUrl() : null
  // CLI 已启用时强制使用 DASH 代理，不再降级 MP4；未连接时直接报错，避免回退
  const effectivePreferMp4 =
    options?.preferMp4 ?? getEffectivePreferMp4(movie.id)
  const forceDash = parsePrefs.cliEnabled && !!proxyUrl

  if (parsePrefs.cliEnabled && !proxyUrl) {
    throw new Error('CLI 代理未连接，请先启动本地 zcontrol-cli')
  }

  if (proxyUrl) {
    const bvid = extractBvid(movie.url)
    if (bvid && movie.cid) {
      const resolved = await resolveBilibiliViaCli(
        proxyUrl,
        bvid,
        movie.cid,
        movie.currentQn,
        effectivePreferMp4,
        forceDash
      )
      return mapResolvedSourceToMovieSource(resolved, movie)
    }
  }

  const resolved = await resolveBilibiliWithOptions(
    movie.url,
    movie.currentQn,
    onProgress,
    { preferMp4: effectivePreferMp4 }
  )
  return mapResolvedSourceToMovieSource(resolved, movie)
}

/**
 * 解析影片的播放源。
 *
 * B站 地址带有快速过期的签名（通常 1-2 小时）。房主刷新恢复时优先复用
 * recovery 中的旧 sourceUrl（刚过期几秒到几分钟，大概率仍有效），避免一次
 * 在线解析的网络往返；仅在 attach 失败时才由调用方回退重新解析。
 *
 * @throws 在线解析失败且无旧 URL 可复用时抛错（调用方决定提示与重试策略）
 */
export async function resolveMovieSource({
  movie,
  sourceType,
  recovery,
  onProgress,
}: ResolveMovieSourceOptions): Promise<ResolvedMovieSource> {
  if (sourceType === 'bilibili') {
    // 恢复场景且旧 URL 可用：直接复用，跳过在线解析
    if (recovery?.sourceUrl) {
      // B站 源的防盗链由服务器代理（m4s）或直连（MP4）处理，不需要前端 headers。
      // recovery.headers 可能来自旧的非 B站 源（如 anime），复用时必须清除，
      // 否则 resolveProxyUrl 会因 hasHeaders=true 将 MP4 直链包装为服务器代理 URL。
      if (recovery.headers && Object.keys(recovery.headers).length > 0) {
        console.warn(
          '[movie-source-resolver] B站 recovery 路径中清除非 B站 headers:',
          recovery.headers
        )
      }
      return {
        sourceUrl: recovery.sourceUrl,
        audioUrl: recovery.audioUrl,
        format: recovery.format,
        videoCodec: recovery.videoCodec,
        audioCodec: recovery.audioCodec,
        cid: recovery.cid,
        duration: recovery.duration ?? movie.duration ?? 0,
        currentQn: recovery.currentQn ?? movie.currentQn,
        acceptQuality: recovery.acceptQuality ?? movie.acceptQuality,
        headers: undefined,
        reusedRecoveryUrl: true,
      }
    }
    return resolveBilibiliOnline(movie, onProgress)
  }

  // 非 B站 源：直接使用影片记录字段（Movie 类型不含 headers，见 roomStore）
  return {
    sourceUrl: movie.url,
    audioUrl: movie.audioUrl,
    format: movie.format,
    videoCodec: movie.videoCodec,
    audioCodec: movie.audioCodec,
    cid: movie.cid,
    duration: movie.duration || 0,
    currentQn: movie.currentQn,
    acceptQuality: movie.acceptQuality,
    headers: undefined,
    reusedRecoveryUrl: false,
  }
}
