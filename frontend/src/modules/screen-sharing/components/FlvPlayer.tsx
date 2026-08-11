/**
 * FlvPlayer —— HTTP-FLV 拉流播放器（ArtPlayer 版）。
 *
 * 基于 ArtPlayer（isLive 模式）+ flv.js：
 * - 自定义玻璃拟态控制栏（播放/音量/全屏/刷新），与 WebRTC 控制栏风格一致
 * - 保留重构前全部行为：指数退避重连（最多 5 次）、卡顿自动追帧、
 *   统计信息每秒上报、自动播放静音重试
 * - props 契约与重构前完全一致（WatchPage / StreamPushPage 无需改动）
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import flvjs from 'flv.js'
import Artplayer from 'artplayer'
import type { Option } from 'artplayer'
import {
  Maximize,
  Maximize2,
  Minimize,
  Minimize2,
  Pause,
  Play,
  RefreshCw,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { Tag } from '@/components/ui/Tag'
import { IconButton } from '@/components/VideoControls'
import { configureArtStatics } from '@/modules/art-player'
import { cn } from '@/lib/utils'
import {
  isIOSDevice,
  supportsContainerFullscreen,
  getFullscreenElement,
  exitFullscreen,
  requestFullscreen,
  onFullscreenChange,
} from '@/lib/fullscreen-utils'
import { useControlBarAutoHide } from '@/hooks/useControlBarAutoHide'
import '@/modules/art-player/art-overrides.css'

/** flv.js 统计信息
 *
 * 注意：flv.js 的 STATISTICS_INFO 事件只提供网络层统计，
 * 不提供 videoDataRate/audioDataRate 等编码层信息。
 * 帧率通过 decodedFrames 差值自行计算，
 * 总码率近似为 speed（下载速度 KB/s）× 8。
 */
export interface FlvStatistics {
  /** 网络下载速度 (KB/s) */
  speed: number
  /** 当前近似总码率 (Kbps)，由 speed × 8 计算得出 */
  totalDataRate: number
  /** 当前帧率（fps），由 decodedFrames 差值 / 时间差计算） */
  fps: number
  /** 已解码帧数 */
  decodedFrames: number
  /** 丢帧数 */
  droppedFrames: number
}

interface FlvPlayerProps {
  /** 拉流地址（HTTP-FLV），例如 http://host:3335/live/xxx.flv */
  src: string
  /** 是否自动播放 */
  autoPlay?: boolean
  /** 是否静音（默认 true，处理浏览器自动播放策略） */
  muted?: boolean
  /** 附加 className */
  className?: string
  /** 拉流出错时回调 */
  onError?: (error: Error) => void
  /** 状态变化回调 */
  onStatusChange?: (
    status: 'connecting' | 'playing' | 'error' | 'stopped'
  ) => void
  /** 统计信息回调（每秒触发） */
  onStatistics?: (stats: FlvStatistics) => void
  /** 网页全屏状态（受控） */
  isWebFullscreen?: boolean
  /** 切换网页全屏 */
  onToggleWebFullscreen?: () => void
}

const MAX_RETRY = 5
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000]

