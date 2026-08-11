import { Text, Paragraph } from '@/components/ui/Typography'
import { Tag } from '@/components/ui/Tag'
import { IconButton } from '@/components/VideoControls'
import { cn } from '@/lib/utils'
import {
  Maximize,
  Minimize,
  Pause,
  Play,
  Pencil,
  PictureInPicture,
  PictureInPicture2,
  Volume2,
  VolumeX,
  X,
  RefreshCw,
} from 'lucide-react'

interface WatchControlsBarProps {
  /** 是否静音 */
  isMuted: boolean
  /** 是否正在播放 */
  isPlaying: boolean
  /** 是否有远端音频 */
  hasRemoteAudio: boolean
  /** 是否有远端视频流 */
  hasRemoteStream: boolean
  /** 是否处于画中画 */
  isPictureInPicture: boolean
  /** 浏览器是否支持画中画 */
  isPiPSupported: boolean
  /** 是否显示批注工具栏 */
  showAnnotationToolbar: boolean
  /** socket 是否已连接 */
  connected: boolean
  /** WebRTC 连接状态 */
  connectionState:
    'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed'
  /** 视频分辨率（可选） */
  videoResolution: { width: number; height: number } | null
  /** 切换静音 */
  onToggleMute: () => void
  /** 播放 / 暂停 */
  onTogglePlayPause: () => void
  /** 全屏 */
  onFullscreen: () => void
  /** 切换画中画 */
  onTogglePiP: () => void
  /** 切换批注工具栏 */
  onToggleAnnotation: () => void
  /** 刷新连接 */
  onRefresh: () => void
  /** 控制栏是否可见（自动隐藏），默认 true */
  controlBarVisible?: boolean
  /** 是否处于网页全屏 */
  isWebFullscreen?: boolean
  /** 切换网页全屏 */
  onToggleWebFullscreen?: () => void
}

function getConnectionStateText(
  state: WatchControlsBarProps['connectionState']
): string {
  switch (state) {
    case 'connecting':
      return '连接中'
    case 'connected':
      return '已连接'
    case 'disconnected':
      return '已断开'
    case 'failed':
      return '连接失败'
    case 'closed':
      return '连接已关闭'
    default:
      return '等待连接'
  }
}

function getConnectionStateColor(
  state: WatchControlsBarProps['connectionState']
): 'default' | 'primary' | 'success' | 'danger' {
  switch (state) {
    case 'connected':
      return 'success'
    case 'connecting':
      return 'primary'
    case 'disconnected':
    case 'failed':
    case 'closed':
      return 'danger'
    default:
      return 'default'
  }
}

export function WatchControlsBar({
  isMuted,
  isPlaying,
  hasRemoteAudio,
  hasRemoteStream,
  isPictureInPicture,
  isPiPSupported,
  showAnnotationToolbar,
  connected,
  connectionState,
  videoResolution,
  onToggleMute,
  onTogglePlayPause,
  onFullscreen,
  onTogglePiP,
  onToggleAnnotation,
  onRefresh,
  controlBarVisible = true,
  isWebFullscreen = false,
  onToggleWebFullscreen,
}: WatchControlsBarProps): JSX.Element {
  return (
    <div
      className={cn(
        'vc-container absolute bottom-0 left-0 right-0 z-20 p-2',
        !controlBarVisible && 'pointer-events-none'
      )}
    >
      <div
        className={cn(
          'glass-strong rounded-xl px-2.5 py-2 shadow-lg',
          controlBarVisible ? 'zart-controlbar-enter' : 'zart-controlbar-exit'
        )}
      >
        <div className="flex flex-wrap items-center vc-gap">
          {/* 播放 / 暂停 */}
          <IconButton
            icon={isPlaying ? <Pause /> : <Play />}
            label={isPlaying ? '暂停' : '播放'}
            onClick={onTogglePlayPause}
          />
          {hasRemoteAudio && (
            <IconButton
              icon={isMuted ? <VolumeX /> : <Volume2 />}
              label={isMuted ? '取消静音' : '静音'}
              onClick={onToggleMute}
            />
          )}
          <IconButton
            icon={isWebFullscreen ? <Minimize /> : <Maximize />}
            label={isWebFullscreen ? '退出网页全屏' : '网页全屏'}
            onClick={onToggleWebFullscreen}
          />
          <IconButton icon={<Maximize />} label="全屏" onClick={onFullscreen} />
          {isPiPSupported && (
            <IconButton
              icon={
                isPictureInPicture ? (
                  <PictureInPicture2 />
                ) : (
                  <PictureInPicture />
                )
              }
              label={isPictureInPicture ? '退出画中画' : '画中画'}
              onClick={onTogglePiP}
            />
          )}
          <IconButton
            icon={showAnnotationToolbar ? <X /> : <Pencil />}
            label={showAnnotationToolbar ? '关闭批注' : '批注'}
            active={showAnnotationToolbar}
            onClick={onToggleAnnotation}
          />
          <IconButton
            icon={<RefreshCw />}
            label="刷新连接"
            onClick={onRefresh}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Tag color={connected ? 'success' : 'default'}>
            {connected ? '已连接' : '未连接'}
          </Tag>
          <Tag color="primary">已加入</Tag>
          <Tag color={getConnectionStateColor(connectionState)}>
            {getConnectionStateText(connectionState)}
          </Tag>
          {hasRemoteStream && hasRemoteAudio && (
            <Tag color="cyan">{isMuted ? '静音中' : '音频开启'}</Tag>
          )}
        </div>
        {videoResolution && (
          <Paragraph className="m-0 mt-2">
            <Text type="secondary">
              分辨率：{videoResolution.width} x {videoResolution.height}
            </Text>
          </Paragraph>
        )}
      </div>
    </div>
  )
}
