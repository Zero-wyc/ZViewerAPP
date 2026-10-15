import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './test-ts-module.mjs'

function createStore() {
  let state
  const create = initializer => {
    const set = update => {
      const next = typeof update === 'function' ? update(state) : update
      state = { ...state, ...next }
    }
    state = initializer(set)
    const hook = selector => selector(state)
    hook.getState = () => state
    return hook
  }

  return loadTs('src/upstream/modules/music/store.ts', {
    zustand: { create },
    '@/modules/room/watch-together/resolveSource': {
      buildBilibiliImageProxyUrl: url => url,
      isBilibiliImageUrl: () => false,
    },
    './store-settings': {
      useMusicSettingsStore: { getState: () => ({ defaultSourcePage: 'home' }) },
      normalizeDefaultSourcePage: source => source,
    },
  }, {
    localStorage: { getItem: () => null, setItem() {} },
    setTimeout,
    clearTimeout,
  }).useMusicStore
}

test('opening the full player closes the widget queue and transfers ownership', () => {
  const store = createStore()
  store.getState().openQueuePopup('widget')

  store.getState().setPlayerOverlayOpen(true)

  assert.equal(store.getState().playerOverlayOpen, true)
  assert.equal(store.getState().queuePopupOpen, false)
  assert.equal(store.getState().queuePopupOwner, 'player')
})

test('queue toggles are owner-scoped and stale widget close callbacks are ignored', () => {
  const store = createStore()
  store.getState().setPlayerOverlayOpen(true)
  store.getState().toggleQueuePopup('player')

  store.getState().closeQueuePopup('widget')
  assert.equal(store.getState().queuePopupOpen, true)
  assert.equal(store.getState().queuePopupOwner, 'player')

  store.getState().toggleQueuePopup('player')
  assert.equal(store.getState().queuePopupOpen, false)
})

test('the widget regains queue ownership after the player close animation', async () => {
  const store = createStore()
  store.getState().setPlayerOverlayOpen(true)
  store.getState().toggleQueuePopup('player')

  store.getState().closePlayerOverlay()
  assert.equal(store.getState().playerOverlayClosing, true)
  assert.equal(store.getState().queuePopupOpen, false)

  await new Promise(resolve => setTimeout(resolve, 520))
  assert.equal(store.getState().playerOverlayOpen, false)
  assert.equal(store.getState().playerOverlayClosing, false)
  assert.equal(store.getState().queuePopupOwner, 'widget')
})

test('hidden widget and closing player callbacks cannot open a queue', () => {
  const store = createStore()
  store.getState().setPlayerOverlayOpen(true)
  store.getState().openQueuePopup('widget')
  assert.equal(store.getState().queuePopupOpen, false)
  assert.equal(store.getState().queuePopupOwner, 'player')

  store.getState().closePlayerOverlay()
  store.getState().toggleQueuePopup('player')
  assert.equal(store.getState().queuePopupOpen, false)
  store.getState().reset()
})

test('reopening or resetting cancels a pending player close', async () => {
  const store = createStore()
  store.getState().setPlayerOverlayOpen(true)
  store.getState().closePlayerOverlay()
  store.getState().setPlayerOverlayOpen(true)
  store.getState().toggleQueuePopup('player')

  await new Promise(resolve => setTimeout(resolve, 520))
  assert.equal(store.getState().playerOverlayOpen, true)
  assert.equal(store.getState().queuePopupOpen, true)

  store.getState().closePlayerOverlay()
  store.getState().reset()
  store.getState().setPlayerOverlayOpen(true)
  await new Promise(resolve => setTimeout(resolve, 520))
  assert.equal(store.getState().playerOverlayOpen, true)
})
