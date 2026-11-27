import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { ShareEndpoint } from '../endpoint.ts'
import type {
  PiikClientMessage,
  PiikRouteUpdate,
  PiikSfuSignalMessage,
} from '../../piik-signal/protocol.ts'

class FakeStream {
  private readonly tracks: unknown[] = []
  addTrack(track: unknown): void { this.tracks.push(track) }
  getTracks(): unknown[] { return this.tracks }
}

class FakePeerConnection {
  static instances: FakePeerConnection[] = []
  connectionState: RTCPeerConnectionState = 'new'
  ontrack: ((event: { track: unknown }) => void) | null = null
  onicecandidate: ((event: { candidate: { toJSON(): RTCIceCandidateInit } | null }) => void) | null = null
  onconnectionstatechange: (() => void) | null = null
  remoteDescriptions: RTCSessionDescriptionInit[] = []
  localDescriptions: RTCSessionDescriptionInit[] = []
  iceCandidates: RTCIceCandidateInit[] = []
  remoteGate?: Promise<void>
  stats: Promise<Map<string, unknown>> = Promise.resolve(new Map())

  constructor() { FakePeerConnection.instances.push(this) }

  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescriptions.push(description)
    await this.remoteGate
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'answer', sdp: 'answer-sdp' }
  }

  async setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.localDescriptions.push(description)
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    this.iceCandidates.push(candidate)
  }

  getStats(): Promise<Map<string, unknown>> { return this.stats }
  close(): void { this.reach('closed') }

  reach(state: RTCPeerConnectionState): void {
    this.connectionState = state
    this.onconnectionstatechange?.()
  }
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve))
const fence = { revision: 9, publicationGeneration: 'gen-1', connectionId: 'conn-sub' }
const assignment = { upstream: { kind: 'sfu' as const }, childPeerIds: [], sfuPublicationGeneration: fence.publicationGeneration }
const prepare: PiikRouteUpdate = {
  type: 'route-update',
  phase: 'prepare',
  revision: fence.revision,
  assignment,
  candidate: { childPeerId: 'viewer', connectionId: fence.connectionId, transport: 'sfu', qualityProbe: false },
}
const config = { type: 'sfu-config', ...fence }
const offer = { type: 'sfu-signal', kind: 'description', description: { type: 'offer', sdp: 'offer-sdp' }, ...fence }
const remoteIce = { type: 'sfu-signal', kind: 'candidate', candidate: { candidate: 'candidate:1', sdpMid: '0' }, ...fence }

function harness(t: TestContext) {
  const store = globalThis as unknown as Record<string, unknown>
  const previousPc = store.RTCPeerConnection
  const previousStream = store.MediaStream
  store.RTCPeerConnection = FakePeerConnection
  store.MediaStream = FakeStream
  FakePeerConnection.instances = []

  const sent: PiikClientMessage[] = []
  const streams: { connectionId: string; stream: MediaStream }[] = []
  const states: RTCPeerConnectionState[] = []
  let failures = 0
  const endpoint = new ShareEndpoint({ iceServers: [] }, null, {
    send: (message) => { sent.push(message); return true },
    onStream: (connectionId, stream) => streams.push({ connectionId, stream }),
    onStateChange: (_connectionId, state) => states.push(state),
    onRouteFailure: () => { failures++ },
  })
  t.after(() => {
    endpoint.close()
    store.RTCPeerConnection = previousPc
    store.MediaStream = previousStream
  })
  const sfuMessages = (kind: PiikSfuSignalMessage['kind']) => sent.filter(
    (message) => message.type === 'sfu-signal' && message.kind === kind
  )
  return { endpoint, sent, streams, states, sfuMessages, failures: () => failures }
}

