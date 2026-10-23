import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm'
import { resolveBilibiliAudioWithFallback, selectBilibiliAudioStream } from '../src/upstream/modules/music/utils/bilibiliAudioStream.ts'

test('Bilibili listening selects the independent audio track from a DASH response', () => {
  assert.equal(selectBilibiliAudioStream({
    format: 'dash', videoUrl: 'https://media.invalid/video.m4s', audioUrl: 'https://media.invalid/audio.m4s',
  }), 'https://media.invalid/audio.m4s')
})

test('a silent DASH video track cannot be substituted for a missing audio track', () => {
  assert.throws(() => selectBilibiliAudioStream({ format: 'dash', videoUrl: 'https://media.invalid/video.m4s' }), /音轨/)
})

test('older server responses can still provide a muxed MP4 when no separate audio is available', () => {
  assert.equal(selectBilibiliAudioStream({ format: 'mp4', videoUrl: 'https://media.invalid/muxed.mp4' }), 'https://media.invalid/muxed.mp4')
  assert.equal(selectBilibiliAudioStream({ videoUrl: 'https://media.invalid/legacy.mp4' }), 'https://media.invalid/legacy.mp4')
})

test('an explicit audio track takes precedence over format and no empty source is accepted', () => {
  assert.equal(selectBilibiliAudioStream({ format: 'mp4', videoUrl: 'https://media.invalid/muxed.mp4', audioUrl: 'https://media.invalid/audio.m4a' }), 'https://media.invalid/audio.m4a')
  assert.throws(() => selectBilibiliAudioStream({}), /音轨/)
})

async function loadSource(relativePath, imports, globals = {}) {
  const context = createContext({ console, URL, URLSearchParams, Response, AbortController, AbortSignal, DOMException, setTimeout, clearTimeout, ...globals })
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8')
  const module = new SourceTextModule(stripTypeScriptTypes(source), { context })
  await module.link(name => {
    const exports = imports[name]
    assert.ok(exports, `Unexpected dependency: ${name}`)
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
    }, { context })
  })
  await module.evaluate()
  return module.namespace
}

const sourcePayload = {
  success: true, status: 'done', format: 'dash', videoUrl: 'https://media.invalid/video.m4s',
  audioUrl: 'https://media.invalid/audio.m4s', videoCodec: 'av01.0.08M.08',
}
const rejectVideoCodec = () => { throw new Error('unsupported video decoder') }

