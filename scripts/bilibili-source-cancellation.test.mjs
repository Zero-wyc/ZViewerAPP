import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm'
import { awaitAbortable } from '../src/upstream/modules/player/utils/abortable.ts'
import { isSamePlayerSource } from '../src/upstream/modules/player/services/source-identity.ts'

const source = stripTypeScriptTypes(await readFile(new URL('../src/upstream/modules/player/hooks/usePlayerSource.ts', import.meta.url), 'utf8'))

async function player() {
  const effects = [], calls = [], resets = [], progress = [], playbackErrors = [], revoked = []
  const video = Object.assign(new EventTarget(), {
    isConnected: true, paused: true, currentTime: 0, currentSrc: '', playbackRate: 1,
    pause() { this.paused = true }, load() {}, removeAttribute() {},
  })
  const engine = {
    type: 'direct',
    attach(element, input) {
      return new Promise((resolve, reject) => {
        const call = {
          element, source: input, signal: input.signal, cleanups: 0,
          finish(result = {}) {
            element.currentSrc = input.url
            resolve({ ...result, cleanup() { call.cleanups++; result.cleanup?.() } })
          },
          fail: reject,
        }
        calls.push(call)
      })
    },
  }
  const imports = {
    react: { useCallback: fn => fn, useEffect: fn => effects.push(fn), useRef: current => ({ current }) },
    '@/store/roomStore': { useRoomStore: { getState: () => ({
      roomSessionRevision: 1, currentMovieId: 1, setMediaAttachProgress: value => progress.push(value),
    }) } },
    '@/modules/player': {
      selectEngine: () => engine, shouldUsePlaysVideo: () => false,
      resetVideoElement: element => { resets.push(element); element.currentSrc = '' },
      resolveProxyUrl: value => value, isLocalUrl: () => false, isRelativeUrl: () => false,
    },
    '@/lib/api': { refreshAccessToken: () => assert.fail('third-party cancellation cannot refresh app credentials') },
    '@/modules/player/utils': { formatVideoLoadError: code => `fixture error ${code}` },
    '../services/source-identity': { isSamePlayerSource },
    '../codec-capability': { assertVideoCodecSupported() {} },
    '../utils/abortable': { awaitAbortable },
    '@/lib/mediaFormat': { isBrowserPlayableFormat: () => true, getUnsupportedFormatMessage: () => 'unsupported' },
  }
  const context = createContext({
    console, Error, DOMException, AbortController, AbortSignal,
    URL: class extends URL { static revokeObjectURL(value) { revoked.push(value) } },
  })
  const module = new SourceTextModule(source, { context })
  await module.link(name => {
    const exports = imports[name]
    assert.ok(exports, `Missing import ${name}`)
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
    }, { context })
  })
  await module.evaluate()
  const api = module.namespace.usePlayerSource({ videoRef: { current: video }, onPlaybackError: error => playbackErrors.push(error) })
  const cleanups = effects.map(fn => fn()).filter(Boolean)
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }
  return { api, video, calls, resets, progress, playbackErrors, revoked, flush,
    dispose() { cleanups.forEach(fn => fn()) },
    get activeEngineType() { return module.namespace.getActiveEngineType(video) } }
}

const media = (name = 'a', signal) => ({ url: `https://cdn.example/${name}.mp4`, format: 'mp4', ...(signal ? { signal } : {}) })

function settlement(promise) {
  const state = { done: false, error: null }
  promise.then(() => { state.done = true }, error => { state.done = true; state.error = error })
  return state
}

test('an aborted queued recovery rejects immediately and never attaches after the earlier source finishes', async () => {
  const h = await player()
  const first = h.api.attachSource(h.video, media('first'))
  await h.flush(); assert.equal(h.calls.length, 1)
  const controller = new AbortController()
  const cancelled = h.api.forceReload(h.video, media('cancelled', controller.signal))
  const state = settlement(cancelled)
  await h.flush(); assert.equal(state.done, false)
  const reason = new DOMException('recovery timed out', 'AbortError')
  controller.abort(reason)
  await assert.rejects(cancelled, error => error === reason)
  assert.equal(state.done, true)
  assert.equal(h.calls.length, 1)
  h.calls[0].finish(); await first; await h.flush()
  assert.equal(h.calls.length, 1, 'aborted queue entries cannot perform a late attach')
  assert.equal(h.api.appliedSourceUrlRef.current, media('first').url)
  const replacement = h.api.attachSource(h.video, media('replacement'))
  await h.flush(); assert.equal(h.calls.length, 2)
  assert.equal(h.calls[0].cleanups, 1)
  h.calls[1].finish(); await replacement
  assert.equal(h.api.appliedSourceUrlRef.current, media('replacement').url)
  h.dispose()
})

