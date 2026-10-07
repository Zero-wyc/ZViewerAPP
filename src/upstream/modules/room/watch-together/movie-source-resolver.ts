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
import { useRoomStore } from '@/store/roomStore'
import { detectMediaFormat, type MediaFormat } from '@/lib/mediaFormat'
import { resolveBilibiliWithOptions } from '@/modules/bilibili/bilibiliApi'
import { extractBvid, extractBangumiId, resolveBangumiViaCli, resolveBilibiliViaCli } from '@/modules/bilibili/cliApi'
import { useCliAgentStore } from '@/store/cliAgentStore'
import { getBilibiliParseOptions } from '@/modules/bilibili/parseOptions'
import { useSystemSettingsStore } from '@/store/systemSettingsStore'
import type { QualityOption } from './resolveSource'
import { buildServerFileProxyUrl } from '@/modules/server-files/serverFilesApi'
import { resolveMovieDirectUrl } from '@/modules/direct-link/directLinkApi'
import { getEmbeddedProxyStatus, isEmbeddedBilibiliHost, subscribeEmbeddedProxy } from '../../../../platform/bilibiliProxy'
import { getRuntimePlatform } from '../../../../platform/runtime'
import { getNativeQualityPolicy, getWebViewCapabilities, nativeQualityCacheKey, recordNativeQuality } from '@/modules/bilibili/nativeQualityPolicy'
import {
  resolveAniSubsEpisode,
  buildAniSubsProxyUrl,
  needsAniSubsProxy,
} from '@/modules/anisubs'

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
  epId?: number
  seasonId?: number
  seasonTitle?: string
  preview?: boolean

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
  /**
   * 影片级浏览器播放引擎（playsvideo）开关（添加影片时设置）。
   * false 时强制原生直连播放（唯一门控，原生失败不回退管线）。
   */
  playsvideoEnabled?: boolean
  /**
   * 挂载直链模式（movie.directLink）：直连失败不回退服务器代理，
   * 直接向用户提示错误，保持"源站直传、服务器零媒体流量"的直链语义。
   */
  noProxyFallback?: boolean
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
 * CLI 代理在服务器上全局注册（不绑定房间）：cliAgentStore.agents 由
 * useCliAgent 订阅 socket 全局广播填充，并已按用户名过滤归属，此处直接
 * 取第一个即可。不再强制要求 localOnline（本地健康检查通过）：健康检查
 * 可能因 CORS、网络抖动或浏览器安全策略暂时失败，但 CLI 的 HTTP 服务
 * 实际可用。如果 HTTP 服务确实不可用，resolveBilibiliViaCli 的 fetch
 * 会失败并报错。
 */
export function getActiveCliProxyUrl(): string | null {
  if (isEmbeddedBilibiliHost()) {
    const local = getEmbeddedProxyStatus()
    return local.ready && (local.loggedIn || getRuntimePlatform() === 'harmony') ? local.proxyUrl : null
  }
  const { agents } = useCliAgentStore.getState()
  if (agents.length === 0) return null
  return normalizeLocalCliProxyUrl(agents[0].proxyUrl)
}

/**
 * 判断影片是否为 B站 PGC 内容（番剧 / 影视）。
 *
 * PGC 影片的 url 为 bangumi ep/ss 链接，或分集列表（pages）带 epId
 * （UGC 普通 UP 主视频的分 P 无 epId 字段）。用于「仅允许 CLI 模式」
 * 开关的显示与执行范围限定——UGC MP4 直链免防盗链可直连，不存在
 * PGC 强制 B站 Referer 防盗链导致的必然代理问题。
 */
export function isBilibiliPgcMovie(
  movie: Pick<Movie, 'url' | 'pages'> | null | undefined
): boolean {
  if (!movie) return false
  if (/^(ep|ss)[1-9]\d*$|bangumi\/play\/(ep|ss)\d+|ep_id=\d+/i.test(movie.url)) return true
  return !!movie.pages?.some((p) => p.epId != null)
}