for (const contentType of ['application/json', 'application/x-ndjson']) {
  test(`server audio-only resolution works with an unsupported video codec (${contentType})`, async () => {
    let requested = ''
    const api = await loadSource('../src/upstream/modules/bilibili/bilibiliApi.ts', {
      '@/lib/api': { apiFetch: async url => {
        requested = url
        return new Response(JSON.stringify(sourcePayload), { headers: { 'content-type': contentType } })
      } },
      '../player/codec-capability': { assertVideoCodecSupported: rejectVideoCodec },
    })
    const resolved = await api.resolveBilibiliWithOptions('https://www.bilibili.com/video/BV1234567890', 64, undefined, { forceDash: true, audioOnly: true })
    assert.equal(selectBilibiliAudioStream(resolved), sourcePayload.audioUrl)
    assert.match(requested, /forceDash=true/)
    assert.doesNotMatch(requested, /preferMp4=true/)
    await assert.rejects(api.resolveBilibiliWithOptions('https://www.bilibili.com/video/BV1234567890'), /unsupported video decoder/)
  })

  test(`MP4-only server responses retry only DASH_NOT_AVAILABLE (${contentType})`, async () => {
    const requests = []
    const api = await loadSource('../src/upstream/modules/bilibili/bilibiliApi.ts', {
      '@/lib/api': { apiFetch: async url => {
        requests.push(url)
        const payload = requests.length === 1
          ? { success: false, status: 'error', code: 'DASH_NOT_AVAILABLE', message: '该视频不支持 DASH 高清播放' }
          : { success: true, status: 'done', format: 'mp4', videoUrl: 'https://media.invalid/muxed.mp4' }
        return new Response(JSON.stringify(payload), { headers: { 'content-type': contentType } })
      } },
      '../player/codec-capability': { assertVideoCodecSupported: () => {} },
    })
    const resolved = await resolveBilibiliAudioWithFallback(options => api.resolveBilibiliWithOptions('https://www.bilibili.com/video/BV1234567890', 64, undefined, options))
    assert.equal(selectBilibiliAudioStream(resolved), 'https://media.invalid/muxed.mp4')
    assert.equal(requests.length, 2)
    assert.match(requests[0], /forceDash=true/)
    assert.match(requests[1], /preferMp4=true/)
    assert.doesNotMatch(requests[1], /forceDash=true/)
  })

  for (const code of ['NO_PERMISSION', 'CDN_UNREACHABLE']) {
    test(`${code} is not retried as MP4 (${contentType})`, async () => {
      let requests = 0
      const api = await loadSource('../src/upstream/modules/bilibili/bilibiliApi.ts', {
        '@/lib/api': { apiFetch: async () => {
          requests++
          return new Response(JSON.stringify({ success: false, status: 'error', code, message: 'original failure' }), { headers: { 'content-type': contentType } })
        } },
        '../player/codec-capability': { assertVideoCodecSupported: () => {} },
      })
      await assert.rejects(resolveBilibiliAudioWithFallback(options => api.resolveBilibiliWithOptions('https://www.bilibili.com/video/BV1234567890', 64, undefined, options)), error => error.code === code && error.message === 'original failure')
      assert.equal(requests, 1)
    })
  }
}

test('transport failures do not trigger a second format request', async () => {
  let requests = 0
  const api = await loadSource('../src/upstream/modules/bilibili/bilibiliApi.ts', {
    '@/lib/api': { apiFetch: async () => { requests++; throw new TypeError('network failed') } },
    '../player/codec-capability': { assertVideoCodecSupported: () => {} },
  })
  await assert.rejects(resolveBilibiliAudioWithFallback(options => api.resolveBilibiliWithOptions('https://www.bilibili.com/video/BV1234567890', 64, undefined, options)), /network failed/)
  assert.equal(requests, 1)
})

test('CLI audio-only resolution leaves the video capability guard active for video playback', async () => {
  const api = await loadSource('../src/upstream/modules/bilibili/cliApi.ts', {
    '../../../platform/connectionTransport': { logicalConnectionUrl: value => value },
    '../../../platform/bilibiliProxy': {
      embeddedBilibiliProxy: { logout: async () => {} },
      getEmbeddedProxyStatus: () => ({ sessionVersion: 1, proxyUrl: 'http://127.0.0.1:9333' }),
      isEmbeddedBilibiliHost: () => true,
    },
    './nativeQualityPolicy': { getWebViewCapabilities: async () => ({}) },
    '../player/codec-capability': { assertVideoCodecSupported: rejectVideoCodec },
  }, { fetch: async () => new Response(JSON.stringify(sourcePayload)) })
  const resolved = await api.resolveBilibiliViaCli('http://127.0.0.1:9333', 'BV1234567890', 42, undefined, false, true, { audioOnly: true })
  assert.equal(selectBilibiliAudioStream(resolved), sourcePayload.audioUrl)
  await assert.rejects(api.resolveBilibiliViaCli('http://127.0.0.1:9333', 'BV1234567890', 42), /unsupported video decoder/)
})

