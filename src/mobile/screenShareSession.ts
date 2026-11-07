import type {
  ScreenShareAudioOptions, ScreenShareVideoOptions, ScreenShareEvent, ScreenShareNativePort,
  ScreenShareSettings, ScreenShareState, ScreenSharePeer,
} from '../platform/contracts'
import { PiikSignalClient, clientId, signalUrl } from '@/modules/piik-signal/client'
import { acquireLink, linkKey } from '@/modules/piik-signal/link'
import { requestCredentials, sessionScope } from '@/modules/piik-signal/credentials'
import { DEFAULT_ROUTE_POLICY, SIGNALING_PROTOCOL, type PiikServerMessage, type PiikIceConfig, type PiikRouteUpdate } from '@/modules/piik-signal/protocol'
import { sampleShareStats, type StatsBaseline } from '@/modules/screen-sharing/core/stats'
import type { ShareEdgeStats } from '@/modules/screen-sharing/core/edge-stats'

export interface ScreenShareSocket {
  connected: boolean
  on(name: string, callback: (...args: any[]) => void): unknown
  off(name: string, callback: (...args: any[]) => void): unknown
}
export interface ScreenShareSnapshot {
  state: ScreenShareState
  transport: 'idle' | 'waiting-viewers' | 'connecting' | 'connected' | 'disconnected'
  viewers: number
  ready?: boolean
  directConnections?: number
  settings?: ScreenShareSettings
  edges?: ShareEdgeStats[]
  error?: string
}
interface Edge {
  ref: ScreenSharePeer
  state: RTCPeerConnectionState
  queue: Promise<unknown>
  offered: boolean
  candidates: RTCIceCandidateInit[]
  baseline: StatsBaseline | null
}

