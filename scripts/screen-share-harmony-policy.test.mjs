import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './test-ts-module.mjs'

function setup(debug = true) {
  let dialog, now = 1000
  const delivered = []
  const controller = { runJavaScript: async value => { delivered.push(value) } }
  const { screenShareCapturePolicy: policy } = loadTs('ZV-HarmonyOS/entry/src/main/ets/services/ScreenShareCapturePolicy.ets', {
    '@kit.ArkWeb': {}, BuildProfile: { DEBUG: debug },
  }, { Date: { now: () => now }, AlertDialog: { show: value => { dialog = value } }, WebCaptureMode: { HOME_SCREEN: 0 } })
  const handler = (origin = 'https://zviewer.local') => ({ grants: 0, denials: 0, getOrigin: () => origin,
    grant() { this.grants++ }, deny() { this.denials++ } })
  return { policy, controller, handler, delivered, dialog: () => dialog, time: value => { now = value } }
}

test('Harmony production and foreign origins never receive capture authorization', () => {
  const production = setup(false)
  assert.throws(() => production.policy.arm('session-1', production.controller), /unsupported/)
  const denied = production.handler(); production.policy.request(denied)
  assert.equal(denied.denials, 1); assert.equal(denied.grants, 0)
  const t = setup(); t.policy.arm('session-1', t.controller)
  for (const origin of ['https://zviewer.local.evil', 'http://zviewer.local', 'https://foreign.example']) {
    const h = t.handler(origin); t.policy.request(h); assert.equal(h.denials, 1); assert.equal(h.grants, 0)
  }
})

test('Harmony requires an armed session and explicit consent; old dialog actions cannot grant a new session', () => {
  const t = setup(), initial = t.handler()
  t.policy.request(initial); assert.equal(initial.denials, 1)
  t.policy.arm('session-1', t.controller)
  const first = t.handler(); t.policy.request(first); const oldDialog = t.dialog()
  const duplicate = t.handler(); t.policy.request(duplicate); assert.equal(duplicate.denials, 1)
  t.policy.cancel('session-1'); assert.equal(first.denials, 1)
  t.policy.arm('session-2', t.controller); const current = t.handler('https://zviewer.local/'); t.policy.request(current)
  oldDialog.secondaryButton.action(); assert.equal(first.grants, 0); assert.equal(current.grants, 0)
  t.dialog().secondaryButton.action(); t.dialog().secondaryButton.action()
  assert.equal(current.grants, 1)
})

test('Harmony expired consent is denied and background disposal cancels a pending handler once', async () => {
  const t = setup(); t.policy.arm('expired', t.controller); t.time(17000)
  const expired = t.handler(); t.policy.request(expired); assert.equal(expired.denials, 1)
  t.policy.arm('current', t.controller); const current = t.handler(); t.policy.request(current)
  t.policy.end(); t.policy.end(); await Promise.resolve()
  assert.equal(current.denials, 1); assert.equal(current.grants, 0)
  assert.equal(t.delivered.length, 1); assert.match(t.delivered[0], /zviewer:screen-capture-stop/)
})
