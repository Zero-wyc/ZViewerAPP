import type { ScreenShareAudioOptions, ScreenShareEvent, ScreenShareNativePort, ScreenShareSettings } from './contracts'
import { getHarmonyBridge } from './runtime'
import { microphoneCapture } from './microphoneCapture'
import type { MicrophoneLease } from './microphoneCapture'
import { screenShareVideoConstraints, screenShareVideoOptions } from './screenShareQuality'
import { createScreenShareFrameMeter } from './screenShareFrameMeter'

/** ArkWeb's native ScreenCaptureHandler supplies the actual display stream; no frame injection. */
export function createHarmonyScreenShare(): ScreenShareNativePort {
  let sessionId: string | undefined
  let stream: MediaStream | undefined
  let config: RTCConfiguration = {}
  let timer: ReturnType<typeof setInterval> | undefined
  let cancelStart: (() => void) | undefined
  let abort: AbortController | undefined
  let microphone: MicrophoneLease | undefined
  let audioContext: AudioContext | undefined
  let audioOutput: MediaStreamAudioDestinationNode | undefined
  let systemInput: MediaStreamAudioSourceNode | undefined
  let microphoneInput: MediaStreamAudioSourceNode | undefined
  let systemGain: GainNode | undefined
  let microphoneGain: GainNode | undefined
  let audioOptions: ScreenShareAudioOptions = { systemAudio: false, microphone: false }
  let paused = false
  let targetFrameRate = 30
  let frameMeter: ReturnType<typeof createScreenShareFrameMeter>
  let audioQueue = Promise.resolve()
  const peers = new Map<string, { pc: RTCPeerConnection; ice: RTCIceCandidateInit[] }>()
  const emit = (event: ScreenShareEvent) => window.dispatchEvent(new CustomEvent('zviewer:screen-share', { detail: event }))
  const settings = (): ScreenShareSettings => {
    const value = stream?.getVideoTracks()[0]?.getSettings()
    const measuredRate = frameMeter?.sample()
    // getSettings.frameRate is the configured track rate, not a measured frame rate.
    const systemAudio = !paused && audioOptions.systemAudio && !!stream?.getAudioTracks().some(t => t.readyState === 'live')
    const microphoneSuppressed = audioOptions.microphone && !microphoneCapture.getSnapshot().shareMicrophoneAllowed
    const mic = !paused && audioOptions.microphone && !!microphone?.stream.getAudioTracks().some(t => t.readyState === 'live') && !microphoneSuppressed
    return { width: value?.width || 0, height: value?.height || 0, frameRate: measuredRate ?? 0, frameRateMeasured: measuredRate !== undefined, targetFrameRate, configuredFrameRate: value?.frameRate || 0, audio: systemAudio || mic, systemAudio, microphone: mic, microphoneSuppressed,
      ...(microphoneSuppressed ? { microphoneSuppressionReason: microphoneCapture.getSnapshot().adminMuted ? 'admin-muted' as const : 'voice' as const } : {}) }
  }
  const applyAudio = () => {
    if (systemGain) systemGain.gain.value = !paused && audioOptions.systemAudio ? 1 : 0
    if (microphoneGain) microphoneGain.gain.value = !paused && audioOptions.microphone ? 1 : 0
    microphone?.setEnabled(!paused && audioOptions.microphone)
    stream?.getAudioTracks().forEach(track => { track.enabled = !paused && audioOptions.systemAudio })
    microphoneCapture.setScreenShareState({ active: !!sessionId, systemAudio: !paused && audioOptions.systemAudio })
  }
  microphoneCapture.subscribe(() => {
    if (sessionId && stream) emit({ sessionId, type: 'stats', settings: settings() })
  })
  const releaseStream = (value?: MediaStream) => value?.getTracks().forEach(track => { try { track.stop() } catch {} })
  const check = (id: string) => {
    if (id !== sessionId || !stream || stream.getVideoTracks()[0]?.readyState !== 'live') throw Object.assign(new Error('共享会话已结束'), { code: 'cancelled' })
  }
  const stop = async ({ sessionId: id }: { sessionId: string }) => {
    if (sessionId !== id) { await getHarmonyBridge()?.cancelScreenShareCapture?.({ sessionId: id }); return }
    sessionId = undefined
    cancelStart?.(); cancelStart = undefined
    abort?.abort(); abort = undefined
    clearInterval(timer)
    frameMeter?.stop(); frameMeter = undefined
    microphoneInput?.disconnect(); microphoneInput = undefined
    microphone?.release(); microphone = undefined
    systemInput?.disconnect(); systemInput = undefined
    audioOutput?.stream.getTracks().forEach(track => track.stop()); audioOutput = undefined
    const context = audioContext; audioContext = undefined
    systemGain = undefined; microphoneGain = undefined
    audioOptions = { systemAudio: false, microphone: false }; paused = false
    microphoneCapture.setScreenShareState({ active: false, systemAudio: false })
    void context?.close().catch(() => {})
    releaseStream(stream); stream = undefined
    for (const peer of peers.values()) {
      peer.pc.onicecandidate = null; peer.pc.onconnectionstatechange = null
      try { peer.pc.close() } catch {}
    }
    peers.clear(); config = {}
    await getHarmonyBridge()?.cancelScreenShareCapture?.({ sessionId: id })
  }
  const setAudioOptions = (options: ScreenShareAudioOptions & { sessionId: string }): Promise<ScreenShareSettings> => {
    const operation = audioQueue.then(async () => {
      const id = options.sessionId
      check(id)
      if (options.systemAudio && !stream!.getAudioTracks().some(t => t.readyState === 'live')) throw new Error('系统没有提供音频轨，请停止共享后重新授权系统声音。')
      if (options.microphone && !microphone) {
        const lease = await microphoneCapture.acquire({ consumer: 'screen-share', signal: abort?.signal, enabled: !paused,
          onEnded: () => {
            if (id !== sessionId) return
            microphoneInput?.disconnect(); microphoneInput = undefined
            microphone = undefined
            audioOptions = { ...audioOptions, microphone: false }
            applyAudio()
            emit({ sessionId: id, type: 'stats', settings: settings() })
          },
        })
        if (id !== sessionId || !audioContext || !microphoneGain) { lease.release(); throw Object.assign(new Error('共享已取消'), { code: 'cancelled' }) }
        microphone = lease
        microphoneInput = audioContext.createMediaStreamSource(lease.stream)
        microphoneInput.connect(microphoneGain)
      } else if (!options.microphone && microphone) {
        microphoneInput?.disconnect(); microphoneInput = undefined
        microphone.release(); microphone = undefined
      }
      audioOptions = { systemAudio: options.systemAudio, microphone: options.microphone }
      applyAudio()
      await audioContext?.resume()
      check(id)
      return settings()
    })
    audioQueue = operation.then(() => {}, () => {})
    return operation
  }
  window.addEventListener('zviewer:screen-capture-stop', () => {
    const id = sessionId
    if (id) void stop({ sessionId: id }).finally(() => emit({ sessionId: id, type: 'capture-ended', code: 'capture-ended' }))
  })
  return {
    async getCapabilities() {
      const supported = (await getHarmonyBridge()?.getScreenShareCaptureSupport?.())?.supported === true && typeof navigator.mediaDevices?.getDisplayMedia === 'function'
      return { video: supported, microphone: supported, systemAudio: supported, background: supported, maxFrameRate: 60, experimental: false, reason: supported ? undefined : '此安装包或系统未开放原生屏幕共享' }
    },
    async start(options) {
      if (sessionId) throw Object.assign(new Error('已有共享会话'), { code: 'capture-start-failed' })
      const id = options.sessionId
      sessionId = id
      abort = new AbortController()
      config = { iceServers: options.iceServers }
      let timeout: ReturnType<typeof setTimeout> | undefined
      try {
        await getHarmonyBridge()?.armScreenShareCapture?.({ sessionId: id })
        if (sessionId !== id) throw Object.assign(new Error('共享已取消'), { code: 'cancelled' })
        const quality = screenShareVideoOptions(options)
        // The system AVScreenCapture API documents 60 FPS as its maximum. ArkWeb may deliver less.
        if (quality.frameRate > 60) quality.frameRate = 60
        targetFrameRate = quality.frameRate
        const display = typeof screen === 'undefined' ? { width: 0, height: 0 } : screen
        const ratio = typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1
        const acquiring = navigator.mediaDevices.getDisplayMedia({ video: screenShareVideoConstraints(quality, Math.round(display.width * ratio), Math.round(display.height * ratio)), audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
        void acquiring.then(value => { if (sessionId !== id) releaseStream(value) }, () => {})
        const cancelled = new Promise<never>((_, reject) => {
          cancelStart = () => reject(Object.assign(new Error('共享已取消'), { code: 'cancelled' }))
          timeout = setTimeout(() => reject(Object.assign(new Error('系统未返回屏幕流，请停止后重试'), { code: 'capture-start-failed' })), 45000)
        })
        const value = await Promise.race([acquiring, cancelled])
        if (sessionId !== id) { releaseStream(value); throw Object.assign(new Error('共享已取消'), { code: 'cancelled' }) }
        stream = value
        const video = value.getVideoTracks()[0]
        if (!video || video.readyState !== 'live') throw new Error('屏幕采集未启动')
        frameMeter = createScreenShareFrameMeter(video)
        video.addEventListener('ended', () => {
          if (id !== sessionId) return
          void stop({ sessionId: id }).finally(() => emit({ sessionId: id, type: 'capture-ended', code: 'capture-ended' }))
        }, { once: true })
        audioContext = new AudioContext({ sampleRate: 48000 })
        audioOutput = audioContext.createMediaStreamDestination()
        systemGain = audioContext.createGain(); systemGain.gain.value = 0; systemGain.connect(audioOutput)
        microphoneGain = audioContext.createGain(); microphoneGain.gain.value = 0; microphoneGain.connect(audioOutput)
        if (value.getAudioTracks().length) {
          systemInput = audioContext.createMediaStreamSource(new MediaStream(value.getAudioTracks()))
          systemInput.connect(systemGain)
        }
        await setAudioOptions({ sessionId: id, systemAudio: options.systemAudio ?? false, microphone: options.microphone ?? false })
        check(id)
        await getHarmonyBridge()?.screenShareCaptureStarted?.({ sessionId: id })
        check(id)
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
    setAudioOptions,
    async pause({ sessionId: id }) { check(id); paused = true; stream!.getVideoTracks().forEach(track => { track.enabled = false }); applyAudio() },
    async resume({ sessionId: id }) { check(id); paused = false; stream!.getVideoTracks().forEach(track => { track.enabled = true }); applyAudio(); await audioContext?.resume() },
    async createOffer({ sessionId: id, peerId }) {
      check(id)
      peers.get(peerId)?.pc.close()
      const pc = new RTCPeerConnection(config), peer = { pc, ice: [] as RTCIceCandidateInit[] }
      peers.set(peerId, peer)
      const outgoing = new MediaStream([...stream!.getVideoTracks(), ...(audioOutput?.stream.getAudioTracks() ?? [])])
      for (const track of outgoing.getTracks()) pc.addTrack(track, outgoing)
      const codecs = typeof RTCRtpSender !== 'undefined' ? RTCRtpSender.getCapabilities?.('video')?.codecs : undefined
      if (codecs) {
        const preferred = [...codecs].sort((a, b) => Number(!/h264/i.test(a.mimeType)) - Number(!/h264/i.test(b.mimeType)))
        for (const transceiver of pc.getTransceivers()) if (transceiver.sender.track?.kind === 'video') transceiver.setCodecPreferences?.(preferred)
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
