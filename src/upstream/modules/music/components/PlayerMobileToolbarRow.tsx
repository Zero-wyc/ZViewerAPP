import { useState, type ReactNode } from 'react'
import type { Socket } from 'socket.io-client'
import { AlignLeft, MessageCircle, ListMusic, MoreHorizontal, Volume2 } from 'lucide-react'
import { MusicSheet } from './MusicSheet'
import { MusicQueuePopup } from './MusicQueuePopup'
import { CARD_TONE_VARS, type PlayerUiTone } from '../utils/playerTone'
import type { PlayMode } from '../types'
export interface PlayerMobileToolbarRowProps {
  /** 工具行色调（跟随主题深浅，不跟播放页 UI 开关） */
  extraActions?: ReactNode
  onAddQueue: () => void
  volume: number
  onVolume: (value: number) => void
  onOrderMode: () => void
  toolbarTone: PlayerUiTone

  // ===== 歌词视图开关（竖屏独占整页）与歌词三开关 =====
  mobileLyricViewActive: boolean
  onToggleMobileLyricView: () => void
  hasRomaLyric: boolean
  lyricRoma: boolean
  onToggleLyricRoma: () => void
  hasTransLyric: boolean
  lyricTrans: boolean
  onToggleLyricTrans: () => void

  // ===== 纯净模式 =====
  bgVideoReady: boolean
  onEnterImmersive: () => void

  // ===== 喜欢（网易云） =====
  canLike: boolean
  liked: boolean
  onLike: () => void

  // ===== 播放模式（房主） =====
  isHost: boolean
  playMode: PlayMode
  onTogglePlayMode: () => void

  // ===== 歌词/评论切换（评论数徽章以小圆点形式叠加） =====
  canComment: boolean
  rightPanelMode: 0 | 1
  commentBadge: string
  onToggleCommentPanel: () => void

  // ===== 添加视频 =====
  songId?: number
  onAddMusicVideo: () => void

  /** B站 原视频链接：命令式读取当前播放进度（?t= 续看），渲染期仅判空 */
  getBiliSourceUrl: () => string | null

  // ===== 播放队列（弹窗固定底部居中弹出） =====
  queuePopupOpen: boolean
  onToggleQueuePopup: () => void
  socket: Socket | null
  roomId: string
  /** 队列管理权限（父级已按 canManage ?? isHost 归一） */
  canManage: boolean
  /** Playback view places mode and queue alongside the main transport controls. */
  showPlaybackActions?: boolean

  // ===== 设置 / UI 深浅色 / 全屏 =====
  onOpenSettings: () => void
  uiTone: PlayerUiTone
  onToggleUiTone: () => void
  isFullscreen: boolean
  showFullscreen?: boolean
  onToggleFullscreen: () => void
}

export function PlayerMobileToolbarRow(p: PlayerMobileToolbarRowProps) {
  const [more, setMore] = useState(false)
  const action = (fn: () => void) => { setMore(false); fn() }
  return <div className="music-player-mobile-tools" style={CARD_TONE_VARS[p.uiTone]}>
    <button onClick={p.onToggleMobileLyricView} aria-pressed={p.mobileLyricViewActive} aria-label="切换歌词显示"><AlignLeft size={22} /><span>{p.mobileLyricViewActive ? '封面' : '歌词'}</span></button>
    <button onClick={p.onToggleCommentPanel} disabled={!p.canComment} aria-label="切换歌词/评论区"><MessageCircle size={22} /><span>评论</span></button>

    <button onClick={() => setMore(true)} aria-label="播放器更多操作"><MoreHorizontal size={22} /><span>更多</span></button>
    {p.queuePopupOpen && <MusicQueuePopup socket={p.socket} roomId={p.roomId} isHost={p.isHost} canManage={p.canManage} placement="sheet" />}
    {more && <MusicSheet title="更多操作" tone={p.uiTone} onClose={() => setMore(false)}>
      <div className="music-sheet-actions">
        <button onClick={() => action(p.onToggleQueuePopup)}>播放队列</button>
        <button onClick={p.onTogglePlayMode}>播放模式 · {p.playMode === 'repeat-one' ? '单曲循环' : p.playMode === 'shuffle' ? '随机播放' : p.playMode === 'order' ? '按顺序播放' : '列表循环'}{!p.isHost && '（仅房主可切换）'}</button>
        {p.mobileLyricViewActive && p.hasRomaLyric && <button onClick={p.onToggleLyricRoma}>{p.lyricRoma ? '隐藏罗马音' : '显示罗马音'}</button>}
        {p.mobileLyricViewActive && p.hasTransLyric && <button onClick={p.onToggleLyricTrans}>{p.lyricTrans ? '隐藏翻译' : '显示翻译'}</button>}
        {p.canLike && <button onClick={() => void p.onLike()}>{p.liked ? '取消喜欢' : '喜欢这首歌'}</button>}
        {p.extraActions ?? <button onClick={() => action(p.onAddQueue)}>加入播放队列</button>}
        {p.songId != null && p.songId > 0 && <button onClick={() => action(p.onAddMusicVideo)}>添加背景视频</button>}
        {p.getBiliSourceUrl() && <button onClick={() => window.open(p.getBiliSourceUrl()!, '_blank', 'noopener,noreferrer')}>打开哔哩哔哩原视频</button>}
        {p.bgVideoReady && <button onClick={() => action(p.onEnterImmersive)}>纯净视频模式</button>}
        <button onClick={() => action(p.onOpenSettings)}>外观与高级设置</button>
        <button onClick={p.onToggleUiTone}>{p.uiTone === 'light' ? '切换深色播放页' : '切换浅色播放页'}</button>
        {p.isHost && <button onClick={() => action(p.onOrderMode)}>按顺序播放（播完停止 / B站推荐连播）</button>}
        {p.showFullscreen && <button onClick={() => action(p.onToggleFullscreen)}>{p.isFullscreen ? '退出全屏' : '进入全屏'}</button>}
        <label className="music-volume-setting"><Volume2 size={20} /><span>本机音量</span><input aria-label="本机音量" type="range" min="0" max="1" step="0.01" value={p.volume} onChange={event => p.onVolume(Number(event.target.value))} /><output>{Math.round(p.volume * 100)}%</output></label>
      </div>
    </MusicSheet>}
  </div>
}