test('cancellation reaches the active engine signal and a late attach result is disposed instead of applied', async () => {
  const h = await player(), controller = new AbortController()
  const pending = h.api.forceReload(h.video, media('expired', controller.signal))
  settlement(pending)
  await h.flush(); assert.equal(h.calls.length, 1)
  assert.notEqual(h.calls[0].signal, controller.signal, 'the hook owns a separate cleanup signal')
  const reason = new Error('attempt deadline')
  controller.abort(reason)
  await assert.rejects(pending, error => error === reason)
  assert.equal(h.calls[0].signal.aborted, true)
  assert.equal(h.calls[0].signal.reason, reason)
  h.calls[0].finish(); await h.flush()
  assert.equal(h.calls[0].cleanups, 1)
  assert.equal(h.api.appliedSourceUrlRef.current, null)
  assert.equal(h.activeEngineType, null)
  assert.equal(h.playbackErrors.length, 0)
  const next = h.api.forceReload(h.video, media('fresh', new AbortController().signal))
  await h.flush(); assert.equal(h.calls.length, 2)
  h.calls[1].finish(); await next
  assert.equal(h.api.appliedSourceUrlRef.current, media('fresh').url)
  assert.equal(h.calls[1].cleanups, 0)
  h.dispose()
})

test('cleanup aborts an in-flight engine and its late result cannot clear a newer queued session', async () => {
  const h = await player()
  const first = h.api.attachSource(h.video, media('obsolete'))
  await h.flush(); assert.equal(h.calls.length, 1)
  h.api.cleanup()
  assert.equal(h.calls[0].signal.aborted, true)
  const replacement = h.api.forceReload(h.video, media('replacement'))
  h.calls[0].finish(); await first; await h.flush()
  assert.equal(h.calls[0].cleanups, 1)
  assert.equal(h.calls.length, 2)
  h.calls[1].finish(); await replacement
  assert.equal(h.api.appliedSourceUrlRef.current, media('replacement').url)
  assert.equal(h.calls[1].cleanups, 0)
  assert.equal(h.activeEngineType, 'direct')
  h.dispose()
})

test('normal source deduplication and force reload retain their behavior without recovery signals', async () => {
  const h = await player(), input = media()
  const first = h.api.attachSource(h.video, input)
  await h.flush(); h.calls[0].finish(); await first
  await h.api.attachSource(h.video, { ...input })
  assert.equal(h.calls.length, 1)
  const reload = h.api.forceReload(h.video, { ...input, startTime: 75 })
  await h.flush()
  assert.equal(h.calls.length, 2)
  assert.equal(h.calls[0].cleanups, 1)
  assert.equal(h.calls[1].source.startTime, 75)
  h.calls[1].finish(); await reload
  assert.equal(h.api.appliedSourceUrlRef.current, input.url)
  h.dispose()
  assert.equal(h.calls[1].cleanups, 1)
})

test('a recovery of the same source waits for its own attachment rather than falsely joining a scheduled normal reload', async () => {
  const h = await player(), input = media()
  const normal = h.api.forceReload(h.video, input)
  await h.flush(); assert.equal(h.calls.length, 1)
  const recovery = h.api.forceReload(h.video, media('a', new AbortController().signal))
  const state = settlement(recovery)
  await h.flush()
  assert.equal(state.done, false)
  assert.equal(h.calls.length, 1)
  h.calls[0].finish(); await normal; await h.flush()
  assert.equal(state.done, false)
  assert.equal(h.calls.length, 2, 'same URL recovery must own a fresh attach operation')
  h.calls[1].finish(); await recovery
  assert.equal(state.done, true)
  assert.equal(state.error, null)
  h.dispose()
})

test('an already aborted request rejects even when an identical source is already applied', async () => {
  const h = await player(), input = media()
  const first = h.api.attachSource(h.video, input)
  await h.flush(); h.calls[0].finish(); await first
  const controller = new AbortController(), reason = new DOMException('replaced', 'AbortError')
  controller.abort(reason)
  await assert.rejects(h.api.attachSource(h.video, { ...input, signal: controller.signal }), error => error === reason)
  await assert.rejects(h.api.forceReload(h.video, { ...input, signal: controller.signal }), error => error === reason)
  assert.equal(h.calls.length, 1)
  assert.equal(h.calls[0].cleanups, 0)
  assert.equal(h.api.appliedSourceUrlRef.current, input.url)
  h.dispose()
})
