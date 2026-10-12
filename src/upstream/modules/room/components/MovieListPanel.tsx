import { beginMediaLibraryChange } from '@/modules/emby/mediaLibraryOperation'
import { getEmbyApiMovieSource, resolveEmby } from '@/modules/emby/embyApi'
import { resolveJellyfin } from '@/modules/jellyfin/jellyfinApi'
import type { EmbyVersionInfo } from '@/modules/emby/types'
import { logicalConnectionUrl } from '../../../../platform/connectionTransport'
import { canReorderPlaylist, movePlaylistItem } from './playlistOrder'
import { apiFetch } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { useState, useMemo, useEffect, useRef } from 'react'
import { Play, Trash2, Film, Monitor, ListVideo, Maximize, ArrowUp, ArrowDown } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Text, Paragraph } from '@/components/ui/Typography'
import { Tag } from '@/components/ui/Tag'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { message } from '@/components/ui/message'
import { useSocket } from '@/hooks/useSocket'
import { useRoomStore, type Movie } from '@/store/roomStore'
import {
  resolveBilibiliWithOptions,
  filterQualitiesByVip,
  getBilibiliUserInfo,
} from '@/modules/bilibili/bilibiliApi'
import {
  extractBvid,
  extractBangumiId,
  resolveBilibiliViaCli,
  resolveBangumiViaCli,
} from '@/modules/bilibili/cliApi'
import type { ResolvedSource } from '@/modules/bilibili/types'
import { BilibiliParseSettings } from './BilibiliParseSettings'
import {
  getEffectivePreferMp4,
  getActiveCliProxyUrl,
} from '@/modules/room/watch-together/movie-source-resolver'
import {
  useBilibiliParsePreferences,
  getBilibiliParseOptions,
} from '@/modules/bilibili/parseOptions'
import { useCliAgentStore } from '@/store/cliAgentStore'
import { cn } from '@/lib/utils'
import { isEmbeddedBilibiliHost, getEmbeddedProxyStatus } from '../../../../platform/bilibiliProxy'
import { NativeQualitySelect } from '@/modules/bilibili/NativeQualitySelect'
import { getNativeQualityPolicy } from '@/modules/bilibili/nativeQualityPolicy'

interface MovieListPanelProps {
  isHost: boolean
  /**
   * 影片管理权限（房管）：可切换/删除影片。
   * 与 isHost 分离：isHost 还控制订阅方向（房主广播 vs 观众订阅）与
   * B站清晰度/分集重解析（走房主 pendingQualityChange 消费链路），
   * 这些保持房主专属，房管不接管。
   */
  canManage?: boolean
}

const SOURCE_LABELS: Record<string, string> = {
  bilibili: '哔哩哔哩',
  mp4: '视频直链',
  webdav: 'WebDAV',
  ftp: 'FTP',
  openlist: 'OpenList',
  smb: 'SMB',
  emby: 'Emby',
  jellyfin: 'Jellyfin',
}

/** 格式标签映射，用于在影片卡片中显示真实媒体格式 */
const FORMAT_LABELS: Record<string, string> = {
  mp4: 'MP4',
  hls: 'HLS',
  flv: 'FLV',
  dash: 'DASH',
  webm: 'WebM',
  mkv: 'MKV',
  mov: 'MOV',
  avi: 'AVI',
  wmv: 'WMV',
  ts: 'TS',
}

