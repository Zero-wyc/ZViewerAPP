/**
 * WebRTC 屏幕共享观众端。
 *
 * 从 WatchPage.tsx 中拆分，仅处理 WebRTC 子模式的观众端：
 * - RTCPeerConnection 管理（挂载时自动创建，卸载时自动清理）
 * - 信令通道订阅（signal-offer / signal-ice-candidate / sharer-ready）
 * - video 元素绑定与分辨率/PiP 监听
 * - 控制栏、全屏和平台小窗 UI
 *
 * WatchPage 分发器根据 roomMode + shareMethod 决定渲染本组件或 StreamPushViewer。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { message } from '@/components/ui/message'
import { useSocket } from '@/hooks/useSocket'
import { cn } from '@/lib/utils'
import {
  isIOSDevice,
  supportsContainerFullscreen,
} from '@/lib/fullscreen-utils'
import { Maximize2, Volume2, X } from 'lucide-react'
import { getRuntimePlatform } from '../../../../platform/runtime'
import { enterNativePictureInPicture, hasPictureInPictureFrame, supportsNativePictureInPicture } from '../../../../platform/webrtcPictureInPicture'
import { ROOM_MEDIA_TEARDOWN_EVENT } from '@/lib/mediaTeardown'
import '../../../../mobile/webrtc-pip.css'
import { CommentPanel } from '@/components/CommentPanel'
import { RoomLayout } from '@/modules/room/components/RoomLayout'
import { RoomInfoPanel } from '@/modules/room/components/RoomInfoPanel'
import { useScreenShareDisplay } from '../../../../mobile/useScreenShareDisplay'
import { useP2PTunnel } from '@/modules/p2p'
import type { P2PStatus } from '@/modules/p2p/types'
import { useViewerPeerConnection } from '../hooks/useViewerPeerConnection'
import { useSignalingChannel } from '../hooks/useSignalingChannel'
import { RemoteVideoPlayer } from './RemoteVideoPlayer'
import { WatchControlsBar } from './WatchControlsBar'

/** 观众端 P2P 状态快照 */
export interface ViewerP2PStateSnapshot {
  enabled: boolean
  pc: RTCPeerConnection | null
  status: P2PStatus
  fallbackNotice: boolean
  toggle: (enabled: boolean) => void
}

declare global {
  interface HTMLVideoElement {
    requestPictureInPicture(): Promise<unknown>
  }
  interface Document {
    readonly pictureInPictureElement: HTMLVideoElement | null
    readonly pictureInPictureEnabled: boolean
    exitPictureInPicture(): Promise<void>
  }
}

interface WebrtcWatchPageProps {
  roomId: string
  playerOnly?: boolean
}

