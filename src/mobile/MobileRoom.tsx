import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ArrowLeft, Cast, Check, Film, Headphones, MessageCircle, MonitorPlay, Music2, Palette, Plus, RefreshCw, UsersRound, WifiOff, X } from 'lucide-react'
import { useSocket, reconnectSocket } from '@/hooks/useSocket'
import { useRoomStore } from '@/store/roomStore'
import { useAuthStore } from '@/store/authStore'
import { canRoomViewerPerform, useSystemSettingsStore } from '@/store/systemSettingsStore'
import { WatchTogetherPanel } from '@/modules/room/watch-together/WatchTogetherPanel'
import { usePlayerRemountKey } from '@/modules/room/watch-together/usePlayerRemountKey'
import { MovieListPanel } from '@/modules/room/components/MovieListPanel'
import { AutoContinueToggle } from '@/modules/room/components/AutoContinueToggle'
import { MoviePushPanel } from '@/modules/room/components/MoviePushPanel'
import { RoomInfoPanel } from '@/modules/room/components/RoomInfoPanel'
import { useRoomModeSwitch } from '@/modules/room/components/useRoomModeSwitch'
import { CommentPanel } from '@/components/CommentPanel'
import { MusicAppShell } from '@/modules/music/components/MusicAppShell'
import { MusicPlayerProvider } from '@/modules/music/MusicPlayerContext'
import { useMusicStore } from '@/modules/music/store'
import WebrtcWatchPage from '@/modules/screen-sharing/components/WebrtcWatchPage'
import StreamPushViewer from '@/modules/screen-sharing/components/StreamPushViewer'
import { useStreamStatus } from '@/modules/screen-sharing/hooks/useStreamStatus'
import { useShareMethod } from '@/modules/screen-sharing/hooks/useShareMethod'
import { useViewerList } from '@/modules/sync-playback/hooks/useViewerList'
import { consumeOverlayBack } from '@/components/ui/overlayBack'
import { useMobileRoom } from './useMobileRoom'
import { dispatchRoomMediaTeardown } from '@/lib/mediaTeardown'
import { message } from '@/components/ui/message'
import { Modal } from '@/components/ui/Modal'
import { restoreDisplay, ScreenOrientationButton } from './PlayerDisplayControls'
import { VoiceChatPanel } from '@/modules/voice-chat/components/VoiceChatPanel'
import { useMusicAudioRouting } from './useMusicAudioRouting'
import { BilibiliAccount } from './BilibiliAccount'
import { isGlobalAppearanceRuntime } from '../platform/runtime'
import MobileScreenShareHost from './MobileScreenShareHost'
import { useScreenShareCapabilities } from './useScreenShareCapabilities'

type Tab = 'chat' | 'movies'