export function MovieListPanel({
  isHost,
  canManage = false,
}: MovieListPanelProps) {
  const operationSeq = useRef(0)
  const { socket } = useSocket()
  const movies = useRoomStore((state) => state.movies)
  const currentMovieId = useRoomStore((state) => state.currentMovieId)
  const roomId = useRoomStore((state) => state.roomId)
  const removeMovie = useRoomStore((state) => state.removeMovie)
  const updateMovie = useRoomStore((state) => state.updateMovie)
  const setPendingQualityChange = useRoomStore(
    (state) => state.setPendingQualityChange
  )
  const setViewerCliResolvedSource = useRoomStore(
    (state) => state.setViewerCliResolvedSource
  )
  const triggerViewerSourceReload = useRoomStore(
    (state) => state.triggerViewerSourceReload
  )
  const viewerCliResolvedSource = useRoomStore(
    (state) => state.viewerCliResolvedSource
  )
  const mode = useRoomStore((state) => state.mode)
  const clearMovies = useRoomStore(state => state.clearMovies)
  const clearingRef = useRef(false)
  const confirmTimer = useRef<ReturnType<typeof setTimeout>>()
  const [clearConfirming, setClearConfirming] = useState(false)
  const [clearingAll, setClearingAll] = useState(false)
  const [search, setSearch] = useState('')
  const user = useAuthStore(state => state.user)
  const [owner, setOwner] = useState<{ roomId: string; userId: string; ownerId: number | null } | null>(null)
  const autoContinueEnabled = useRoomStore(state => state.autoContinueEnabled)
  const setAutoContinueEnabled = useRoomStore(state => state.setAutoContinueEnabled)
  const [sorting, setSorting] = useState(false)
  const sortingRef = useRef(false)
  const [orderOpen, setOrderOpen] = useState(false)
  const canSort = canReorderPlaylist(user?.role, user?.id, owner?.roomId === roomId && owner.userId === user?.id ? owner.ownerId : null)
  const [removingId, setRemovingId] = useState<number | null>(null)
  const [switchingId, setSwitchingId] = useState<number | null>(null)
  const [qualityLoadingId, setQualityLoadingId] = useState<number | null>(null)
  const [pageLoadingId, setPageLoadingId] = useState<number | null>(null)
  const [bilibiliVip, setBilibiliVip] = useState(false)
  const isScreenShare = mode === 'screen-share'

  // 弹窗显示完整影片列表
  const [showListModal, setShowListModal] = useState(false)

  useEffect(() => {
    if (!roomId || user?.role !== 'admin') return
    let cancelled = false
    void apiFetch('/api/admin/rooms').then(async response => {
      const data = await response.json() as { success?: boolean; rooms?: { roomId: string; ownerUserId: number | null }[] }
      if (!cancelled && response.ok && data.success) setOwner({ roomId, userId: user.id, ownerId: data.rooms?.find(room => room.roomId === roomId)?.ownerUserId ?? null })
    }).catch(() => { if (!cancelled) setOwner(null) })
    return () => { cancelled = true }
  }, [showListModal, roomId, user?.id, user?.role])
  useEffect(() => { setOrderOpen(false); setSearch(''); setClearConfirming(false); ++operationSeq.current; return () => { ++operationSeq.current; clearTimeout(confirmTimer.current) } }, [roomId])

  const moveMovie = async (movieId: number, direction: -1 | 1) => {
    if (sortingRef.current || !canSort || isScreenShare || !roomId) return
    const state = useRoomStore.getState()
    const ids = movePlaylistItem(state.movies, movieId, direction, search)
    if (!ids || state.roomId !== roomId) return
    sortingRef.current = true
    setSorting(true)
    try { await state.reorderMovies(roomId, ids) }
    catch (error) {
      if (useRoomStore.getState().roomId === roomId) {
        message.error(error instanceof Error ? error.message + '；排序仅允许 root 或创建房间的管理员' : '排序失败，请重试')
        try { await state.fetchMovies(roomId) } catch { /* keep the last server broadcast; no optimistic order */ }
      }
    } finally { sortingRef.current = false; setSorting(false) }
  }

  // 获取当前 B站 会员状态，用于过滤清晰度列表
  const hasBilibiliMovie = movies.some((m) => m.sourceType === 'bilibili')
  useEffect(() => {
    if (!hasBilibiliMovie) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 无 B站影片时重置会员状态
      setBilibiliVip(false)
      return
    }
    let cancelled = false
    getBilibiliUserInfo().then((info) => {
      if (!cancelled) setBilibiliVip(info?.vipStatus === 1)
    })
    return () => {
      cancelled = true
    }
  }, [hasBilibiliMovie])

  const filteredMovies = useMemo(() => {
    if (!search.trim()) return movies
    const keyword = search.trim().toLowerCase()
    return movies.filter((m) => m.title.toLowerCase().includes(keyword))
  }, [movies, search])

  const handlePlay = (movieId: number) => {
    if (!isHost && !canManage) {
      message.info('没有影片管理权限')
      return
    }
    if (!socket?.connected) {
      message.error('未连接房间')
      return
    }
    if (switchingId !== null) return
    const previousSourceUrl = useRoomStore.getState().watchTogether.sourceUrl
    const isNewMovie = currentMovieId !== movieId
    setSwitchingId(movieId)
    const complete = (error: Error | null, ack?: { success?: boolean; message?: string }, retried = false) => {
        if (!retried && isHost && !error && ack?.message === '影片不存在') {
          // The server can retain the DB playlist while losing its in-memory room
          // movie list. Registering the host refreshes that list before retrying.
          socket.timeout(8000).emit('register-host', { roomId },
            (registerError: Error | null, registerAck?: { success?: boolean }) => {
              if (registerError || !registerAck?.success) {
                setSwitchingId(null)
                message.error('片单同步失败，请重新进入房间')
                return
              }
              socket.timeout(8000).emit('play-movie', { roomId, movieId },
                (retryError: Error | null, retryAck?: { success?: boolean; message?: string }) => complete(retryError, retryAck, true))
            })
          return
        }
        setSwitchingId(null)
        if (error || !ack?.success) {
          message.error(ack?.message || '切换影片失败，请重试')
        } else if (!isHost && isNewMovie && previousSourceUrl) {
          // 服务端确认的是片单选择；实际片源仍由分享端加载并广播。
          // 旧版分享端可能忽略切片事件，此时明确提示而不把高亮当成播放成功。
          window.setTimeout(() => {
            const state = useRoomStore.getState()
            if (
              state.roomId === roomId &&
              state.currentMovieId === movieId &&
              state.watchTogether.sourceUrl === previousSourceUrl
            ) {
              message.error('分享端未切换，请刷新后重试')
            }
          }, 12000)
        }
    }
    socket.timeout(8000).emit('play-movie', { roomId, movieId }, complete)
  }

  const handleRemove = async (movieId: number) => {
    if (!isHost && !canManage) {
      message.info('只有房主或房管可以删除影片')
      return
    }
    if (!roomId) {
      message.error('未连接房间')
      return
    }
    setRemovingId(movieId)
    try {
      await removeMovie(roomId, movieId)
      message.success('影片已删除')
    } catch (err) {
      console.error('[MovieListPanel] remove movie error:', err)
      message.error(err instanceof Error ? err.message : '删除影片失败')
    } finally {
      setRemovingId(null)
    }
  }

  /**
   * 移除全部影片（卡片与展开弹窗共用，权限由服务端校验）。
   * 二次确认：首次点击进入「确认清空」态（3s 超时回退），再次点击才执行。
   */
  const handleClearAll = async () => {
    if (
      clearingRef.current ||
      clearingAll ||
      removingId !== null ||
      movies.length === 0 ||
      isScreenShare
    )
      return
    if (!canSort) {
      message.info('仅 root 或创建房间的管理员可以清空全部影片')
      return
    }
    if (!roomId) {
      message.error('未连接房间')
      return
    }
    if (!clearConfirming) {
      setClearConfirming(true)
      confirmTimer.current = setTimeout(() => setClearConfirming(false), 3000)
      return
    }
    setClearConfirming(false)
    setClearingAll(true)
    clearingRef.current = true
    ++operationSeq.current
    const revision = useRoomStore.getState().roomSessionRevision
    try {
      await clearMovies(roomId)
      if (useRoomStore.getState().roomId !== roomId || useRoomStore.getState().roomSessionRevision !== revision) return
      setSearch('')
      message.success('已清空影片列表')
    } catch (err) {
      console.error('[MovieListPanel] clear movies error:', err)
      message.error(err instanceof Error ? err.message : '移除全部影片失败')
    } finally {
      clearingRef.current = false
      setClearingAll(false)
    }
  }

  const renderClearButton = () =>
    canSort && !isScreenShare ? (
      <Button
        size="sm"
        variant={clearConfirming ? 'danger' : 'secondary'}
        icon={<Trash2 className="h-3.5 w-3.5" />}
        onClick={handleClearAll}
        loading={clearingAll}
        disabled={movies.length === 0 || removingId !== null || !roomId || !socket?.connected || clearingAll}
        title="清空房间影片列表，包括搜索隐藏的影片"
      >
        {clearingAll ? '清空中…' : clearConfirming ? '确认清空全部？' : '清空全部'}
      </Button>
    ) : null

  const handleQualityChange = async (movie: Movie, value: string) => {
    if (!isHost || isScreenShare || !roomId) return
    const qn = Number(value)
    if (!Number.isFinite(qn) || qn === movie.currentQn) return

    // cliOnly（仅允许CLI模式）：CLI 未连接时阻止切清晰度——切完也无法播放
    // （解析/挂载链路均强制 CLI），提前给出可操作提示
    if (movie.cliOnly === true && !getActiveCliProxyUrl()) {
      message.error(
        '该影片已开启「仅允许CLI模式」：请登录 B 站或重启内置代理后操作'
      )
      return
    }

    const operation = ++operationSeq.current
    const session = getEmbeddedProxyStatus().sessionVersion
    const current = () => operation === operationSeq.current && useRoomStore.getState().roomId === roomId && useRoomStore.getState().movies.find(m => m.id === movie.id)?.cid === movie.cid && getEmbeddedProxyStatus().sessionVersion === session
    setQualityLoadingId(movie.id)
    try {
      const parsePrefs = getBilibiliParseOptions(movie.id)
      // cliOnly 时强制走 CLI 解析分支（CLI 未连接已在上方拦截）
      const proxyUrl =
        parsePrefs.cliEnabled || movie.cliOnly === true
          ? getActiveCliProxyUrl()
          : null
      let resolved: ResolvedSource

      if (proxyUrl) {
        // CLI 已连接：使用本地 CLI 代理解析，强制 DASH，不再降级 MP4
        // PGC（番剧 ep/ss 链接）按 epId 走 CLI 番剧解析分支
        const bangumiId = extractBangumiId(movie.url)
        if (bangumiId?.epId) {
          resolved = await resolveBangumiViaCli(
            proxyUrl,
            bangumiId.epId,
            movie.cid,
            qn,
            false,
            true
          )
        } else {
          const bvid = extractBvid(movie.url)
          if (bvid && movie.cid) {
            resolved = await resolveBilibiliViaCli(
              proxyUrl,
              bvid,
              movie.cid,
              qn,
              false,
              true
            )
          } else {
            throw new Error('无法提取 BV 号或 cid，无法使用 CLI 代理')
          }
        }
      } else {
        // CLI 未启用按影片偏好；CLI 启用未连接由 getEffectivePreferMp4
        // 返回 true，回退服务器 MP4 直链。
        // movieId：服务器解析统一以房间房主 Cookie 身份执行。
        resolved = await resolveBilibiliWithOptions(movie.url, qn, undefined, {
          preferMp4: getEffectivePreferMp4(movie.id),
          movieId: movie.id,
          page: movie.currentPage,
        })
      }
      if (!current()) return
      await updateMovie(roomId, movie.id, {
        audioUrl: resolved.audioUrl,
        format: resolved.format,
        videoCodec: resolved.videoCodec,
        audioCodec: resolved.audioCodec,
        duration: resolved.duration,
        cid: resolved.cid,
        currentQn: resolved.currentQn,
        acceptQuality: resolved.acceptQuality,
      })
      if (movie.id === currentMovieId) {
        setPendingQualityChange({ movieId: movie.id, resolved })
      }
    } catch (err) {
      console.error('[MovieListPanel] change quality error:', err)
      message.error(err instanceof Error ? err.message : '切换清晰度失败')
    } finally {
      setQualityLoadingId(null)
    }
  }

  /**
   * 观众端通过本地 CLI 切换清晰度。
   *
   * 仅影响当前客户端：用观众自己的 B站 Cookie 解析所选清晰度的 DASH 地址，
   * 覆盖房主广播的源，但不写入影片列表也不广播。
   */
  const handleViewerQualityChange = async (movie: Movie, value: string) => {
    if (isHost || isScreenShare) return
    const qn = Number(value)
    if (!Number.isFinite(qn) || qn === movie.currentQn) return

    const proxyUrl = getActiveCliProxyUrl()
    if (!proxyUrl) {
      message.error('CLI 代理未连接')
      return
    }

    // PGC（番剧 ep/ss 链接）按 epId 走 CLI 番剧解析分支
    const bangumiId = extractBangumiId(movie.url)
    if (!bangumiId?.epId) {
      const bvid = extractBvid(movie.url)
      if (!bvid || !movie.cid) {
        message.error('无法解析该 B站 影片')
        return
      }
    }

    const operation = ++operationSeq.current
    const session = getEmbeddedProxyStatus().sessionVersion
    const current = () => operation === operationSeq.current && useRoomStore.getState().roomId === roomId && useRoomStore.getState().movies.find(m => m.id === movie.id)?.cid === movie.cid && getEmbeddedProxyStatus().sessionVersion === session
    setQualityLoadingId(movie.id)
    try {
      const resolved = bangumiId?.epId
        ? await resolveBangumiViaCli(
            proxyUrl,
            bangumiId.epId,
            movie.cid,
            qn,
            false,
            true
          )
        : await resolveBilibiliViaCli(
            proxyUrl,
            extractBvid(movie.url)!,
            movie.cid,
            qn,
            false,
            true
          )
      if (!current()) return
      setViewerCliResolvedSource({ movieId: movie.id, sessionVersion: session, resolved })
      if (movie.id === currentMovieId) {
        triggerViewerSourceReload()
      }
    } catch (err) {
      console.error('[MovieListPanel] viewer change quality error:', err)
      message.error(err instanceof Error ? err.message : 'CLI 切换清晰度失败')
    } finally {
      setQualityLoadingId(null)
    }
  }

  /**
   * 切换分P（分集）。
   *
   * 多 P 视频每个分集有独立的 cid 和 m4s 文件，必须用对应 cid 重新请求 playurl。
   * 切换后更新 movie 的 cid/duration/videoUrl/audioUrl 等字段，并触发当前播放影片的重新 attach。
   */
  const handlePageChange = async (movie: Movie, value: string) => {
    if (!isHost || isScreenShare || !roomId) return
    const page = Number(value)
    if (!Number.isFinite(page) || page === movie.currentPage) return

    // cliOnly（仅允许CLI模式）：CLI 未连接时阻止切分P——切完也无法播放
    // （解析/挂载链路均强制 CLI），提前给出可操作提示
    if (movie.cliOnly === true && !getActiveCliProxyUrl()) {
      message.error(
        '该影片已开启「仅允许CLI模式」：请安装并连接 ZViewer CLI 后操作'
      )
      return
    }

    if (movie.sourceType === 'emby' || movie.sourceType === 'jellyfin') {
      const target = movie.pages?.find(item => item.page === page)
      if (!target?.path || !target.mountId || clearingRef.current) return
      const mediaCurrent = beginMediaLibraryChange(movie.id)
      const operation = ++operationSeq.current
      const revision = useRoomStore.getState().roomSessionRevision
      setPageLoadingId(movie.id)
      try {
        const resolved = await (movie.sourceType === 'emby' ? resolveEmby : resolveJellyfin)(target.mountId, target.path)
        const state = useRoomStore.getState()
        if (!mediaCurrent() || operation !== operationSeq.current || state.roomSessionRevision !== revision || !state.movies.some(item => item.id === movie.id)) return
        await updateMovie(roomId, movie.id, { path: target.path, url: logicalConnectionUrl(movie.directLink ? resolved.directUrl || resolved.videoUrl : `/api/${movie.sourceType}/stream?movieId=${movie.id}&ep=${page}`), format: resolved.format, audioCodec: resolved.audioCodec || '', duration: resolved.duration, currentPage: page, multiVersion: resolved.multiVersion })
      } catch (error) { if (operation === operationSeq.current) message.error(error instanceof Error ? error.message : '切集失败') }
      finally { if (operation === operationSeq.current) setPageLoadingId(null) }
      return
    }

    const operation = ++operationSeq.current
    const session = getEmbeddedProxyStatus().sessionVersion
    const current = () => operation === operationSeq.current && useRoomStore.getState().roomId === roomId && useRoomStore.getState().movies.find(m => m.id === movie.id)?.cid === movie.cid && getEmbeddedProxyStatus().sessionVersion === session
    setPageLoadingId(movie.id)
    try {
      const parsePrefs = getBilibiliParseOptions(movie.id)
      // cliOnly 时强制走 CLI 解析分支（CLI 未连接已在上方拦截）
      const proxyUrl =
        parsePrefs.cliEnabled || movie.cliOnly === true
          ? getActiveCliProxyUrl()
          : null
      const targetPage = movie.pages?.find((p) => p.page === page)
      let resolved: ResolvedSource

      // PGC（番剧分集，page 带 epId）：按目标集 ep 链接重解析。
      // 与 UGC 分P 的差异：每集是独立 ep_id，不能靠 page 序号定位，
      // 且必须同步更新 movie.url，否则后续切清晰度仍会解析旧集。
      if (targetPage?.epId) {
        const epUrl = `https://www.bilibili.com/bangumi/play/ep${targetPage.epId}`
        if (proxyUrl) {
          resolved = await resolveBangumiViaCli(
            proxyUrl,
            targetPage.epId,
            targetPage.cid,
            movie.currentQn,
            false,
            true
          )
        } else {
          resolved = await resolveBilibiliWithOptions(
            epUrl,
            movie.currentQn,
            undefined,
            {
              preferMp4: getEffectivePreferMp4(movie.id),
              movieId: movie.id,
            }
          )
        }
        if (!current()) return
        await updateMovie(roomId, movie.id, {
          url: resolved.resolvedUrl || epUrl,
          audioUrl: resolved.audioUrl,
          format: resolved.format,
          videoCodec: resolved.videoCodec,
          audioCodec: resolved.audioCodec,
          duration: resolved.duration,
          cid: resolved.cid,
          currentQn: resolved.currentQn,
          acceptQuality: resolved.acceptQuality,
          currentPage: resolved.currentPage ?? page,
        })
        if (resolved.preview) {
          message.info(
            `当前返回试看片段（约 ${Math.round((resolved.duration || 0) / 60)} 分钟）；完整播放取决于本机账号的内容授权`
          )
        }
        if (movie.id === currentMovieId) {
          setPendingQualityChange({ movieId: movie.id, resolved })
        }
        return
      }

      if (proxyUrl && targetPage) {
        // CLI 已连接：使用本地 CLI 代理解析目标分P，强制 DASH，不再降级 MP4
        const bvid = extractBvid(movie.url)
        if (bvid && targetPage.cid) {
          resolved = await resolveBilibiliViaCli(
            proxyUrl,
            bvid,
            targetPage.cid,
            movie.currentQn,
            false,
            true
          )
        } else {
          throw new Error('无法提取 BV 号或 cid，无法使用 CLI 代理')
        }
      } else {
        // CLI 未启用按影片偏好；CLI 启用未连接由 getEffectivePreferMp4
        // 返回 true，回退服务器 MP4 直链。
        // movieId：服务器解析统一以房间房主 Cookie 身份执行。
        resolved = await resolveBilibiliWithOptions(
          movie.url,
          movie.currentQn,
          undefined,
          {
            preferMp4: getEffectivePreferMp4(movie.id),
            movieId: movie.id,
            page,
          }
        )
      }
      if (!current()) return
      await updateMovie(roomId, movie.id, {
        audioUrl: resolved.audioUrl,
        format: resolved.format,
        videoCodec: resolved.videoCodec,
        audioCodec: resolved.audioCodec,
        duration: resolved.duration,
        cid: resolved.cid,
        currentQn: resolved.currentQn,
        acceptQuality: resolved.acceptQuality,
        currentPage: resolved.currentPage ?? page,
      })
      if (movie.id === currentMovieId) {
        setPendingQualityChange({ movieId: movie.id, resolved })
      }
    } catch (err) {
      console.error('[MovieListPanel] change page error:', err)
      message.error(err instanceof Error ? err.message : '切换分P失败')
    } finally {
      setPageLoadingId(null)
    }
  }

  // 影片列表内容（卡片和弹窗共用）
  const renderMovieList = (expanded: boolean) => (
    <>
      {isScreenShare && (
        <div
          className="flex items-center gap-2 rounded-[var(--md-sys-shape-corner)] p-2"
          style={{
            backgroundColor:
              'color-mix(in srgb, var(--md-sys-color-secondary-container) calc(var(--glass-strength) * 100%), transparent)',
          }}
        >
          <Monitor
            className="h-4 w-4 flex-shrink-0"
            style={{ color: 'var(--md-sys-color-secondary)' }}
          />
          <Paragraph type="secondary" className="m-0 text-xs">
            当前为远程共享模式，影片播放已暂停
          </Paragraph>
        </div>
      )}

      {expanded && <div className="flex flex-wrap items-center gap-2 px-2.5">
        {isHost && !isScreenShare && <label className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" checked={autoContinueEnabled} onChange={event => setAutoContinueEnabled(event.target.checked)} />自动连播</label>}
        {!isScreenShare && <Button size="sm" variant={orderOpen ? 'primary' : 'secondary'} disabled={!canSort || !!search.trim() || sorting} title="仅 root 或创建房间的管理员可排序；搜索时不可排序" onClick={() => setOrderOpen(value => !value)}>{orderOpen ? '完成排序' : '调整顺序'}</Button>}
        {!canSort && !isScreenShare && <Text type="secondary" className="text-xs">排序仅限 root 或房间创建管理员</Text>}
      </div>}
      {expanded && <Input
        size="sm"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="搜索影片…"
        className="px-2.5"
      />}

      {/* 影片列表滚动区域 — pl-2.5 平衡左右剩余宽度，
          scrollbar-gutter:stable 占右侧 10px，pl-2.5 补左侧 10px，
          使视频卡片左右距面板边缘宽度一致 */}
      <div className="movie-list-scroll min-h-[120px] min-w-0 flex-1 overflow-y-auto rounded-[var(--md-sys-shape-corner)] pl-2.5">
        {(expanded ? filteredMovies : movies).length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full"
              style={{
                backgroundColor: 'var(--glass-bg)',
              }}
            >
              <Film
                className="h-5 w-5 opacity-40"
                style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
              />
            </div>
            <Paragraph type="secondary" className="m-0 text-xs">
              {search ? '未找到匹配的影片' : '暂无影片，请在右侧添加'}
            </Paragraph>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          {(expanded ? filteredMovies : movies).map((movie, idx) => {
            const isActive = movie.id === currentMovieId
            return (
              <div
                key={movie.id}
                className={cn(
                  'zen-item-enter rounded-[var(--md-sys-shape-corner)] border p-2.5 transition-all',
                  isActive
                    ? 'border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)] shadow-md'
                    : 'glass border-transparent hover:-translate-y-0.5 hover:border-[var(--md-sys-color-outline-variant)] hover:shadow-md'
                )}
                style={
                  {
                    '--item-delay': `${idx * 50}ms`,
                  } as React.CSSProperties
                }
              >
                <div
                  draggable={false}
                  className={cn(
                    'grid items-center gap-2',
                    isHost || canManage
                      ? 'grid-cols-[auto_1fr_auto_auto]'
                      : 'grid-cols-[auto_1fr]'
                  )}
                >
                  <div
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--md-sys-shape-corner)]"
                    style={{
                      background: isActive
                        ? 'var(--md-sys-color-primary)'
                        : 'color-mix(in srgb, var(--md-sys-color-primary) 12%, transparent)',
                    }}
                  >
                    <Film
                      className="h-3 w-3"
                      style={{
                        color: isActive
                          ? 'var(--md-sys-color-on-primary)'
                          : 'var(--md-sys-color-primary)',
                      }}
                    />
                  </div>
                  <div className="min-w-0 overflow-hidden">
                    <Paragraph
                      className="m-0 truncate text-xs font-medium"
                      title={movie.title}
                    >
                      {movie.title}
                    </Paragraph>
                    <div className="mt-1 flex items-center gap-1.5">
                      <Tag
                        color="primary"
                        className="inline-flex min-w-0 max-w-full truncate"
                      >
                        {movie.sourceType === 'mp4' && movie.format
                          ? FORMAT_LABELS[movie.format] ||
                            movie.format.toUpperCase()
                          : SOURCE_LABELS[movie.sourceType] || movie.sourceType}
                      </Tag>
                      {movie.pages && movie.pages.length > 1 && (
                        <Tag
                          className="inline-flex items-center gap-1"
                          style={{
                            backgroundColor:
                              'color-mix(in srgb, var(--md-sys-color-tertiary-container) calc(var(--glass-strength) * 100%), transparent)',
                            color: 'var(--md-sys-color-on-tertiary-container)',
                          }}
                        >
                          <ListVideo className="h-2.5 w-2.5" />
                          {movie.sourceType === 'bilibili' ? 'P' : ''}
                          {movie.currentPage ?? 1}/{movie.pages.length}
                        </Tag>
                      )}
                    </div>
                    {movie.sourceType === 'bilibili' &&
                      (isEmbeddedBilibiliHost() || (movie.acceptQuality && movie.acceptQuality.length > 0)) && (
                        <BilibiliQualitySelect
                          movie={movie}
                          isHost={isHost}
                          isScreenShare={isScreenShare}
                          qualityLoadingId={qualityLoadingId}
                          bilibiliVip={bilibiliVip}
                          selectedQn={
                            viewerCliResolvedSource?.movieId === movie.id
                              ? viewerCliResolvedSource.resolved.currentQn
                              : undefined
                          }
                          onChange={(value) =>
                            isHost
                              ? handleQualityChange(movie, value)
                              : handleViewerQualityChange(movie, value)
                          }
                        />
                      )}
                    {isHost &&
                      (movie.sourceType === 'bilibili' ||
                        movie.sourceType === 'emby' ||
                        movie.sourceType === 'jellyfin') &&
                      movie.pages &&
                      movie.pages.length > 1 && (
                        <Select
                          className="mt-1.5"
                          size="sm"
                          value={String(movie.currentPage ?? 1)}
                          options={movie.pages.map((p) => ({
                            label:
                              movie.sourceType === 'bilibili'
                                ? `P${p.page} ${p.part}${
                                    p.badge ? ` · ${p.badge}` : ''
                                  }`
                                : p.part,
                            value: String(p.page),
                          }))}
                          disabled={
                            !isHost ||
                            isScreenShare ||
                            pageLoadingId === movie.id
                          }
                          onChange={(value) => handlePageChange(movie, value)}
                        />
                      )}
                    {isHost &&
                      !isScreenShare &&
                      (movie.sourceType === 'emby' ||
                        movie.sourceType === 'jellyfin') && (
                        <EmbyVersionSelect
                          movie={movie}
                          api={
                            movie.sourceType === 'emby' ? 'emby' : 'jellyfin'
                          }
                        />
                      )}
                  </div>
                  {(isHost || canManage) && (
                    <Button
                      variant={isActive ? 'primary' : 'secondary'}
                      size="sm"
                      className="h-7 flex-shrink-0 px-2"
                      icon={<Play className="h-3.5 w-3.5" />}
                      onClick={() => handlePlay(movie.id)}
                      loading={switchingId === movie.id}
                      disabled={(!isHost && !canManage) || isScreenShare || switchingId !== null}
                      title={
                        isScreenShare
                          ? '远程共享模式下不可播放'
                          : isHost || canManage
                            ? '播放'
                            : '没有影片切换权限'
                      }
                    />
                  )}
                  {(isHost || canManage) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 flex-shrink-0 px-2"
                      icon={<Trash2 className="h-3.5 w-3.5" />}
                      onClick={() => handleRemove(movie.id)}
                      loading={removingId === movie.id}
                      disabled={(!isHost && !canManage) || isScreenShare}
                      title={
                        isScreenShare
                          ? '远程共享模式下不可删除'
                          : isHost || canManage
                            ? '删除'
                            : '没有影片删除权限'
                      }
                    />
                  )}
                </div>
                {expanded && orderOpen && canSort && !isScreenShare && !search.trim() && <div className="flex items-center justify-end gap-2">
                  <Button size="sm" variant="secondary" icon={<ArrowUp className="h-4 w-4" />} disabled={sorting || movies[0]?.id === movie.id} onClick={() => void moveMovie(movie.id, -1)}>上移</Button>
                  <Button size="sm" variant="secondary" icon={<ArrowDown className="h-4 w-4" />} disabled={sorting || movies[movies.length - 1]?.id === movie.id} onClick={() => void moveMovie(movie.id, 1)}>下移</Button>
                </div>}
                {/* B站解析设置：每个 B站 影片独享一份配置；房主可操作，观众可查看并独立开启 CLI 代理 */}
                {movie.sourceType === 'bilibili' && !isScreenShare && (
                  <BilibiliParseSettings movieId={movie.id} isHost={isHost} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )

  return (
    <div className="glass-card zen-card flex h-full min-w-0 flex-col overflow-hidden rounded-[var(--md-sys-shape-corner)]">
      {/* 卡片头部：图标 + 标题 + 影片数量 + 清空/全屏按钮 */}
      <div className="flex items-center gap-2.5 border-b border-[var(--glass-border)] px-4 py-3">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--md-sys-shape-corner)]"
          style={{
            backgroundColor: 'var(--md-sys-color-primary-container)',
          }}
        >
          <Film
            className="h-4 w-4"
            style={{ color: 'var(--md-sys-color-on-primary-container)' }}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <Text className="text-sm font-semibold leading-tight">影片列表</Text>
          <Text
            type="secondary"
            className="text-[10px] uppercase tracking-wide"
          >
            {movies.length} 部影片
          </Text>
        </div>
        {renderClearButton()}
        <button
          type="button"
          onClick={() => setShowListModal(true)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--md-sys-shape-corner)] transition-colors hover:bg-[var(--md-sys-color-surface-container-highest)]"
          style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
          title="展开查看完整影片列表"
          aria-label="展开查看完整影片列表"
        >
          <Maximize className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 卡片内容 — 外层 px-0.5(2px) + 内层 pl-2.5(10px)/scrollbar-gutter(10px) = 12px 左右剩余 */}
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-0.5 py-3">
        {renderMovieList(false)}
      </div>

      {/* 完整影片列表弹窗 */}
      <Modal
        open={showListModal}
        onClose={() => setShowListModal(false)}
        title={`影片列表 (${movies.length} 部)`}
        expandable
        className="max-w-2xl"
      >
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden">
          <div className="flex shrink-0 flex-wrap justify-end gap-2">{renderClearButton()}</div>
          {renderMovieList(true)}
        </div>
      </Modal>
    </div>
  )
}