test('Android app lifecycle overrides a WebView deliberately kept visible and ignores a stale initial snapshot', async () => {
  let value
  let effect
  let appListener
  let initialState
  let removed = false
  const document = new EventTarget()
  document.hidden = false
  const api = await loadSource('../src/mobile/useAppVisibility.ts', {
    react: { useState: init => { value = init(); return [value, next => { value = next }] }, useEffect: fn => { effect = fn } },
    '@capacitor/app': { App: {
      addListener: async (_name, fn) => { appListener = fn; return { remove: async () => { removed = true } } },
      getState: () => new Promise(resolve => { initialState = resolve }),
    } },
    '../platform/runtime': { getRuntimePlatform: () => 'android' },
  }, { document, window: new EventTarget() })
  api.useAppVisibility()
  const cleanup = effect()
  appListener({ isActive: false })
  initialState({ isActive: true })
  await Promise.resolve()
  assert.equal(value, false, 'late getState must not restart the silent video in background')
  document.dispatchEvent(new Event('visibilitychange'))
  assert.equal(value, false, 'the active playback WebView is not the application visibility authority')
  appListener({ isActive: true })
  assert.equal(value, true)
  cleanup()
  assert.equal(removed, true)
})

test('Harmony only retains a background Web engine with an active playback lease', async () => {
  let active = 0
  const scripts = []
  const api = await loadSource('../ZV-HarmonyOS/entry/src/main/ets/services/NativeMediaSession.ets', {
    '@kit.AbilityKit': { common: {}, wantAgent: {}, WantAgent: {} },
    '@kit.AVSessionKit': { avSession: {} },
    './BackgroundMediaTasks': { backgroundMediaTasks: {} },
    '@kit.ImageKit': { image: {} },
    '@kit.NetworkKit': { http: {} },
    '@kit.ArkWeb': { webview: {} },
  })
  const session = new api.NativeMediaSession({}, { onActive: () => { active++ }, runJavaScript: async script => { scripts.push(script) } })
  session.state = { playing: true }
  api.NativeMediaSession.appVisibility(false)
  assert.equal(active, 0, 'metadata without a system lease must not retain the engine')
  session.backgroundRunning = true
  api.NativeMediaSession.appVisibility(false)
  assert.equal(active, 1)
  assert.match(scripts.at(-1), /active:false/)
  session.state.playing = false
  api.NativeMediaSession.appVisibility(false)
  assert.equal(active, 1, 'paused playback must not be kept alive')
  api.NativeMediaSession.appVisibility(true)
  assert.equal(active, 2)
})

for (const [visible, playing, expectedPause] of [[false, true, 1], [true, false, 1], [true, true, 0]]) {
  test(`a late MV autoplay follows app visibility (${visible}) and music playback (${playing})`, async () => {
    let paused = 0
    let ready = null
    const api = await loadSource('../src/upstream/modules/music/hooks/useBackgroundVideoSync.ts', {
      react: {
        useCallback: fn => fn, useEffect: () => {}, useMemo: fn => fn(),
        useRef: current => ({ current }),
        useState: initial => [initial, value => { ready = value }],
      },
      '@/modules/player': { usePlayerSource: () => ({ attachSource: async () => {}, cleanup: () => {} }) },
      '../../../../mobile/useAppVisibility': { useAppVisibility: () => visible },
      '../constants': {
        BG_VIDEO_CATCHUP_EPSILON_SEC: .2, BG_VIDEO_CATCHUP_GAIN_SEC: 20, BG_VIDEO_MAX_RATE: 1.1,
        BG_VIDEO_MIN_RATE: .9, BG_VIDEO_SEEK_DEBOUNCE_MS: 300, BG_VIDEO_SYNC_THRESHOLD_SEC: 2,
      },
      './usePlaybackPosition': { getPositionSec: () => 0 },
    })
    const hook = api.useBackgroundVideoSync({ source: { url: 'https://media.invalid/mv.mp4' }, status: 'ready', isPlaying: playing })
    hook.videoRef.current = { pause: () => { paused++ } }
    hook.videoHandlers.onPlaying()
    assert.equal(paused, expectedPause)
    assert.equal(ready, expectedPause ? null : 'https://media.invalid/mv.mp4')
  })
}