function WebrtcWatchPage({ roomId, playerOnly }: WebrtcWatchPageProps) {
  const { socket, connected } = useSocket()

  // UI state
  const [isMuted, setIsMuted] = useState(false)
  const [isPlaying, setIsPlaying] = useState(true)
  const [videoResolution, setVideoResolution] = useState<{
    width: number
    height: number
  } | null>(null)
  const [isPictureInPicture, setIsPictureInPicture] = useState(false)
  const platform = getRuntimePlatform()
  const mobilePiP = platform === 'android'
  const [nativePiPSupported, setNativePiPSupported] = useState(false)
  const [inlinePiP, setInlinePiP] = useState(false)
  const [pipPosition, setPipPosition] = useState<{ left: number; top: number } | null>(null)
  const pipDrag = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const nativePiPCleanup = useRef<(() => void) | null>(null)
  const pipRequest = useRef<AbortController | null>(null)
  const pipBusy = useRef(false)
  const [frameReady, setFrameReady] = useState(false)
  // ArkWeb can decode MediaStream yet show a white cross-app PiP window.
  const isPiPSupported = platform !== 'harmony' && (mobilePiP || !!document.pictureInPictureEnabled)
  const [isWebFullscreen, setIsWebFullscreen] = useState(false)

  useEffect(() => {
    let cancelled = false
    void supportsNativePictureInPicture().then(supported => { if (!cancelled) setNativePiPSupported(supported) })
    return () => { cancelled = true }
  }, [])

  // WebRTC 播放器舞台 ref（用于控制栏自动隐藏）
  const webrtcStageRef = useRef<HTMLDivElement | null>(null)

  // video ref（使用回调 ref 触发 videoVersion 变化，驱动 resolution 监听 effect 重新订阅）
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [videoVersion, setVideoVersion] = useState(0)
  const setVideoRef = useCallback((node: HTMLVideoElement | null) => {
    const prev = videoRef.current
    videoRef.current = node
    if (node && !prev) setVideoVersion((v) => v + 1)
  }, [])

  useEffect(() => {
    const close = () => {
      pipRequest.current?.abort()
      nativePiPCleanup.current?.()
      nativePiPCleanup.current = null
      const video = videoRef.current
      if (video && document.pictureInPictureElement === video) void document.exitPictureInPicture().catch(() => {})
      setInlinePiP(false)
      setIsPictureInPicture(false)
    }
    window.addEventListener(ROOM_MEDIA_TEARDOWN_EVENT, close)
    return () => {
      window.removeEventListener(ROOM_MEDIA_TEARDOWN_EVENT, close)
      close()
    }
  }, [])

  useEffect(() => {
    if (!inlinePiP) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setInlinePiP(false) }
    const clamp = () => setPipPosition(null)
    document.addEventListener('keydown', close)
    window.addEventListener('resize', clamp)
    return () => { document.removeEventListener('keydown', close); window.removeEventListener('resize', clamp) }
  }, [inlinePiP])

  // 观众 PC hook
  const {
    pc,
    hasRemoteStream,
    hasRemoteAudio,
    connectionState,
    create: createPc,
    cleanup: cleanupPc,
    handleSignalOffer,
    handleSignalIceCandidate,
    handleSharerReady,
  } = useViewerPeerConnection({
    socket,
    roomId,
    videoRef,
    videoMountedVersion: videoVersion,
  })

  useEffect(() => {
    if (hasRemoteStream) return
    pipRequest.current?.abort()
    nativePiPCleanup.current?.()
    nativePiPCleanup.current = null
    setInlinePiP(false)
    setIsPictureInPicture(false)
  }, [hasRemoteStream])

  // 挂载时自动创建 PC，卸载时自动清理
  // 替代原 WatchPage 中 useJoinRoom.onApprovedScreenShare / onRoomModeChanged 的 PC 创建逻辑
  useEffect(() => {
    createPc()
    return () => {
      cleanupPc()
      if (videoRef.current) videoRef.current.srcObject = null
    }
  }, [createPc, cleanupPc])

  // 信令 channel hook（订阅 signal-offer / signal-ice-candidate）
  useSignalingChannel({
    socket,
    onSignalOffer: handleSignalOffer,
    onSignalIceCandidate: handleSignalIceCandidate,
  })

  useEffect(() => {
    if (!socket) return
    const failed = (data: { roomId: string }) => {
      if (data.roomId !== roomId) return
      cleanupPc()
      setFrameReady(false)
      // Remote error text can contain private details; show a fixed actionable message.
      message.error('房主屏幕共享未成功，请等待房主重新开始')
    }
    socket.on('sharer-error', failed)
    return () => { socket.off('sharer-error', failed) }
  }, [socket, roomId, cleanupPc])

  // P2P 直连隧道（观众为 receiver，remotePeerId 由 offer 自动填充）
  const [p2pFallbackNotice, setP2pFallbackNotice] = useState(false)
  const { enableP2P, disableP2P, p2pEnabled, p2pPC, p2pStatus } = useP2PTunnel({
    socket,
    roomId,
    role: 'receiver',
    onStatusChange: (status, didFallback) => {
      if (didFallback) {
        setP2pFallbackNotice(true)
        message.warning('P2P 连接失败，已回退到服务器中转')
      } else if (status === 'connected') {
        setP2pFallbackNotice(false)
        message.success('P2P 直连已建立')
      } else if (status === 'connecting') {
        setP2pFallbackNotice(false)
      }
    },
  })

  // 观众接收房主 P2P 模式广播：同步开关状态
  useEffect(() => {
    if (!socket) return
    const handleP2PModeChange = (data: {
      roomId: string
      enabled: boolean
    }) => {
      if (data.roomId !== roomId) return
      if (data.enabled) {
        void enableP2P()
      } else {
        disableP2P()
      }
    }
    socket.on('p2p-mode-change', handleP2PModeChange)
    return () => {
      socket.off('p2p-mode-change', handleP2PModeChange)
    }
  }, [socket, roomId, enableP2P, disableP2P])

  const handleToggleP2P = useCallback(
    (enabled: boolean) => {
      if (enabled) {
        void enableP2P()
      } else {
        disableP2P()
      }
    },
    [enableP2P, disableP2P]
  )

  // WebRTC 控制栏自动隐藏（逻辑仿照 WatchTogetherCore）
  const webrtcControlBarVisible = useScreenShareDisplay({ stage: webrtcStageRef, video: videoRef,
    fullscreen: isWebFullscreen, enterFullscreen: () => setIsWebFullscreen(true), enabled: !inlinePiP && !isPictureInPicture })

  // WebRTC 网页全屏模式下按 ESC 退出
  useEffect(() => {
    if (!isWebFullscreen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsWebFullscreen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isWebFullscreen])

  // 订阅 sharer-ready 事件：房主开始共享时触发，观众重建 PC 并重发 viewer-ready
  useEffect(() => {
    if (!socket) return
    const handleSharerReadyEvent = (data: { roomId: string }) => {
      if (data.roomId !== roomId) return
      handleSharerReady()
    }
    socket.on('sharer-ready', handleSharerReadyEvent)
    return () => {
      socket.off('sharer-ready', handleSharerReadyEvent)
    }
  }, [socket, roomId, handleSharerReady])

  // video 元素 resolution / PiP 监听
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleLoadedMetadata = () => {
      setVideoResolution({ width: video.videoWidth, height: video.videoHeight })
      setFrameReady(hasPictureInPictureFrame(video))
    }
    const handleEnterPiP = () => setIsPictureInPicture(true)
    const handleLeavePiP = () => setIsPictureInPicture(false)
    const pipEnter = 'enterpictureinpicture' as keyof HTMLVideoElementEventMap
    const pipLeave = 'leavepictureinpicture' as keyof HTMLVideoElementEventMap

    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    video.addEventListener('loadeddata', handleLoadedMetadata)
    video.addEventListener('resize', handleLoadedMetadata)
    video.addEventListener('emptied', handleLoadedMetadata)
    video.addEventListener(pipEnter, handleEnterPiP)
    video.addEventListener(pipLeave, handleLeavePiP)

    const interval = setInterval(() => {
      setFrameReady(hasPictureInPictureFrame(video))
      if (video.videoWidth && video.videoHeight)
        setVideoResolution((prev) => {
          if (
            prev &&
            prev.width === video.videoWidth &&
            prev.height === video.videoHeight
          ) {
            return prev
          }
          return { width: video.videoWidth, height: video.videoHeight }
        })
    }, 1000)

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('loadeddata', handleLoadedMetadata)
      video.removeEventListener('resize', handleLoadedMetadata)
      video.removeEventListener('emptied', handleLoadedMetadata)
      video.removeEventListener(pipEnter, handleEnterPiP)
      video.removeEventListener(pipLeave, handleLeavePiP)
      clearInterval(interval)
    }
  }, [hasRemoteStream, videoVersion])

  // isMuted 同步到 video 元素
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = isMuted
  }, [isMuted])

  // 自动播放回退和播放器可能直接修改元素静音状态，同步到移动端控制栏。
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const syncMuted = () => setIsMuted(video.muted)
    syncMuted()
    video.addEventListener('volumechange', syncMuted)
    return () => video.removeEventListener('volumechange', syncMuted)
  }, [hasRemoteStream, videoVersion])

  const handleUnmute = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = false
    setIsMuted(false)
    void video.play().catch(() => { message.warning('声音未能开启，请再次点击播放') })
  }, [])

  // 监听 video play/pause 事件同步 isPlaying 状态
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    return () => {
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
    }
  }, [videoVersion])

  // 事件处理
  const handleFullscreen = () => {
    if (isIOSDevice() || !supportsContainerFullscreen()) {
      setIsWebFullscreen((prev) => !prev)
      return
    }
    const video = videoRef.current
    if (!video) return
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {})
    } else {
      video.requestFullscreen().catch(() => {
        setIsWebFullscreen((prev) => !prev)
      })
    }
  }

  const handleTogglePictureInPicture = async () => {
    if (!isPiPSupported) return
    const video = videoRef.current
    if (!video || pipBusy.current) return
    if (inlinePiP) { setInlinePiP(false); return }
    if (!hasPictureInPictureFrame(video)) { message.info('请等待投屏画面就绪后再开启小窗'); return }
    pipBusy.current = true
    const request = new AbortController()
    pipRequest.current = request
    try {
      if (mobilePiP) {
        if (nativePiPSupported && webrtcStageRef.current) {
          const cleanup = await enterNativePictureInPicture(webrtcStageRef.current, video, () => {
            nativePiPCleanup.current = null
            setIsPictureInPicture(false)
          }, request.signal)
          nativePiPCleanup.current = cleanup
          if (cleanup) setIsPictureInPicture(true)
        } else {
          setIsWebFullscreen(false)
          setPipPosition(null)
          setInlinePiP(true)
        }
      } else if (document.pictureInPictureElement === video)
        await document.exitPictureInPicture()
      else await video.requestPictureInPicture()
    } catch (err) {
      if (request.signal.aborted) return
      console.error('[WebrtcWatchPage] picture-in-picture error:', err)
      if (mobilePiP) {
        setIsWebFullscreen(false)
        setPipPosition(null)
        setInlinePiP(true)
        message.info('系统画中画不可用，已切换为应用内小窗')
      } else message.error('画中画模式不可用')
    } finally { pipBusy.current = false; if (pipRequest.current === request) pipRequest.current = null }
  }

  const handleToggleMute = () => setIsMuted((prev) => !prev)

  const handleTogglePlayPause = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      void video.play().catch(() => {})
    } else {
      video.pause()
    }
  }, [])

  const handleRefresh = useCallback(() => {
    cleanupPc()
    setTimeout(() => createPc(), 0)
  }, [cleanupPc, createPc])

  const playerContent = (
    <div
      ref={webrtcStageRef}
      className={cn(
        'zart-stage relative h-full w-full',
        isWebFullscreen && !inlinePiP && 'zart-web-fullscreen fixed inset-0 z-[100]',
        inlinePiP && 'webrtc-inline-pip'
      )}
      style={
        inlinePiP ? {
          aspectRatio: `${videoResolution?.width || 16} / ${videoResolution?.height || 9}`,
          ...(pipPosition ? { left: pipPosition.left, top: pipPosition.top, right: 'auto' } : {}),
        } : isWebFullscreen ? { width: '100dvw', height: '100dvh' } : undefined
      }
    >
      <RemoteVideoPlayer
        videoRef={videoRef}
        setVideoRef={setVideoRef}
        isMuted={isMuted}
        hasRemoteStream={hasRemoteStream}
        peerConnection={pc}
      />
      {hasRemoteStream && hasRemoteAudio && isMuted && (
        <button type="button" onClick={handleUnmute}
          className="absolute left-1/2 top-4 z-20 flex min-h-11 max-w-[90%] -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white shadow-lg"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.72)' }}>
          <Volume2 className="h-4 w-4 shrink-0" />
          点击开启声音
        </button>
      )}
      {inlinePiP && <div className="webrtc-pip-heading"
        onPointerDown={event => {
          if ((event.target as HTMLElement).closest('button')) return
          const rect = webrtcStageRef.current!.getBoundingClientRect()
          pipDrag.current = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={event => {
          const drag = pipDrag.current, stage = webrtcStageRef.current
          if (!drag || !stage) return
          setPipPosition({
            left: Math.max(0, Math.min(innerWidth - stage.offsetWidth, drag.left + event.clientX - drag.x)),
            top: Math.max(0, Math.min(innerHeight - stage.offsetHeight, drag.top + event.clientY - drag.y)),
          })
        }}
        onPointerUp={() => { pipDrag.current = null }} onPointerCancel={() => { pipDrag.current = null }}>
        <span>应用内小窗</span>
        <button type="button" aria-label="恢复播放画面" onClick={() => setInlinePiP(false)}><Maximize2 size={18} /></button>
        <button type="button" aria-label="关闭小窗" onClick={() => setInlinePiP(false)}><X size={18} /></button>
      </div>}
      <WatchControlsBar
        isMuted={isMuted}
        isPlaying={isPlaying}
        hasRemoteAudio={hasRemoteAudio}
        hasRemoteStream={hasRemoteStream}
        isPictureInPicture={isPictureInPicture || inlinePiP}
        isPiPSupported={isPiPSupported}
        canEnterPiP={hasRemoteStream && frameReady}
        pipLabel={mobilePiP && !nativePiPSupported ? '应用内小窗' : '画中画'}
        connected={connected}
        connectionState={connectionState}
        videoResolution={videoResolution}
        onToggleMute={handleToggleMute}
        onTogglePlayPause={handleTogglePlayPause}
        onFullscreen={handleFullscreen}
        onTogglePiP={handleTogglePictureInPicture}
        onRefresh={handleRefresh}
        controlBarVisible={webrtcControlBarVisible}
        isWebFullscreen={isWebFullscreen}
        onToggleWebFullscreen={() => setIsWebFullscreen((prev) => !prev)}
      />
    </div>
  )

  if (playerOnly) return playerContent
  return (
    <RoomLayout
      isHost={false}
      mainContent={playerContent}
      peerConnection={pc}
      sharingRole="receiver"
      sharingActive
      p2pEnabled={p2pEnabled}
      p2pPC={p2pPC}
      p2pStatus={p2pStatus}
      p2pFallbackNotice={p2pFallbackNotice}
      onToggleP2P={handleToggleP2P}
      webFullscreen={isWebFullscreen}
      rightPanel={<CommentPanel socket={socket} roomId={roomId} commentsOnly />}
      controls={<RoomInfoPanel roomId={roomId} isHost={false} />}
      controlLabels={['房间状态']}
    />
  )
}

export default WebrtcWatchPage
