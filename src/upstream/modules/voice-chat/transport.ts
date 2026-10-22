export type VoiceTransport = 'udp' | 'tcp'

/** Selected ICE pair, never a server configuration or an arbitrary nominated pair. */
export async function detectVoiceTransport(pc?: RTCPeerConnection): Promise<VoiceTransport | null> {
  if (!pc || pc.connectionState !== 'connected') return null
  try {
    const stats = await pc.getStats()
    if (pc.connectionState !== 'connected') return null
    let pairId: string | undefined
    stats.forEach(r => { if (r.type === 'transport' && r.selectedCandidatePairId) pairId = r.selectedCandidatePairId })
    let localId: string | undefined
    stats.forEach(r => {
      if (r.type === 'candidate-pair' && (r.id === pairId || (!pairId && r.selected === true))) localId = r.localCandidateId
    })
    const protocol = localId ? stats.get(localId)?.protocol : null
    return protocol === 'udp' || protocol === 'tcp' ? protocol : null
  } catch { return null }
}

export function voicePeerConnections(room: unknown): RTCPeerConnection[] {
  // SDK 2.22: optional private access; missing internals must leave the call usable.
  try {
    const manager = (room as VoiceRoomInternals)?.engine?.pcManager
    return [...new Set([manager?.subscriber?._pc, manager?.publisher?._pc].filter((pc): pc is RTCPeerConnection => !!pc))]
  } catch { return [] }
}

interface VoiceRoomInternals {
  engine?: { pcManager?: {
    subscriber?: { _pc?: RTCPeerConnection }
    publisher?: { _pc?: RTCPeerConnection }
    needsSubscriber?: boolean
    needsPublisher?: boolean
  } }
}

export const VOICE_MEDIA_TIMEOUT_MS = 10_000
export type VoiceMediaStatus = 'idle' | 'connecting' | 'connected' | 'recovering' | 'timeout' | 'unavailable'

/** Null means private SDK diagnostics are unavailable, never proof of a failed call. */
export function voiceMediaConnectionState(room: unknown): boolean | null {
  try {
    const manager = (room as VoiceRoomInternals)?.engine?.pcManager
    if (!manager) return null
    const entries = [
      { pc: manager.subscriber?._pc, required: manager.needsSubscriber },
      { pc: manager.publisher?._pc, required: manager.needsPublisher },
    ]
    const required = entries.filter(({ pc, required }) => required === true || (required === undefined && pc && (pc.connectionState !== 'new' || pc.iceConnectionState !== 'new')))
    if (!required.length) return voicePeerConnections(room).length ? false : null
    if (required.some(({ pc }) => !pc || (!pc.connectionState && !pc.iceConnectionState))) return null
    return required.every(({ pc }) => {
      if (!pc) return false
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState) || ['failed', 'closed', 'disconnected'].includes(pc.iceConnectionState)) return false
      return pc.connectionState === 'connected' || pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed'
    })
  } catch { return null }
}

/** Watch both transport directions, rebind replaced PCs, and warn once per establishment window. */
export function createVoiceMediaMonitor(options: {
  room: unknown
  active: () => boolean
  signalingConnected: () => boolean
  onChange: (status: VoiceMediaStatus) => void
  onTimeout: () => void
  now: () => number
  schedule: (tick: () => void) => unknown
  cancel: (timer: unknown) => void
}) {
  let stopped = false
  let status: VoiceMediaStatus = 'connecting'
  let everConnected = false
  let startedAt = options.now()
  let warned = false
  const listeners = new Map<RTCPeerConnection, () => void>()
  let timer: unknown
  const stop = () => {
    if (stopped) return
    stopped = true
    if (timer !== undefined) options.cancel(timer)
    for (const [pc, listener] of listeners) {
      pc.removeEventListener?.('connectionstatechange', listener)
      pc.removeEventListener?.('iceconnectionstatechange', listener)
    }
    listeners.clear()
  }
  const setStatus = (next: VoiceMediaStatus) => {
    if (status === next) return
    status = next
    options.onChange(next)
  }
  const refresh = () => {
    if (stopped) return
    if (!options.active()) { stop(); return }
    const pcs = voicePeerConnections(options.room)
    for (const [pc, listener] of listeners) if (!pcs.includes(pc)) {
      pc.removeEventListener?.('connectionstatechange', listener)
      pc.removeEventListener?.('iceconnectionstatechange', listener)
      listeners.delete(pc)
    }
    for (const pc of pcs) if (!listeners.has(pc)) {
      pc.addEventListener?.('connectionstatechange', refresh)
      pc.addEventListener?.('iceconnectionstatechange', refresh)
      listeners.set(pc, refresh)
    }
    const connected = voiceMediaConnectionState(options.room)
    if (options.signalingConnected() && connected === null) { setStatus('unavailable'); return }
    if (options.signalingConnected() && connected) {
      everConnected = true
      warned = false
      setStatus('connected')
      return
    }
    if (status === 'connected' || status === 'unavailable') { startedAt = options.now(); warned = false }
    if (options.now() - startedAt >= VOICE_MEDIA_TIMEOUT_MS) {
      setStatus('timeout')
      if (!warned) { warned = true; options.onTimeout() }
    } else setStatus(everConnected ? 'recovering' : 'connecting')
  }
  const restart = () => {
    if (stopped || !options.active()) return
    startedAt = options.now()
    warned = false
    setStatus(everConnected ? 'recovering' : 'connecting')
    refresh()
  }
  options.onChange('connecting')
  refresh()
  if (!stopped) timer = options.schedule(refresh)
  return { refresh, restart, stop }
}
