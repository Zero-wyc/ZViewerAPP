import { getApiUrl } from '@/lib/api'
/** 底部播放条：整条非按钮区域点击或上滑展开；标题左右滑切歌；只读进度。网易云红心共用 useSongFavorite 状态。 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CirclePlus,
  Disc3,
  Heart,
  ListMusic,
  Repeat,
  Repeat1,
  Shuffle,
  ListEnd,
} from 'lucide-react'
import { apiGet, apiPost } from '../musicApi'
import { message } from '@/components/ui/message'
import { useMusicStore } from '../store'
import {
  normalizeBiliLikeFavTitle,
  useMusicSettingsStore,
} from '../store-settings'
import { useMusicPlayer } from '../hooks/useMusicPlayer'
import { usePlaybackPosition } from '../hooks/usePlaybackPosition'
import { useVolumeSliderDrag } from '../hooks/useVolumeSliderDrag'
import { OverflowMarquee } from './OverflowMarquee'
import { musicCoverUrl } from '../utils/neteaseImage'
import { MusicCoverImage } from './MusicCoverImage'
import { BiliFavCollectModal } from './BiliFavCollectModal'
import {
  ControlNextIcon,
  ControlPauseIcon,
  ControlPlayIcon,
  ControlPrevIcon,
} from './PlayerControlIcons'
import { AddToPlaylistModal } from './AddToPlaylistModal'
import { prefetchUserPlaylists } from '../userPlaylists'
import { prefetchBiliFavFolders } from '@/modules/bilibili/bilibiliApi'
import { cn, formatDuration } from '@/lib/utils'
import { PLAY_MODE_ORDER } from '../constants'
import { useSongFavorite } from '../hooks/useSongFavorite'
import { useMusicTrackSwipe } from '../hooks/useMusicTrackSwipe'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { isGlobalAppearanceRuntime } from '../../../../platform/runtime'

export function MusicWidgetBar() {
  const {
    togglePlay,
    next,
    prev,
    seek,
    requestControl,
    canControl,
    currentSong,
    isPlaying,
    playMode,
    setPlayMode,
    volume,
    setVolume,
  } = useMusicPlayer()
  // 播放进度：本组件内部量化订阅（0.5s 一档）——不再从 context 取
  // positionSec（那会带动整个播放控制栏以 4-8Hz 重渲染）
  const positionSec = usePlaybackPosition(0.5)

  const setPlayerOverlayOpen = useMusicStore((s) => s.setPlayerOverlayOpen)
  const openQueuePopup = useMusicStore((s) => s.openQueuePopup)
  const setPendingAlbumDetail = useMusicStore((s) => s.setPendingAlbumDetail)
  const setPage = useMusicStore((s) => s.setPage)
  const loginStatus = useMusicStore((s) => s.loginStatus)

  // ===== 进度条（细滑块；canControl 可拖动 seek，观众拖动转为 seek 申请） =====
  const durationSec = currentSong ? currentSong.durationMs / 1000 : 0
  const progressRatio =
    durationSec > 0 ? Math.min(1, Math.max(0, positionSec / durationSec)) : 0
  // ===== 控制按钮（观众点击走申请，房主/房主离线 canControl 直接控制） =====
  const handlePlayPause = useCallback(() => {
    if (canControl) togglePlay()
    else requestControl(isPlaying ? 'pause' : 'play')
  }, [canControl, togglePlay, requestControl, isPlaying])

  const handleNext = useCallback(() => {
    if (canControl) next()
    else requestControl('next')
  }, [canControl, next, requestControl])

  const handlePrev = useCallback(() => {
    if (canControl) prev()
    else requestControl('prev')
  }, [canControl, prev, requestControl])

  /** 播放模式 3 态循环（仅直接控制权持有者可切换） */
  const cyclePlayMode = useCallback(() => {
    if (!canControl) return
    const idx = PLAY_MODE_ORDER.indexOf(playMode)
    const mode = PLAY_MODE_ORDER[(idx + 1) % PLAY_MODE_ORDER.length]
    setPlayMode(mode)
    message.info(mode === 'sequence' ? '列表循环' : mode === 'repeat-one' ? '单曲循环' : '随机播放')
  }, [canControl, playMode, setPlayMode])

  // ===== 音量横条滑块（仅本地生效不参与房间同步） =====
  // 拖拽逻辑抽为 useVolumeSliderDrag 共享（与播放卡同款：拖动期间锁定
  // 页面滚动/文本选择，touch-slider 禁触屏滚动）
  const { volumeTrackRef, volumeDragging, handleVolumePointerDown } =
    useVolumeSliderDrag(setVolume)

  // ===== 喜欢（Hydrogen likeSong：NCM 登录且当前有歌可见；乐观更新） =====
  const songId = currentSong?.songId
  const isBiliSong = !!currentSong?.biliBvid
  const [addPlaylistOpen, setAddPlaylistOpen] = useState(false)
  const { canLike, liked, toggleLike: handleLike, biliFavModalOpen, setBiliFavModalOpen,
    biliCollecting, biliCollected, biliLikeFavTitle, setBiliCollectedMark, toggleBiliCollect: handleBiliCollect } = useSongFavorite({ songId, biliBvid: currentSong?.biliBvid ?? null, ncmLoggedIn: loginStatus.loggedIn })
  // ===== 专辑跳转（Hydrogen toAlbum：解析当前歌的专辑 ID 后跳转专辑详情页） =====
  const handleToAlbum = useCallback(async () => {
    if (!currentSong || currentSong.songId <= 0) return
    try {
      const { data } = await apiGet<{
        songs?: Array<{ al?: { id?: number; name?: string; picUrl?: string } }>
      }>(
        `/api/music/ncm/song/detail?ids=${currentSong.songId}&timestamp=${Date.now()}`
      )
      const album = data?.songs?.[0]?.al
      if (!album?.id) {
        message.info('该歌曲暂无专辑信息')
        return
      }
      // 写入待打开详情并切到我的音乐页（详情页由 MusicMyPage 消费打开）
      setPendingAlbumDetail({
        id: album.id,
        name: album.name || '专辑',
        cover: album.picUrl,
      })
      setPage('mymusic')
    } catch (err) {
      console.error('[MusicWidgetBar] 专辑解析失败:', err)
      message.info('该歌曲暂无专辑信息')
    }
  }, [currentSong, setPendingAlbumDetail, setPage])

  const cover = musicCoverUrl(currentSong?.cover, 120, getApiUrl())
  const songName = currentSong?.name ?? '一起听'
  const artist = currentSong?.artist ?? ''

  /** 播放模式图标（4 态） */
  const PlayModeIcon =
    playMode === 'repeat-one'
      ? Repeat1
      : playMode === 'shuffle'
        ? Shuffle
        : playMode === 'order'
          ? ListEnd
          : Repeat
  const narrow = useIsMobile()
  const compactBar = narrow || isGlobalAppearanceRuntime()
  const swipe = useMusicTrackSwipe(handlePrev, handleNext, compactBar && !!currentSong)

  const startOpen = useRef<{ x: number; y: number } | null>(null)
  const suppressOpen = useRef(false)
  return (
    <div
      onPointerDown={event => { if ((event.target as Element).closest('button,[role="slider"]')) return; startOpen.current = { x: event.clientX, y: event.clientY }; suppressOpen.current = false }}
      onPointerCancel={() => { startOpen.current = null; suppressOpen.current = true }}
      onPointerUp={event => { const start = startOpen.current; startOpen.current = null; if (!start) return; const dx = event.clientX - start.x, dy = event.clientY - start.y; suppressOpen.current = Math.abs(dx) > 15 || Math.abs(dy) > 15; if (dy < -45 && Math.abs(dy) > Math.abs(dx) * 1.5 && currentSong) setPlayerOverlayOpen(true) }}
      onClick={event => { if (!suppressOpen.current && currentSong && !(event.target as Element).closest('button,[role="slider"]')) setPlayerOverlayOpen(true) }}
      data-compact={compactBar}
      className="music-widget-bar glass-card relative flex h-[65px] items-center"
      style={
        {
          // 玻璃作用域文字色：条体是主题驱动的玻璃面（glass-card），文字/
          // 图标用按「含玻璃层背景」判定的 scheme 文字色（ThemeProvider 注入
          // --lt-glass-*），不跟随全局壁纸级文字切换——否则深色模式亮壁纸
          // 下全局切深字，深色条体上深字不可读
          '--md-sys-color-on-surface': 'var(--lt-glass-on-surface)',
          '--md-sys-color-on-surface-variant':
            'var(--lt-glass-on-surface-variant)',
          '--md-sys-color-outline': 'var(--lt-glass-outline)',
          '--md-sys-color-outline-variant': 'var(--lt-glass-outline-variant)',
          boxShadow: '0 8px 28px color-mix(in srgb, var(--md-sys-color-shadow) 18%, transparent)',
        } as React.CSSProperties
      }
    >
      <div className="music-widget-readonly-progress" role="progressbar" aria-label="播放进度" aria-valuenow={Math.round(positionSec)} aria-valuemin={0} aria-valuemax={Math.round(durationSec)}><span style={{ width: `${progressRatio * 100}%` }} /></div>
      {/* ===== 左：封面缩略图 + 歌曲信息（Hydrogen .music-info） ===== */}
      <div className="music-widget-info ml-[17px] flex min-w-0 flex-1 items-center max-md:ml-3">
        {/* 封面：点击打开完整播放器覆盖层；hover 黑色遮罩 + 箭头从底部滑入 */}
        <button
          type="button"
          disabled={!currentSong}
          className={cn(
            'music-widget-cover group/cover relative h-[45px] w-[45px] shrink-0 overflow-hidden border',
            cover ? 'cursor-pointer' : 'cursor-default'
          )}
          style={{
            borderColor:
              'color-mix(in srgb, var(--md-sys-color-on-surface) 10%, transparent)',
            backgroundColor: 'var(--md-sys-color-surface-container-high)',
          }}
          onClick={currentSong ? () => setPlayerOverlayOpen(true) : undefined}
          title="打开完整播放器"
          aria-label="打开完整播放器"
        >
          <MusicCoverImage key={cover} src={cover} alt="" className="h-full w-full object-cover" fallback={
            <ListMusic
              className="m-auto h-4 w-4 opacity-40"
              style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
            />
          } />
          {/* hover 遮罩 + 上箭头从底部滑入（Hydrogen .open-player：top 120% → 50%） */}
          {cover && (
            <span
              className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover/cover:opacity-100"
              style={{
                backgroundColor: 'color-mix(in srgb, black 50%, transparent)',
              }}
            >
              <svg
                viewBox="0 0 1024 1024"
                className="h-[40%] w-[40%] -translate-y-[120%] transition-transform duration-200 ease-[cubic-bezier(0,1.06,0.77,0.99)] group-hover/cover:translate-y-0"
                aria-hidden="true"
              >
                <path
                  d="M960.1 699.7l-72.8 72.8L512 397.1 136.7 772.5l-72.8-72.8L512 251.5z"
                  fill="#ffffff"
                />
              </svg>
            </span>
          )}
        </button>
        {/* 歌名（OverflowMarquee 跑马灯，Hydrogen .music-name 14px bold）+ 歌手；
            手机端自适应宽度（固定 175px 会挤压右侧控制区） */}
        <div className="music-widget-title-region ml-2 w-[175px] min-w-0 select-text max-md:w-auto max-md:flex-1 max-md:max-w-[150px]"
          {...swipe} tabIndex={currentSong ? 0 : undefined}
          role="button"
          aria-label={`打开播放器：${songName}`} onKeyUp={event => { if (event.key === 'Enter' || event.key === ' ') setPlayerOverlayOpen(true) }}>
          <OverflowMarquee
            text={songName}
            className="block h-[18px] text-[14px] font-bold leading-[18px] text-[var(--md-sys-color-on-surface)]"
          />
          <div className="truncate text-[10px] leading-snug text-[var(--md-sys-color-on-surface-variant)]">
            {artist}
          </div>
        </div>
      </div>

      {/* ===== 右：控制键 + 音量 + 功能图标（Hydrogen .music-right 476px 定宽；
          手机端改自适应：隐藏音量条（手机用系统音量/完整播放器内调节）
          与次要图标，避免定宽溢出小屏） ===== */}
      <div className="music-widget-actions flex w-[476px] max-w-[calc(100%-245px)] shrink-0 items-center max-md:w-auto max-md:max-w-none">
        {/* music-control（126px）：prev / play-pause / next（线条式 SVG） */}
        <div className="music-widget-controls flex w-[126px] shrink-0 items-center px-[18px] max-md:w-auto max-md:px-1">
          {!compactBar && <button
            type="button"
            className="flex h-6 w-6 items-center justify-center text-[var(--md-sys-color-on-surface)] transition-transform hover:opacity-70 active:scale-90"
            onClick={handlePrev}
            title={canControl ? '上一首' : '向房主申请切换上一首'}
            aria-label="上一首"
          >
            <ControlPrevIcon className="h-5 w-5" />
          </button>}
          <button
            type="button"
            className="music-primary-play mx-[15px] flex h-6 w-6 items-center justify-center transition-transform hover:opacity-70 active:scale-90 max-md:mx-[7px]"
            onClick={handlePlayPause}
            title={
              canControl
                ? isPlaying
                  ? '暂停'
                  : '播放'
                : isPlaying
                  ? '申请暂停'
                  : '申请继续播放'
            }
            aria-label="播放或暂停"
          >
            {isPlaying ? (
              <ControlPauseIcon className="h-5 w-5" />
            ) : (
              <ControlPlayIcon className="h-5 w-5" />
            )}
          </button>
          {!compactBar && <button
            type="button"
            className="flex h-6 w-6 items-center justify-center text-[var(--md-sys-color-on-surface)] transition-transform hover:opacity-70 active:scale-90"
            onClick={handleNext}
            title={canControl ? '下一首' : '向房主申请切换下一首'}
            aria-label="下一首"
          >
            <ControlNextIcon className="h-5 w-5" />
          </button>}
        </div>

        {/* music-volume（120px）：7px 描边滑条 + 上方 VOLUME 标签与数字；
            手机端隐藏（小屏放不下，音量经系统/完整播放器调节） */}
        <div className="music-widget-volume w-[120px] shrink-0 max-md:hidden">
          <div className="relative h-[7px]">
            <div
              ref={volumeTrackRef}
              role="slider"
              aria-label="音量"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(volume * 100)}
              className="touch-slider relative h-[7px] cursor-pointer"
              style={{
                border: '1px solid var(--md-sys-color-on-surface)',
                boxShadow: '0 0 0 0.5px var(--md-sys-color-on-surface)',
              }}
              onPointerDown={handleVolumePointerDown}
            >
              <div
                className="absolute left-0 top-0 h-full bg-[var(--md-sys-color-on-surface)]"
                style={{
                  width: `${volume * 100}%`,
                  transition: volumeDragging ? 'none' : 'width 0.3s linear',
                }}
              />
            </div>
            <div className="absolute -top-[10px] left-0 flex items-center">
              <span className="mr-1.5 text-[8px] tracking-widest text-[var(--md-sys-color-on-surface-variant)]">
                VOLUME
              </span>
              <span
                className="text-[8px] tabular-nums"
                style={{ color: 'var(--md-sys-color-on-surface)' }}
              >
                {Math.round(volume * 100)}
              </span>
            </div>
          </div>
        </div>

        {/* music-other（230px，space-evenly）：喜欢 / 加入队列 / 专辑 / 模式 / 队列；
            手机端仅保留喜欢/队列，并给右缘留出呼吸间距（原贴边太挤） */}
        <div className="music-widget-other flex w-[230px] shrink-0 items-center justify-evenly max-md:w-auto max-md:gap-3 max-md:pr-3.5">
          {/* 喜欢（描边心 / 红心，NCM 登录且有歌可见） */}
          {canLike && (
            <button
              type="button"
              className="flex h-5 w-5 items-center justify-center text-[var(--md-sys-color-on-surface)] transition-transform hover:opacity-70 active:scale-90"
              onClick={() => void handleLike()}
              title={liked ? '取消喜欢' : '喜欢'}
              aria-label={liked ? '取消喜欢' : '喜欢'}
            >
              {liked ? (
                <Heart className="h-5 w-5" fill="#E5404F" stroke="none" />
              ) : (
                <Heart className="h-5 w-5" />
              )}
            </button>
          )}
          {/* 添加到歌单（圆圈加号，Hydrogen addToPlaylist：NCM 登录且有歌可见；
              手机端隐藏——入口保留在完整播放器内）。
              B站 歌时切换为「添加到哔哩哔哩我的收藏夹」（弹窗选择收藏夹） */}
          {(isBiliSong
            ? currentSong?.biliBvid != null
            : loginStatus.loggedIn && currentSong != null) && (
            <button
              type="button"
              className="flex h-5 w-5 items-center justify-center text-[var(--md-sys-color-on-surface)] transition-transform hover:opacity-70 active:scale-90 max-md:hidden"
              // hover 即预取：网易云歌预取自建歌单、B站 歌预取收藏夹
              // （Hydrogen libraryStore 预载同思路，面板打开零等待）
              onPointerEnter={() => {
                if (isBiliSong) void prefetchBiliFavFolders()
                else void prefetchUserPlaylists()
              }}
              onClick={() => {
                if (isBiliSong) {
                  setBiliFavModalOpen(true)
                } else {
                  void prefetchUserPlaylists()
                  setAddPlaylistOpen(true)
                }
              }}
              title={isBiliSong ? '添加到哔哩哔哩收藏夹' : '添加到我的歌单'}
              aria-label={
                isBiliSong ? '添加到哔哩哔哩收藏夹' : '添加到我的歌单'
              }
            >
              <CirclePlus className="h-5 w-5" />
            </button>
          )}
          {/* 专辑（唱片）：解析当前歌专辑并跳转详情页（Hydrogen toAlbum；
              手机端隐藏——入口保留在完整播放器内）。
              B站 歌时切换为红心：一键收藏当前视频到设置的「红心收藏夹」 */}
          {currentSong &&
            (isBiliSong ? (
              <button
                type="button"
                className="flex h-5 w-5 items-center justify-center transition-transform hover:opacity-70 active:scale-90 max-md:hidden"
                onClick={() => void handleBiliCollect()}
                disabled={biliCollecting}
                title={
                  biliCollected
                    ? `已收藏到哔哩哔哩「${biliLikeFavTitle}」收藏夹；点击取消收藏`
                    : `收藏到哔哩哔哩「${biliLikeFavTitle}」收藏夹`
                }
                aria-label={
                  biliCollected
                    ? `已收藏到哔哩哔哩 ${biliLikeFavTitle} 收藏夹，点击取消收藏`
                    : `收藏到哔哩哔哩 ${biliLikeFavTitle} 收藏夹`
                }
              >
                <Heart
                  className={cn('h-5 w-5', biliCollecting && 'animate-pulse')}
                  fill={biliCollected ? '#E5404F' : 'none'}
                  stroke={biliCollected ? 'none' : 'currentColor'}
                />
              </button>
            ) : (
              <button
                type="button"
                className="flex h-5 w-5 items-center justify-center text-[var(--md-sys-color-on-surface)] transition-transform hover:opacity-70 active:scale-90 max-md:hidden"
                onClick={() => void handleToAlbum()}
                title="查看专辑"
                aria-label="查看专辑"
              >
                <Disc3 className="h-5 w-5" />
              </button>
            ))}
          {/* 播放模式（顺序循环 / 按顺序播放 / 单曲循环 / 随机 4 态循环；
              仅直接控制权可切；手机端隐藏——入口保留在完整播放器工具行内） */}
          <button
            type="button"
            className={cn(
              'flex h-5 w-5 items-center justify-center text-[var(--md-sys-color-on-surface)] transition-transform hover:opacity-70 active:scale-90 max-md:hidden',
              !canControl && 'cursor-default opacity-50'
            )}
            onClick={cyclePlayMode}
            title={
              canControl
                ? playMode === 'sequence'
                  ? '顺序循环'
                  : playMode === 'order'
                    ? '按顺序播放'
                    : playMode === 'repeat-one'
                      ? '单曲循环'
                      : '随机播放'
                : '仅房主可切换播放模式'
            }
            aria-label="切换播放模式"
          >
            <PlayModeIcon className="h-5 w-5" />
          </button>
          {/* 队列弹窗 */}
          <button
            type="button"
            className="flex h-5 w-5 items-center justify-center text-[var(--md-sys-color-on-surface)] transition-transform hover:opacity-70 active:scale-90"
            onClick={() => openQueuePopup('widget')}
            title="播放队列"
            aria-label="播放队列"
          >
            <ListMusic className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* widget-back：右上角 5px 圆点装饰（Hydrogen 同款） */}
      <span
        className="absolute right-1.5 top-1.5 h-[5px] w-[5px] rounded-full"
        style={{ backgroundColor: 'rgba(160, 160, 160, 0.7)' }}
        aria-hidden="true"
      />

      {/* 添加到我的歌单弹窗（Hydrogen ContextMenu.add-to-playlist；NCM 歌） */}
      <AddToPlaylistModal
        open={addPlaylistOpen}
        song={
          currentSong
            ? { songId: currentSong.songId, name: currentSong.name }
            : null
        }
        onClose={() => setAddPlaylistOpen(false)}
      />

      {/* B站 收藏夹选择弹窗（B站 歌的「添加到哔哩哔哩收藏夹」） */}
      <BiliFavCollectModal
        open={biliFavModalOpen}
        bvid={currentSong?.biliBvid ?? ''}
        onCollected={(bvid, folder) =>
          setBiliCollectedMark({ bvid, folder: folder ?? biliLikeFavTitle })
        }
        onClose={() => setBiliFavModalOpen(false)}
      />
    </div>
  )
}
