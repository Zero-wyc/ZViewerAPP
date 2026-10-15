import { useEffect, useState } from 'react'
import type { Socket } from 'socket.io-client'
import { MonitorUp, Pause, Play, Square } from 'lucide-react'
import { getScreenShareNative, subscribeScreenShare } from '../platform/screenShare'
import { useScreenShareCapabilities } from './useScreenShareCapabilities'
import { createScreenShareSession } from './screenShareSession'
import type { ScreenShareSnapshot } from './screenShareSession'
import { ICE_SERVERS } from '@/modules/screen-sharing/constants'
import { ROOM_MEDIA_TEARDOWN_EVENT } from '@/lib/mediaTeardown'

const labels = { idle: '尚未开始', 'requesting-permission': '等待系统授权', starting: '正在启动采集', sharing: '正在共享', paused: '已暂停画面发送', stopping: '正在停止', stopped: '已停止', error: '共享失败' }
const transportLabels = { idle: '尚未连接', 'waiting-viewers': '等待观众', connecting: '正在连接观众', connected: '观众已连接', disconnected: '网络已断开' }

export default function MobileScreenShareHost({ socket, roomId, streamPush }: { socket: Socket | null; roomId: string; streamPush: boolean }) {
  const capability = useScreenShareCapabilities()
  const [snapshot, setSnapshot] = useState<ScreenShareSnapshot>({ state: 'idle', transport: 'idle', viewers: 0 })
  const [controller, setController] = useState<ReturnType<typeof createScreenShareSession>>()
  useEffect(() => {
    setController(undefined)
    setSnapshot({ state: 'idle', transport: 'idle', viewers: 0 })
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
  return <section className="mobile-screen-share-host" aria-label="房主屏幕共享">
    <MonitorUp size={32} aria-hidden="true" />
    <h2>共享手机屏幕</h2>
    <p role="status">{labels[snapshot.state]} · {transportLabels[snapshot.transport]} · {snapshot.viewers} 位连接观众</p>
    {streamPush ? <p>当前房间使用 OBS 推流，请在电脑推流软件中开始。手机屏幕采集仅用于 WebRTC 房间。</p> : <>
      <p>开始后需在系统窗口中授权。屏幕上的个人信息可能被房间观众看到。</p>
      {capability?.experimental && <p className="mobile-screen-share-note">原生验证版 · 尚未完成双端真机验收</p>}
      {capability && !capability.video && <p role="status">{capability.reason}</p>}
      <p>当前仅发送画面，麦克风与系统音频未开放；房间语音继续独立使用。</p>
      <p>验证版最多同时连接 4 位观众。</p>
      {capability?.video && !capability.background && <p>此平台验证版仅支持前台共享，退到后台时自动停止。</p>}
      {snapshot.settings && <p>采集画面 {snapshot.settings.width} × {snapshot.settings.height} · {snapshot.settings.frameRate > 0 ? `${snapshot.settings.frameRate} fps（实测）` : '帧率待测'}</p>}
      {snapshot.state === 'paused' && <p>已暂停向观众发送画面；系统采集仍运行，结束采集请点停止。</p>}
      <div className="mobile-screen-share-actions">
        {!running && !busy && <button className="primary-button" disabled={!capability?.video || !socket?.connected || !controller} onClick={() => { void controller?.start() }}><MonitorUp size={18} />开始共享</button>}
        {running && <button className="mobile-text-button" onClick={() => { void controller?.pause(snapshot.state === 'sharing') }}>{snapshot.state === 'sharing' ? <Pause size={18} /> : <Play size={18} />}{snapshot.state === 'sharing' ? '暂停' : '恢复'}</button>}
        {(running || busy) && <button className="mobile-text-button" disabled={snapshot.state === 'stopping'} onClick={() => { void controller?.stop() }}><Square size={18} />{snapshot.state === 'requesting-permission' ? '取消共享' : '停止共享'}</button>}
      </div>
    </>}
    {snapshot.error && <p role="alert">{snapshot.error}</p>}
  </section>
}