test('观众应答 SFU offer，转交媒体、展示入边统计并只结算一次', async (t) => {
  const { endpoint, sent, streams, states, sfuMessages } = harness(t)
  endpoint.handle(prepare)
  assert.equal(endpoint.relaySubscribed, false)
  endpoint.handle(config)
  assert.equal(sent.length, 0)
  endpoint.handle(offer)
  await flush()

  const [pc] = FakePeerConnection.instances
  assert.equal(FakePeerConnection.instances.length, 1)
  assert.deepEqual(pc.remoteDescriptions, [offer.description])
  assert.deepEqual(pc.localDescriptions, [{ type: 'answer', sdp: 'answer-sdp' }])
  assert.deepEqual(sfuMessages('description'), [{
    type: 'sfu-signal', ...fence, kind: 'description', description: pc.localDescriptions[0],
  }])

  pc.onicecandidate?.({ candidate: { toJSON: () => remoteIce.candidate } })
  pc.onicecandidate?.({ candidate: null })
  assert.deepEqual(sfuMessages('candidate'), [remoteIce])

  const track = { kind: 'video' }
  pc.ontrack?.({ track })
  assert.equal(streams.length, 1)
  assert.equal(streams[0].connectionId, fence.connectionId)
  assert.deepEqual(streams[0].stream.getTracks(), [track])

  pc.reach('connected')
  pc.reach('connected')
  assert.equal(states[0], 'connected')
  assert.deepEqual(sent.filter((message) => message.type.startsWith('route-')), [
    { type: 'route-transport-connected', revision: fence.revision, connectionId: fence.connectionId },
    { type: 'route-ready', revision: fence.revision, phase: 'prepare' },
  ])
  assert.equal(endpoint.relaySubscribed, true)
  assert.equal(endpoint.receivingPeer, pc)
  assert.deepEqual(endpoint.connectionIds(), [fence.connectionId])
  assert.equal(endpoint.stateOf(fence.connectionId), 'connected')
  const stats = await endpoint.stats()
  assert.equal(stats.length, 1)
  assert.equal(stats[0].connectionId, fence.connectionId)
  assert.equal(stats[0].direction, 'inbound')
  assert.equal(stats[0].state, 'connected')
})

test('远端描述就绪前缓存 ICE 候选，单条回放失败后仍继续作答', async (t) => {
  const { endpoint, sfuMessages } = harness(t)
  endpoint.handle(prepare)
  endpoint.handle(config)
  const [pc] = FakePeerConnection.instances
  const gate = Promise.withResolvers<void>()
  pc.remoteGate = gate.promise
  const addIceCandidate = pc.addIceCandidate.bind(pc)
  pc.addIceCandidate = async (candidate) => {
    await addIceCandidate(candidate)
    if (candidate === remoteIce.candidate) throw new Error('候选已过期')
  }

  endpoint.handle(remoteIce)
  endpoint.handle(offer)
  await flush()
  const second = { ...remoteIce, candidate: { candidate: 'candidate:2', sdpMid: '0' } }
  endpoint.handle(second)
  endpoint.handle({ ...remoteIce, candidate: null })
  assert.deepEqual(pc.iceCandidates, [])
  gate.resolve()
  await flush()
  assert.deepEqual(pc.iceCandidates, [remoteIce.candidate, second.candidate])
  assert.equal(sfuMessages('description').length, 1)
  assert.equal(endpoint.receivingPeer, pc)
})

test('同一订阅边上的两条 offer 按到达顺序完整协商并作答', async (t) => {
  const { endpoint, sfuMessages } = harness(t)
  endpoint.handle(prepare)
  endpoint.handle(config)
  const [pc] = FakePeerConnection.instances
  const gate = Promise.withResolvers<void>()
  const setLocalDescription = pc.setLocalDescription.bind(pc)
  const firstAnswer = { type: 'answer', sdp: 'answer:offer-sdp' }
  const secondAnswer = { type: 'answer', sdp: 'answer:restart-sdp' }
  pc.createAnswer = async () => ({ type: 'answer', sdp: `answer:${pc.remoteDescriptions.at(-1)?.sdp}` })
  pc.setLocalDescription = async (description) => {
    await setLocalDescription(description)
    if (description.sdp === firstAnswer.sdp) await gate.promise
  }

  const restart = { ...offer, description: { type: 'offer', sdp: 'restart-sdp' } }
  endpoint.handle(offer)
  endpoint.handle(restart)
  await flush()
  assert.deepEqual(pc.remoteDescriptions, [offer.description])
  assert.deepEqual(pc.localDescriptions, [firstAnswer])
  assert.deepEqual(sfuMessages('description'), [])

  gate.resolve()
  await flush()
  assert.deepEqual(pc.remoteDescriptions, [offer.description, restart.description])
  assert.deepEqual(pc.localDescriptions, [firstAnswer, secondAnswer])
  assert.deepEqual(sfuMessages('description'), [firstAnswer, secondAnswer].map((description) => ({
    type: 'sfu-signal', ...fence, kind: 'description', description,
  })))
})