export function FlvPlayer({
  src,
  autoPlay = true,
  muted = true,
  className,
  onError,
  onStatusChange,
  onStatistics,
  isWebFullscreen = false,
  onToggleWebFullscreen,
}: FlvPlayerProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [reloadVersion, setReloadVersion] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(muted)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [streamStatus, setStreamStatus] = useState<
    'connecting' | 'playing' | 'error' | 'stopped'
  >('connecting')

  // 控制栏自动隐藏（逻辑仿照 WatchTogetherCore）
  const controlBarVisible = useControlBarAutoHide(stageRef, {
    disabled: loading || !!errorMsg,
  })

  // 用 ref 存储回调，避免内联函数引用变化导致 useEffect 重新执行（播放器闪烁）
  const onErrorRef = useRef(onError)
  const onStatusChangeRef = useRef(onStatusChange)
  const onStatisticsRef = useRef(onStatistics)
  const mutedRef = useRef(muted)

  useEffect(() => {
    onErrorRef.current = onError
    onStatusChangeRef.current = onStatusChange
    onStatisticsRef.current = onStatistics
    mutedRef.current = muted
  }, [onError, onStatusChange, onStatistics, muted])

  // 创建 ArtPlayer + flv.js（src 变化 / 手动刷新时重建）
  useEffect(() => {
    const container = containerRef.current
    if (!container || !src) return
    if (!flvjs.isSupported()) {
      const err = new Error('当前浏览器不支持 MSE / flv.js')
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 错误处理
      setErrorMsg(err.message)
      onErrorRef.current?.(err)
      onStatusChangeRef.current?.('error')
      return
    }

    configureArtStatics()

    let retryCount = 0
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    // 帧率计算：flv.js STATISTICS_INFO 不直接提供 fps，通过 decodedFrames 差值计算
    let lastStatsTime = 0
    let lastDecodedFrames = 0

    setLoading(true)
    setErrorMsg(null)
    setStreamStatus('connecting')
    onStatusChangeRef.current?.('connecting')

    // ── ArtPlayer 实例（isLive 隐藏进度条与时间显示）────────────
    const art = new Artplayer({
      container,
      url: '',
      lang: 'zh-cn',
      isLive: true,
      muted: mutedRef.current,
      autoplay: false,
      // 禁用单击视频区域暂停：共享画面通过控制栏按钮控制
      click: false,
      hotkey: false,
      pip: false,
      screenshot: false,
      setting: false,
      loop: false,
      flip: false,
      playbackRate: false,
      aspectRatio: false,
      // 禁用 ArtPlayer 原生全屏和控制栏；由自定义控制栏接管
      fullscreen: false,
      fullscreenWeb: false,
      subtitleOffset: false,
      miniProgressBar: false,
      airplay: false,
      mutex: true,
      backdrop: true,
      playsInline: true,
      moreVideoAttr: {
        playsInline: true,
      },
      // 禁用 ArtPlayer 原生控制栏
      controls: [],
    } as Option)
    // 空 url 初始化会让 ArtPlayer 一直显示 loading，延迟隐藏
    const hideLoadingTimer = setTimeout(() => {
      art.loading.show = false
    }, 100)

    const video = art.video
    video.muted = mutedRef.current
    videoRef.current = video

    // ── video 事件监听：同步播放/静音状态到自定义控制栏 ──────
    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleVolumeChange = () => setIsMuted(video.muted)
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    video.addEventListener('volumechange', handleVolumeChange)

    // ── 阻止点击视频画面暂停/播放：由控制栏按钮控制 ──────────
    // ArtPlayer 的 click:false 可能不完全阻止点击暂停，
    // 在 capture 阶段拦截 click/dblclick 确保 video 点击不触发任何操作
    const blockVideoClick = (e: Event) => {
      if (e.target === video) {
        e.stopImmediatePropagation()
        e.preventDefault()
      }
    }
    video.addEventListener('click', blockVideoClick, true)
    video.addEventListener('dblclick', blockVideoClick, true)

    // ── flv.js 实例 ──────────────────────────────────────
    const player = flvjs.createPlayer(
      {
        type: 'flv',
        url: src,
        isLive: true,
        cors: true,
      },
      {
        enableWorker: false,
        enableStashBuffer: true,
        stashInitialSize: 256,
        // 自动清理已播放的 SourceBuffer，防止内存膨胀
        autoCleanupSourceBuffer: true,
        autoCleanupMaxBackwardDuration: 8,
        autoCleanupMinBackwardDuration: 4,
        // 直播延迟追赶：缓冲超过阈值时自动追帧（flv.js 运行时支持，类型定义缺失）
        liveBufferLatencyChasing: true,
        liveBufferLatencyMaxLatency: 1.5,
        liveBufferLatencyTargetLatency: 0.5,
      } as Record<string, unknown>
    )
    player.attachMediaElement(video)
    player.on(flvjs.Events.ERROR, (errorType: string, errorDetail: string) => {
      console.error('[FlvPlayer] error:', errorType, errorDetail)
      if (retryCount < MAX_RETRY) {
        const delay = RETRY_DELAYS_MS[retryCount]
        retryCount += 1
        console.log(
          `[FlvPlayer] retry ${retryCount}/${MAX_RETRY} in ${delay}ms`
        )
        onStatusChangeRef.current?.('connecting')
        setStreamStatus('connecting')
        if (retryTimer) clearTimeout(retryTimer)
        retryTimer = setTimeout(() => {
          player.unload()
          player.load()
          try {
            const ret = player.play()
            if (ret && typeof ret.catch === 'function') ret.catch(() => {})
          } catch {
            // ignore
          }
        }, delay)
      } else {
        const err = new Error(
          `拉流失败（${errorType}/${errorDetail}），已重试 ${MAX_RETRY} 次`
        )
        setErrorMsg(err.message)
        onErrorRef.current?.(err)
        onStatusChangeRef.current?.('error')
        setStreamStatus('error')
      }
    })
    player.on(flvjs.Events.MEDIA_INFO, () => {
      retryCount = 0
      setLoading(false)
      setErrorMsg(null)
    })

    // 统计信息上报（flv.js 内部约每秒触发一次）
    player.on(flvjs.Events.STATISTICS_INFO, (info: Record<string, unknown>) => {
      const now = performance.now()
      const decodedFrames = (info.decodedFrames as number) ?? 0
      const droppedFrames = (info.droppedFrames as number) ?? 0
      const speed = (info.speed as number) ?? 0

      let fps = 0
      if (lastStatsTime > 0) {
        const dt = (now - lastStatsTime) / 1000
        const frameDelta = decodedFrames - lastDecodedFrames
        if (dt > 0 && frameDelta >= 0) {
          fps = Math.round(frameDelta / dt)
        }
      }
      lastStatsTime = now
      lastDecodedFrames = decodedFrames

      onStatisticsRef.current?.({
        speed: Math.round(speed),
        totalDataRate: Math.round(speed * 8),
        fps,
        decodedFrames,
        droppedFrames,
      })
    })

    // 兜底：当 video 元素实际拿到画面时关闭 loading（部分流 MEDIA_INFO 触发较晚或不触发）
    const handleLoadedMetadata = () => {
      retryCount = 0
      setLoading(false)
      setErrorMsg(null)
    }
    video.addEventListener('loadedmetadata', handleLoadedMetadata)

    // 卡死自动恢复：当视频暂停但 buffered 有数据时，向前跳过一小段恢复播放
    const handleWaiting = () => {
      if (video.readyState < 3) {
        const buffered = video.buffered
        if (buffered.length > 0) {
          const bufferedEnd = buffered.end(buffered.length - 1)
          if (bufferedEnd - video.currentTime > 0.5) {
            video.currentTime = bufferedEnd - 0.3
            console.log(
              '[FlvPlayer] recovered from stall, seek to',
              video.currentTime
            )
          }
        }
      }
    }
    video.addEventListener('waiting', handleWaiting)

    // 兜底：video 播放卡住但未触发 waiting 时，通过定时器检测 stalled 状态
    const stallCheckTimer = setInterval(() => {
      if (!video.paused && video.readyState < 3) {
        const buffered = video.buffered
        if (buffered.length > 0) {
          const bufferedEnd = buffered.end(buffered.length - 1)
          if (bufferedEnd - video.currentTime > 0.5) {
            video.currentTime = bufferedEnd - 0.3
            console.log(
              '[FlvPlayer] recovered from stall (timer), seek to',
              video.currentTime
            )
          }
        }
      }
    }, 3000)

    player.on(flvjs.Events.LOADING_COMPLETE, () => {
      // 直播流不应触发 LOADING_COMPLETE，触发说明流已结束
      console.warn('[FlvPlayer] loading complete (stream ended)')
      onStatusChangeRef.current?.('stopped')
      setStreamStatus('stopped')
    })
    player.load()
    if (autoPlay) {
      const tryPlay = async () => {
        try {
          const ret = video.play()
          if (ret && typeof ret.catch === 'function') {
            await ret.catch(async (err: Error) => {
              console.warn('[FlvPlayer] autoplay failed:', err)
              if (!video.muted) {
                video.muted = true
                try {
                  await video.play()
                  console.log('[FlvPlayer] muted autoplay succeeded')
                } catch (mutedErr) {
                  console.warn('[FlvPlayer] muted autoplay failed:', mutedErr)
                }
              }
            })
          }
        } catch (err) {
          console.warn('[FlvPlayer] autoplay failed:', err)
        }
      }
      void tryPlay()
    }

    onStatusChangeRef.current?.('playing')
    setStreamStatus('playing')

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('waiting', handleWaiting)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('volumechange', handleVolumeChange)
      video.removeEventListener('click', blockVideoClick, true)
      video.removeEventListener('dblclick', blockVideoClick, true)
      videoRef.current = null
      clearInterval(stallCheckTimer)
      clearTimeout(hideLoadingTimer)
      if (retryTimer) {
        clearTimeout(retryTimer)
        retryTimer = null
      }
      try {
        player.unload()
        player.detachMediaElement()
        player.destroy()
      } catch (err) {
        console.error('[FlvPlayer] destroy error:', err)
      }
      try {
        art.destroy(false)
      } catch (err) {
        console.warn('[FlvPlayer] art destroy error:', err)
      }
    }
  }, [src, autoPlay, reloadVersion])

  // ── 全屏状态跟踪 ──────────────────────────────────────
  useEffect(() => {
    const dispose = onFullscreenChange(() => {
      setIsFullscreen(Boolean(getFullscreenElement()))
    })
    return dispose
  }, [])

  // ── 控制栏操作 ─────────────────────────────────────────
  const handleTogglePlayPause = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      void video.play().catch(() => {})
    } else {
      video.pause()
    }
  }, [])

  const handleToggleMute = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
  }, [])

  const handleFullscreen = useCallback(() => {
    // iOS 不支持容器全屏，降级为网页全屏（CSS 模拟全屏，保留控制栏等 UI）
    if (isIOSDevice() || !supportsContainerFullscreen()) {
      onToggleWebFullscreen?.()
      return
    }
    const stage = stageRef.current
    if (!stage) return
    if (getFullscreenElement()) {
      void exitFullscreen()
    } else {
      void requestFullscreen(stage).catch(() => {
        onToggleWebFullscreen?.()
      })
    }
  }, [onToggleWebFullscreen])

  const handleRefresh = useCallback(() => {
    setReloadVersion((v) => v + 1)
  }, [])

  return (
    <div
      ref={stageRef}
      className={cn(
        'zart-stage group',
        isWebFullscreen && 'zart-web-fullscreen fixed inset-0 z-[100]',
        className
      )}
      style={
        isWebFullscreen ? { width: '100dvw', height: '100dvh' } : undefined
      }
    >
      <div ref={containerRef} className="h-full w-full" />

      {loading && !errorMsg && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <Spinner tip="正在连接直播流..." size={32} />
        </div>
      )}
      {errorMsg && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/90 p-6 text-center">
          <div className="text-base font-medium text-[var(--md-sys-color-error)]">
            {errorMsg}
          </div>
          <div className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
            请检查网络连接或房主推流状态
          </div>
          <button
            type="button"
            className="mt-1 rounded-lg border border-white/20 px-4 py-1.5 text-sm text-white transition-colors hover:bg-white/10"
            onClick={handleRefresh}
          >
            重新连接
          </button>
        </div>
      )}

      {/* 自定义玻璃拟态控制栏（与 WebRTC 控制栏风格一致） */}
      {!loading && !errorMsg && (
        <div
          className={cn(
            'vc-container absolute bottom-0 left-0 right-0 z-20 p-2',
            !controlBarVisible && 'pointer-events-none'
          )}
        >
          <div
            className={cn(
              'glass-strong rounded-xl px-2.5 py-2 shadow-lg',
              controlBarVisible
                ? 'zart-controlbar-enter'
                : 'zart-controlbar-exit'
            )}
          >
            <div className="flex flex-wrap items-center vc-gap">
              <IconButton
                icon={isPlaying ? <Pause /> : <Play />}
                label={isPlaying ? '暂停' : '播放'}
                onClick={handleTogglePlayPause}
              />
              <IconButton
                icon={isMuted ? <VolumeX /> : <Volume2 />}
                label={isMuted ? '取消静音' : '静音'}
                onClick={handleToggleMute}
              />
              <IconButton
                icon={isWebFullscreen ? <Minimize /> : <Maximize />}
                label={isWebFullscreen ? '退出网页全屏' : '网页全屏'}
                onClick={onToggleWebFullscreen}
              />
              <IconButton
                icon={isFullscreen ? <Minimize2 /> : <Maximize2 />}
                label={isFullscreen ? '退出全屏' : '全屏'}
                onClick={handleFullscreen}
              />
              <IconButton
                icon={<RefreshCw />}
                label="刷新连接"
                onClick={handleRefresh}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Tag
                color={
                  streamStatus === 'playing'
                    ? 'success'
                    : streamStatus === 'error'
                      ? 'danger'
                      : 'primary'
                }
              >
                {streamStatus === 'playing'
                  ? '直播中'
                  : streamStatus === 'error'
                    ? '连接失败'
                    : streamStatus === 'stopped'
                      ? '已停止'
                      : '连接中'}
              </Tag>
              <Tag color="primary">OBS 推流</Tag>
              {isMuted ? (
                <Tag color="default">静音中</Tag>
              ) : (
                <Tag color="cyan">音频开启</Tag>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
