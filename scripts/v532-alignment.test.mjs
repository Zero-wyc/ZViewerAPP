import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm'
import { buildCliProxyUrl } from '../src/platform/bilibiliMediaUrl.ts'
import {
  buildCandidateItems, registerCliCandidates, resetRegisteredCandidates, unwrapCliProxyUrl,
} from '../src/upstream/modules/bilibili/cliCandidates.ts'

const proxy = 'http://127.0.0.1:12345'
const prefix = `${proxy}/proxy?url=`
const video = 'https://primary.bilivideo.com/v.m4s?sign=a%2Bb&deadline=2'
const audio = 'https://primary.bilivideo.com/a.m4s'
const videoBackup = 'https://backup.bilivideo.com/v.m4s'
const audioBackup = 'https://backup.bilivideo.com/a.m4s'
const tracks = { videoUrl: video, audioUrl: audio, videoBackupUrls: [videoBackup], audioBackupUrls: [audioBackup] }
const items = [
  { primaryUrl: video, backupUrls: [videoBackup] },
  { primaryUrl: audio, backupUrls: [audioBackup] },
]

test('CLI candidates unwrap signed URLs, retain ordering and skip tracks without alternatives', () => {
  resetRegisteredCandidates()
  const wrapped = `${prefix}${encodeURIComponent(video)}&ref=live`
  assert.equal(unwrapCliProxyUrl(prefix, wrapped), video)
  assert.equal(unwrapCliProxyUrl(prefix, `${prefix}%E0%A4%A`), `${prefix}%E0%A4%A`)
  assert.deepEqual(buildCandidateItems(proxy, { videoUrl: wrapped, videoBackupUrls: [video, '', `${prefix}`] }), [])
  assert.deepEqual(buildCandidateItems(proxy, { videoUrl: `${prefix}`, videoBackupUrls: [videoBackup] }), [])
  assert.deepEqual(buildCandidateItems(proxy, { videoUrl: video, videoBackupUrls: [null, 42, '', video] }), [])
  assert.deepEqual(buildCandidateItems(proxy, {
    ...tracks, videoUrl: wrapped, videoBackupUrls: [wrapped, null, '', videoBackup, `${prefix}${encodeURIComponent(videoBackup)}`],
  }), [{ primaryUrl: video, backupUrls: [video, videoBackup] }, items[1]])
  assert.deepEqual(buildCandidateItems(`${proxy}/`, tracks), [])
  assert.deepEqual(buildCandidateItems(proxy, tracks), [])
  assert.deepEqual(buildCandidateItems('http://127.0.0.1:12346', tracks), items)
})

test('CLI registration posts both tracks and retries after HTTP or network failure', async t => {
  resetRegisteredCandidates()
  const failures = [() => new Response(null, { status: 502 }), () => { throw new TypeError('offline') }]
  const fetch = t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, `${proxy}/candidates`)
    assert.equal(init.method, 'POST')
    assert.equal(init.headers['Content-Type'], 'application/json')
    assert.deepEqual(JSON.parse(init.body), { items })
    return failures.length ? failures.shift()() : new Response(null, { status: 204 })
  })
  const debug = t.mock.method(console, 'debug', () => {})
  for (let i = 0; i < 4; i++) {
    assert.equal(registerCliCandidates(proxy, tracks), undefined)
    await new Promise(resolve => setImmediate(resolve))
  }
  assert.equal(fetch.mock.callCount(), 3)
  assert.equal(debug.mock.callCount(), 2)
})

async function load(name, imports, globals = {}) {
  const context = createContext({ URL, URLSearchParams, AbortController, AbortSignal, DOMException,
    TextDecoder, setTimeout, clearTimeout, ...globals })
  const url = new URL(`../src/upstream/modules/bilibili/${name}.ts`, import.meta.url)
  const mod = new SourceTextModule(stripTypeScriptTypes(await readFile(url, 'utf8')), { context })
  await mod.link(specifier => {
    const exports = imports[specifier]
    assert.ok(exports, `Unexpected import ${specifier}`)
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
    }, { context })
  })
  await mod.evaluate()
  return mod.namespace
}

test('JSON and NDJSON host resolution register both backup lists before the loopback probe', async () => {
  for (const contentType of ['application/json', 'application/x-ndjson']) {
    let registered
    const api = await load('bilibiliApi', {
      '@/lib/api': { apiFetch: async url => {
        assert.equal(new URL(url, 'https://server.example').searchParams.get('cliHost'), '1')
        return new Response(`${JSON.stringify({ success: true, status: 'done', ...tracks })}\n`,
          { headers: { 'Content-Type': contentType } })
      } },
      '../player/codec-capability': { assertVideoCodecSupported() {} },
      '../../../platform/bilibiliProxy': {
        isEmbeddedBilibiliHost: () => true,
        getEmbeddedProxyStatus: () => ({ sessionVersion: 17 }),
        registerHostMedia: async media => { registered = structuredClone(media) },
        hostMediaReachable: async urls => {
          assert.deepEqual([...urls], [video, audio])
          assert.deepEqual(registered, { ...tracks, sessionVersion: 17 })
          return true
        },
      },
    })
    const result = await api.resolveBilibiliWithOptions('BV1234567890', 64, undefined,
      { cliHost: true, movieId: 2, skipCdnCheck: true })
    for (const [key, value] of Object.entries(tracks)) assert.deepEqual(structuredClone(result[key]), value)
  }
})

test('external CLI resolve keeps both backup lists and registers them before wrapping media URLs', async () => {
  resetRegisteredCandidates()
  const calls = []
  const api = await load('cliApi', {
    './cliCandidates': { registerCliCandidates: (base, source) => calls.push(...buildCandidateItems(base, source)) },
    './bilibiliApi': { getBilibiliVideoView: () => assert.fail('unexpected view request') },
    './nativeQualityPolicy': { getWebViewCapabilities: () => assert.fail('unexpected native lookup') },
    '../player/codec-capability': { assertVideoCodecSupported() {} },
    '../../../platform/bilibiliMediaUrl': { buildCliProxyUrl },
    '../../../platform/connectionTransport': { logicalConnectionUrl: value => value },
    '../../../platform/bilibiliProxy': {
      embeddedBilibiliProxy: {}, isEmbeddedBilibiliHost: () => false, getEmbeddedProxyStatus: () => ({}),
    },
  }, { fetch: async () => Response.json({ success: true, ...tracks }) })
  const result = await api.resolveBilibiliViaCli(proxy, 'BV1234567890', 1)
  assert.deepEqual(result.videoBackupUrls, tracks.videoBackupUrls)
  assert.deepEqual(result.audioBackupUrls, tracks.audioBackupUrls)
  assert.deepEqual(calls, items)
  assert.equal(api.unwrapCliProxyUrl(result.videoUrl), video)
  assert.equal(api.unwrapCliProxyUrl(result.audioUrl), audio)
})