test('等 offer 3 秒只补订阅一次，收到 offer、换路或关闭会取消等待', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { endpoint, sfuMessages } = harness(t)
  endpoint.handle(prepare)
  t.mock.timers.tick(2_999)
  endpoint.handle(config)
  endpoint.handle(prepare)
  assert.deepEqual(sfuMessages('subscribe'), [])
  t.mock.timers.tick(1)
  const subscriptions = [{ type: 'sfu-signal', kind: 'subscribe', ...fence }]
  assert.deepEqual(sfuMessages('subscribe'), subscriptions)
  endpoint.handle(prepare)
  t.mock.timers.tick(6_000)
  assert.deepEqual(sfuMessages('subscribe'), subscriptions)

  const next = { ...fence, connectionId: 'conn-next', revision: 10 }
  endpoint.handle({ ...prepare, revision: next.revision, candidate: { ...prepare.candidate, connectionId: next.connectionId } })
  endpoint.handle({ ...offer, ...next })
  t.mock.timers.tick(3_000)
  assert.deepEqual(sfuMessages('subscribe'), subscriptions)

  endpoint.handle({ ...prepare, revision: 11 })
  t.mock.timers.tick(2_000)
  endpoint.handle({ ...prepare, revision: 12 })
  t.mock.timers.tick(1_000)
  assert.deepEqual(sfuMessages('subscribe'), subscriptions)
  endpoint.close()
  t.mock.timers.tick(3_000)
  assert.deepEqual(sfuMessages('subscribe'), subscriptions)
})

test('切回直连关闭订阅边，丢弃旧边的异步应答、统计和媒体事件', async (t) => {
  const { endpoint, sent, streams, sfuMessages } = harness(t)
  endpoint.handle(prepare)
  endpoint.handle(config)
  const [pc] = FakePeerConnection.instances
  const remote = Promise.withResolvers<void>()
  const stats = Promise.withResolvers<Map<string, unknown>>()
  pc.remoteGate = remote.promise
  pc.stats = stats.promise
  endpoint.handle(offer)
  const pendingStats = endpoint.stats()
  await flush()
  assert.deepEqual(pc.remoteDescriptions, [offer.description])

  endpoint.handle({ ...prepare, revision: 10, phase: 'active', assignment: {
    upstream: { kind: 'peer', peerId: 'parent' }, childPeerIds: [],
  } })
  assert.equal(pc.connectionState, 'closed')
  assert.equal(endpoint.relaySubscribed, false)
  assert.equal(endpoint.receivingPeer, null)
  assert.deepEqual(endpoint.connectionIds(), [])
  assert.equal(endpoint.stateOf(fence.connectionId), null)

  remote.resolve()
  stats.resolve(new Map())
  assert.deepEqual(await pendingStats, [])
  await flush()
  pc.ontrack?.({ track: { kind: 'video' } })
  pc.onicecandidate?.({ candidate: { toJSON: () => remoteIce.candidate } })
  pc.reach('connected')
  assert.deepEqual(streams, [])
  assert.equal(sent.length, 0)

  endpoint.handle({ type: 'signal', fromPeerId: 'parent', payload: {
    kind: 'description', connectionId: 'conn-direct', description: offer.description,
  } })
  await flush()
  assert.equal(endpoint.receivingPeer, FakePeerConnection.instances[1])
  assert.equal(endpoint.relaySubscribed, false)
  assert.deepEqual(sfuMessages('description'), [])
})

test('校验 SFU 路由三项标识，并接收生效版本的 ICE 候选', async (t) => {
  const { endpoint } = harness(t)
  endpoint.handle(prepare)
  for (const stale of [{ revision: 8 }, { publicationGeneration: 'old' }, { connectionId: 'old' }]) {
    endpoint.handle({ ...config, ...stale })
    endpoint.handle({ ...offer, ...stale })
    endpoint.handle({ ...remoteIce, ...stale })
  }
  assert.equal(FakePeerConnection.instances.length, 0)
  endpoint.handle({ type: 'route-update', phase: 'active', revision: 8, assignment: { upstream: { kind: 'none' }, childPeerIds: [] } })
  endpoint.handle(offer)
  await flush()

  const [pc] = FakePeerConnection.instances
  pc.reach('connected')
  endpoint.handle({ type: 'route-update', phase: 'active', revision: 10, assignment })
  endpoint.handle({ ...remoteIce, revision: 10 })
  endpoint.handle({ ...remoteIce, revision: 8 })
  assert.deepEqual(pc.iceCandidates, [remoteIce.candidate])
})

