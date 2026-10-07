export type VoiceTransport = 'udp' | 'tcp'

/** Selected ICE pair, never a server configuration or an arbitrary nominated pair. */
export async function detectVoiceTransport(pc?: RTCPeerConnection): Promise<VoiceTransport | null> {
  if (!pc || pc.connectionState !== 'connected') return null
  try {
    const stats = await pc.getStats()
    let pairId: string | undefined
    stats.forEach(r => { if (r.type === 'transport' && r.selectedCandidatePairId) pairId = r.selectedCandidatePairId })
    let localId: string | undefined
    stats.forEach(r => {
      if (r.type === 'candidate-pair' && (r.id === pairId || (!pairId && r.selected === true))) localId = r.localCandidateId
    })
    if (!localId && !pairId) stats.forEach(r => {
      if (r.type === 'candidate-pair' && r.nominated === true && r.state === 'succeeded') localId = r.localCandidateId
    })
    const protocol = localId ? stats.get(localId)?.protocol : null
    return protocol === 'udp' || protocol === 'tcp' ? protocol : null
  } catch { return null }
}

export function voicePeerConnections(room: unknown): RTCPeerConnection[] {
  // SDK 2.22: optional private access; missing internals must leave the call usable.
  const manager = (room as { engine?: { pcManager?: { subscriber?: { _pc?: RTCPeerConnection }; publisher?: { _pc?: RTCPeerConnection } } } })?.engine?.pcManager
  return [manager?.subscriber?._pc, manager?.publisher?._pc].filter((pc): pc is RTCPeerConnection => !!pc && typeof pc.getStats === 'function')
}