export default function MobileRoom({ roomId, onLeave }: { roomId: string; onLeave: () => void }) {
  const { socket, connected, recoveryError } = useSocket()
  const screenShareCapability = useScreenShareCapabilities()
  const location = useLocation()
  useViewerList()
  const room = useMobileRoom(socket, roomId, location.state || {})
  const mode = useRoomStore(s => s.mode)
  const name = useRoomStore(s => s.roomName)
  const viewers = useRoomStore(s => s.viewers)
  const moderators = useRoomStore(s => s.moderators)
  const user = useAuthStore(s => s.user)
  const matrix = useSystemSettingsStore(s => s.roomPermissionMatrix)
  const { isModeSwitching, handleSwitchMode } = useRoomModeSwitch(socket, roomId, room.isHost)
  const streamStatus = useStreamStatus(socket, roomId)
  const { shareMethod } = useShareMethod(socket, roomId, room.isHost)
  const streamKey = useRoomStore(s => s.streamKey)
  const playerKey = usePlayerRemountKey()
  const [tab, setTab] = useState<Tab>('chat')
  const [password, setPassword] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [voiceJoined, setVoiceJoined] = useState(false)
  const [voiceAudioActive, setVoiceAudioActive] = useState(false)
  const [voiceAvailable, setVoiceAvailable] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [requests, setRequests] = useState<{ viewerSocketId: string; username: string }[]>([])
  const roomElement = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const root = roomElement.current, header = root?.querySelector<HTMLElement>('.mobile-room-header')
    if (!root || !header) return
    const update = () => root.style.setProperty('--mobile-room-header-bottom', `${Math.max(0, header.getBoundingClientRect().bottom)}px`)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(header)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, { passive: true })
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update)
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
      root.style.removeProperty('--mobile-room-header-bottom')
    }
  }, [])
  const [approvalBusy, setApprovalBusy] = useState<string | null>(null)
  const permissions = { isHost: room.isHost, isModerator: !!user && moderators.includes(Number(user.id)), role: user?.role }
  const canAdd = canRoomViewerPerform(matrix, 'addMovie', permissions)
  const canManage = canRoomViewerPerform(matrix, 'manageMovie', permissions)
  const canQueue = canRoomViewerPerform(matrix, 'musicQueue', permissions)
  useMusicAudioRouting(mode === 'listen-together' && room.phase === 'ready', voiceAudioActive)
  useEffect(() => () => { void restoreDisplay().catch(() => {}) }, [])
  useEffect(() => { setTab('chat'); setFullscreen(false); setAddOpen(false) }, [mode])
  useEffect(() => {
    if (room.phase === 'ready') setVoiceAvailable(true)
    else {
      setVoiceAvailable(false)
      setVoiceOpen(false)
      setVoiceJoined(false)
    }
  }, [room.phase])

  useEffect(() => {
    const back = () => {
      if (consumeOverlayBack()) return
      if (document.fullscreenElement) { void document.exitFullscreen(); return }
      if (document.querySelector('[data-music-immersive="true"]')) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        return
      }
      if (fullscreen) setFullscreen(false)
      else if (document.querySelector('.zart-web-fullscreen')) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      else if (addOpen) setAddOpen(false)
      else if (settingsOpen) setSettingsOpen(false)
      else if (voiceOpen) setVoiceOpen(false)
      else if (leaveOpen) setLeaveOpen(false)
      else if (useRoomStore.getState().mode === 'listen-together' && useMusicStore.getState().playerOverlayOpen) {
        // Expanded music owns the screen; Back returns to the room before leaving.
        const music = useMusicStore.getState()
        if (!music.playerOverlayClosing) music.closePlayerOverlay()
      }
      else setLeaveOpen(true)
    }
    window.addEventListener('mobile-room-back', back)
    return () => window.removeEventListener('mobile-room-back', back)
  }, [fullscreen, addOpen, settingsOpen, voiceOpen, leaveOpen])

  useEffect(() => {
    if (!voiceOpen) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setVoiceOpen(false)
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [voiceOpen])

  useEffect(() => {
    if (!socket || !room.isHost || (mode !== 'listen-together' && mode !== 'screen-share')) return
    const receive = (data: { viewerSocketId: string; username: string; roomId: string }) => {
      if (data.roomId !== roomId) return
      setRequests(current => [...current.filter(r => r.viewerSocketId !== data.viewerSocketId), data])
    }
    socket.on('join-request', receive)
    return () => { socket.off('join-request', receive) }
  }, [socket, room.isHost, mode, roomId])

  const approve = (viewerSocketId: string, accepted: boolean) => {
    if (!socket?.connected) { message.error('服务器连接已断开'); return }
    setApprovalBusy(viewerSocketId)
    socket.timeout(8000).emit(accepted ? 'approve-join' : 'reject-join', { roomId, viewerSocketId },
      (error: Error | null, ack: { success?: boolean; message?: string }) => {
        setApprovalBusy(null)
        if (error || !ack?.success) { message.error(ack?.message || '处理失败，请重试'); return }
        setRequests(current => current.filter(r => r.viewerSocketId !== viewerSocketId))
      })
  }

  const leave = () => {
    dispatchRoomMediaTeardown(true)
    socket?.disconnect()
    onLeave()
    // Reconnect only after room listeners have unmounted.
    window.setTimeout(() => { if (useRoomStore.getState().activeRoomId === null) socket?.connect() }, 100)
  }
  const music = mode === 'listen-together'
  const ready = room.phase === 'ready'
  return (
    <main ref={roomElement} className={`mobile-room ${music && ready ? 'mobile-room-music' : ''}`}>
      <header className="mobile-room-header">
        <button className="icon-button" aria-label="离开房间" title="离开房间" onClick={() => setLeaveOpen(true)}><ArrowLeft size={22} /></button>
        <div className="mobile-room-title"><strong>{name || roomId}</strong><span>{room.isHost ? '房主' : '观众'} · {music ? '一起听' : mode === 'screen-share' ? '屏幕共享' : '同步观影'}</span></div>
        {ready && <ScreenOrientationButton className="icon-button mobile-orientation-button" />}
        {ready && <button className={`icon-button mobile-voice-trigger ${voiceJoined ? 'is-connected' : ''}`} title={voiceJoined ? '语音已连接' : '语音聊天'} aria-label="语音聊天" aria-expanded={voiceOpen} onClick={() => setVoiceOpen(value => !value)}><Headphones size={20} /></button>}
        <button className="icon-button" title="房间设置" aria-label="房间设置" onClick={() => setSettingsOpen(true)}><UsersRound size={20} /></button>
      </header>
      {!connected && <div className="mobile-status" role="status"><WifiOff size={15} />{recoveryError || '连接已断开，正在重连'}{recoveryError && <button onClick={reconnectSocket}>重试连接</button>}</div>}
      {!ready ? (
        <section className="mobile-join">
          {(room.phase === 'joining' || room.phase === 'connecting' || room.phase === 'waiting') ? <RefreshCw className="spin" size={28} /> : <MonitorPlay size={36} />}
          <h1>{room.phase === 'password' ? '输入房间密码' : room.phase === 'waiting' ? '等待房主批准' : room.phase === 'closed' ? '房间已关闭' : room.phase === 'error' ? '无法加入房间' : '正在加入房间'}</h1>
          {room.error && <p role="alert">{room.error}</p>}
          {room.phase === 'password' && <form onSubmit={event => { event.preventDefault(); room.join(password) }}>
            <input aria-label="房间密码" autoFocus type="password" value={password} onChange={event => setPassword(event.target.value)} className="mobile-text-input" />
            <button className="primary-button" type="submit" disabled={!connected}>进入房间</button>
          </form>}
          {room.phase === 'error' && <button className="primary-button" onClick={() => room.join()} disabled={!connected}><RefreshCw size={18} />重试</button>}
          <button className="mobile-text-button" onClick={leave}>返回房间列表</button>
        </section>
      ) : music ? (
        <div className="mobile-music-content">
          {requests.map(request => <div className="mobile-approval" key={request.viewerSocketId}>
            <span>{request.username} 申请加入</span>
            <button className="icon-button" aria-label={`批准 ${request.username}`} disabled={approvalBusy !== null} onClick={() => approve(request.viewerSocketId, true)}><Check size={20} /></button>
            <button className="icon-button" aria-label={`拒绝 ${request.username}`} disabled={approvalBusy !== null} onClick={() => approve(request.viewerSocketId, false)}><X size={20} /></button>
          </div>)}
          <MusicPlayerProvider socket={socket} roomId={roomId} isHost={room.isHost} username={user?.username}>
            <MusicAppShell voiceManagedExternally socket={socket} roomId={roomId} isHost={room.isHost} username={user?.username}
              canManage={canQueue} isModeSwitching={isModeSwitching} commentsOnlyDock />
          </MusicPlayerProvider>
        </div>
      ) : (
        <div className="mobile-watch-layout">
          {requests.map(request => <div className="mobile-approval" key={request.viewerSocketId}>
            <span>{request.username} 申请加入</span>
            <button className="icon-button" aria-label={`批准 ${request.username}`} disabled={approvalBusy !== null} onClick={() => approve(request.viewerSocketId, true)}><Check size={20} /></button>
            <button className="icon-button" aria-label={`拒绝 ${request.username}`} disabled={approvalBusy !== null} onClick={() => approve(request.viewerSocketId, false)}><X size={20} /></button>
          </div>)}
          <div className="mobile-player-stage"><div className="mobile-player" data-testid="player">
            {mode === 'screen-share'
              ? room.isHost
                ? <MobileScreenShareHost socket={socket} roomId={roomId} streamPush={shareMethod === 'stream-push'} />
                : shareMethod === 'stream-push'
                ? <StreamPushViewer roomId={roomId} streamKey={streamKey || ''} streamStatus={streamStatus} playerOnly />
                : <WebrtcWatchPage roomId={roomId} playerOnly />
              : <WatchTogetherPanel key={`${room.isHost}:${playerKey}`} roomId={roomId} isHost={room.isHost}
                  isWebFullscreen={fullscreen} onToggleWebFullscreen={() => setFullscreen(value => !value)} initialPlayback={playerKey === 'init' ? room.playback : null} />}
          </div></div>
          <section className="mobile-room-details">
            <nav className="mobile-room-tabs" aria-label="房间面板">
              <button aria-selected={tab === 'chat'} onClick={() => setTab('chat')}><MessageCircle size={18} />聊天</button>
              {mode === 'watch-together' && <button aria-selected={tab === 'movies'} onClick={() => setTab('movies')}><Film size={18} />片单</button>}
            </nav>
            <div className="mobile-tab-panel" hidden={tab !== 'chat'}><CommentPanel socket={socket} roomId={roomId} commentsOnly={mode === 'screen-share'} /></div>
            {mode === 'watch-together' && <div className="mobile-tab-panel" hidden={tab !== 'movies'}>
              {(canAdd || room.isHost) && <div className="mobile-panel-actions"><AutoContinueToggle isHost={room.isHost} />{canAdd && <button className="mobile-text-button ml-auto" onClick={() => setAddOpen(true)}><Plus size={18} />添加影片</button>}</div>}
              <MovieListPanel isHost={room.isHost} canManage={canManage} />
            </div>}
          </section>
        </div>
      )}
      {voiceAvailable && <section className="mobile-voice-panel" hidden={!voiceOpen || !ready} aria-label="语音面板">
        <div className="mobile-voice-heading"><strong>房间语音</strong><button className="icon-button" aria-label="收起语音面板" title="收起语音面板" onClick={() => setVoiceOpen(false)}><X size={20} /></button></div>
        <VoiceChatPanel embedded socket={socket} roomId={roomId} username={user?.username}
          canManageVoice={room.isHost || permissions.isModerator} onConnectionChange={setVoiceJoined}
          onAudioSessionChange={setVoiceAudioActive} />
      </section>}
      <Modal open={addOpen} title="添加影片" onClose={() => setAddOpen(false)} footer={null}><MoviePushPanel isHost={canAdd} /></Modal>
      <Modal keepMounted open={settingsOpen} title="房间" onClose={() => setSettingsOpen(false)} footer={null}>
        {ready && room.isHost && <div className="mobile-mode-switch" role="group" aria-label="房间模式">
          <button aria-pressed={mode === 'watch-together'} disabled={isModeSwitching || !connected} onClick={() => handleSwitchMode('watch-together')}><MonitorPlay size={18} />一起看</button>
          {screenShareCapability?.video && <button aria-pressed={mode === 'screen-share'} disabled={isModeSwitching || !connected} onClick={() => handleSwitchMode('screen-share')}><Cast size={18} />投屏</button>}
          <button aria-pressed={mode === 'listen-together'} disabled={isModeSwitching || !connected} onClick={() => handleSwitchMode('listen-together')}><Music2 size={18} />一起听</button>
        </div>}
        <div className="mobile-room-settings-shortcuts">
        {isGlobalAppearanceRuntime() && <button className="mobile-text-button mobile-appearance-entry" onClick={() => {
          setSettingsOpen(false)
          window.dispatchEvent(new Event('mobile-appearance-open'))
        }}><Palette size={18} />外观设置</button>}
        {ready && <BilibiliAccount className="mobile-bilibili-entry" />}
        </div>
        {ready && <><RoomInfoPanel roomId={roomId} isHost={room.isHost} />
          <div className="mobile-room-footer"><span>房间号 {roomId} · {viewers.length} 位观众</span><button className="mobile-text-button" onClick={() => { setSettingsOpen(false); setLeaveOpen(true) }}>离开房间</button></div>
        </>}
      </Modal>
      <Modal open={leaveOpen} title="离开房间？" onClose={() => setLeaveOpen(false)} footer={<div className="mobile-dialog-actions"><button className="mobile-text-button" onClick={() => setLeaveOpen(false)}>取消</button><button className="mobile-text-button" onClick={leave}>离开</button></div>}>
        <p>{room.isHost ? '离开后将停止本机播放，房间按服务器的离线规则保留。' : '离开后将停止本机播放。'}</p>
      </Modal>
    </main>
  )
}
