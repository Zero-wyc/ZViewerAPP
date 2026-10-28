import type { ReactNode } from 'react'
import { Volume2 } from 'lucide-react'
import { MusicSheet } from './MusicSheet'
import type { PlayerUiTone } from '../utils/playerTone'
import type { PlayMode } from '../types'

interface PlayerMoreMenuProps {
  open: boolean
  onClose: () => void
  extraActions?: ReactNode
  volume: number
  onVolume: (value: number) => void
  showVolume: boolean
  onOrderMode: () => void
  bgVideoReady: boolean
  showImmersive: boolean
  onEnterImmersive: () => void
  isHost: boolean
  playMode: PlayMode
  onTogglePlayMode: () => void
  songId?: number
  onAddMusicVideo: () => void
  getBiliSourceUrl: () => string | null
  onToggleQueuePopup: () => void
  /** Only offer controls that the current layout does not already display. */
  showPlaybackActions: boolean
  onOpenSettings: () => void
  uiTone: PlayerUiTone
  onToggleUiTone: () => void
  isFullscreen: boolean
  showFullscreen: boolean
  onToggleFullscreen: () => void
}

export function PlayerMoreMenu(p: PlayerMoreMenuProps) {
  const action = (fn: () => void) => { p.onClose(); fn() }
  return <MusicSheet open={p.open} title="更多操作" tone={p.uiTone} onClose={p.onClose}>
    <div className="music-sheet-actions">
      {p.showPlaybackActions && <>
        <button onClick={() => action(p.onToggleQueuePopup)}>播放队列</button>
        <button onClick={p.onTogglePlayMode}>播放模式 · {p.playMode === 'repeat-one' ? '单曲循环' : p.playMode === 'shuffle' ? '随机播放' : p.playMode === 'order' ? '按顺序播放' : '列表循环'}{!p.isHost && '（仅房主可切换）'}</button>
      </>}
      {p.extraActions}
      {p.songId != null && p.songId > 0 && <button onClick={() => action(p.onAddMusicVideo)}>添加背景视频</button>}
      {p.getBiliSourceUrl() && <button onClick={() => window.open(p.getBiliSourceUrl()!, '_blank', 'noopener,noreferrer')}>打开哔哩哔哩原视频</button>}
      {p.showImmersive && p.bgVideoReady && <button onClick={() => action(p.onEnterImmersive)}>纯净视频模式</button>}
      <button onClick={() => action(p.onOpenSettings)}>外观与高级设置</button>
      <button onClick={p.onToggleUiTone}>{p.uiTone === 'light' ? '切换深色播放页' : '切换浅色播放页'}</button>
      {p.isHost && <button onClick={() => action(p.onOrderMode)}>按顺序播放（播完停止 / B站推荐连播）</button>}
      {p.showFullscreen && <button onClick={() => action(p.onToggleFullscreen)}>{p.isFullscreen ? '退出全屏' : '进入全屏'}</button>}
      {p.showVolume && <label className="music-volume-setting"><Volume2 size={20} /><span>本机音量</span><input aria-label="本机音量" type="range" min="0" max="1" step="0.01" value={p.volume} onChange={event => p.onVolume(Number(event.target.value))} /><output>{Math.round(p.volume * 100)}%</output></label>}
    </div>
  </MusicSheet>
}
