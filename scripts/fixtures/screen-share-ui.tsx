// Browser-only fixture: real local WebRTC video; room and native bridges are test doubles.
import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import MobileRoom from '../../src/mobile/MobileRoom'
import { MobileAppearance } from '../../src/mobile/MobileAppearance'
import { useRoomStore } from '../../src/upstream/store/roomStore'
import { useThemeStore } from '../../src/upstream/store/themeStore'
import { message } from '../../src/upstream/components/ui/message'
import { PlayerControlBar } from '../../src/upstream/modules/room/watch-together/PlayerControlBar'
import '../../src/upstream/index.css'
import '../../src/styles.css'
import '../../src/mobile/mobile.css'
import '../../src/mobile/appearance.css'

const fixture = window as any
fixture.theme = (dark: boolean) => useThemeStore.setState({ mode: dark ? 'dark' : 'light', isDark: dark, glassStrength: .2, glassBlur: 32 })
fixture.toast = (type: keyof typeof message, text: string) => (message[type] as any)(text, { duration: 60000 })
fixture.teardown = () => window.dispatchEvent(new CustomEvent('zviewer:room-media-teardown', { detail: { full: true } }))
useRoomStore.setState({ mode: 'screen-share', shareMethod: 'webrtc', roomName: '投屏测试房间', roomId: 'fixture', viewers: [] })
fixture.theme(false)

const canvas = document.createElement('canvas')
canvas.width = 640; canvas.height = 360
const ctx = canvas.getContext('2d')!
let frame = 0
setInterval(() => {
  frame++
  ctx.fillStyle = frame % 20 < 10 ? '#087acc' : '#bc3275'
  ctx.fillRect(0, 0, 640, 360)
  ctx.fillStyle = '#ffffff'; ctx.font = '40px sans-serif'
  ctx.fillText(`WebRTC ${frame}`, 80, 180)
}, 50)
const source = canvas.captureStream(20)
const NativePC = RTCPeerConnection
fixture.RTCPeerConnection = class extends NativePC {
  constructor() {
    super({ iceServers: [] })
    const receiver = this, sender = new NativePC({ iceServers: [] })
    source.getTracks().forEach(track => sender.addTrack(track, source))
    sender.onicecandidate = e => { if (e.candidate) void receiver.addIceCandidate(e.candidate).catch(() => {}) }
    receiver.onicecandidate = e => { if (e.candidate) void sender.addIceCandidate(e.candidate).catch(() => {}) }
    queueMicrotask(async () => {
      await sender.setLocalDescription(await sender.createOffer())
      await receiver.setRemoteDescription(sender.localDescription!)
      await receiver.setLocalDescription(await receiver.createAnswer())
      await sender.setRemoteDescription(receiver.localDescription!)
    })
  }
}
const root = createRoot(document.getElementById('root')!)
fixture.unmount = () => root.unmount()
function MenuFixture() {
  const video = useRef<HTMLVideoElement>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [visible, setVisible] = useState(true)
  fixture.hideControls = () => setVisible(false)
  fixture.showControls = () => setVisible(true)
  useEffect(() => { if (video.current) { video.current.srcObject = source; void video.current.play() } }, [])
  return <main className="mobile-room"><header className="mobile-room-header">一起看菜单测试</header>
    <div className="mobile-player"><div className={`zart-stage ${fullscreen ? 'zart-web-fullscreen' : ''}`}>
      <video ref={video} muted autoPlay playsInline className="h-full w-full" />
      <PlayerControlBar isHost videoRef={video} watchTogether={{ duration: 300, currentTime: 0 } as any}
        isPlaying isWebFullscreen={fullscreen} onToggleWebFullscreen={() => setFullscreen(v => !v)}
        danmakuEnabled onToggleDanmaku={() => {}} onSendDanmaku={() => {}} onSync={() => {}} onReload={() => {}}
        settingsOpen={false} onToggleSettings={() => {}} controlBarVisible={visible} />
    </div></div><section className="mobile-room-details">菜单应向下展开，并保持“更多”按钮可见。</section>
  </main>
}
root.render(<HashRouter><MobileAppearance global room>{location.search.includes('menu') ? <MenuFixture /> : <MobileRoom roomId="fixture" onLeave={() => root.unmount()} />}</MobileAppearance></HashRouter>)
