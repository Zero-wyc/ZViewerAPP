import { useEffect, useRef, useCallback, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useSocket } from '@/hooks/useSocket'
import { message } from '@/components/ui/message'
import {
  useRoomStore,
  type WatchTogetherState,
  type MovieDto,
  type Movie,
  mapDtoToMovie,
} from '@/store/roomStore'
import { type QualityOption } from './resolveSource'
import { useBilibiliQuality } from '@/modules/bilibili/useBilibiliQuality'
import { getBilibiliParseOptions } from '@/modules/bilibili/parseOptions'
import {
  useHostSync,
  useViewerSync,
  useViewerList,
  useTrackSync,
  useVideoSource,
  SOCKET_EVENT,
  safePlay,
} from '@/modules/sync-playback'
import { type MediaFormat } from '@/lib/mediaFormat'
import {
  resolveMovieSource,
  resolveBilibiliOnline,
  getEffectivePreferMp4,
  getActiveCliProxyUrl,
  type ResolvedMovieSource,
} from './movie-source-resolver'
import type { ResolvedSource } from '@/modules/bilibili/types'
import {
  fetchBlobsForBufferMode,
  DownloadError,
  UrlExpiredError,
  DownloadAbortedError,
} from '@/modules/player/services/buffer-mode'

// 格式化跳转时间用于提示信息（mm:ss 或 h:mm:ss）
function formatSeekTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const mm = m.toString().padStart(2, '0')
  const ss = s.toString().padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export type SourceType =
  'url' | 'webdav' | 'ftp' | 'openlist' | 'smb' | 'bilibili' | string

export type { QualityOption }

interface UseWatchTogetherOptions {
  roomId: string
  isHost: boolean
  videoRef: React.RefObject<HTMLVideoElement | null>
  /**
   * 房主刷新/重连恢复时由后端返回的最近一次播放状态。
   * 提供时，loadMovie 加载完成后若 currentMovieId 与之匹配，
   * 则将 currentTime 设置为 initialPlayback.currentTime 并强制暂停（不自动播放）。
   */
  initialPlayback?: {
    currentTime: number
    isPlaying: boolean
    playbackRate: number
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
    updatedAt: number
  } | null
}

/**
 * 一起看聚合 Hook：组合 useVideoSource（视频源管理）与 useSyncPlayback（同步核心），
 * 并保留 B站 清晰度切换、影片列表/当前影片同步、pendingQualityChange 消费等业务逻辑。
 *
 * v2 重构：影片 → 播放源的解析决策抽取到 movie-source-resolver.ts，
 * loadMovie 只保留编排（状态构建 / attach / 恢复进度 / 失败回退）。
 *
 * 对外导出签名与重构前完全一致，WatchTogetherPanel.tsx 无需修改。
 */
