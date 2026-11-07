import type { ScreenShareAudioOptions, ScreenShareEvent, ScreenShareNativePort, ScreenShareSettings, ScreenSharePeer } from './contracts'
import { getHarmonyBridge } from './runtime'
import { microphoneCapture } from './microphoneCapture'
import type { MicrophoneLease } from './microphoneCapture'
import { screenShareVideoOptions } from './screenShareQuality'
import { createScreenShareFrameMeter } from './screenShareFrameMeter'
import { createScreenShareVideoTransform, screenShareVideoTransformSupported } from './screenShareVideoTransform'

/** ArkWeb's native ScreenCaptureHandler supplies the actual display stream; no frame injection. */
export function createHarmonyScreenShare(): ScreenShareNativePort {
  let sessionId: string | undefined
  let stream: MediaStream | undefined
  let sendingVideo: MediaStreamTrack | undefined
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
  let stopResize: (() => void) | undefined
  let audioQueue = Promise.resolve()
  let transform: ReturnType<typeof createScreenShareVideoTransform> | undefined
  const peers = new Map<string, { pc: RTCPeerConnection; ice: RTCIceCandidateInit[]; ref: ScreenSharePeer }>()
  const peerFor = (ref: ScreenSharePeer) => {
    const peer = peers.get(ref.connectionId)
    return sessionId === ref.sessionId && peer?.ref.remotePeerId === ref.remotePeerId && peer.ref.revision === ref.revision ? peer : undefined
  }
  const setSending = async () => {
    for (const peer of peers.values()) for (const transceiver of peer.pc.getTransceivers()) {
      const track = transceiver.receiver.track.kind === 'video' ? sendingVideo : audioOutput?.stream.getAudioTracks()[0]
      await transceiver.sender.replaceTrack(paused ? null : track ?? null).catch(() => {})
    }
  }
  const emit = (event: ScreenShareEvent) => window.dispatchEvent(new CustomEvent('zviewer:screen-share', { detail: event }))
  const settings = (): ScreenShareSettings => {
    const value = sendingVideo?.getSettings()
    const measuredRate = frameMeter?.sample()
    const measuredSize = frameMeter?.dimensions()
    const configuredFrameRate = Number.isFinite(value?.frameRate) ? Math.max(0, value!.frameRate!) : 0
    // getSettings.frameRate is the configured track rate, not a measured frame rate.
    const systemAudio = !paused && audioOptions.systemAudio && !!stream?.getAudioTracks().some(t => t.readyState === 'live')
    const microphoneSuppressed = audioOptions.microphone && !microphoneCapture.getSnapshot().shareMicrophoneAllowed
    const mic = !paused && audioOptions.microphone && !!microphone?.stream.getAudioTracks().some(t => t.readyState === 'live') && !microphoneSuppressed
    return { width: measuredSize?.width || value?.width || 0, height: measuredSize?.height || value?.height || 0, frameRate: measuredRate ?? 0, frameRateMeasured: measuredRate !== undefined, targetFrameRate, configuredFrameRate, audio: systemAudio || mic, systemAudio, microphone: mic, microphoneSuppressed,
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
    stopResize?.(); stopResize = undefined; transform = undefined
    sendingVideo = undefined
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
      const supported = (await getHarmonyBridge()?.getScreenShareCaptureSupport?.())?.supported === true && typeof navigator.mediaDevices?.getDisplayMedia === 'function' && screenShareVideoTransformSupported()
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
        // Size constraints only scale ArkWeb's fixed initial capture canvas.
        // Keep native pixels for both orientations; bound the outgoing frames below.
        const captureVideo: MediaTrackConstraints & { resizeMode: 'none' } = { frameRate: { ideal: targetFrameRate, max: targetFrameRate }, resizeMode: 'none' }
        const acquiring = navigator.mediaDevices.getDisplayMedia({ video: captureVideo, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
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
        const transformed = createScreenShareVideoTransform(video, { quality, width: Math.round(display.width * ratio), height: Math.round(display.height * ratio),
          current: () => id === sessionId && stream === value,
          applied: () => emit({ sessionId: id, type: 'stats', settings: settings() }),
          failed: () => {
            if (id === sessionId) void stop({ sessionId: id }).finally(() => emit({ sessionId: id, type: 'capture-ended', code: 'capture-ended' }))
          },
        })
        transform = transformed
        sendingVideo = transformed.track
        let nativeDisplaySize = false
        const nativeResize = (event: Event) => {
          const detail = (event as CustomEvent<{ sessionId: string; width: number; height: number }>).detail
          if (!detail || detail.sessionId !== id || !Number.isFinite(detail.width) || !Number.isFinite(detail.height) || detail.width <= 0 || detail.height <= 0) return
          nativeDisplaySize = true
          transformed.resize(detail.width, detail.height)
        }
        const windowResize = () => {
          // Once native display observation is active it remains authoritative
          // while another app is foreground; this WebView can keep its old size.
          if (!nativeDisplaySize) transformed.resize(Math.round(screen.width * ratio), Math.round(screen.height * ratio))
        }
        window.addEventListener('zviewer:screen-capture-resize', nativeResize)
        window.addEventListener('resize', windowResize)
        stopResize = () => {
          transformed.stop()
          window.removeEventListener('zviewer:screen-capture-resize', nativeResize)
          window.removeEventListener('resize', windowResize)
        }
        frameMeter = createScreenShareFrameMeter(sendingVideo)
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
    async setVideoOptions(options) {
      check(options.sessionId)
      const quality = screenShareVideoOptions(options)
      quality.frameRate = Math.min(60, quality.frameRate)
      await stream!.getVideoTracks()[0].applyConstraints({ frameRate: { ideal: quality.frameRate, max: quality.frameRate } })
      check(options.sessionId)
      targetFrameRate = quality.frameRate
      transform?.setQuality(quality)
      for (const peer of peers.values()) for (const sender of peer.pc.getSenders()) {
        if (sender.track?.kind !== 'video') continue
        const params = sender.getParameters()
        if (!params.encodings?.length) continue
        params.encodings.forEach(encoding => { encoding.maxFramerate = quality.frameRate; delete encoding.maxBitrate })
        await sender.setParameters(params)
      }
      return settings()
    },
    async getConnectionStats(ref) {
      const peer = peerFor(ref)
      if (!peer) throw new Error('媒体连接已失效')
      const stats = await peer.pc.getStats()
      if (peerFor(ref) !== peer) throw new Error('媒体连接已失效')
      const reports: Record<string, string | number | boolean>[] = []
      const fields = ['id', 'type', 'kind', 'mediaType', 'timestamp', 'bytesSent', 'bytesReceived', 'framesEncoded', 'framesDecoded', 'packetsSent', 'packetsReceived', 'packetsLost', 'roundTripTime', 'currentRoundTripTime', 'jitter', 'qualityLimitationReason', 'totalEncodeTime', 'mediaSourceId', 'frames', 'frameWidth', 'frameHeight', 'codecId', 'mimeType', 'selected', 'nominated', 'state']
      stats.forEach(value => {
        if (!['outbound-rtp', 'remote-inbound-rtp', 'inbound-rtp', 'media-source', 'candidate-pair', 'codec'].includes(value.type)) return
        const row: Record<string, string | number | boolean> = {}
        for (const key of fields) if (['number', 'string', 'boolean'].includes(typeof value[key])) row[key] = value[key]
        reports.push(row)
      })
      return { connectionId: ref.connectionId, timestamp: Date.now(), reports }
    },
    async pause({ sessionId: id }) { check(id); paused = true; if (sendingVideo) sendingVideo.enabled = false; stream!.getVideoTracks().forEach(track => { track.enabled = false }); applyAudio(); await setSending() },
    async resume({ sessionId: id }) { check(id); paused = false; if (sendingVideo) sendingVideo.enabled = true; stream!.getVideoTracks().forEach(track => { track.enabled = true }); applyAudio(); await setSending(); await audioContext?.resume() },
    async createOffer(ref) {
      const { sessionId: id, connectionId } = ref
      check(id)
      peers.get(connectionId)?.pc.close()
      if (!peers.has(connectionId) && peers.size >= 3) throw new Error('当前设备发送连接已达上限')
      const pc = new RTCPeerConnection(ref.iceServers ? { iceServers: ref.iceServers } : config), peer = { pc, ice: [] as RTCIceCandidateInit[], ref }
      peers.set(connectionId, peer)
      const outgoing = new MediaStream([sendingVideo!, ...(audioOutput?.stream.getAudioTracks() ?? [])])
      for (const track of outgoing.getTracks()) pc.addTrack(track, outgoing)
      if (paused) for (const sender of pc.getSenders()) await sender.replaceTrack(null)
      const codecs = typeof RTCRtpSender !== 'undefined' ? RTCRtpSender.getCapabilities?.('video')?.codecs : undefined
      if (codecs) {
        const preferred = [...codecs].sort((a, b) => Number(!/h264/i.test(a.mimeType)) - Number(!/h264/i.test(b.mimeType)))
        for (const transceiver of pc.getTransceivers()) if (transceiver.sender.track?.kind === 'video') transceiver.setCodecPreferences?.(preferred)
      }
      pc.onicecandidate = event => { if (peerFor(ref) === peer && event.candidate) emit({ ...ref, type: 'ice', candidate: event.candidate.toJSON() }) }
      pc.onconnectionstatechange = () => { if (peerFor(ref) === peer) emit({ ...ref, type: 'peer-state', connectionState: pc.connectionState }) }
      const offer = await pc.createOffer()
      if (peerFor(ref) !== peer) throw Object.assign(new Error('会话已结束'), { code: 'cancelled' })
      await pc.setLocalDescription(offer)
      if (peerFor(ref) !== peer) throw Object.assign(new Error('会话已结束'), { code: 'cancelled' })
      return { type: 'offer', sdp: offer.sdp }
    },
    async setAnswer(ref) {
      const { description } = ref
      const peer = peerFor(ref)
      if (!peer) return
      await peer.pc.setRemoteDescription(description)
      if (peerFor(ref) !== peer) return
      for (const candidate of peer.ice.splice(0)) await peer.pc.addIceCandidate(candidate)
    },
    async addIceCandidate(ref) {
      const { candidate } = ref
      const peer = peerFor(ref)
      if (!peer) return
      if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(candidate)
      else if (peer.ice.length < 128) peer.ice.push(candidate)
    },
    async removePeer(ref) { const peer = peerFor(ref); if (peer) { peers.delete(ref.connectionId); peer.pc.onconnectionstatechange = null; peer.pc.onicecandidate = null; peer.pc.close() } },
  }
}