test('SFU 发布代际为 null 的路由更新保留同一订阅边', async (t) => {
  const { endpoint, sfuMessages } = harness(t)
  const nullGeneration = { ...assignment, sfuPublicationGeneration: null }
  endpoint.handle({ ...prepare, assignment: nullGeneration })
  endpoint.handle({ ...config, publicationGeneration: '' })
  const [pc] = FakePeerConnection.instances
  assert.ok(pc)

  endpoint.handle({ type: 'route-update', phase: 'active', revision: 10, assignment: nullGeneration })
  endpoint.handle({ ...offer, publicationGeneration: '' })
  await flush()
  assert.equal(endpoint.receivingPeer, pc)
  assert.deepEqual(pc.remoteDescriptions, [offer.description])
  assert.equal(sfuMessages('description').length, 1)
})

test('订阅边进入 failed 时只关本地连接', async (t) => {
  const { endpoint, sent, states, failures } = harness(t)
  endpoint.handle(prepare)
  endpoint.handle(offer)
  await flush()
  const [pc] = FakePeerConnection.instances
  pc.reach('failed')
  assert.equal(pc.connectionState, 'closed')
  assert.deepEqual(states, ['failed', 'closed'])
  assert.equal(endpoint.relaySubscribed, false)
  assert.equal(failures(), 0)
  assert.equal(sent.some((message) => message.type === 'route-failed'), false)
})

test('订阅超时请求 ICE 重启并保留连接，重新计时直到连通或关闭', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { endpoint, sent, sfuMessages, failures } = harness(t)
  const subscribe = { type: 'sfu-signal', kind: 'subscribe', ...fence }
  endpoint.handle(prepare)
  endpoint.handle(offer)
  await flush()
  const [pc] = FakePeerConnection.instances
  pc.stats = new Promise(() => {})
  const pendingStats = endpoint.stats()
  t.mock.timers.tick(4_000)
  assert.deepEqual(await pendingStats, [])

  t.mock.timers.tick(15_000)
  pc.reach('disconnected')
  t.mock.timers.tick(999)
  assert.equal(failures(), 0)
  assert.deepEqual(sfuMessages('subscribe'), [])
  t.mock.timers.tick(1)
  assert.equal(failures(), 1)
  assert.deepEqual(sfuMessages('subscribe'), [subscribe])
  assert.equal(endpoint.receivingPeer, pc)

  const restart = { ...offer, description: { type: 'offer', sdp: 'restart-sdp' } }
  endpoint.handle(restart)
  await flush()
  assert.deepEqual(pc.remoteDescriptions, [offer.description, restart.description])
  assert.equal(sfuMessages('description').length, 2)
  t.mock.timers.tick(19_999)
  assert.equal(failures(), 1)
  assert.deepEqual(sfuMessages('subscribe'), [subscribe])
  t.mock.timers.tick(1)
  assert.equal(failures(), 2)
  assert.deepEqual(sfuMessages('subscribe'), [subscribe, subscribe])
  assert.equal(endpoint.receivingPeer, pc)

  pc.reach('connected')
  t.mock.timers.tick(20_000)
  pc.reach('disconnected')
  t.mock.timers.tick(8_000)
  pc.reach('connecting')
  t.mock.timers.tick(3_999)
  assert.equal(failures(), 2)
  t.mock.timers.tick(1)
  assert.equal(failures(), 3)
  assert.deepEqual(sfuMessages('subscribe'), [subscribe, subscribe, subscribe])
  assert.equal(endpoint.receivingPeer, pc)

  pc.reach('disconnected')
  t.mock.timers.tick(11_999)
  pc.reach('connected')
  t.mock.timers.tick(20_000)
  assert.equal(failures(), 3)
  pc.reach('disconnected')
  endpoint.close()
  t.mock.timers.tick(20_000)
  assert.equal(pc.connectionState, 'closed')
  assert.equal(failures(), 3)
  assert.equal(sfuMessages('subscribe').length, 3)
  assert.equal(sent.some((message) => message.type === 'route-failed'), false)
})

test('发布连接的配置因不匹配 SFU 订阅路由而被忽略', (t) => {
  const { endpoint, sent } = harness(t)
  const publisherConfig = { ...config, connectionId: fence.publicationGeneration }
  endpoint.handle(prepare)
  endpoint.handle(publisherConfig)
  assert.equal(FakePeerConnection.instances.length, 0)
  endpoint.handle({ ...prepare, revision: 10, assignment: { upstream: { kind: 'none' }, childPeerIds: ['viewer'], sfuPublicationGeneration: fence.publicationGeneration } })
  endpoint.handle({ ...publisherConfig, revision: 10 })
  assert.equal(FakePeerConnection.instances.length, 0)
  assert.equal(sent.length, 0)
})
