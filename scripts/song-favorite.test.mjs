import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm'
const source = stripTypeScriptTypes(await readFile(new URL('../src/upstream/modules/music/hooks/useSongFavorite.ts', import.meta.url), 'utf8'))
async function harness() {
  const effects = [], requests = []
  function create(init) {
    let state = init(), listeners = []
    const store = select => select(state)
    store.getState = () => state
    store.setState = update => { const previous = state; state = { ...state, ...(typeof update === 'function' ? update(state) : update) }; listeners.forEach(fn => fn(state, previous)) }
    store.subscribe = fn => { listeners.push(fn); return () => { listeners = listeners.filter(f => f !== fn) } }
    return store
  }
  const music = create(() => ({ loginStatus: { loggedIn: true, nickname: 'test-account' } }))
  const auth = create(() => ({ user: { id: '1' } }))
  const deps = {
    react: { useCallback: fn => fn, useEffect: fn => effects.push(fn), useState: value => [value, () => {}] },
    zustand: { create }, '../store': { useMusicStore: music }, '@/store/authStore': { useAuthStore: auth },
    '@/lib/api': { getApiUrl: () => 'https://example.test' },
    '../musicApi': { apiGet: url => new Promise((resolve, reject) => requests.push({ url, resolve, reject })), apiPost: () => {} },
    '@/components/ui/message': { message: { error() {}, success() {} } },
    '../store-settings': { useMusicSettingsStore: fn => fn({ biliLikeFavTitle: 'Music' }), normalizeBiliLikeFavTitle: v => v },
  }
  const context = createContext({ console, Date, Promise, Map })
  const module = new SourceTextModule(source, { context })
  await module.link(specifier => {
    const exports = deps[specifier]
    assert.ok(exports, specifier)
    return new SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value) }, { context })
  })
  await module.evaluate()
  const render = (songId = 42) => module.namespace.useSongFavorite({ songId, biliBvid: null, ncmLoggedIn: true })
  const flush = async () => { effects.splice(0).forEach(fn => fn()); for (let i = 0; i < 8; i++) await Promise.resolve() }
  return { render, flush, requests, music }
}
test('two player surfaces share one initial favorite query and its result', async () => {
  const h = await harness(); h.render(); h.render(); await h.flush()
  assert.equal(h.requests.length, 1)
  h.requests[0].resolve({ data: { account: { id: 1 } } }); await h.flush()
  h.requests[1].resolve({ data: { ids: [42] } }); await h.flush()
  assert.equal(h.render().liked, true); assert.equal(h.render().liked, true)
})
test('optimistic toggle is shared immediately; late initial lookup cannot overwrite it', async () => {
  const h = await harness(); h.render(); await h.flush()
  h.requests[0].resolve({ data: { account: { id: 1 } } }); await h.flush()
  const operation = h.render().toggleLike(); assert.equal(h.render().liked, true)
  h.requests[1].resolve({ data: { ids: [] } }); await h.flush()
  assert.equal(h.render().liked, true)
  h.requests[2].resolve({ ok: true }); await operation
  assert.equal(h.render().likeBusy, false)
})
test('duplicate taps are serialized and failure rolls back both surfaces', async () => {
  const h = await harness(); const operation = h.render().toggleLike(); await h.render().toggleLike()
  assert.equal(h.requests.length, 1); assert.equal(h.render().likeBusy, true)
  h.requests[0].reject(new Error('offline')); await operation
  assert.equal(h.render().liked, false); assert.equal(h.render().likeBusy, false)
})
test('switching song/account isolates late mutation failures', async () => {
  const h = await harness(); const operation = h.render(42).toggleLike()
  assert.equal(h.render(43).liked, false)
  h.music.setState({ loginStatus: { loggedIn: false } })
  h.music.setState({ loginStatus: { loggedIn: true, nickname: 'second' } })
  h.requests[0].reject(new Error('late failure')); await operation
  assert.equal(h.render(42).liked, false)
})
