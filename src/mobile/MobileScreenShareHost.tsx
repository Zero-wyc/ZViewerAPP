import { useEffect, useState } from 'react'
import type { Socket } from 'socket.io-client'
import { ChevronDown, Info, Mic, MonitorUp, Pause, Play, ShieldCheck, Square, Users, Volume2 } from 'lucide-react'
import { AppIcon } from './AppIcon'
import { getScreenShareNative, subscribeScreenShare } from '../platform/screenShare'
import { useScreenShareCapabilities } from './useScreenShareCapabilities'
import { createScreenShareSession } from './screenShareSession'
import type { ScreenShareSnapshot } from './screenShareSession'
import { ICE_SERVERS } from '@/modules/screen-sharing/constants'
import { ROOM_MEDIA_TEARDOWN_EVENT } from '@/lib/mediaTeardown'
import { screenShareFrameRates, screenShareResolutions } from '../platform/screenShareQuality'
import type { ScreenShareVideoOptions } from '../platform/contracts'

const labels = { idle: '准备就绪', 'requesting-permission': '等待系统授权', starting: '正在开始共享', sharing: '正在共享', paused: '共享已暂停', stopping: '正在停止', stopped: '共享已结束', error: '共享未成功' }
const transportLabels = { idle: '尚未连接', 'waiting-viewers': '等待观众', connecting: '正在连接观众', connected: '观众已连接', disconnected: '网络已断开' }