/**
 * 获取影片实际生效的 MP4 偏好（感知 CLI 连接状态与系统默认参数）。
 *
 * CLI 已启用且本地代理已连接：强制 DASH 高画质代理路径（preferMp4=false）。
 * CLI 已启用但本地代理未连接：回退服务器 MP4 直链（preferMp4=true），
 * 不抛错也不回退服务器 DASH（用户指定语义：CLI 未连接就回退 MP4）。
 *
 * CLI 未启用时：服务器端 DASH 被禁用（dashDisabled）强制 MP4；
 * 影片已有显式解析配置按配置走；未显式配置时回退管理员基础设置的
 * 默认解析参数（普通视频 bilibiliDefaultParseMode / 番剧影视
 * bilibiliPgcDefaultMode，经 public-settings 下发，观众端同样生效）。
 */
export function getEffectivePreferMp4(movieId: number): boolean {
  const parsePrefs = getBilibiliParseOptions(movieId)
  const { preferMp4, cliEnabled } = parsePrefs
  const moviePolicy = useRoomStore.getState().movies.find(m => m.id === movieId)
  if (moviePolicy?.cliOnly === true) return false
  if (cliEnabled) {
    // CLI 已启用：已连接走 CLI DASH，未连接回退服务器 MP4
    return getActiveCliProxyUrl() ? false : true
  }
  // CLI 未启用：检查服务器端是否禁用了 DASH
  const settings = useSystemSettingsStore.getState()
  if (settings.dashDisabled) {
    return true
  }
  // 影片已有显式解析配置：按配置走
  if (parsePrefs.configured) {
    return preferMp4
  }
  // 未显式配置：按管理员基础设置的默认解析参数兜底
  // （PGC 走番剧/影视默认模式，普通视频走普通默认模式；
  // cliOnly 在此处仅映射 preferMp4=true——实际媒体路径由
  // Movie.cliOnly 物化后的强制 CLI 分支决定，不经过本函数）
  const movie = useRoomStore.getState().movies.find((m) => m.id === movieId)
  const defaultMode = isBilibiliPgcMovie(movie)
    ? settings.bilibiliPgcDefaultMode
    : settings.bilibiliDefaultParseMode
  return defaultMode !== 'dash'
}