/**
 * B站清晰度选择器（响应式）。
 *
 * 每个影片的解析偏好（preferMp4）独立存储在 localStorage 中。
 * 使用 useBilibiliParsePreferences 订阅配置变化，确保在 BilibiliParseSettings
 * 中切换 MP4/DASH 模式时，当前影片的清晰度选择器能立即禁用/启用。
 */
interface BilibiliQualitySelectProps {
  movie: Movie
  isHost: boolean
  isScreenShare: boolean
  qualityLoadingId: number | null
  bilibiliVip: boolean
  selectedQn?: number
  onChange: (value: string) => void
}

function BilibiliQualitySelect({
  movie,
  isHost,
  isScreenShare,
  qualityLoadingId,
  bilibiliVip,
  selectedQn,
  onChange,
}: BilibiliQualitySelectProps) {
  // 订阅该影片解析偏好的变化，确保在 BilibiliParseSettings 中切换 MP4/DASH 模式后
  // 本组件能立即重新渲染，避免禁用状态停留在旧模式。
  const parsePrefs = useBilibiliParsePreferences(movie.id)

  // CLI 代理可用状态：观众端需要本地 CLI 在线才能切换清晰度。
  const cliAgentAvailable = useCliAgentStore(
    (s) => s.localOnline && s.agents.length > 0
  )

  // 使用生效的播放模式：CLI 未连接时强制 MP4，清晰度选择随之禁用
  const effectivePreferMp4 = getEffectivePreferMp4(movie.id)

  // 观众端未启用 CLI 时不显示清晰度选择器
  if (!isHost && !parsePrefs.cliEnabled) {
    return null
  }

  const canChangeQuality =
    isHost || (parsePrefs.cliEnabled && cliAgentAvailable)

  if (isEmbeddedBilibiliHost()) return <NativeQualitySelect movieId={movie.id} isHost={isHost} disabled={isScreenShare || qualityLoadingId === movie.id || effectivePreferMp4} />

  return (
    <Select
      className="mt-1.5"
      size="sm"
      value={String(
        selectedQn ?? movie.currentQn ?? movie.acceptQuality?.[0]?.id
      )}
      options={filterQualitiesByVip(movie.acceptQuality, bilibiliVip).map(
        (q) => ({
          label: q.resolution ? `${q.label} · ${q.resolution}` : q.label,
          value: String(q.id),
        })
      )}
      disabled={
        !canChangeQuality ||
        isScreenShare ||
        qualityLoadingId === movie.id ||
        effectivePreferMp4
      }
      onChange={onChange}
    />
  )
}

