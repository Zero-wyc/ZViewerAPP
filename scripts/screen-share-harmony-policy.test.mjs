import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'
import { loadTs } from './test-ts-module.mjs'

const flush = async () => { for (let n = 0; n < 8; n++) await Promise.resolve() }
function deferred() { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
function setup(debug = true, backgroundTasks) {
  let dialog, now = 1000
  const delivered = [], tasks = []
  const backgroundMediaTasks = backgroundTasks ?? { set: async (_context, owner, mode) => { tasks.push(['set', owner, mode]) }, release: async owner => { tasks.push(['release', owner]) } }
  const controller = { activations: 0, onActive() { this.activations++ }, runJavaScript: async value => { delivered.push(value) } }
  const { screenShareCapturePolicy: policy } = loadTs('ZV-HarmonyOS/entry/src/main/ets/services/ScreenShareCapturePolicy.ets', {
    '@kit.ArkWeb': {}, '@kit.AbilityKit': {}, BuildProfile: { DEBUG: debug }, './BackgroundMediaTasks': { backgroundMediaTasks },
  }, { Date: { now: () => now }, AlertDialog: { show: value => { dialog = value } }, WebCaptureMode: { HOME_SCREEN: 0 } })
  const handler = (origin = 'https://zviewer.local') => ({ grants: 0, denials: 0, getOrigin: () => origin,
    grant() { this.grants++ }, deny() { this.denials++ } })
  const consent = id => { policy.arm(id, controller); const value = handler(); policy.request(value); dialog.secondaryButton.action(); return value }
  return { policy, controller, handler, delivered, tasks, backgroundMediaTasks, consent, dialog: () => dialog, time: value => { now = value } }
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

test('Harmony expired consent is denied and destruction cancels a pending handler once', async () => {
  const t = setup(); t.policy.arm('expired', t.controller); t.time(17000)
  const expired = t.handler(); t.policy.request(expired); assert.equal(expired.denials, 1)
  t.policy.arm('current', t.controller); const current = t.handler(); t.policy.request(current)
  t.policy.background(); assert.equal(current.denials, 0); assert.equal(t.controller.activations, 0)
  t.policy.end(); t.policy.end(); await flush()
  assert.equal(current.denials, 1); assert.equal(current.grants, 0)
  assert.equal(t.delivered.length, 1); assert.match(t.delivered[0], /zviewer:screen-capture-stop/)
})

test('a granted live capture stays active in background, while cancellation releases its own task', async () => {
  const t = setup(); t.consent('capture')
  await t.policy.started('capture', {})
  assert.equal(t.controller.activations, 1)
  t.policy.background(); t.policy.background()
  assert.equal(t.controller.activations, 3); assert.equal(t.delivered.length, 0)
  assert.deepEqual(t.tasks, [['set', 'capture:capture', 'audioRecording']])
  await t.policy.cancel('stale-session'); assert.deepEqual(t.tasks.at(-1), ['release', 'capture:stale-session'])
  assert.equal(t.tasks.some(([kind, owner]) => kind === 'release' && owner === 'capture:capture'), false)
  await t.policy.cancel('capture'); t.policy.background()
  assert.equal(t.controller.activations, 3)
  assert.deepEqual(t.tasks.at(-1), ['release', 'capture:capture'])
})

test('a failed background task never activates WebView and its session can be cancelled', async () => {
  const t = setup(); t.consent('capture')
  t.backgroundMediaTasks.set = async () => { throw new Error('background start rejected') }
  await assert.rejects(t.policy.started('capture', {}), /background start rejected/)
  t.policy.background(); assert.equal(t.controller.activations, 0)
  await t.policy.cancel('capture')
  assert.deepEqual(t.tasks.at(-1), ['release', 'capture:capture'])
})

test('cancelled background startup cannot revive the old capture or release its replacement', async () => {
  const t = setup(), opening = deferred(); t.consent('first')
  t.backgroundMediaTasks.set = async (_context, owner, mode) => { t.tasks.push(['set', owner, mode]); if (owner === 'capture:first') await opening.promise }
  const first = t.policy.started('first', {}), rejected = assert.rejects(first, /cancelled/)
  await flush(); await t.policy.cancel('first')
  t.consent('second'); await t.policy.started('second', {})
  opening.resolve(); await rejected; t.policy.background()
  assert.equal(t.controller.activations, 2)
  assert.equal(t.tasks.some(([action, owner]) => action === 'release' && owner === 'capture:second'), false)
  assert.deepEqual(t.tasks.at(-1), ['release', 'capture:first'])
})

test('EntryAbility dispatches background retention separately from destruction', () => {
  const calls = []
  const modules = {
    '@kit.AbilityKit': { UIAbility: class {} }, '@kit.PerformanceAnalysisKit': { hilog: {} }, '@kit.ArkUI': {},
    '../services/ScreenShareCapturePolicy': { screenShareCapturePolicy: { background: () => calls.push('background'), end: () => calls.push('end') } },
  }
  const source = stripTypeScriptTypes(readFileSync('ZV-HarmonyOS/entry/src/main/ets/entryability/EntryAbility.ets', 'utf8'))
    .replace(/import\s+\{([\s\S]*?)\}\s+from\s+['"]([^'"]+)['"];?/g, (_match, fields, path) => `const {${fields}} = require(${JSON.stringify(path)});`)
    .replace('export default class EntryAbility', 'class EntryAbility')
  const EntryAbility = runInNewContext(source + '\nEntryAbility', { require: name => { assert(name in modules); return modules[name] } })
  const ability = new EntryAbility()
  ability.onBackground(); ability.onBackground(); assert.deepEqual(calls, ['background', 'background'])
  ability.onDestroy(); assert.deepEqual(calls, ['background', 'background', 'end'])
})

test('policy cancellation retries a failed native stop even after its capture session has been invalidated', async () => {
  let stops = 0
  const { backgroundMediaTasks } = loadTs('ZV-HarmonyOS/entry/src/main/ets/services/BackgroundMediaTasks.ets', {
    '@kit.AbilityKit': { wantAgent: { getWantAgent: async () => ({}), OperationType: { START_ABILITY: 0 }, WantAgentFlags: { UPDATE_PRESENT_FLAG: 0 } } },
    '@kit.BackgroundTasksKit': { backgroundTaskManager: {
      ContinuousTaskRequest: class {}, BackgroundTaskMode: { MODE_AUDIO_RECORDING: 3, MODE_AUDIO_PLAYBACK: 2 },
      BackgroundTaskSubmode: { SUBMODE_NORMAL_NOTIFICATION: 2 }, on() {},
      startBackgroundRunning: async () => ({ continuousTaskId: 42 }), updateBackgroundRunning: async () => ({ continuousTaskId: 42 }),
      stopBackgroundRunning: async () => { if (++stops <= 2) throw new Error('native stop failed') },
    } },
  })
  const t = setup(true, backgroundMediaTasks); t.consent('capture'); await t.policy.started('capture', {})
  await assert.rejects(t.policy.cancel('capture'), /native stop failed/)
  await t.policy.cancel('capture'); assert.equal(stops, 3)
  await t.policy.cancel('capture'); assert.equal(stops, 3, 'no capture owner remains after retry succeeds')
})
