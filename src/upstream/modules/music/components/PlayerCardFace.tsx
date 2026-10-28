/** 封面与底部播放控制。竖屏歌词模式隐藏封面与歌曲信息，保留进度和五键；本机音量移入更多菜单。 */
import { message } from '@/components/ui/message'
import type { HTMLAttributes } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { Music, Repeat, Repeat1, Shuffle, ListOrdered, MessageCircle } from 'lucide-react'
import type { PlayMode } from '../types'
import { PLAY_MODE_META } from '../constants'
import { cn } from '@/lib/utils'
import { OverflowMarquee } from './OverflowMarquee'
import { MusicCoverImage } from './MusicCoverImage'
import { AudioVisualizer } from './AudioVisualizer'
import { PlayerProgressBar } from './PlayerProgressBar'
import {
  ControlNextIcon,
  ControlPauseIcon,
  ControlPlayIcon,
  ControlPrevIcon,
  LikeFilledIcon,
  LikeOutlineIcon,
} from './PlayerControlIcons'
import { CARD_TINT, type PlayerUiTone } from '../utils/playerTone'

export interface PlayerCardFaceProps {
  /** 播放页 UI 深浅色（卡底 tint 与文字同组切换） */
  lyricView?: boolean
  onToggleLyric?: () => void
  artworkGesture?: HTMLAttributes<HTMLDivElement>
  currentLyric?: string
  uiTone: PlayerUiTone
  /** UI 整体透明度（设置 uiOpacity 换算，1 = 不透明；只作用于 UI 图层） */
  uiFade: number
  isPortraitMobile: boolean
  /** 横屏矮窗口：迷你三键收纳到歌手行尾，独立三键/音量区隐藏 */
  isLandscapeShort: boolean
  cover?: string
  coverAlt: string
  isBiliSong: boolean
  /** B站 歌封面显示形状（square = 居中裁剪正方形） */
  biliCoverShape: 'original' | 'square'
  songName: string
  artist: string
  /** 切歌黑块滑入（true = 黑块遮住歌名行） */
  songSwitching: boolean
  /** 双击歌名 → 添加当前歌到播放队列 */
  onSongNameDoubleClick: () => void
  onPrev: () => void
  onPlayPause: () => void
  onNext: () => void
  isHost: boolean
  playMode: PlayMode
  onTogglePlayMode: () => void
  queuePopupOpen: boolean
  onToggleQueuePopup: () => void
  canLike: boolean
  liked: boolean
  onLike: () => void
  canComment: boolean
  rightPanelMode: 0 | 1
  commentBadge: string
  onToggleCommentPanel: () => void
  canControl: boolean
  isPlaying: boolean
  durationSec: number
  currentKey: string | null
  seekLock: { key: string | null; sec: number } | null
  /** 本地 seek（已挂等位锁） */
  onSeek: (time: number) => void
  /** 观众 seek 申请（本地只挂等位锁，实际跳转由房主端执行） */
  onRequestSeek: (time: number) => void
  audioVisualizer: boolean
  getAudio: () => HTMLAudioElement | null
  volume: number
  volumeDragging: boolean
  volumeTrackRef: RefObject<HTMLDivElement>
  onVolumePointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void
}