function mapResolvedSourceToMovieSource(
  resolved: {
    epId?: number
    seasonId?: number
    seasonTitle?: string
    preview?: boolean
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
    epId: resolved.epId, seasonId: resolved.seasonId, seasonTitle: resolved.seasonTitle, preview: resolved.preview,
    noProxyFallback: movie.cliOnly === true,
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
 * B站 解析结果短 TTL 缓存。
 *
 * B站 playurl 解析涉及上游多跳请求，房主反复重载 / 观众加入 / 清晰度重试
 * 都会触发全量解析。B站 CDN URL 官方有效期约 2-3 小时，分钟级缓存完全安全。
 * 缓存 key 含 qn / preferMp4 / CLI 代理地址，任一维度变化自动失效。
 */
const BILIBILI_RESOLVE_CACHE_TTL_MS = 5 * 60 * 1000
const bilibiliResolveCache = new Map<
  string,
  {
    resolved: ResolvedMovieSource
    expiresAt: number
  }
>()

function buildBilibiliResolveCacheKey(
  movieId: number,
  qn: number | null | undefined,
  preferMp4: boolean,
  cliProxyUrl: string | null,
  useHostCookie: boolean,
  page: number | null | undefined
): string {
  return `${movieId}|${qn ?? '-'}|${preferMp4 ? 'mp4' : 'dash'}|${
    cliProxyUrl ?? 'server'
  }|${useHostCookie ? 'host' : 'self'}|p${page ?? '-'}`
}

/** 强制绕过缓存时（旧 URL 已失败），清掉该影片的全部缓存条目避免膨胀 */
function purgeBilibiliResolveCache(movieId: number): void {
  const prefix = `${movieId}|`
  for (const key of Array.from(bilibiliResolveCache.keys())) {
    if (key.startsWith(prefix)) bilibiliResolveCache.delete(key)
  }
}

/**
 * 在线解析 B站 视频 playurl。
 * 独立导出供「复用旧 URL 失败后的回退重新解析」复用。
 *
 * 若该影片启用了 CLI 代理且本地 CLI 在线，则通过 CLI 使用用户自己的 Cookie
 * 解析高画质地址；否则回退到服务端解析。
 *
 * CLI 已启用但本地未连接时：不抛错中断播放，回退服务器端 MP4 直链解析
 * （getEffectivePreferMp4 已按连接状态返回 true），一起看/一起听同语义。
 *
 * 结果带 5 分钟 TTL 缓存；forceRefresh 为 true 时绕过缓存并清空旧条目
 * （用于复用旧 URL 失败后的强制重新解析——缓存的正是刚失败的 URL）。
 */
export async function resolveBilibiliOnline(
  movie: Movie,
  onProgress?: (step: string, message: string) => void,
  options?: { preferMp4?: boolean; forceRefresh?: boolean; timeoutMs?: number; page?: number; useHostCookie?: boolean }
): Promise<ResolvedMovieSource> {
  const parsePrefs = getBilibiliParseOptions(movie.id)
  const policy = getNativeQualityPolicy(movie.id)
  const qn = isEmbeddedBilibiliHost() ? policy.qn : undefined
  const cliOnly = movie.cliOnly === true
  const proxyUrl = cliOnly || parsePrefs.cliEnabled ? getActiveCliProxyUrl() : null
  if (cliOnly && !proxyUrl) throw new Error('该影片要求本机代理：请登录 B 站或重启内置代理后重试')
  const useHostCookie = options?.useHostCookie !== false
  // CLI 已启用：已连接走 CLI DASH；未连接由 getEffectivePreferMp4
  // 返回 true，回退服务器 MP4 直链
  const effectivePreferMp4 =
    options?.preferMp4 ?? getEffectivePreferMp4(movie.id)
  const forceDash = (parsePrefs.cliEnabled || cliOnly) && !!proxyUrl

  if (parsePrefs.cliEnabled && !proxyUrl) {
    console.warn(
      '[movie-source-resolver] CLI 已启用但本地代理未连接，回退服务器 MP4 解析'
    )
  }

  const forceRefresh = options?.forceRefresh === true
  const nativeSession = getEmbeddedProxyStatus().sessionVersion
  const capabilityKey = isEmbeddedBilibiliHost() && proxyUrl ? JSON.stringify(await getWebViewCapabilities()) : ''
  const requestedQn = isEmbeddedBilibiliHost() && policy.mode === 'manual' ? policy.qn : undefined
  const cacheKey = buildBilibiliResolveCacheKey(
    movie.id,
    requestedQn,
    effectivePreferMp4,
    proxyUrl,
    useHostCookie,
    options?.page ?? movie.currentPage ?? 1
  ) + `|${movie.url}|${movie.cid ?? ''}|${isEmbeddedBilibiliHost() ? nativeQualityCacheKey(movie.id) : ''}|${capabilityKey}`
  if (!forceRefresh) {
    const cached = bilibiliResolveCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.resolved
    }
  } else {
    purgeBilibiliResolveCache(movie.id)
  }

  let resolvedSource: ResolvedMovieSource
  if (proxyUrl) {
    const pgc = extractBangumiId(movie.url)
    const nativeOptions = { qualityMode: policy.mode, fallbackQn: policy.fallbackQn, timeoutMs: options?.timeoutMs, seasonId: pgc?.seasonId }
    if (pgc) {
      const resolved = await resolveBangumiViaCli(proxyUrl, pgc.epId ?? 0, movie.cid, requestedQn, effectivePreferMp4, forceDash, nativeOptions)
      resolvedSource = mapResolvedSourceToMovieSource(resolved, movie)
    } else {
    const bvid = extractBvid(movie.url)
    if (bvid && (movie.cid || isEmbeddedBilibiliHost())) {
      const resolved = await resolveBilibiliViaCli(
        proxyUrl,
        bvid,
        movie.cid,
        qn,
        effectivePreferMp4,
        forceDash,
        isEmbeddedBilibiliHost() ? { qualityMode: policy.mode, fallbackQn: policy.fallbackQn, timeoutMs: options?.timeoutMs } : undefined
      )
      resolvedSource = mapResolvedSourceToMovieSource(resolved, movie)
    } else {
      if (cliOnly) throw new Error('该影片要求本机解析，当前链接无法识别；请使用 BV / ep / ss 完整链接')
      const resolved = await resolveBilibiliWithOptions(
        movie.url,
        requestedQn,
        onProgress,
        {
          preferMp4: effectivePreferMp4,
          // PGC ep 链接无法走 CLI 的 bvid 分支，服务器 fallback 同样锚定房主
          movieId: useHostCookie ? movie.id : undefined,
          // UGC 多 P：按目标分 P 解析（切 P 后 movie.url 不变）
          page: options?.page ?? movie.currentPage,
        }
      )
      resolvedSource = mapResolvedSourceToMovieSource(resolved, movie)
    }
    }
  } else {
    const resolved = await resolveBilibiliWithOptions(
      movie.url,
      requestedQn,
      onProgress,
      {
        preferMp4: effectivePreferMp4,
        movieId: useHostCookie ? movie.id : undefined,
        page: options?.page ?? movie.currentPage,
      }
    )
    resolvedSource = mapResolvedSourceToMovieSource(resolved, movie)
  }

  if (isEmbeddedBilibiliHost() && nativeSession !== getEmbeddedProxyStatus().sessionVersion) throw new Error('账号已切换，请重新解析')
  bilibiliResolveCache.set(cacheKey, {
    resolved: resolvedSource,
    expiresAt: Date.now() + BILIBILI_RESOLVE_CACHE_TTL_MS,
  })
  if (isEmbeddedBilibiliHost() && resolvedSource.currentQn) recordNativeQuality(movie.id, resolvedSource.currentQn, resolvedSource.acceptQuality ?? [])
  return resolvedSource
}

subscribeEmbeddedProxy(() => bilibiliResolveCache.clear())

/**
 * 在线解析 ani-subs 番剧源播放地址。
 *
 * ani-subs 的视频地址通常带 token/signature，短期有效（几分钟到几小时）。
 * 每次播放（含刷新恢复）都通过 sourceMeta 重新解析，确保使用最新地址。
 *
 * 防盗链处理：若返回 headers（Referer/UA 等），构建后端代理 URL。
 * 浏览器无法为 video.src 设置 Referer/UA，必须走代理。
 *
 * @throws sourceMeta 缺失或解析失败时抛错
 */
export async function resolveAnimeOnline(
  movie: Movie
): Promise<ResolvedMovieSource> {
  if (!movie.sourceMeta) {
    throw new Error('番剧源元数据缺失，请重新添加该番剧')
  }

  const { sourceId, episode } = movie.sourceMeta
  const resolved = await resolveAniSubsEpisode(sourceId, episode)

  // 防盗链处理：若返回 headers，走后端代理 URL
  const finalUrl = needsAniSubsProxy(resolved.url, resolved.headers)
    ? buildAniSubsProxyUrl(resolved.url, resolved.headers)
    : resolved.url

  return {
    sourceUrl: finalUrl,
    audioUrl: undefined,
    format: resolved.format as MediaFormat | undefined,
    videoCodec: undefined,
    audioCodec: undefined,
    duration: movie.duration ?? 0,
    headers: undefined,
    reusedRecoveryUrl: false,
  }
}

/**
 * 解析影片的播放源。
 *
 * - B站 源：在线解析 playurl（带解析进度回调）；
 * - ani-subs 番剧源：通过 sourceMeta 在线解析（URL 短期有效，每次重新解析）；
 * - 房主刷新恢复（recovery）且旧 URL 可用：优先复用旧 URL，
 *   标记 reusedRecoveryUrl，attach 失败时由调用方回退到在线解析；
 * - openlist/webdav 直链影片：播放时向后端实时解析新鲜直链
 *   （后端短 TTL 缓存），失败回退固化 movie.url；
 * - 其他源（webdav / ftp / url 等）：直接使用影片记录字段。
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
    if (movie.cliOnly !== true && recovery?.sourceUrl && !isEmbeddedBilibiliHost()) {
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

  if (sourceType === 'anime') {
    // ani-subs 番剧源：URL 短期有效，每次播放都通过 sourceMeta 重新解析
    // recovery 场景下也强制重新解析，因为旧 URL 大概率已过期
    return resolveAnimeOnline(movie)
  }

  // 非 B站 源：直接使用影片记录字段（Movie 类型不含 headers，见 roomStore）
  // server-files 源按「当前客户端」重建代理 URL：旧记录可能存的是添加者的
  // 绝对 API 地址，外网/跨域观众无法访问；重建为相对路径后所有客户端都
  // 指向各自可达的同源后端（文件路径保存在 movie.path）。
  if (sourceType === 'server-files' && movie.path) {
    const format = movie.format || detectMediaFormat(movie.path)
    return {
      sourceUrl: buildServerFileProxyUrl(movie.path),
      audioUrl: movie.audioUrl,
      format,
      videoCodec: movie.videoCodec,
      audioCodec: movie.audioCodec,
      cid: movie.cid,
      duration: movie.duration || 0,
      currentQn: movie.currentQn,
      acceptQuality: movie.acceptQuality,
      headers: undefined,
      reusedRecoveryUrl: false,
      playsvideoEnabled: movie.playsvideoEnabled !== false,
    }
  }

  // 其余源（webdav / openlist / ftp / smb / emby / jellyfin / url 等）：
  // format 兜底从 URL 扩展名自动推断。MKV 快速路径判定与 server-files
  // 一致：原生友好编码直通原生播放，跨域 URL 由 direct 引擎的代理策略
  // （直连失败回退服务器代理）兜底，原生失败再回退 playsvideo 管线。
  // 挂载直链模式（directLink）例外：直连失败不回退服务器代理，直接提示。
  //
  // openlist/webdav 直链影片：播放时向后端实时解析新鲜直链，不使用固化的
  // movie.url——签名直链会过期、源站地址/协议可能随时间变化（对齐 synctv
  // 的 play-time 解析语义；后端 5 分钟 TTL 缓存 + 单飞去重，附赠
  // upgradeDirectUrlValidated 的 https 活性校验）。解析失败回退固化
  // movie.url 保持旧行为（direct-engine 的 http 降级自愈仍然生效）。
  let effectiveUrl = movie.url
  if (
    movie.directLink === true &&
    (sourceType === 'openlist' || sourceType === 'webdav') &&
    movie.serverUrl &&
    movie.path
  ) {
    try {
      effectiveUrl = await resolveMovieDirectUrl(movie.id)
    } catch (err) {
      console.warn(
        '[movie-source-resolver] 实时直链解析失败，回退影片记录 URL:',
        err
      )
    }
  }
  const inferredFormat = movie.format || detectMediaFormat(effectiveUrl)
  return {
    sourceUrl: effectiveUrl,
    audioUrl: movie.audioUrl,
    format: inferredFormat,
    videoCodec: movie.videoCodec,
    audioCodec: movie.audioCodec,
    cid: movie.cid,
    duration: movie.duration || 0,
    currentQn: movie.currentQn,
    acceptQuality: movie.acceptQuality,
    headers: undefined,
    reusedRecoveryUrl: false,
    playsvideoEnabled: movie.playsvideoEnabled !== false,
    noProxyFallback: movie.directLink === true,
  }
}
