// Inject with CDP into the installed debug app BEFORE its entry point executes.
// Two real peer connections on the same emulator provide changing decoded frames.
(() => {
  const NativePC = window.RTCPeerConnection
  const sourceCanvas = document.createElement('canvas')
  sourceCanvas.width = 640; sourceCanvas.height = 360
  const ctx = sourceCanvas.getContext('2d')
  let frame = 0
  setInterval(() => {
    frame++
    ctx.fillStyle = frame % 20 < 10 ? '#087acc' : '#bc3275'
    ctx.fillRect(0, 0, 640, 360)
    ctx.fillStyle = '#fff'; ctx.font = '40px sans-serif'
    ctx.fillText(`Native WebRTC ${frame}`, 60, 180)
  }, 50)
  window.__nativeFixture = { frames: () => frame, errors: [] }
  window.RTCPeerConnection = class extends NativePC {
    constructor() {
      super({ iceServers: [] })
      const receiver = this, sender = new NativePC({ iceServers: [] })
      const source = sourceCanvas.captureStream(20)
      source.getTracks().forEach(track => sender.addTrack(track, source))
      sender.onicecandidate = e => { if (e.candidate) receiver.addIceCandidate(e.candidate).catch(() => {}) }
      receiver.onicecandidate = e => { if (e.candidate) sender.addIceCandidate(e.candidate).catch(() => {}) }
      queueMicrotask(async () => {
        try {
          await sender.setLocalDescription(await sender.createOffer())
          await receiver.setRemoteDescription(sender.localDescription)
          await receiver.setLocalDescription(await receiver.createAnswer())
          await sender.setRemoteDescription(receiver.localDescription)
        } catch (error) { window.__nativeFixture.errors.push(String(error)) }
      })
    }
  }
})()