export default function MobileScreenShareHost({ socket, roomId, streamPush }: { socket: Socket | null; roomId: string; streamPush: boolean }) {
  const capability = useScreenShareCapabilities()
  const [snapshot, setSnapshot] = useState<ScreenShareSnapshot>({ state: 'idle', transport: 'idle', viewers: 0 })
  const [controller, setController] = useState<ReturnType<typeof createScreenShareSession>>()
  const [audioOptions, setAudioOptions] = useState({ systemAudio: true, microphone: false })
  const [videoOptions, setVideoOptions] = useState<ScreenShareVideoOptions>({ resolution: '720p', frameRate: 30 })
  useEffect(() => {
    setController(undefined)
    setSnapshot({ state: 'idle', transport: 'idle', viewers: 0 })
    setAudioOptions({ systemAudio: true, microphone: false })
    const native = getScreenShareNative()
    if (!socket || !native || streamPush) return
    const session = createScreenShareSession({ roomId, socket, native, iceServers: ICE_SERVERS, subscribe: subscribeScreenShare, changed: setSnapshot, newId: () => crypto.randomUUID() })
    setController(session)
    const stop = () => { void session.stop() }
    window.addEventListener(ROOM_MEDIA_TEARDOWN_EVENT, stop)
    window.addEventListener('pagehide', stop)
    return () => {
      window.removeEventListener(ROOM_MEDIA_TEARDOWN_EVENT, stop)
      window.removeEventListener('pagehide', stop)
      void session.dispose()
    }
  }, [socket, roomId, streamPush])
  const running = snapshot.state === 'sharing' || snapshot.state === 'paused'
  const busy = ['requesting-permission', 'starting', 'stopping'].includes(snapshot.state)
  const selectedAudio = { systemAudio: !!capability?.systemAudio && audioOptions.systemAudio, microphone: !!capability?.microphone && audioOptions.microphone }
  const changeAudio = (key: 'systemAudio' | 'microphone', enabled: boolean) => {
    const next = { ...selectedAudio, [key]: enabled }
    setAudioOptions(next)
    if (running) void controller?.setAudioOptions(next)
  }
  const systemAudioHint = !capability?.systemAudio ? '当前设备暂不支持' : snapshot.state === 'paused' ? '声音已暂停发送' : running ? snapshot.settings?.systemAudio ? '正在共享设备播放的声音' : '设备声音未发送' : '一起听到设备播放的声音'
  const microphoneHint = !capability?.microphone ? '当前设备暂不支持' : snapshot.settings?.microphoneSuppressionReason === 'admin-muted' ? '管理员已关闭你的麦克风' : snapshot.settings?.microphoneSuppressed ? '麦克风由房间语音发送' : snapshot.state === 'paused' ? '声音已暂停发送' : running ? snapshot.settings?.microphone ? '正在共享你的声音' : '麦克风声音未发送' : '将你的声音加入共享'
  return <section className="mobile-screen-share-host" aria-label="房主屏幕共享" data-state={snapshot.state}>
    <header className="mobile-screen-share-heading">
      <AppIcon />
      <div><h2>屏幕共享</h2><p>把正在看的内容分享给房间</p></div>
    </header>
    {streamPush ? <div className="mobile-screen-share-message"><MonitorUp size={22} aria-hidden="true" /><p>当前房间使用 OBS 推流，请在电脑推流软件中开始。</p></div> : <>
      <div className="mobile-screen-share-status" role="status" aria-live="polite">
        <span className="mobile-screen-share-symbol" aria-hidden="true">{snapshot.state === 'paused' ? <Pause size={24} /> : <MonitorUp size={24} />}</span>
        <div className="mobile-screen-share-status-copy"><strong>{labels[snapshot.state]}</strong><span>{running || busy ? transportLabels[snapshot.transport] : '开始后，房间观众就能看到你的屏幕'}</span></div>
        <span className="mobile-screen-share-viewers"><Users size={16} aria-hidden="true" /><span><strong>{snapshot.viewers}</strong> 位观众</span></span>
      </div>
      {!!snapshot.settings?.width && !!snapshot.settings?.height && <p className="mobile-screen-share-quality">实际采集 {snapshot.settings.width} × {snapshot.settings.height}{snapshot.settings.frameRateMeasured || snapshot.settings.frameRate > 0 ? <> · 采集实测 {snapshot.settings.frameRate} fps</> : <> · 尚无实测帧率</>}</p>}
      {capability && !capability.video && <p className="mobile-screen-share-message" role="status">{capability.reason}</p>}
      <div className="mobile-screen-share-video-options">
        <label>分辨率<select aria-label="共享分辨率" value={videoOptions.resolution} disabled={running || busy || !capability?.video} onChange={event => setVideoOptions({ ...videoOptions, resolution: event.target.value as ScreenShareVideoOptions['resolution'] })}>{screenShareResolutions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label>目标帧率<select aria-label="共享帧率" value={videoOptions.frameRate} disabled={running || busy || !capability?.video} onChange={event => setVideoOptions({ ...videoOptions, frameRate: Number(event.target.value) as ScreenShareVideoOptions['frameRate'] })}>{screenShareFrameRates.map(rate => <option key={rate} value={rate} disabled={!!capability?.maxFrameRate && rate > capability.maxFrameRate}>{rate} fps{capability?.maxFrameRate && rate > capability.maxFrameRate ? '（系统不支持）' : ''}</option>)}</select></label>
      </div>
      <p className="mobile-screen-share-quality-hint">{running ? '停止共享后可更改画质。' : '按屏幕比例缩放，不放大原始画面。'}实际画质和帧率受设备性能、屏幕刷新率与网络影响。</p>
      {capability?.maxFrameRate && <p className="mobile-screen-share-quality-hint">系统录屏接口最高 {capability.maxFrameRate} fps；当前 ArkWeb 能否达到该帧率，以采集实测为准。</p>}
      <div className="mobile-screen-share-options">
        <label className="mobile-screen-share-audio-option" data-unavailable={!capability?.systemAudio}>
          <Volume2 size={20} aria-hidden="true" /><span><strong>系统音频</strong><small>{systemAudioHint}</small></span>
          <input type="checkbox" role="switch" aria-label="共享系统音频" checked={selectedAudio.systemAudio} disabled={!capability?.systemAudio || busy} onChange={event => changeAudio('systemAudio', event.target.checked)} />
        </label>
        <label className="mobile-screen-share-audio-option" data-unavailable={!capability?.microphone}>
          <Mic size={20} aria-hidden="true" /><span><strong>麦克风</strong><small>{microphoneHint}</small></span>
          <input type="checkbox" role="switch" aria-label="共享麦克风" checked={selectedAudio.microphone} disabled={!capability?.microphone || busy} onChange={event => changeAudio('microphone', event.target.checked)} />
        </label>
      </div>
      {snapshot.state === 'paused' && <p className="mobile-screen-share-message">画面和声音已暂停发送。停止共享后，系统采集才会结束。</p>}
      {!running && <p className="mobile-screen-share-privacy"><ShieldCheck size={16} aria-hidden="true" /><span>开始后需在系统弹窗中授权，请注意隐藏屏幕上的个人信息。</span></p>}
      <div className="mobile-screen-share-actions">
        {!running && !busy && <button className="primary-button" disabled={!capability?.video || !socket?.connected || !controller} onClick={() => { void controller?.start({ ...selectedAudio, ...videoOptions }) }}><MonitorUp size={18} />开始共享</button>}
        {running && <button className="mobile-text-button" onClick={() => { void controller?.pause(snapshot.state === 'sharing') }}>{snapshot.state === 'sharing' ? <Pause size={18} /> : <Play size={18} />}{snapshot.state === 'sharing' ? '暂停' : '恢复'}</button>}
        {(running || busy) && <button className="mobile-text-button" disabled={snapshot.state === 'stopping'} onClick={() => { void controller?.stop() }}><Square size={18} />{snapshot.state === 'requesting-permission' ? '取消共享' : '停止共享'}</button>}
      </div>
      <details className="mobile-screen-share-help">
        <summary><Info size={15} aria-hidden="true" />共享说明<ChevronDown size={16} aria-hidden="true" /></summary>
        <div>
          <p>最多支持 4 位观众同时观看。</p>
          {capability?.video && !capability.background && <p>当前设备需保持应用在前台，退到后台会停止共享。</p>}
          <p>系统音频可共享允许录制的媒体声音；部分应用可能限制声音采集。</p>
          <p>房间语音使用麦克风时，共享会自动让出麦克风，避免重复发送你的声音。</p>
          {capability?.experimental && <p>屏幕共享功能仍在测试中。</p>}
        </div>
      </details>
    </>}
    {snapshot.error && <p className="mobile-screen-share-error" role="alert">{snapshot.error}</p>}
  </section>
}
