import type { ScreenShareAudioOptions, ScreenShareVideoOptions, ScreenShareEvent, ScreenShareNativePort, ScreenShareSettings, ScreenShareState } from '../platform/contracts'

export interface ScreenShareSocket {
  connected: boolean
  on(name: string, callback: (...args: any[]) => void): unknown
  off(name: string, callback: (...args: any[]) => void): unknown
  emit(name: string, ...args: any[]): unknown
}
export interface ScreenShareSnapshot {
  state: ScreenShareState
  transport: 'idle' | 'waiting-viewers' | 'connecting' | 'connected' | 'disconnected'
  viewers: number
  settings?: ScreenShareSettings
  error?: string
}
const errors: Record<string, string> = {
  unsupported: '当前设备或安装包不支持屏幕共享。',
  'permission-denied': '未获得屏幕捕获授权，可以重新开始并授权。',
  'capture-start-failed': '屏幕采集未能启动，请停止后重试。',
  'capture-ended': '系统已停止屏幕共享。',
  'encoder-failed': '视频编码失败，请重新开始共享。',
  'transport-failed': '观众连接失败，请让观众重新连接。',
  cancelled: '共享已取消。',
}

/** A room-scoped sender controller. No media frames or native tracks cross this boundary. */
export function createScreenShareSession(options: {
  roomId: string
  native: ScreenShareNativePort
  socket: ScreenShareSocket
  iceServers: RTCIceServer[]
  subscribe: (listener: (event: ScreenShareEvent) => void) => Promise<() => void>
  changed: (snapshot: ScreenShareSnapshot) => void
  newId: () => string
}) {
  const { native, socket } = options
  let snapshot: ScreenShareSnapshot = { state: 'idle', transport: 'idle', viewers: 0 }
  let sessionId: string | undefined
  let pendingStart: Promise<void> | undefined
  let pendingStop: Promise<void> | undefined
  let disposed = false
  let unsubscribe: (() => void) | undefined
  const peers = new Map<string, { revision: number; state: string; queue: Promise<void> }>()
  let revision = 0
  const publish = (patch: Partial<ScreenShareSnapshot>) => {
    snapshot = { ...snapshot, ...patch }
    if (!disposed) options.changed(snapshot)
  }
  const active = (id: string) => !disposed && sessionId === id && !['stopping', 'stopped', 'error'].includes(snapshot.state)
  const transport = () => publish({ viewers: peers.size, transport: !sessionId ? 'idle' : !socket.connected ? 'disconnected' : !peers.size ? 'waiting-viewers' : [...peers.values()].some(p => p.state === 'connected') ? 'connected' : 'connecting' })
  const removePeer = async (peerId: string) => {
    const id = sessionId
    peers.delete(peerId)
    transport()
    if (id) await native.removePeer({ sessionId: id, peerId }).catch(() => {})
  }
  const ready = ({ from }: { from?: string }) => {
    const id = sessionId
    if (!id || !from || !['sharing', 'paused'].includes(snapshot.state) || peers.has(from) || peers.size >= 4) return
    const peer = { revision: ++revision, state: 'connecting', queue: Promise.resolve() }
    peers.set(from, peer)
    transport()
    peer.queue = native.createOffer({ sessionId: id, peerId: from }).then(description => {
      if (active(id) && peers.get(from) === peer && socket.connected) socket.emit('signal-offer', { to: from, data: description })
    }).catch(() => {
      if (active(id) && peers.get(from) === peer) { void removePeer(from); publish({ error: errors['transport-failed'] }) }
    })
  }
  const answer = ({ from, data }: { from: string; data: RTCSessionDescriptionInit }) => {
    const id = sessionId, peer = peers.get(from)
    if (!id || !peer || data?.type !== 'answer' || typeof data.sdp !== 'string') return
    peer.queue = peer.queue.then(async () => {
      if (active(id) && peers.get(from) === peer) await native.setAnswer({ sessionId: id, peerId: from, description: data })
    }).catch(() => { if (active(id)) void removePeer(from) })
  }
  const ice = ({ from, data }: { from: string; data: RTCIceCandidateInit }) => {
    const id = sessionId, peer = peers.get(from)
    if (!id || !peer || typeof data?.candidate !== 'string') return
    peer.queue = peer.queue.then(async () => {
      if (active(id) && peers.get(from) === peer) await native.addIceCandidate({ sessionId: id, peerId: from, candidate: data })
    }).catch(() => { if (active(id)) void removePeer(from) })
  }
  const left = ({ viewerSocketId }: { viewerSocketId: string }) => { void removePeer(viewerSocketId) }
  const stop = (): Promise<void> => {
    if (pendingStop) return pendingStop
    const id = sessionId
    sessionId = undefined // invalidate callbacks before any asynchronous cleanup
    peers.clear()
    publish({ state: 'stopping', transport: 'idle', viewers: 0, settings: undefined })
    pendingStop = (async () => {
      if (id) await native.stop({ sessionId: id })
    })().then(() => publish({ state: 'stopped' }), () => publish({ state: 'error', error: '系统未确认采集已停止，请通过系统共享提示停止。' })).finally(() => { pendingStop = undefined })
    return pendingStop
  }
  const disconnected = () => { void stop() }
  const roomClosed = (data: { roomId?: string }) => { if (!data?.roomId || data.roomId === options.roomId) void stop() }
  const bindings: [string, (...args: any[]) => void][] = [['viewer-ready', ready], ['signal-answer', answer], ['signal-ice-candidate', ice], ['viewer-left', left], ['disconnect', disconnected], ['room-closed', roomClosed]]
  bindings.forEach(([name, handler]) => socket.on(name, handler))

  const event = (value: ScreenShareEvent) => {
    if (!sessionId || value.sessionId !== sessionId) return
    if (value.type === 'capture-ended' || value.type === 'error') {
      const error = errors[value.code || 'capture-ended'] || errors['capture-start-failed']
      if (value.type === 'error') socket.emit('sharer-error', { roomId: options.roomId, message: error })
      void stop().then(() => { if (!sessionId) publish({ error }) })
    } else if (value.type === 'ice' && value.peerId && peers.has(value.peerId) && value.candidate && socket.connected) {
      socket.emit('signal-ice-candidate', { to: value.peerId, data: value.candidate })
    } else if (value.type === 'peer-state' && value.peerId) {
      const peer = peers.get(value.peerId)
      if (!peer) return
      peer.state = value.connectionState || 'connecting'
      if (['failed', 'closed', 'disconnected'].includes(peer.state)) void removePeer(value.peerId)
      else transport()
    } else if (value.type === 'state' && value.state === 'starting' && snapshot.state === 'requesting-permission') publish({ state: 'starting' })
    else if (value.type === 'stats') publish({ settings: value.settings })
  }
  const listening = options.subscribe(event).then(remove => {
    if (disposed) remove()
    else unsubscribe = remove
  })
  // Keep a rejected listener subscription observable through start(), without an unhandled rejection.
  void listening.catch(() => {})
  const start = (audio: ScreenShareAudioOptions & Partial<ScreenShareVideoOptions> = { systemAudio: false, microphone: false }): Promise<void> => {
    if (pendingStart) return pendingStart
    if (disposed || sessionId || pendingStop) return Promise.resolve()
    const id = options.newId()
    sessionId = id
    publish({ state: 'requesting-permission', error: undefined, settings: undefined })
    pendingStart = (async () => {
      await listening
      if (!active(id) || !socket.connected) { await stop(); return }
      const settings = await native.start({ sessionId: id, iceServers: options.iceServers, ...audio })
      if (!active(id)) { await native.stop({ sessionId: id }); return }
      publish({ state: 'sharing', settings })
      transport()
      socket.emit('sharer-ready', { roomId: options.roomId })
    })().catch(async error => {
      if (!active(id)) return
      const code = typeof error?.code === 'string' ? error.code : 'capture-start-failed'
      socket.emit('sharer-error', { roomId: options.roomId, message: errors[code] || errors['capture-start-failed'] })
      await stop()
      if (!sessionId) publish({ state: 'error', error: errors[code] || errors['capture-start-failed'] })
    }).finally(() => { pendingStart = undefined })
    return pendingStart
  }
  let changing = false
  const pause = async (paused: boolean) => {
    const id = sessionId
    if (!id || changing || snapshot.state !== (paused ? 'sharing' : 'paused')) return
    changing = true
    try {
      await (paused ? native.pause({ sessionId: id }) : native.resume({ sessionId: id }))
      if (active(id)) publish({ state: paused ? 'paused' : 'sharing' })
    } catch { if (active(id)) { await stop(); publish({ error: errors['capture-start-failed'] }) } }
    finally { changing = false }
  }
  const dispose = async () => {
    if (disposed) return
    disposed = true
    bindings.forEach(([name, handler]) => socket.off(name, handler))
    unsubscribe?.()
    await stop()
  }
  const setAudioOptions = async (audio: ScreenShareAudioOptions) => {
    const id = sessionId
    if (!id || !['sharing', 'paused'].includes(snapshot.state)) return
    try {
      const settings = await native.setAudioOptions({ sessionId: id, ...audio })
      if (active(id)) publish({ settings, error: undefined })
    } catch (error) {
      if (active(id)) publish({ error: error instanceof Error ? error.message : '声音设置失败，请重试。' })
    }
  }
  return { start, stop, pause, setAudioOptions, dispose, getSnapshot: () => snapshot }
}
