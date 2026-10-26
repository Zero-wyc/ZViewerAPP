import test from 'node:test'
import assert from 'node:assert/strict'
import { musicCoverUrl, portableMusicCoverUrl } from '../src/upstream/modules/music/utils/neteaseImage.ts'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm'
import { create } from 'zustand'
import * as artwork from '../src/upstream/modules/music/utils/neteaseImage.ts'
import { bindConnectionTransport, clearConnectionTransport, connectionUrl } from '../src/platform/connectionTransport.ts'

const source = 'http://p4.music.126.net/vwNxbxKBS7K6JAxaQqbsGg==/109951168088742524.jpg'
test('daily recommendation artwork uses HTTPS in the queue and in both player sizes', () => {
  const queued = musicCoverUrl(source, 300)
  assert.equal(new URL(queued).protocol, 'https:')
  assert.equal(new URL(musicCoverUrl(queued)).searchParams.get('param'), '600y600')
  assert.equal(new URL(musicCoverUrl(queued, 120)).searchParams.get('param'), '120y120')
})
test('existing crop queries are replaced while other query fields remain intact', () => {
  const result = new URL(musicCoverUrl(`${source}?quality=80&param=80y80&param=100y100`, 600))
  assert.deepEqual(result.searchParams.getAll('param'), ['600y600'])
  assert.equal(result.searchParams.get('quality'), '80')
})
test('protocol relative Netease artwork is normalized without changing its image identity', () => {
  assert.equal(musicCoverUrl(source.replace('http:', ''), 300), source.replace('http:', 'https:') + '?param=300y300')
})
test('Bilibili proxies and their authorization queries remain unchanged', () => {
  for (const url of ['/api/stream/proxy-image?url=encoded&token=opaque', 'http://127.0.0.1:9280/private/api/stream/proxy-image?url=x&token=y', 'https://i0.hdslb.com/bfs/archive/image.jpg']) assert.equal(musicCoverUrl(url), url)
})
test('non Netease and local artwork are preserved and empty artwork stays empty', () => {
  for (const url of ['/cover.jpg', 'blob:https://zviewer.local/cover', 'https://other.example.com/cover.jpg?signature=opaque']) assert.equal(musicCoverUrl(url), url)
  assert.equal(musicCoverUrl(null), '')
  assert.equal(musicCoverUrl(undefined), '')
})

const bili = 'https://i0.hdslb.com/bfs/archive/fixture.jpg@640w_400h.webp?quality=80'
const legacy = `https://localhost:3333/api/stream/proxy-image?url=${encodeURIComponent(bili)}`

test('shared Bilibili artwork unwraps localhost, private channels and nested proxies before persistence', () => {
  for (const prefix of ['http://localhost:3333', 'https://localhost:3333/prefix', 'http://127.0.0.1:47111/private-token/prefix', 'https://other.example.com/old']) {
    const proxy = `${prefix}/api/stream/proxy-image?url=${encodeURIComponent(bili)}`
    assert.equal(portableMusicCoverUrl(proxy), bili)
    assert.equal(portableMusicCoverUrl(`/api/stream/proxy-image?url=${encodeURIComponent(proxy)}`), bili)
  }
  assert.equal(portableMusicCoverUrl(bili.replace('https:', '')), bili)
  assert.equal(portableMusicCoverUrl(bili.replace('https:', 'http:')), bili)
})

test('expanded player, widget and queue rebind an old cover to the current viewer server', () => {
  for (const base of ['https://viewer.example.com/prefix', 'http://127.0.0.1:47111/private-channel/prefix']) {
    for (const size of [80, 120, 600]) {
      const url = new URL(musicCoverUrl(legacy, size, base))
      assert.equal(`${url.origin}${url.pathname}`, `${base}/api/stream/proxy-image`)
      assert.equal(url.searchParams.get('url'), bili)
      assert.equal(url.searchParams.has('param'), false)
    }
  }
})

test('malformed and unrelated proxy parameters do not redirect arbitrary artwork', () => {
  for (const raw of ['/api/stream/proxy-image?url=x', 'https://localhost/image?url=' + encodeURIComponent(bili), '/api/stream/proxy-image?url=' + encodeURIComponent('https://third.example/cover.jpg'), 'data:image/png;base64,opaque']) {
    assert.equal(portableMusicCoverUrl(raw), raw)
  }
})

async function loadSource(file, imports, globals = {}) {
  const context = createContext({ URL, URLSearchParams, console, ...globals })
  const code = stripTypeScriptTypes(await readFile(new URL(file, import.meta.url), 'utf8'))
  const module = new SourceTextModule(code, { context })
  await module.link(name => {
    const values = imports[name]
    assert.ok(values, `Unexpected import ${name}`)
    return new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value)
    }, { context })
  })
  await module.evaluate()
  return module.namespace
}

test('system media artwork uses the same current native connection and follows reconnection', async () => {
  let base
  const api = await loadSource('../src/mobile/useSystemMediaSession.ts', {
    react: { useEffect() {}, useRef() {}, useState() {} },
    '@/lib/api': { getApiUrl: () => connectionUrl(base).replace(/\/$/, '') },
    '../platform/mediaSession': { clearSystemMedia() {}, listenSystemMedia() {}, updateSystemMedia() {} },
    '../platform/runtime': { isGlobalAppearanceRuntime: () => true },
    '../upstream/modules/music/utils/neteaseImage': artwork,
  })
  try {
    base = 'https://viewer.example.com/prefix'
    bindConnectionTransport(base, 'http://127.0.0.1:47111/channel-a/prefix')
    const first = new URL(api.systemArtworkUrl(legacy))
    assert.equal(first.origin + first.pathname, 'http://127.0.0.1:47111/channel-a/prefix/api/stream/proxy-image')
    assert.equal(first.searchParams.get('url'), bili)
    bindConnectionTransport(base, 'http://127.0.0.1:47222/channel-b/prefix')
    assert.match(api.systemArtworkUrl(legacy), /^http:\/\/127\.0\.0\.1:47222\/channel-b\/prefix\//)
    assert.equal(new URL(api.systemArtworkUrl(source)).protocol, 'https:')
  } finally { clearConnectionTransport() }
})

test('queue and local audition store portable covers and retain their playback identity', async () => {
  const api = await loadSource('../src/upstream/modules/music/store.ts', {
    zustand: { create },
    './utils/neteaseImage': artwork,
    './store-settings': { useMusicSettingsStore: { getState: () => ({ defaultSourcePage: 'netease' }) }, normalizeDefaultSourcePage: () => 'netease' },
  })
  const item = { id: 1, songId: 0, biliBvid: 'BV17x411w7KC', biliCid: 123, order: 1, cover: legacy }
  api.useMusicStore.getState().setQueue([item])
  assert.equal(api.useMusicStore.getState().queue[0].cover, bili)
  assert.equal(api.musicItemKey(api.useMusicStore.getState().queue[0]), 'bili:BV17x411w7KC:123')
  assert.equal(item.cover, legacy)
  api.useMusicStore.getState().setBiliItem(item)
  assert.equal(api.useMusicStore.getState().biliItem.cover, bili)
})