export function useWatchTogether({
  roomId,
  isHost,
  videoRef,
  initialPlayback,
}: UseWatchTogetherOptions) {
  const { socket } = useSocket()
  // 使用 useShallow 做浅比较，避免无 selector 订阅整个 store 导致任何字段变化都触发重渲染。
  // 特别是无害字段（viewers/isReloading 等）变化不应触发本 hook 重执行。
  const {
    watchTogether,
    setWatchTogether,
    movies,
    currentMovieId,
    setMovies,
    setCurrentMovieId,
    fetchMovies,
    pendingQualityChange,
    setPendingQualityChange,
    pendingPreviewPlay,
    setPendingPreviewPlay,
    pendingReloadBilibili,
    pendingViewerSourceReload,
    setBufferProgress,
  } = useRoomStore(
    useShallow((s) => ({
      watchTogether: s.watchTogether,
      setWatchTogether: s.setWatchTogether,
      movies: s.movies,
      currentMovieId: s.currentMovieId,
      setMovies: s.setMovies,
      setCurrentMovieId: s.setCurrentMovieId,
      fetchMovies: s.fetchMovies,
      pendingQualityChange: s.pendingQualityChange,
      setPendingQualityChange: s.setPendingQualityChange,
      pendingPreviewPlay: s.pendingPreviewPlay,
      setPendingPreviewPlay: s.setPendingPreviewPlay,
      pendingReloadBilibili: s.pendingReloadBilibili,
      pendingViewerSourceReload: s.pendingViewerSourceReload,
      setBufferProgress: s.setBufferProgress,
    }))
  )
  const isHostRef = useRef(isHost)
  const suppressEventsRef = useRef(false)
  const lastLoadedMovieRef = useRef<{ id: number; url: string } | null>(null)
  // 房主刷新恢复：用于在 loadMovie 完成后应用 initialPlayback.currentTime 并暂停
  // 通过 ref 暂存，避免修改 effect 依赖导致 loadMovie 重新触发
  // 采用 latest ref pattern：每次渲染同步，确保 loadMovie 内部读到最新值
  const initialPlaybackRef = useRef(initialPlayback)
  useEffect(() => {
    initialPlaybackRef.current = initialPlayback
  }, [initialPlayback])
  const appliedPlaybackRef = useRef(false)

  // B站 视频解析进度：用于在播放器上显示后台解析过程
  const [isResolving, setIsResolving] = useState(false)

  /** 下载取消器：切换影片时主动取消未完成下载 */
  const downloadAbortRef = useRef<AbortController | null>(null)
  /** 同步当前缓冲模式 key，供观众端 attach 后清理标记 */
  const bufferedKeyRef = useRef<string | null>(null)

  // reloadBilibili 并发重入保护：手动点击重载与 stalled/error 自动重载可能重叠，
  // 若上一次解析尚未结束又发起新请求，会导致 suppressEventsRef 状态错乱
  // （先结束的 finally 把 suppressEventsRef 重置为 false，但后结束的仍在解析中）
  // 以及重复 UI 闪烁。ref 标记确保同一时刻只有一个 reloadBilibili 在执行。
  const isReloadingBilibiliRef = useRef(false)
  // 观众端 CLI 代理切换/清晰度覆盖的并发重入保护。
  const isViewerReloadingRef = useRef(false)

  useEffect(() => {
    isHostRef.current = isHost
  }, [isHost])

  // 1. 视频源管理：applySourceToVideo / cleanupMedia / restoredRef / seekTo / reloadVideo
  const { applySourceToVideo, cleanupMedia, seekTo, reloadVideo } =
    useVideoSource({
      videoRef,
      suppressEventsRef,
      watchTogether,
      isHostRef,
    })

  // 2. 房主同步编排（组合广播+状态请求+心跳+事件绑定，内部按 isHostRef 判断）
  const { broadcastState, sendControl, forceSync } = useHostSync({
    roomId,
    isHostRef,
    videoRef,
    suppressEventsRef,
    setWatchTogether,
  })

  // 3. 观众同步编排（组合状态接收+服务器心跳，内部按 isHostRef 判断）
  useViewerSync({
    roomId,
    isHostRef,
    videoRef,
    suppressEventsRef,
    setWatchTogether,
    applySourceToVideo,
    watchTogether,
    seekTo,
    reloadVideo,
  })

  // 4. 房主与观众：同步在线观众列表（viewer-joined / viewer-left）
  useViewerList()

  // 弹幕/字幕轨道同步（合并事件 track-change，后端新增转发 handler 修复功能失效 bug）
  const {
    broadcastDanmakuTrackChange,
    broadcastSubtitleTrackChange,
    setSubtitleTrackIndex,
    subtitleTrackIndex,
    danmakuTrackId,
    onDanmakuTrackChange,
    onSubtitleTrackChange,
  } = useTrackSync({
    roomId,
    isHostRef,
  })

  /**
   * 缓冲模式：从 B站 CDN 下载完整 m4s 流到 IndexedDB，缓存命中时直接复用。
   *
   * 提升到组件作用域以便 useBilibiliQuality（清晰度切换）与 loadMovie（影片加载）
   * 共用同一实现。实际逻辑委托给 buffer-mode service，此处仅负责：
   * - 创建 AbortController 供切换影片时取消
   * - 进度回调更新 roomStore.bufferProgress（房主/观众共享 UI）
   * - 错误分类提示
   *
   * @param state 当前播放状态（含 sourceUrl/audioUrl/cid/currentQn）
   * @param movie 影片元数据（用于 bvid 与 title）
   */
  const fetchBlobsForBufferModeLocal = useCallback(
    async (
      state: WatchTogetherState,
      movie: Movie
    ): Promise<{ videoBlob: Blob; audioBlob: Blob }> => {
      const controller = new AbortController()
      downloadAbortRef.current = controller

      try {
        setBufferProgress({
          downloaded: 0,
          total: 1,
          title: movie.title || '当前视频',
        })

        const result = await fetchBlobsForBufferMode({
          state,
          bvid: movie.url,
          title: movie.title,
          onProgress: (p) => setBufferProgress(p),
          signal: controller.signal,
        })
        bufferedKeyRef.current = result.cacheKey
        return { videoBlob: result.videoBlob, audioBlob: result.audioBlob }
      } catch (err) {
        if (err instanceof DownloadAbortedError) {
          console.log('[useWatchTogether] 缓冲下载已取消')
        } else if (err instanceof UrlExpiredError) {
          message.error('B站 URL 已过期，请重新解析视频')
        } else if (err instanceof DownloadError) {
          message.error(`缓冲下载失败: ${err.message}`)
        } else {
          console.error('[useWatchTogether] 缓冲下载失败:', err)
          message.error('缓冲下载失败，请重试')
        }
        throw err
      } finally {
        setBufferProgress(null)
        downloadAbortRef.current = null
      }
    },
    [setBufferProgress]
  )

  // B站 清晰度切换统一 Hook：封装 currentQuality/availableQualities/isSwitchingQuality
  // 状态及房主/观众/列表触发的切换逻辑。
  // 协议精简（v2）：不再传 socket/roomId，清晰度切换通过 broadcastState 推送完整 state 同步。
  // 缓冲模式扩展（v3）：注入 fetchBlobsForBufferModeLocal，清晰度切换时下载新清晰度的 m4s。
  const quality = useBilibiliQuality({
    videoRef,
    isHostRef,
    suppressEventsRef,
    applySourceToVideo,
    setWatchTogether,
    broadcastState,
    setIsResolving,
    fetchBlobsForBufferMode: fetchBlobsForBufferModeLocal,
  })

  // 监听影片列表与当前播放影片的同步事件
  useEffect(() => {
    if (!socket) return

    const handleMovieList = (payload: { movies: MovieDto[] }) => {
      // 后端广播的 movie-list 事件仅作实时刷新：直接覆盖本地缓存
      // 防御性检查：仅接受属于当前房间的影片，避免切换房间时旧房间的事件
      // 残留导致新房间显示其他房间的视频
      const currentRoomId = useRoomStore.getState().roomId
      const filtered = payload.movies.filter(
        (m) => !m.roomId || m.roomId === currentRoomId
      )
      setMovies(filtered.map(mapDtoToMovie))
    }

    const handleCurrentMovie = (payload: { movieId: number | null }) => {
      // 房主刷新恢复期间，recovery 已通过 register-host 回调写入 currentMovieId，
      // 不接受后端 current-movie 事件的覆盖（后端 roomStateService 可能因状态丢失
      // 或预览模式残留返回 null，导致 recovery 被清空）。
      // 仅在 store 中无 currentMovieId 时才接受事件值（如观众端首次加入房间）。
      if (isHostRef.current && useRoomStore.getState().currentMovieId) return
      setCurrentMovieId(payload.movieId)
    }

    // 观众端：接收房主广播的预览源，直接加载播放（不经过影片列表）
    const handlePreviewSource = (payload: {
      source: {
        url: string
        title?: string
        sourceType?: string
        format?: MediaFormat
        audioUrl?: string
        videoCodec?: string
        audioCodec?: string
        headers?: Record<string, string>
        duration?: number
      }
    }) => {
      if (isHostRef.current) return
      const video = videoRef.current
      if (!video) return

      const { source } = payload
      const newState: WatchTogetherState = {
        sourceUrl: source.url,
        sourceType: source.sourceType || 'anime',
        audioUrl: source.audioUrl,
        format: source.format as MediaFormat | undefined,
        videoCodec: source.videoCodec,
        audioCodec: source.audioCodec,
        isPlaying: true,
        currentTime: 0,
        playbackRate: watchTogether.playbackRate,
        duration: source.duration ?? 0,
        headers: source.headers,
        isPreview: true,
        previewTitle: source.title,
      }
      setWatchTogether(newState)
      suppressEventsRef.current = true
      void applySourceToVideo(video, newState)
        .then(() => {
          video.currentTime = 0
          if (video.paused) {
            void safePlay(video)
          }
          suppressEventsRef.current = false
        })
        .catch((err: unknown) => {
          console.error('[useWatchTogether] 观众端预览源加载失败:', err)
          suppressEventsRef.current = false
          message.error(err instanceof Error ? err.message : '预览源加载失败')
        })
    }

    socket.on(SOCKET_EVENT.MOVIE_LIST, handleMovieList)
    socket.on(SOCKET_EVENT.CURRENT_MOVIE, handleCurrentMovie)
    socket.on(SOCKET_EVENT.PREVIEW_SOURCE, handlePreviewSource)

    // 房间加入/刷新时优先通过 REST 接口加载影片列表
    fetchMovies(roomId).catch((err) => {
      console.error('[useWatchTogether] fetchMovies error:', err)
    })
    socket.emit(SOCKET_EVENT.REQUEST_CURRENT_MOVIE, { roomId })

    // 房主刷新恢复：若 initialPlayback 中有 currentMovieId 且 store 中为 null，
    // 主动写入 store 以触发 loadMovie effect（loadMovie 内部会应用 recovery.currentTime）
    // 避免依赖后端 REQUEST_CURRENT_MOVIE 事件推送（房主断开期间后端可能已丢失 currentMovieId）
    const recovery = initialPlaybackRef.current
    if (
      isHostRef.current &&
      recovery &&
      typeof recovery.currentMovieId === 'number' &&
      !useRoomStore.getState().currentMovieId
    ) {
      setCurrentMovieId(recovery.currentMovieId)
    }

    return () => {
      socket.off(SOCKET_EVENT.MOVIE_LIST, handleMovieList)
      socket.off(SOCKET_EVENT.CURRENT_MOVIE, handleCurrentMovie)
      socket.off(SOCKET_EVENT.PREVIEW_SOURCE, handlePreviewSource)
    }
  }, [
    socket,
    roomId,
    setMovies,
    setCurrentMovieId,
    fetchMovies,
    applySourceToVideo,
    broadcastState,
    sendControl,
    suppressEventsRef,
    videoRef,
    watchTogether.playbackRate,
    setWatchTogether,
  ])

  // 根据当前视频源类型计算可用清晰度列表。
  // B站 DASH 流使用后端返回的真实 acceptQuality；其他单源类型返回空数组，由 UI 隐藏选择器。
  useEffect(() => {
    quality.syncFromState(watchTogether)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 依赖已按字段列出，无需整个 watchTogether
  }, [
    watchTogether.sourceType,
    watchTogether.format,
    watchTogether.sourceUrl,
    watchTogether.acceptQuality,
    watchTogether.currentQn,
    quality.syncFromState,
  ])

  // 房主：切换清晰度。重新解析对应 qn 的 URL、attach MSE 流并保留进度，同时广播给观众。
  const changeQuality = useCallback(
    async (qualityId: number) => {
      if (!isHostRef.current) return
      if (qualityId === quality.currentQuality) return

      const storeState = useRoomStore.getState()
      const movie = storeState.movies.find(
        (m) => m.id === storeState.currentMovieId
      )
      if (!movie?.url) return

      await quality.applyQualityChange(movie, qualityId, {
        broadcast: true,
      })
    },
    [quality]
  )

  // 房主：重新解析当前 B站 视频（用于解析偏好变更后即时生效）
  const reloadBilibili = useCallback(
    async (options?: { preferMp4?: boolean }) => {
      // 并发重入保护：上一次解析仍在进行中（含超时未返回的挂起场景）时直接跳过，
      // 避免多个解析请求并发导致 suppressEventsRef / isResolving 状态错乱。
      if (isReloadingBilibiliRef.current) {
        console.log(
          '[useWatchTogether] reloadBilibili 已在进行中，跳过本次请求'
        )
        return
      }
      isReloadingBilibiliRef.current = true

      const video = videoRef.current
      if (!video || !isHostRef.current) {
        isReloadingBilibiliRef.current = false
        return
      }

      const state = useRoomStore.getState().watchTogether
      if (state.sourceType !== 'bilibili') {
        isReloadingBilibiliRef.current = false
        return
      }

      const storeState = useRoomStore.getState()
      const movie = storeState.movies.find(
        (m) => m.id === storeState.currentMovieId
      )
      if (!movie?.url) {
        isReloadingBilibiliRef.current = false
        return
      }

      setIsResolving(true)
      suppressEventsRef.current = true

      const preserveTime = video.currentTime
      const shouldPlay = !video.paused

      try {
        // 未显式传入 options 时，从 localStorage 读取该影片的播放模式偏好
        // （BilibiliParseSettings 中切换播放模式触发 triggerReloadBilibili 走此路径）
        // CLI 已启用但未连接时直接报错，不再降级为 MP4。
        const parsePrefs = getBilibiliParseOptions(movie.id)
        if (parsePrefs.cliEnabled && !getActiveCliProxyUrl()) {
          throw new Error('CLI 代理未连接，请先启动本地 zcontrol-cli')
        }
        const resolvedOptions = options ?? {
          preferMp4: getEffectivePreferMp4(movie.id),
        }
        const resolved = await resolveBilibiliOnline(
          movie,
          undefined,
          resolvedOptions
        )

        const newState: WatchTogetherState = {
          ...state,
          sourceUrl: resolved.sourceUrl,
          audioUrl: resolved.audioUrl,
          videoCodec: resolved.videoCodec,
          audioCodec: resolved.audioCodec,
          format: resolved.format,
          currentQn:
            resolved.currentQn ?? quality.currentQuality ?? movie.currentQn,
          acceptQuality: resolved.acceptQuality,
          // 重新评估 bufferMode：根据当前用户偏好与新源格式
          // （DASH + bufferMode=true 才启用；MP4 模式强制 false）
          bufferMode:
            resolved.format === 'dash' &&
            getBilibiliParseOptions(movie.id).bufferMode === true,
        }
        setWatchTogether(newState)

        // 缓冲模式：重新解析后 cacheKey 变化（cid/qn 可能不同），需要重新下载 blobs
        let blobs: { videoBlob: Blob; audioBlob: Blob } | undefined
        if (newState.bufferMode) {
          try {
            blobs = await fetchBlobsForBufferModeLocal(newState, movie)
          } catch {
            // 缓冲失败已通过 message.error 提示，保持 bufferMode=true 不降级
            // 用户需手动重试（重载或切清晰度），避免自动回退到流式播放与用户意图相悖
            return
          }
        }

        // 传入 preserveTime 作为 startTime：MsePlayer.attach 会从该时间对应的字节偏移
        // 开始 Range 下载，而非从文件头 0 字节顺序下载。否则大跨度跳转后重载会
        // 从头加载到目标位置才播放（用户看到的"加载跳转之前的部分"现象）。
        await applySourceToVideo(video, newState, preserveTime, blobs)
        video.currentTime = preserveTime
        if (shouldPlay) {
          void safePlay(video)
        }

        quality.setCurrentQuality(newState.currentQn ?? null)
        quality.setAvailableQualities(newState.acceptQuality ?? [])

        // 同步更新 movie 对象的 acceptQuality/currentQn/format，
        // 否则 BilibiliQualitySelect 仍使用旧的 MP4 过滤后的清晰度列表，
        // 导致 CLI 开启后无法选择高画质。
        try {
          await useRoomStore.getState().updateMovie(roomId, movie.id, {
            acceptQuality: newState.acceptQuality,
            currentQn: newState.currentQn,
            format: newState.format,
          })
        } catch {
          // 持久化失败不阻塞播放，watchTogether state 已更新
        }

        broadcastState(newState)
      } catch (err) {
        console.error('[useWatchTogether] 重新解析 B站 视频失败:', err)
        message.error(err instanceof Error ? err.message : '重新解析失败')
        try {
          await applySourceToVideo(video, state, preserveTime)
          if (preserveTime > 0) {
            video.currentTime = preserveTime
          }
          if (shouldPlay) {
            void safePlay(video)
          }
        } catch {
          // 忽略恢复失败
        }
      } finally {
        suppressEventsRef.current = false
        quality.setIsSwitchingQuality(false)
        setIsResolving(false)
        isReloadingBilibiliRef.current = false
      }
    },
    [
      videoRef,
      quality,
      applySourceToVideo,
      setWatchTogether,
      broadcastState,
      fetchBlobsForBufferModeLocal,
    ]
  )

  // 响应 BilibiliParseSettings 中 codec / CDN 偏好变更触发的重新解析请求。
  // 计数器模式：每次 triggerReloadBilibili() 都会递增 pendingReloadBilibili，
  // effect 监听到值变化即调用 reloadBilibili。0 表示初始无请求，跳过。
  useEffect(() => {
    if (pendingReloadBilibili === 0) return
    const run = async () => {
      await reloadBilibili()
    }
    void run()
    // reloadBilibili 是 useCallback，依赖已固定；pendingReloadBilibili 是触发信号
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingReloadBilibili])

  // 观众：切换 CLI 等仅影响本客户端代理的设置后，重新 attach 当前源以生效。
  // 若启用了本地 CLI 代理且当前为 B站 源，优先通过 CLI 重新解析 DASH 高画质地址，
  // 覆盖房主广播的源（可能为 MP4），实现观众端独立走本地代理。
  useEffect(() => {
    if (pendingViewerSourceReload === 0) return
    const run = async () => {
      if (isHostRef.current) return
      if (isViewerReloadingRef.current) return
      isViewerReloadingRef.current = true

      const video = videoRef.current
      if (!video) {
        isViewerReloadingRef.current = false
        return
      }
      const storeState = useRoomStore.getState()
      const state = storeState.watchTogether
      if (!state.sourceUrl) {
        isViewerReloadingRef.current = false
        return
      }

      const movieId = storeState.currentMovieId
      const movie =
        movieId != null
          ? storeState.movies.find((m) => m.id === movieId)
          : undefined
      const cliEnabled =
        movieId != null && getBilibiliParseOptions(movieId).cliEnabled
      const existingOverride = storeState.viewerCliResolvedSource
      const hasOverride = existingOverride?.movieId === movieId

      suppressEventsRef.current = true
      try {
        if (
          cliEnabled &&
          movie?.url &&
          movie.cid &&
          getActiveCliProxyUrl() &&
          !hasOverride
        ) {
          const resolved = await resolveBilibiliOnline(movie, undefined, {
            preferMp4: false,
          })
          const resolvedSource: ResolvedSource = {
            videoUrl: resolved.sourceUrl,
            audioUrl: resolved.audioUrl,
            videoCodec: resolved.videoCodec,
            audioCodec: resolved.audioCodec,
            duration: resolved.duration,
            format: resolved.format ?? 'mp4',
            cid: resolved.cid,
            currentQn: resolved.currentQn,
            acceptQuality: resolved.acceptQuality,
            title: movie.title,
          }
          storeState.setViewerCliResolvedSource({
            movieId: movie.id,
            resolved: resolvedSource,
          })
        } else if (!cliEnabled) {
          // 关闭 CLI 时清除本地覆盖，恢复使用房主广播源
          storeState.setViewerCliResolvedSource(null)
        }

        await applySourceToVideo(video, state, video.currentTime)
      } catch (err) {
        console.error('[useWatchTogether] 观众重新 attach 源失败:', err)
        message.error(err instanceof Error ? err.message : '本地代理加载失败')
        // 出错时回退到房主广播源
        try {
          storeState.setViewerCliResolvedSource(null)
          await applySourceToVideo(video, state, video.currentTime)
        } catch {
          // ignore
        }
      } finally {
        suppressEventsRef.current = false
        isViewerReloadingRef.current = false
      }
    }
    void run()
    // applySourceToVideo 是 useCallback，依赖已固定；pendingViewerSourceReload 是触发信号
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingViewerSourceReload])

  // 观众：切换影片后清除本地 CLI 清晰度覆盖，避免旧影片的覆盖应用到新影片。
  useEffect(() => {
    const override = useRoomStore.getState().viewerCliResolvedSource
    if (override && override.movieId !== currentMovieId) {
      useRoomStore.getState().setViewerCliResolvedSource(null)
    }
  }, [currentMovieId])

  // 观众：清晰度切换通过 watch-together-state.currentQn 同步。
  // 旧版使用独立的 quality-change 事件，但后端无转发 handler 导致功能失效；
  // 重构后移除该事件，房主切换清晰度时通过 applyQualityChange 内的
  // broadcastState(newState) 立即推送完整状态（含 currentQn），
  // 观众端 useViewerStateSync 接收后由 quality.syncFromState 自动更新 UI。
  // 见上方 syncFromState effect（依赖 watchTogether.currentQn）。

  // 响应 MovieListPanel 触发的清晰度切换请求：若对应影片正在播放，立即应用新源。
  useEffect(() => {
    if (!pendingQualityChange) return

    // 立即捕获并清除 pending，防止 applyQualityChange 执行期间
    // setWatchTogether 触发重新渲染导致 quality 对象变化、effect 重复触发、
    // 多个 applyQualityChange 并发执行造成 MSE 流冲突白屏。
    const pending = pendingQualityChange
    setPendingQualityChange(null)

    const applyPending = async () => {
      const video = videoRef.current
      if (!video) return

      if (pending.movieId !== currentMovieId) return

      const storeState = useRoomStore.getState()
      const movie = storeState.movies.find((m) => m.id === pending.movieId)
      if (!movie) return

      await quality.applyQualityChange(movie, undefined, {
        broadcast: isHostRef.current,
        resolved: pending.resolved,
      })
    }

    void applyPending()
  }, [
    pendingQualityChange,
    currentMovieId,
    quality,
    setPendingQualityChange,
    videoRef,
  ])

  // currentMovieId 变化时自动加载对应影片到 video 元素
  // 仅房主执行加载逻辑：房主解析视频源并广播给观众。
  // 观众端完全依赖 handleState 接收房主广播的 sourceUrl/audioUrl 进行 MSE attach，
  // 不独立解析（避免与房主状态冲突导致黑屏）。
  useEffect(() => {
    if (!currentMovieId) return
    if (!isHostRef.current) return
    const movie = movies.find((m) => m.id === currentMovieId)
    if (!movie) return

    // 避免 movies 列表刷新时重复加载同一部影片
    if (
      lastLoadedMovieRef.current?.id === movie.id &&
      lastLoadedMovieRef.current?.url === movie.url
    ) {
      return
    }

    const video = videoRef.current
    if (!video) return

    const sourceType: WatchTogetherState['sourceType'] =
      movie.sourceType === 'mp4' ? 'url' : movie.sourceType

    suppressEventsRef.current = true
    lastLoadedMovieRef.current = { id: movie.id, url: movie.url }

    /** 带解析进度 UI 的在线解析（B站），读取 localStorage 中该影片的播放模式偏好 */
    const resolveOnline = async (): Promise<ResolvedMovieSource> => {
      setIsResolving(true)
      try {
        const parsePrefs = getBilibiliParseOptions(movie.id)
        if (parsePrefs.cliEnabled && !getActiveCliProxyUrl()) {
          throw new Error('CLI 代理未连接，请先启动本地 zcontrol-cli')
        }
        return await resolveBilibiliOnline(movie, undefined, {
          preferMp4: getEffectivePreferMp4(movie.id),
        })
      } finally {
        setIsResolving(false)
      }
    }

    const loadMovie = async () => {
      // 房主刷新恢复：若 initialPlayback.currentMovieId 与当前加载的影片 ID 匹配，
      // 则使用 initialPlayback.currentTime 替代 0，并强制暂停而非自动播放。
      // B站 URL 每次解析都会变，因此通过 currentMovieId 匹配而非 sourceUrl。
      const recovery = initialPlaybackRef.current
      const isRecovery =
        !appliedPlaybackRef.current &&
        !!recovery &&
        typeof recovery.currentMovieId === 'number' &&
        recovery.currentMovieId === movie.id
      const recoveryTime = isRecovery ? recovery!.currentTime : 0
      if (isRecovery) {
        appliedPlaybackRef.current = true
      }

      // 重置加载失败标记的辅助：允许用户手动重试
      const resetForRetry = () => {
        suppressEventsRef.current = false
        lastLoadedMovieRef.current = null
        if (isRecovery) {
          appliedPlaybackRef.current = false
        }
      }

      // 1. 解析播放源（B站 在线解析 / recovery 复用旧 URL / 其他源直用记录字段）
      let resolved: ResolvedMovieSource
      try {
        const willResolveOnline =
          sourceType === 'bilibili' && !(isRecovery && recovery?.sourceUrl)
        resolved = willResolveOnline
          ? await resolveOnline()
          : await resolveMovieSource({
              movie,
              sourceType,
              recovery: isRecovery ? recovery : null,
            })
      } catch (err) {
        console.error('[useWatchTogether] 解析视频源失败:', err)
        message.error(err instanceof Error ? err.message : '视频源解析失败')
        resetForRetry()
        return
      }

      // 2. 在线解析成功后同步清晰度 UI 状态（recovery 复用时保持现有值）
      if (sourceType === 'bilibili' && !resolved.reusedRecoveryUrl) {
        if (resolved.acceptQuality?.length) {
          quality.setAvailableQualities(resolved.acceptQuality)
        }
        quality.setCurrentQuality(
          resolved.currentQn ?? resolved.acceptQuality?.[0]?.id ?? null
        )
      }

      // 3. 构建播放状态
      const buildNewState = (r: ResolvedMovieSource): WatchTogetherState => ({
        sourceUrl: r.sourceUrl,
        sourceType,
        audioUrl: r.audioUrl,
        format: r.format,
        videoCodec: r.videoCodec,
        audioCodec: r.audioCodec,
        cid: r.cid,
        // Movie 类型不含 headers 字段，recovery 时从 initialPlayback.headers 获取，
        // 确保 ani-subs 等依赖防盗链的源在刷新恢复后仍能正确 MSE attach。
        headers: r.headers,
        isPlaying: !isRecovery,
        currentTime: recoveryTime,
        playbackRate: isRecovery
          ? (recovery!.playbackRate ?? watchTogether.playbackRate)
          : watchTogether.playbackRate,
        duration: r.duration,
        currentQn: r.currentQn,
        acceptQuality: r.acceptQuality,
        // 缓冲模式：仅 B站 DASH 源启用，根据该影片的用户偏好决定
        bufferMode:
          sourceType === 'bilibili' &&
          r.format === 'dash' &&
          getBilibiliParseOptions(movie.id).bufferMode === true,
      })

      // 4. attach 并恢复进度 / 自动播放 / 广播
      const applyAndRecover = async (
        state: WatchTogetherState,
        blobs?: { videoBlob: Blob; audioBlob: Blob }
      ) => {
        // 恢复进度时传入 recoveryTime 作为 startTime，MsePlayer 从该时间对应的
        // 字节偏移开始下载，而非从文件头顺序下载到 recoveryTime 才播放。
        const startTime =
          isRecovery && recoveryTime > 0 ? recoveryTime : undefined
        await applySourceToVideo(video, state, startTime, blobs)
        if (isRecovery && recoveryTime > 0) {
          // 恢复进度：seek 到目标时间并强制暂停
          try {
            video.currentTime = recoveryTime
          } catch {
            // ignore
          }
          video.pause()
          suppressEventsRef.current = false
          if (isHostRef.current) {
            broadcastState(state)
            sendControl('pause')
          }
          message.info(`已恢复到 ${formatSeekTime(recoveryTime)}（已暂停）`)
        } else {
          video.currentTime = 0
          if (video.paused) {
            void safePlay(video)
          }
          suppressEventsRef.current = false
          if (isHostRef.current) {
            broadcastState(state)
            sendControl('play')
          }
        }
      }

      /**
       * 缓冲模式：从 B站 CDN 下载完整 m4s 流到 IndexedDB，缓存命中时直接复用。
       *
       * 实际逻辑委托给组件作用域的 fetchBlobsForBufferModeLocal（已提升），
       * 此处直接复用，避免与 useBilibiliQuality 的清晰度切换路径实现重复。
       */
      const newState = buildNewState(resolved)
      setWatchTogether(newState)

      // 缓冲模式：在 attach 前先下载完整 m4s 流到 IndexedDB
      let blobs: { videoBlob: Blob; audioBlob: Blob } | undefined
      if (newState.bufferMode) {
        try {
          blobs = await fetchBlobsForBufferModeLocal(newState, movie)
        } catch {
          // 缓冲失败已通过 message.error 提示，重置状态允许用户重试
          resetForRetry()
          return
        }
      }

      void applyAndRecover(newState, blobs).catch(async (err: unknown) => {
        // MSE attach 失败时必须释放 suppressEventsRef，否则房主端
        // play/pause/seek/timeupdate 事件全部被吞，broadcastState 永不调用，
        // 导致观众端永久黑屏。
        console.error('[useWatchTogether] applySourceToVideo 失败:', err)

        // 房主刷新恢复 + 复用旧 B站 URL 失败（通常 403/404 deadline 过期）：
        // 回退到重新解析 B站 获取最新 URL，attach 后再次 applyAndRecover。
        // 非 B站 源或非 recovery 路径不回退（错误大概率不会自愈）。
        if (resolved.reusedRecoveryUrl) {
          console.log('[useWatchTogether] 复用旧 B站 URL 失败，回退到重新解析')
          try {
            const reResolved = await resolveOnline()
            if (reResolved.acceptQuality?.length) {
              quality.setAvailableQualities(reResolved.acceptQuality)
            }
            quality.setCurrentQuality(
              reResolved.currentQn ?? reResolved.acceptQuality?.[0]?.id ?? null
            )

            const reResolvedState = buildNewState(reResolved)
            setWatchTogether(reResolvedState)

            // 缓冲模式重新解析时也需要重新下载 m4s
            let reBlobs: { videoBlob: Blob; audioBlob: Blob } | undefined
            if (reResolvedState.bufferMode) {
              try {
                reBlobs = await fetchBlobsForBufferModeLocal(
                  reResolvedState,
                  movie
                )
              } catch {
                resetForRetry()
                return
              }
            }

            await applyAndRecover(reResolvedState, reBlobs)
            return
          } catch (retryErr) {
            console.error('[useWatchTogether] 回退重新解析失败:', retryErr)
            message.error(
              retryErr instanceof Error ? retryErr.message : 'B站视频解析失败'
            )
          }
          resetForRetry()
          return
        }

        // 非回退路径：报错并允许重试
        message.error(err instanceof Error ? err.message : '视频源加载失败')
        resetForRetry()
      })
    }

    void loadMovie()
  }, [
    currentMovieId,
    movies,
    videoRef,
    watchTogether.playbackRate,
    setWatchTogether,
    applySourceToVideo,
    broadcastState,
    sendControl,
    quality,
    suppressEventsRef,
    fetchBlobsForBufferModeLocal,
  ])

  // 组件卸载或切换房间时释放 MSE blob URL 与音频同步资源
  useEffect(() => {
    return () => {
      cleanupMedia()
    }
  }, [cleanupMedia])

  // Bug #14 修复：B站 CDN 地址 deadline 过期后，MSE 流式下载 fetch 会返回 403，
  // 播放器进入 stalled 状态。监听 video 的 stalled/error 事件，
  // 房主端自动触发 reloadBilibili 重新解析新地址（带 5s 去抖动 + 单次重试限制）。
  useEffect(() => {
    if (!isHostRef.current) return
    const video = videoRef.current
    if (!video) return

    const state = useRoomStore.getState().watchTogether
    if (state.sourceType !== 'bilibili') return

    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    let lastReloadAt = 0
    const RELOAD_COOLDOWN_MS = 10000 // 同一影片 10s 内最多重新解析一次，避免死循环

    const triggerReload = () => {
      const now = Date.now()
      if (now - lastReloadAt < RELOAD_COOLDOWN_MS) {
        console.log(
          '[useWatchTogether] stalled/error 已在冷却期内，跳过重新解析'
        )
        return
      }
      lastReloadAt = now
      console.log('[useWatchTogether] 检测到播放停滞，自动重新解析 B站 视频')
      void reloadBilibili()
    }

    const handleStalled = () => {
      if (suppressEventsRef.current) return
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(triggerReload, 5000)
    }
    const handleError = () => {
      if (suppressEventsRef.current) return
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(triggerReload, 2000)
    }

    video.addEventListener('stalled', handleStalled)
    video.addEventListener('error', handleError)

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      video.removeEventListener('stalled', handleStalled)
      video.removeEventListener('error', handleError)
    }
  }, [
    videoRef,
    reloadBilibili,
    suppressEventsRef,
    watchTogether.sourceType,
    watchTogether.sourceUrl,
  ])

  /**
   * 房主端：播放预览源（不写入影片列表，直接加载并广播给观众）。
   * 用于 ani-subs / Kazumi 等番剧源选集后的实时播放。
   */
  const previewPlay = useCallback(
    (params: {
      url: string
      title?: string
      sourceType?: string
      format?: MediaFormat
      audioUrl?: string
      videoCodec?: string
      audioCodec?: string
      headers?: Record<string, string>
      duration?: number
    }) => {
      const video = videoRef.current
      if (!video) return

      const newState: WatchTogetherState = {
        sourceUrl: params.url,
        sourceType: params.sourceType || 'anime',
        audioUrl: params.audioUrl,
        format: params.format,
        videoCodec: params.videoCodec,
        audioCodec: params.audioCodec,
        isPlaying: true,
        currentTime: 0,
        playbackRate: watchTogether.playbackRate,
        duration: params.duration ?? 0,
        headers: params.headers,
        isPreview: true,
        previewTitle: params.title,
      }

      setWatchTogether(newState)
      // 清除当前影片标记，避免 loadMovie effect 触发覆盖预览源
      setCurrentMovieId(null)

      suppressEventsRef.current = true
      void applySourceToVideo(video, newState)
        .then(() => {
          video.currentTime = 0
          if (video.paused) {
            void safePlay(video)
          }
          suppressEventsRef.current = false
          // 广播给观众
          broadcastState(newState)
          // 通过专用事件通知观众加载预览源
          socket?.emit('play-preview-source', {
            roomId,
            source: {
              url: params.url,
              title: params.title,
              sourceType: params.sourceType,
              format: params.format,
              audioUrl: params.audioUrl,
              videoCodec: params.videoCodec,
              audioCodec: params.audioCodec,
              headers: params.headers,
              duration: params.duration,
            },
          })
        })
        .catch((err: unknown) => {
          console.error('[useWatchTogether] previewPlay 加载失败:', err)
          suppressEventsRef.current = false
          message.error(err instanceof Error ? err.message : '预览源加载失败')
        })
    },
    [
      videoRef,
      watchTogether.playbackRate,
      setWatchTogether,
      setCurrentMovieId,
      applySourceToVideo,
      broadcastState,
      socket,
      roomId,
      suppressEventsRef,
    ]
  )

  // 监听 pendingPreviewPlay：由 MoviePushPanel 等外部组件触发，
  // 通过 store 解耦后在此消费，调用内部 previewPlay 执行实际加载与广播。
  // 捕获后立即清除 pending，防止 previewPlay 内部 setWatchTogether
  // 触发重新渲染导致 effect 重复触发、多次 applySourceToVideo 并发。
  useEffect(() => {
    if (!pendingPreviewPlay) return
    const payload = pendingPreviewPlay
    setPendingPreviewPlay(null)
    previewPlay(payload)
  }, [pendingPreviewPlay, previewPlay, setPendingPreviewPlay])

  return {
    watchTogether,
    setWatchTogether,
    videoRef,
    isHost,
    broadcastState,
    sendControl,
    forceSync,
    suppressEventsRef,
    applySourceToVideo,
    cleanupMedia,
    reloadVideo,
    previewPlay,
    // 清晰度相关
    currentQuality: quality.currentQuality,
    availableQualities: quality.availableQualities,
    isSwitchingQuality: quality.isSwitchingQuality,
    changeQuality,
    // B站 解析进度
    isResolving,
    // B站 重新解析
    reloadBilibili,
    // 轨道同步（合并事件）
    broadcastDanmakuTrackChange,
    broadcastSubtitleTrackChange,
    setSubtitleTrackIndex,
    subtitleTrackIndex,
    danmakuTrackId,
    onDanmakuTrackChange,
    onSubtitleTrackChange,
  }
}