/** Native capture stays native; only connection-scoped Piik DTOs cross this boundary. */
export function createScreenShareSession(options: {
  roomId: string
  native: ScreenShareNativePort
  socket: ScreenShareSocket
  subscribe: (listener: (event: ScreenShareEvent) => void) => Promise<() => void>
  changed: (snapshot: ScreenShareSnapshot) => void
  newId: () => string
}) {
  const { native } = options
  const scope = sessionScope(), opaqueId = clientId()
  const peers = new Map<string, Edge>()
  let snapshot: ScreenShareSnapshot = { state: 'idle', transport: 'connecting', viewers: 0, ready: false }
  let sessionId: string | undefined
  let generation = '', revision = 0, captured = false, confirmed = false
  let desiredPaused = false
  let iceConfig: PiikIceConfig = { iceServers: [] }, path = '/signal'
  let pendingStart: Promise<void> | undefined, pendingStop: Promise<void> | undefined
  let disposed = false, changing = false, polling = false
  let unsubscribe: (() => void) | undefined
  let ackTimer: ReturnType<typeof setTimeout> | undefined
  const publish = (patch: Partial<ScreenShareSnapshot>) => {
    snapshot = { ...snapshot, ...patch }
    if (!disposed) options.changed(snapshot)
  }
  const active = (id: string) => !disposed && sessionId === id && scope === sessionScope()
  const current = (edge: Edge) => active(edge.ref.sessionId) && peers.get(edge.ref.connectionId) === edge
  const transport = () => publish({
    directConnections: peers.size,
    transport: !client.connected ? 'disconnected' : !sessionId ? 'idle'
      : !confirmed ? 'connecting' : !peers.size ? 'waiting-viewers'
        : [...peers.values()].some(peer => peer.state === 'connected') ? 'connected' : 'connecting',
  })
  const drop = (connectionId: string) => {
    const peer = peers.get(connectionId)
    if (!peer) return
    peers.delete(connectionId)
    void native.removePeer(peer.ref).catch(() => {})
  }
  const clearEdges = () => { for (const id of [...peers.keys()]) drop(id); publish({ edges: [], directConnections: 0 }) }
  const beginBroadcast = () => {
    if (!sessionId || !captured || !client.connected || generation) return
    if (client.authenticated?.role !== 'host') { void stop(); publish({ error: '当前身份不是房主，无法发布屏幕' }); return }
    generation = 'share_' + clientId()
    confirmed = false
    publish({ state: 'starting', error: undefined })
    client.send({ type: 'start-sharing', shareGeneration: generation, routePolicy: DEFAULT_ROUTE_POLICY })
    clearTimeout(ackTimer)
    ackTimer = setTimeout(() => { void stop().then(() => publish({ error: '服务端未确认开播，请重试' })) }, 8000)
    transport()
  }
  const route = (update: PiikRouteUpdate) => {
    const id = sessionId
    if (!id || !captured || !confirmed || update.revision < revision) return
    revision = update.revision
    for (const [key, edge] of peers) {
      if (!update.assignment.childPeerIds.includes(edge.ref.remotePeerId)) drop(key)
    }
    const candidate = update.phase === 'prepare' ? update.candidate : null
    if (!candidate || candidate.transport !== 'direct' ||
        !update.assignment.childPeerIds.includes(candidate.childPeerId) || peers.has(candidate.connectionId)) {
      transport(); return
    }
    const edge: Edge = {
      ref: { sessionId: id, connectionId: candidate.connectionId, remotePeerId: candidate.childPeerId, revision, iceServers: iceConfig.iceServers },
      state: 'connecting', offered: false, candidates: [], queue: Promise.resolve(), baseline: null,
    }
    peers.set(candidate.connectionId, edge)
    edge.queue = native.createOffer(edge.ref).then(description => {
      if (!current(edge)) return
      client.send({ type: 'signal', targetPeerId: edge.ref.remotePeerId,
        payload: { kind: 'description', connectionId: edge.ref.connectionId, description } })
      edge.offered = true
      for (const value of edge.candidates.splice(0)) sendIce(edge, value)
    }).catch(() => {
      if (current(edge)) { drop(edge.ref.connectionId); publish({ error: '观众媒体连接未能建立，请检查网络后重试' }); transport() }
    })
    transport()
  }
  const sendIce = (edge: Edge, candidate: RTCIceCandidateInit) => {
    if (current(edge)) client.send({ type: 'signal', targetPeerId: edge.ref.remotePeerId,
      payload: { kind: 'candidate', connectionId: edge.ref.connectionId, candidate } })
  }
  const receive = (message: PiikServerMessage) => {
    if (disposed || scope !== sessionScope()) return
    if (message.type === 'authenticated') {
      iceConfig = client.authenticated?.iceConfig ?? iceConfig
      publish({ ready: client.authenticated?.role === 'host', error: undefined })
      beginBroadcast()
    } else if (message.type === 'sharing-started' && message.shareGeneration === generation) {
      clearTimeout(ackTimer)
      confirmed = true
      if (desiredPaused) client.send({ type: 'set-sharing-paused', shareGeneration: generation, paused: true })
      publish({ state: desiredPaused ? 'paused' : 'sharing' })
      transport()
    } else if (message.type === 'route-update') route(message as PiikRouteUpdate)
    else if (message.type === 'room-state' && Array.isArray(message.viewers)) publish({ viewers: message.viewers.length })
    else if (message.type === 'signal') {
      const payload = message.payload as { connectionId?: string; kind?: string; description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }
      const edge = peers.get(payload?.connectionId ?? '')
      if (!edge || edge.ref.remotePeerId !== message.fromPeerId) return
      edge.queue = edge.queue.then(async () => {
        if (!current(edge)) return
        if (payload.kind === 'description' && payload.description?.type === 'answer') {
          await native.setAnswer({ ...edge.ref, description: payload.description })
        } else if (payload.kind === 'candidate' && payload.candidate) {
          await native.addIceCandidate({ ...edge.ref, candidate: payload.candidate })
        }
      }).catch(() => { if (current(edge)) { drop(edge.ref.connectionId); transport() } })
    } else if (message.type === 'room-closed' || message.type === 'sharing-start-failed') {
      void stop().then(() => publish({ error: message.type === 'room-closed' ? '房间已关闭' : '服务端拒绝了本次开播' }))
    }
  }
  const link = acquireLink(linkKey(options.roomId, scope), {
    onMessage: receive,
    onStatus: status => {
      if (disposed) return
      if (status === 'open') {
        iceConfig = client.authenticated?.iceConfig ?? iceConfig
        publish({ ready: client.authenticated?.role === 'host' })
        beginBroadcast()
      } else {
        clearTimeout(ackTimer)
        confirmed = false; generation = ''; revision = 0
        clearEdges()
        publish({ ready: false, transport: 'disconnected' })
        if (status === 'closed') void stop()
      }
    },
    onFatal: (_code, message) => { void stop().then(() => publish({ ready: false, error: message })) },
  }, handlers => new PiikSignalClient({
    ...handlers,
    authenticate: async () => {
      if (scope !== sessionScope()) throw new Error('房间身份已改变')
      const credentials = await requestCredentials(options.roomId, 'share')
      if (credentials.role !== 'host') throw new Error('当前身份不是房主')
      path = credentials.signalPath
      iceConfig = credentials.iceConfig
      return { type: 'authenticate', protocol: SIGNALING_PROTOCOL, roomId: credentials.roomId,
        role: 'host', token: credentials.token, clientId: opaqueId, roomOnly: true, roomSession: true, routePolicy: DEFAULT_ROUTE_POLICY }
    },
    url: () => signalUrl(path),
  }))
  const client = link.client
  const stop = (): Promise<void> => {
    if (pendingStop) return pendingStop
    const id = sessionId
    sessionId = undefined; captured = false; confirmed = false; desiredPaused = false
    clearTimeout(ackTimer)
    if (generation) client.send({ type: 'stop-sharing', shareGeneration: generation })
    generation = ''; revision = 0
    clearEdges()
    if (!id) return Promise.resolve()
    publish({ state: 'stopping', transport: 'idle', settings: undefined, viewers: 0 })
    pendingStop = native.stop({ sessionId: id }).then(
      () => publish({ state: 'stopped' }),
      () => publish({ state: 'error', error: '系统未确认采集已停止，请通过系统共享提示停止' }),
    ).finally(() => { pendingStop = undefined })
    return pendingStop
  }
  const event = (value: ScreenShareEvent) => {
    if (!sessionId || value.sessionId !== sessionId) return
    if (value.type === 'capture-ended' || value.type === 'error') {
      void stop().then(() => publish({ error: value.type === 'error' ? '屏幕采集已中断，请重新开始' : '系统已停止屏幕共享' }))
    } else if (value.type === 'stats') publish({ settings: value.settings })
    else if (value.connectionId) {
      const edge = peers.get(value.connectionId)
      if (!edge || value.remotePeerId !== edge.ref.remotePeerId || value.revision !== edge.ref.revision) return
      if (value.type === 'ice' && value.candidate) {
        if (edge.offered) sendIce(edge, value.candidate)
        else if (edge.candidates.length < 128) edge.candidates.push(value.candidate)
      } else if (value.type === 'peer-state') {
        edge.state = value.connectionState ?? 'new'
        if (edge.state === 'failed' || edge.state === 'closed') drop(value.connectionId)
        transport()
      }
    }
  }
  const listening = options.subscribe(event).then(remove => { if (disposed) remove(); else unsubscribe = remove })
  void listening.catch(() => {})
  const start = (audio: ScreenShareAudioOptions & Partial<ScreenShareVideoOptions>): Promise<void> => {
    if (pendingStart) return pendingStart
    if (disposed || sessionId || pendingStop || !client.connected || !snapshot.ready) return Promise.resolve()
    const id = options.newId()
    sessionId = id
    publish({ state: 'requesting-permission', error: undefined, settings: undefined })
    // Authentication is prepared before the click; do not delay the system picker with REST.
    pendingStart = native.start({ sessionId: id, iceServers: iceConfig.iceServers, ...audio }).then(async settings => {
      await listening
      if (!active(id)) { await native.stop({ sessionId: id }); return }
      captured = true
      publish({ settings })
      beginBroadcast()
    }).catch(async error => {
      if (!active(id)) return
      await stop()
      publish({ state: 'error', error: error?.code === 'permission-denied' ? '未获得屏幕捕获授权，请重新开始并授权' : '屏幕采集未能启动，请重试' })
    }).finally(() => { pendingStart = undefined })
    return pendingStart
  }
  const pause = async (paused: boolean) => {
    const id = sessionId
    if (!id || changing || !confirmed) return
    changing = true
    try {
      await (paused ? native.pause({ sessionId: id }) : native.resume({ sessionId: id }))
      if (!active(id)) return
      desiredPaused = paused
      client.send({ type: 'set-sharing-paused', shareGeneration: generation, paused })
      publish({ state: paused ? 'paused' : 'sharing' })
    } catch { if (active(id)) { await stop(); publish({ error: '暂停状态未能同步，请重新开始共享' }) } }
    finally { changing = false }
  }
  const setAudioOptions = async (audio: ScreenShareAudioOptions) => {
    const id = sessionId
    if (!id || !captured) return
    try { const settings = await native.setAudioOptions({ sessionId: id, ...audio }); if (active(id)) publish({ settings }) }
    catch { if (active(id)) publish({ error: '声音设置失败，请重试' }) }
  }
  const setVideoOptions = async (video: ScreenShareVideoOptions) => {
    const id = sessionId
    if (!id || !captured) return
    try { const settings = await native.setVideoOptions({ sessionId: id, ...video }); if (active(id)) publish({ settings }) }
    catch { if (active(id)) publish({ error: '画质设置未生效，请重试' }) }
  }
  const timer = setInterval(() => {
    if (polling || !captured || disposed) return
    polling = true
    void Promise.all([...peers.values()].map(async edge => {
      const sample = await native.getConnectionStats(edge.ref).catch(() => null)
      if (!sample || !current(edge)) return null
      const report = new Map(sample.reports.map((row, index) => [String(row.id ?? index), row])) as unknown as RTCStatsReport
      const result = sampleShareStats(edge.baseline, report)
      edge.baseline = result.baseline
      return { connectionId: edge.ref.connectionId, direction: 'outbound', state: edge.state, stats: result.stats } as ShareEdgeStats
    })).then(edges => { if (!disposed) publish({ edges: edges.filter((edge): edge is ShareEdgeStats => !!edge) }) })
      .finally(() => { polling = false })
  }, 2000)
  const disconnected = () => { void stop() }
  options.socket.on('disconnect', disconnected)
  void client.start().then(() => {
    if (!disposed && client.connected) receive({ type: 'authenticated' })
  })
  const dispose = async () => {
    if (disposed) return
    disposed = true
    clearInterval(timer)
    options.socket.off('disconnect', disconnected)
    unsubscribe?.()
    await stop()
    link.release()
  }
  return { start, stop, pause, setAudioOptions, setVideoOptions, dispose, getSnapshot: () => snapshot }
}