/**
 * Emby/Jellyfin 多版本（多清晰度）选择器。
 *
 * 同一部影片在 Emby/Jellyfin 中可能有多个 MediaSource（如 1080P 与 4K 高码率版），
 * 添加影片时默认取服务器默认版本（通常最高码率），低清晰度无法选择。
 * 本选择器懒加载版本列表（首次点击下拉时请求 /api/{api}/movie-source），
 * 房主选中某版本后重新解析并 updateMovie：
 * - 代理模式：url 写为 /api/{api}/stream?movieId=N&ms=X（观众可访问，不依赖挂载归属）
 * - 直链模式：url 写为带 MediaSourceId 的 Emby 直链
 * 房主端检测到 movie.url 变化会自动重新加载并广播给观众（复用既有 loadMovie 链路）。
 */
interface EmbyVersionSelectProps {
  movie: Movie
  api: 'emby' | 'jellyfin'
}

function EmbyVersionSelect({ movie, api }: EmbyVersionSelectProps) {
  const roomId = useRoomStore((s) => s.roomId)
  const generation = useRef(0)
  const switchingRef = useRef(false)
  useEffect(() => { setVersions(null); setSelectedId(null); setLoadFailed(false); setLoading(false); setSwitching(false); ++generation.current; return () => { ++generation.current } }, [roomId, movie.id, movie.path, movie.url])
  const [versions, setVersions] = useState<EmbyVersionInfo[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)

  // 懒加载版本列表：首次点开下拉时请求（避免列表里每个 Emby 影片都打 API）
  const ensureLoaded = () => {
    if (versions || loading || loadFailed) return
    setLoading(true)
    const request = generation.current
    getEmbyApiMovieSource(api, movie.id, new URL(movie.url, "https://placeholder.invalid").searchParams.get("ms") || undefined)
      .then((data) => { if (request === generation.current) { setVersions(data.versions); setSelectedId(data.mediaSourceId) } })
      .catch((err) => {
        console.error('[MovieListPanel] load emby versions error:', err)
        if (request === generation.current) setLoadFailed(true)
      })
      .finally(() => { if (request === generation.current) setLoading(false) })
  }

  const currentId = selectedId ?? versions?.[0]?.id ?? ''

  const handleChange = async (value: string) => {
    if (!roomId || switchingRef.current || switching || value === currentId) return
    // 版本列表尚未加载完成时的占位项，不可选择
    if (value === '__loading__') return
    setSwitching(true)
    switchingRef.current = true
    const mediaCurrent = beginMediaLibraryChange(movie.id)
    const request = ++generation.current
    const revision = useRoomStore.getState().roomSessionRevision
    try {
      const data = await getEmbyApiMovieSource(api, movie.id, value)
      // 代理模式影片 url 必须是 stream 形式（观众可访问）；直链模式用带
      // MediaSourceId 的 Emby 直链。format/audioCodec 同步更新（切到的版本
      // 音轨可能不兼容，format 会变为 hls 触发服务端转码）。
      if (!mediaCurrent() || request !== generation.current || revision !== useRoomStore.getState().roomSessionRevision || !useRoomStore.getState().movies.some(item => item.id === movie.id && item.path === movie.path)) return
      const nextUrl = movie.directLink
        ? data.directUrl || data.streamUrl || data.videoUrl
        : data.streamUrl || data.videoUrl
      await useRoomStore.getState().updateMovie(roomId, movie.id, {
        url: logicalConnectionUrl(nextUrl),
        format: data.format,
        audioCodec: data.audioCodec || "",
        duration: data.duration,
        multiVersion: data.multiVersion,
      })
      setSelectedId(value)
      message.success('已切换清晰度')
    } catch (err) {
      console.error('[MovieListPanel] change emby version error:', err)
      message.error(err instanceof Error ? err.message : '切换清晰度失败')
    } finally {
      switchingRef.current = false
      if (request === generation.current) setSwitching(false)
    }
  }

  if (loadFailed) return null
  // 单版本影片不渲染选择框：添加时已物化 multiVersion；懒加载后仅 1 个版本同样隐藏
  if (movie.multiVersion === false) return null
  if (versions && versions.length <= 1) return null

  return (
    <div onClickCapture={ensureLoaded}>
      <Select
        className="mt-1.5"
        size="sm"
        value={currentId}
        placeholder={loading ? '加载清晰度...' : '选择清晰度'}
        options={
          versions && versions.length > 0
            ? versions.map((v) => ({ label: v.label, value: v.id }))
            : [
                {
                  label: loading ? '加载中...' : '点击加载清晰度',
                  value: '__loading__',
                },
              ]
        }
        disabled={switching}
        onChange={handleChange}
        aria-label="切换影片清晰度版本"
      />
    </div>
  )
}
