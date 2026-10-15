import { permissions } from './permissions'
import { coordinateRoomMicrophone, coordinateMicrophonePolicy } from './roomMicrophoneCoordination'

export type MicrophoneConsumer = 'voice' | 'screen-share'

export interface MicrophoneLease {
  /** Consumer-owned clones; never exposes the physical capture stream. */
  stream: MediaStream
  setEnabled(enabled: boolean): void
  release(): void
}

export interface MicrophonePolicy {
  voiceConnected: boolean
  voicePublishing: boolean
  adminMuted: boolean
  screenShareActive: boolean
  systemAudioSharing: boolean
  shareMicrophoneAllowed: boolean
}

interface Consumer {
  consumer: MicrophoneConsumer
  enabled: boolean
  stream: MediaStream | null
  resolve(lease: MicrophoneLease): void
  reject(error: unknown): void
  removeAbort?: () => void
  onEnded?: () => void
}

/** One recorder, independent consumer tracks, and one room-wide moderation policy. */
export function createMicrophoneCapture(
  request = () => permissions.requestMicrophoneStream({ audio: {
    echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1,
  } }),
  coordinate = coordinateRoomMicrophone,
  synchronizePolicy = coordinateMicrophonePolicy,
) {
  const consumers = new Set<Consumer>()
  const listeners = new Set<(policy: MicrophonePolicy) => void>()
  let source: MediaStream | null = null
  let removeSourceListeners: (() => void) | undefined
  let opening = false
  let scope: string | undefined
  let policy: MicrophonePolicy = {
    voiceConnected: false, voicePublishing: false, adminMuted: false,
    screenShareActive: false, systemAudioSharing: false, shareMicrophoneAllowed: true,
  }

  const apply = (consumer: Consumer) => {
    const enabled = consumer.enabled && !policy.adminMuted &&
      (consumer.consumer !== 'screen-share' || policy.shareMicrophoneAllowed)
    consumer.stream?.getAudioTracks().forEach(track => { track.enabled = enabled })
  }
  const update = (change: Partial<MicrophonePolicy>, forceNativePolicy = false) => {
    const next = { ...policy, ...change }
    next.shareMicrophoneAllowed = !next.adminMuted && !next.voicePublishing
    if (forceNativePolicy || next.adminMuted !== policy.adminMuted || next.voicePublishing !== policy.voicePublishing) {
      void synchronizePolicy({ adminMuted: next.adminMuted, voicePublishing: next.voicePublishing }).catch(() => {})
    }
    if (Object.keys(next).every(key => next[key as keyof MicrophonePolicy] === policy[key as keyof MicrophonePolicy])) return
    policy = next
    consumers.forEach(apply)
    listeners.forEach(listener => { try { listener({ ...policy }) } catch { /* A UI listener cannot interrupt microphone moderation. */ } })
  }
  const stopTracks = (stream: MediaStream) => stream.getTracks().forEach(track => { try { track.stop() } catch {} })
  const sourceIsLive = () => source?.getAudioTracks().some(track => track.readyState === 'live') === true
  const retireEndedSource = () => {
    if (!source || sourceIsLive()) return
    const ended = source
    source = null
    removeSourceListeners?.(); removeSourceListeners = undefined
    const expired = [...consumers].filter(consumer => consumer.stream)
    for (const consumer of expired) {
      consumers.delete(consumer)
      consumer.removeAbort?.()
      stopTracks(consumer.stream!)
    }
    stopTracks(ended)
    void coordinate(false).catch(() => {})
    // Notify consumers after invalidation; a later explicit acquire opens a fresh recorder.
    for (const consumer of expired) { try { consumer.onEnded?.() } catch {} }
  }
  const closeUnusedSource = () => {
    if (consumers.size || !source) return
    removeSourceListeners?.(); removeSourceListeners = undefined
    stopTracks(source)
    source = null
    // Native coordination serializes this release before a subsequent acquire.
    void coordinate(false).catch(() => {})
  }
  const release = (consumer: Consumer) => {
    if (!consumers.delete(consumer)) return
    consumer.removeAbort?.()
    if (consumer.stream) stopTracks(consumer.stream)
    else consumer.reject(new DOMException('Microphone request cancelled', 'AbortError'))
    closeUnusedSource()
  }
  const deliver = (consumer: Consumer) => {
    if (!source || !consumers.has(consumer) || consumer.stream) return
    const clones: MediaStreamTrack[] = []
    try {
      for (const track of source.getAudioTracks()) if (track.readyState === 'live') clones.push(track.clone())
      if (!clones.length) throw new DOMException('Microphone capture has ended', 'NotReadableError')
      consumer.stream = new MediaStream(clones)
      apply(consumer)
      consumer.resolve({
        stream: consumer.stream,
        setEnabled(enabled) { if (consumers.has(consumer)) { consumer.enabled = enabled; apply(consumer) } },
        release: () => release(consumer),
      })
    } catch (error) {
      clones.forEach(track => track.stop())
      consumers.delete(consumer)
      consumer.removeAbort?.()
      consumer.reject(error)
    }
  }
  const open = () => {
    retireEndedSource()
    if (source) { consumers.forEach(deliver); closeUnusedSource(); return }
    if (opening || !consumers.size) return
    opening = true
    void (async () => {
      let raw: MediaStream | null = null
      try {
        await coordinate(true)
        if (!consumers.size) { await coordinate(false); return }
        raw = await request()
        if (!consumers.size) { stopTracks(raw); raw = null; await coordinate(false); return }
        if (!raw.getAudioTracks().some(track => track.readyState !== 'ended')) {
          throw new DOMException('No live microphone track was returned', 'NotReadableError')
        }
        raw.getTracks().filter(track => track.kind !== 'audio').forEach(track => track.stop())
        source = raw
        raw = null
        const watchedTracks = source.getAudioTracks()
        watchedTracks.forEach(track => track.addEventListener?.('ended', retireEndedSource))
        removeSourceListeners = () => watchedTracks.forEach(track => track.removeEventListener?.('ended', retireEndedSource))
        consumers.forEach(deliver)
        closeUnusedSource()
      } catch (error) {
        if (raw) stopTracks(raw)
        await coordinate(false).catch(() => {})
        for (const consumer of consumers) {
          consumer.removeAbort?.()
          consumer.reject(error)
        }
        consumers.clear()
      } finally {
        opening = false
        // An acquire can arrive while a cancelled request is releasing Android's recorder.
        if (!source && consumers.size) open()
      }
    })()
  }

  return {
    acquire(options: { consumer: MicrophoneConsumer; signal?: AbortSignal; enabled?: boolean; onEnded?: () => void }): Promise<MicrophoneLease> {
      if (options.signal?.aborted) return Promise.reject(new DOMException('Microphone request cancelled', 'AbortError'))
      return new Promise((resolve, reject) => {
        const consumer: Consumer = { consumer: options.consumer, enabled: options.enabled ?? true, stream: null,
          onEnded: options.onEnded, resolve, reject }
        consumers.add(consumer)
        if (options.signal) {
          const abort = () => release(consumer)
          options.signal.addEventListener('abort', abort, { once: true })
          consumer.removeAbort = () => options.signal?.removeEventListener('abort', abort)
        }
        open()
      })
    },
    getSnapshot(): MicrophonePolicy { return { ...policy } },
    subscribe(listener: (policy: MicrophonePolicy) => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    /** Only a room/server transition clears a remembered administrator mute. */
    setRoomScope(roomScope: string | undefined) {
      if (scope === roomScope) return
      scope = roomScope
      update({ voiceConnected: false, voicePublishing: false, adminMuted: false }, true)
    },
    setVoiceState(state: { joined: boolean; publishing: boolean; adminMuted?: boolean }) {
      update({ voiceConnected: state.joined, voicePublishing: state.joined && state.publishing,
        ...(state.adminMuted === undefined ? {} : { adminMuted: state.adminMuted }) })
    },
    setScreenShareState(state: { active: boolean; systemAudio: boolean }) {
      update({ screenShareActive: state.active, systemAudioSharing: state.active && state.systemAudio })
    },
  }
}

export const microphoneCapture = createMicrophoneCapture()
