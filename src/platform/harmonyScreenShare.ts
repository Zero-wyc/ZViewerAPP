import type { ScreenShareEvent, ScreenShareNativePort, ScreenShareSettings } from './contracts'
import { getHarmonyBridge } from './runtime'

/** ArkWeb's native ScreenCaptureHandler supplies the actual display stream; no frame injection. */
export function createHarmonyScreenShare(): ScreenShareNativePort {
  let sessionId: string | undefined
  let stream: MediaStream | undefined
  let config: RTCConfiguration = {}
  let timer: ReturnType<typeof setInterval> | undefined
  let cancelStart: (() => void) | undefined
  const peers = new Map<string, { pc: RTCPeerConnection; ice: RTCIceCandidateInit[] }>()
  const emit = (event: ScreenShareEvent) => window.dispatchEvent(new CustomEvent('zviewer:screen-share', { detail: event }))
  const settings = (): ScreenShareSettings => {
    const value = stream?.getVideoTracks()[0]?.getSettings()
    // getSettings.frameRate is the configured track rate, not a measured frame rate.
    return { width: value?.width || 0, height: value?.height || 0, frameRate: 0, audio: false }
  }
  const releaseStream = (value?: MediaStream) => value?.getTracks().forEach(track => { try { track.stop() } catch {} })
  const check = (id: string) => {
    if (id !== sessionId || !stream) throw Object.assign(new Error('共享会话已结束'), { code: 'cancelled' })
  }
  const stop = async ({ sessionId: id }: { sessionId: string }) => {
    if (sessionId !== id) return
    sessionId = undefined
    cancelStart?.(); cancelStart = undefined
    clearInterval(timer)
    releaseStream(stream); stream = undefined
    for (const peer of peers.values()) {
      peer.pc.onicecandidate = null; peer.pc.onconnectionstatechange = null
      try { peer.pc.close() } catch {}
    }
    peers.clear(); config = {}
    await getHarmonyBridge()?.cancelScreenShareCapture?.({ sessionId: id })
  }
  window.addEventListener('zviewer:screen-capture-stop', () => {
    const id = sessionId
    if (id) void stop({ sessionId: id }).finally(() => emit({ sessionId: id, type: 'capture-ended', code: 'capture-ended' }))
  })
  return {
    async getCapabilities() {
      const supported = (await getHarmonyBridge()?.getScreenShareCaptureSupport?.())?.supported === true && typeof navigator.mediaDevices?.getDisplayMedia === 'function'
      return { video: supported, microphone: false, systemAudio: false, background: false, experimental: true, reason: supported ? 'ArkWeb 原生采集验证版，仅支持前台画面共享' : '此安装包或系统未开放原生屏幕共享' }
    },
    async start(options) {
      if (sessionId) throw Object.assign(new Error('已有共享会话'), { code: 'capture-start-failed' })
      const id = options.sessionId
      sessionId = id
      config = { iceServers: options.iceServers }
      let timeout: ReturnType<typeof setTimeout> | undefined
      try {
        await getHarmonyBridge()?.armScreenShareCapture?.({ sessionId: id })
        if (sessionId !== id) throw Object.assign(new Error('共享已取消'), { code: 'cancelled' })
        const acquiring = navigator.mediaDevices.getDisplayMedia({ video: { width: { ideal: 1280, max: 1280 }, height: { ideal: 720, max: 1280 }, frameRate: { ideal: 30, max: 30 } }, audio: false })
        void acquiring.then(value => { if (sessionId !== id) releaseStream(value) }, () => {})
        const cancelled = new Promise<never>((_, reject) => {
          cancelStart = () => reject(Object.assign(new Error('共享已取消'), { code: 'cancelled' }))
          timeout = setTimeout(() => reject(Object.assign(new Error('系统未返回屏幕流，请停止后重试'), { code: 'capture-start-failed' })), 45000)
        })
        const value = await Promise.race([acquiring, cancelled])
        if (sessionId !== id) { releaseStream(value); throw Object.assign(new Error('共享已取消'), { code: 'cancelled' }) }
        stream = value
        for (const track of value.getAudioTracks()) { track.stop(); value.removeTrack(track) }
        const video = value.getVideoTracks()[0]
        if (!video || video.readyState !== 'live') throw new Error('屏幕采集未启动')
        video.addEventListener('ended', () => {
          if (id !== sessionId) return
          void stop({ sessionId: id }).finally(() => emit({ sessionId: id, type: 'capture-ended', code: 'capture-ended' }))
        }, { once: true })
        timer = setInterval(() => { if (id === sessionId) emit({ sessionId: id, type: 'stats', settings: settings() }) }, 2000)
        return settings()
      } catch (error) {
        if (id === sessionId) await stop({ sessionId: id })
        if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')) throw Object.assign(new Error('屏幕捕获未授权'), { code: 'permission-denied' })
        throw error
      } finally {
        clearTimeout(timeout)
        if (sessionId === id) cancelStart = undefined
      }
    },
    stop,
    async pause({ sessionId: id }) { check(id); stream!.getVideoTracks().forEach(track => { track.enabled = false }) },
    async resume({ sessionId: id }) { check(id); stream!.getVideoTracks().forEach(track => { track.enabled = true }) },
    async createOffer({ sessionId: id, peerId }) {
      check(id)
      peers.get(peerId)?.pc.close()
      const pc = new RTCPeerConnection(config), peer = { pc, ice: [] as RTCIceCandidateInit[] }
      peers.set(peerId, peer)
      for (const track of stream!.getTracks()) pc.addTrack(track, stream!)
      const codecs = typeof RTCRtpSender !== 'undefined' ? RTCRtpSender.getCapabilities?.('video')?.codecs : undefined
      if (codecs) {
        const preferred = [...codecs].sort((a, b) => Number(!/h264/i.test(a.mimeType)) - Number(!/h264/i.test(b.mimeType)))
        for (const transceiver of pc.getTransceivers()) transceiver.setCodecPreferences?.(preferred)
      }
      pc.onicecandidate = event => { if (id === sessionId && peers.get(peerId) === peer && event.candidate) emit({ sessionId: id, type: 'ice', peerId, candidate: event.candidate.toJSON() }) }
      pc.onconnectionstatechange = () => { if (id === sessionId && peers.get(peerId) === peer) emit({ sessionId: id, type: 'peer-state', peerId, connectionState: pc.connectionState }) }
      const offer = await pc.createOffer()
      if (id !== sessionId || peers.get(peerId) !== peer) throw Object.assign(new Error('会话已结束'), { code: 'cancelled' })
      await pc.setLocalDescription(offer)
      return { type: 'offer', sdp: offer.sdp }
    },
    async setAnswer({ sessionId: id, peerId, description }) {
      check(id)
      const peer = peers.get(peerId)
      if (!peer) return
      await peer.pc.setRemoteDescription(description)
      for (const candidate of peer.ice.splice(0)) await peer.pc.addIceCandidate(candidate)
    },
    async addIceCandidate({ sessionId: id, peerId, candidate }) {
      check(id)
      const peer = peers.get(peerId)
      if (!peer) return
      if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(candidate)
      else if (peer.ice.length < 128) peer.ice.push(candidate)
    },
    async removePeer({ sessionId: id, peerId }) { if (sessionId === id) { peers.get(peerId)?.pc.close(); peers.delete(peerId) } },
  }
}