export function PlayerCardFace({
  lyricView, onToggleLyric, artworkGesture, currentLyric,
  uiTone,
  uiFade,
  isPortraitMobile,
  isLandscapeShort,
  cover,
  coverAlt,
  isBiliSong,
  biliCoverShape,
  songName,
  artist,
  songSwitching,
  onSongNameDoubleClick,
  onPrev,
  onPlayPause,
  onNext,
  isHost,
  playMode,
  onTogglePlayMode,
  queuePopupOpen,
  onToggleQueuePopup,
  canLike,
  liked,
  onLike,
  canComment,
  rightPanelMode,
  commentBadge,
  onToggleCommentPanel,
  canControl,
  isPlaying,
  durationSec,
  currentKey,
  seekLock,
  onSeek,
  onRequestSeek,
  audioVisualizer,
  getAudio,
  volume,
  volumeDragging,
  volumeTrackRef,
  onVolumePointerDown,
}: PlayerCardFaceProps) {
  const ModeIcon = playMode === 'repeat-one' ? Repeat1 : playMode === 'shuffle' ? Shuffle : Repeat
  return (
    <div className="music-player-card-face relative flex h-full min-h-0 w-full flex-col overflow-hidden">
      <div
        aria-hidden="true"
        className="lt-blur-surface pointer-events-none absolute inset-0"
        style={{
          backdropFilter: 'blur(var(--lt-ui-blur, 12px))',
          WebkitBackdropFilter: 'blur(var(--lt-ui-blur, 12px))',
        }}
      />
      {/* 卡底 tint 层（**在 uiFade 图层之外**）：tint 常驻托住文字对比度
          （分层原理见组件头注释）；浅色 UI = 白玻璃、深色 UI = 黑玻璃 */}
      <div
        aria-hidden="true"
        className="music-player-card-tint pointer-events-none absolute inset-0"
        style={{
          backgroundColor: isPortraitMobile
            ? CARD_TINT[uiTone].portrait
            : CARD_TINT[uiTone].desktop,
        }}
      />
      <div
        className="music-player-card-body relative flex h-full min-h-0 w-full flex-col"
        style={uiFade < 1 ? { opacity: uiFade } : undefined}
      >
        {/* 封面先让出控制区需要的高度；大字体/矮屏时卡内可滚动，
            工具栏继续占据卡片外独立的高度，避免被底部裁切。 */}
        <div
          {...artworkGesture}
          onClick={onToggleLyric}
          role="button" tabIndex={0} aria-label="查看歌词"
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') onToggleLyric?.() }}
          hidden={lyricView}
          className="music-player-artwork-region relative p-[max(1.5vh,10px)]"
          style={isPortraitMobile ? undefined : { maxHeight: '38vh' }}
        >
          <div
            className="music-player-artwork relative overflow-hidden"
            data-square-cover={!cover || (isBiliSong && biliCoverShape === 'square')}
            style={{ boxShadow: '0 0 8px 0 rgba(0, 0, 0, 0.05)' }}
          >
            <MusicCoverImage
              key={cover}
              src={cover}
              alt={coverAlt}
              className={cn(
                'music-player-cover-image block w-full object-cover',
                isBiliSong && biliCoverShape === 'square' && 'aspect-square'
              )}
              fallback={
                <div
                  className="music-player-cover-placeholder flex aspect-square w-full items-center justify-center"
                  style={{ backgroundColor: 'var(--md-sys-color-surface-container-high)' }}
                >
                  <Music className="h-10 w-10 opacity-40" style={{ color: 'var(--md-sys-color-on-surface-variant)' }} />
                </div>
              }
            />
          </div>
        </div>

        {/* 歌曲信息：歌名（黑块滑入遮字 + 跑马灯）+ 歌手（小方点 + 名） */}
        <div className="music-player-metadata shrink-0 px-[max(1.5vh,10px)] pt-[max(1vh,6px)]">
          {/* 歌名行（Hydrogen .info-music:first-child：pb 1.2vh + overflow 隐藏；
            双击加入播放队列——网易云歌弹顶部提示/确认） */}
          <div
            className="music-player-song-heading relative min-w-0 overflow-hidden pb-[max(1.2vh,7px)]"

          >
            <div className={cn('min-w-0', songSwitching && 'opacity-0')}>
              <OverflowMarquee
                text={songName}
                className="music-player-song-title pl-[max(1.5vh,10px)] text-[max(2.4vh,15px)] font-bold leading-[max(2.9vh,20px)] text-[var(--md-sys-color-on-surface)]"
              />
            </div>
            {/* 黑色滑块：默认藏在左侧（露 5px 竖条，Hydrogen music-name-lable
              原版样式；文字缩进 1.5vh 与竖条留出间隙），切歌时滑入遮住整行 */}
            <span
              aria-hidden="true"
              className="absolute left-0 top-0 h-[max(2.9vh,20px)] w-full transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.12,1)]"
              style={{
                backgroundColor: 'var(--md-sys-color-on-surface)',
                transform: songSwitching
                  ? 'translateX(0)'
                  : 'translateX(calc(-100% + 5px))',
              }}
            />
          </div>
          {/* 歌手和横屏迷你三键沿同一行居中；长歌手名在剩余宽度内省略。 */}
          <div className="music-player-artist-row relative flex min-w-0 items-center">
            <span className="music-player-artist-name min-w-0 truncate text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
              {artist || ' '}
            </span>
            {isLandscapeShort && (
              <div className="music-player-mini-transport ml-auto flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  className="flex h-[max(3.6vh,28px)] w-[max(3.6vh,28px)] items-center justify-center text-[var(--md-sys-color-on-surface)] transition-opacity hover:opacity-70 active:scale-90"
                  onClick={onPrev}
                  title={canControl ? '上一首' : '向房主申请切换上一首'}
                  aria-label="上一首"
                >
                  <ControlPrevIcon className="h-[max(3.6vh,28px)] w-[max(3.6vh,28px)]" />
                </button>
                <button
                  type="button"
                  className="music-primary-play flex h-[max(3.6vh,28px)] w-[max(3.6vh,28px)] items-center justify-center transition-opacity hover:opacity-70 active:scale-90"
                  onClick={onPlayPause}
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
                    <ControlPauseIcon className="h-[max(3.6vh,28px)] w-[max(3.6vh,28px)]" />
                  ) : (
                    <ControlPlayIcon className="h-[max(3.6vh,28px)] w-[max(3.6vh,28px)]" />
                  )}
                </button>
                <button
                  type="button"
                  className="flex h-[max(3.6vh,28px)] w-[max(3.6vh,28px)] items-center justify-center text-[var(--md-sys-color-on-surface)] transition-opacity hover:opacity-70 active:scale-90"
                  onClick={onNext}
                  title={canControl ? '下一首' : '向房主申请切换下一首'}
                  aria-label="下一首"
                >
                  <ControlNextIcon className="h-[max(3.6vh,28px)] w-[max(3.6vh,28px)]" />
                </button>
              </div>
            )}
          </div>
          {isPortraitMobile && <div className="music-player-song-actions">
            {canLike && <button type="button" onClick={() => void onLike()}
              aria-label={liked ? '取消喜欢' : '喜欢'} title={liked ? '取消喜欢' : '喜欢这首歌'}
              style={{ color: liked ? 'var(--md-sys-color-error)' : 'var(--md-sys-color-on-surface)' }}>
              {liked ? <LikeFilledIcon className="h-6 w-6" /> : <LikeOutlineIcon className="h-6 w-6" />}
            </button>}
          </div>}
        </div>

        {isPortraitMobile && !lyricView && <button className="music-current-lyric" onClick={onToggleLyric}>{currentLyric || '点击封面查看歌词'}</button>}
        {!canControl && <p className="music-control-authority">🔒 由房主控制 · 点击按钮可申请</p>}
        {/* 控制区（Hydrogen .player-control：进度 / 三键 / 音量 纵向分布；
          滑条挂 touch-slider 禁触屏滚动，vh 尺寸全部 max() 保底，
          保证横屏矮窗口下仍可读可点） */}
        <div className="music-player-controls flex shrink-0 flex-col px-[max(1.5vh,10px)] pb-[max(1vh,6px)] pt-[max(1.5vh,10px)]">
          {/* 进度区：时间行（1.5vh）+ 细黑条滑块（1.3vh + 0.5px 描边） */}
          <div className="music-player-progress shrink-0">
            <PlayerProgressBar
              durationSec={durationSec}
              canControl={canControl}
              currentKey={currentKey}
              seekLock={seekLock}
              onSeek={onSeek}
              onRequestSeek={onRequestSeek}
            />

            {/* 音频可视化（设置：音频可视化 → 真实频谱于进度条下方；
              captureStream 旁路 WebAudio analyser，Hydrogen 同思路） */}
            {audioVisualizer && (
              <div
                className="flex shrink-0 items-center justify-center pt-[max(0.6vh,4px)]"
                style={{ color: 'var(--md-sys-color-on-surface)' }}
              >
                <AudioVisualizer getAudio={getAudio} playing={isPlaying} />
              </div>
            )}
          </div>

          {/* 主控制：竖屏按模式 / 上一首 / 播放暂停 / 下一首 / 队列排列，
            使用实心播放图标，主题色突出中央主按钮。
            横屏矮窗口时隐藏——三键已收纳到歌手行右端（见上方
            isLandscapeShort 分支），避免控件区纵向臃肿 */}
          {!isLandscapeShort && (
            <div className="music-player-transport-row flex shrink-0 items-center justify-evenly">
              {isPortraitMobile && (
                <button type="button" className="music-player-transport music-player-mode flex items-center justify-center"
                  onClick={isHost ? onTogglePlayMode : () => message.info('仅房主可切换')} aria-disabled={!isHost} aria-label={`播放模式：${PLAY_MODE_META[playMode].label}`}
                  title={`${PLAY_MODE_META[playMode].label}（点击${PLAY_MODE_META[playMode].next}）`}>
                  <ModeIcon className="h-6 w-6" strokeWidth={1.6} />
                </button>
              )}
              <button
                type="button"
                className="music-player-transport flex h-[max(5vh,36px)] w-[max(5vh,36px)] items-center justify-center text-[var(--md-sys-color-on-surface)] transition-opacity hover:opacity-70 active:scale-90"
                onClick={onPrev}
                title={canControl ? '上一首' : '向房主申请切换上一首'}
                aria-label="上一首"
              >
                <ControlPrevIcon className="h-[max(5vh,36px)] w-[max(5vh,36px)]" />
              </button>
              <button
                type="button"
                className="music-primary-play flex h-[max(5vh,36px)] w-[max(5vh,36px)] items-center justify-center transition-opacity hover:opacity-70 active:scale-90"
                onClick={onPlayPause}
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
                  <ControlPauseIcon className="h-[max(5vh,36px)] w-[max(5vh,36px)]" />
                ) : (
                  <ControlPlayIcon className="h-[max(5vh,36px)] w-[max(5vh,36px)]" />
                )}
              </button>
              <button
                type="button"
                className="music-player-transport flex h-[max(5vh,36px)] w-[max(5vh,36px)] items-center justify-center text-[var(--md-sys-color-on-surface)] transition-opacity hover:opacity-70 active:scale-90"
                onClick={onNext}
                title={canControl ? '下一首' : '向房主申请切换下一首'}
                aria-label="下一首"
              >
                <ControlNextIcon className="h-[max(5vh,36px)] w-[max(5vh,36px)]" />
              </button>
              {isPortraitMobile && (
                <button type="button" className="music-player-transport music-player-queue flex items-center justify-center"
                  onClick={onToggleQueuePopup} aria-label="切换播放队列" aria-expanded={queuePopupOpen}
                  title={queuePopupOpen ? '收起播放队列' : '播放队列'}>
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                    <path d="M11 6h10M3 12h18M3 18h18" strokeLinecap="round" />
                    <path d="m3 3 5 3-5 3Z" fill="currentColor" stroke="none" />
                  </svg>
                </button>
              )}
            </div>
          )}

          {/* 音量区（滑块与进度同款 + VOLUME 标签与百分比；
            手机端保留——蓝牙/外放场景仍需软件音量）。
            横屏矮窗口隐藏：物理音量键触手可及，软件音量让位给
            进度条——高度不足时本区会与进度条重叠出框 */}
          {!isLandscapeShort && !isPortraitMobile && (
            <div className="music-player-volume shrink-0">
              <div
                ref={volumeTrackRef}
                role="slider"
                aria-label="音量"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(volume * 100)}
                className="touch-slider lt-slider-hairline relative h-[max(1.3vh,6px)] cursor-pointer"
                onPointerDown={onVolumePointerDown}
              >
                <div
                  className="absolute left-0 top-0 h-full"
                  style={{
                    width: `${volume * 100}%`,
                    backgroundColor: 'var(--md-sys-color-on-surface)',
                    transition: volumeDragging ? 'none' : 'width 0.3s ease',
                  }}
                />
              </div>
              <div className="mt-[max(1vh,6px)] flex items-center justify-between text-[max(1.5vh,11px)] font-bold text-[var(--md-sys-color-on-surface)]">
                <span className="tracking-widest">音量</span>
                <span className="tabular-nums">{Math.round(volume * 100)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
