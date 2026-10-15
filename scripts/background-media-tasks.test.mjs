import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './test-ts-module.mjs'

const flush = async () => { for (let n = 0; n < 8; n++) await Promise.resolve() }
function deferred() { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
function harness() {
  const calls = [], context = {}, agent = {}, listeners = new Map()
  const modes = request => Array.from(request.backgroundTaskModes).includes(3) ? ['audioRecording'] : ['audioPlayback']
  const manager = {
    ContinuousTaskRequest: class {},
    BackgroundTaskMode: { MODE_AUDIO_RECORDING: 3, MODE_AUDIO_PLAYBACK: 2 },
    BackgroundTaskSubmode: { SUBMODE_NORMAL_NOTIFICATION: 2 },
    on(event, callback) { listeners.set(event, callback) },
    async startBackgroundRunning(ctx, request) { assert.equal(ctx, context); assert.equal(request.wantAgent, agent); assert.equal(request.backgroundTaskModes.length,request.backgroundTaskSubmodes.length); assert(request.backgroundTaskModes.includes(2), 'ArkWeb audio render must be declared alongside capture'); calls.push(['start', modes(request)]); return { continuousTaskId: 42 } },
    async updateBackgroundRunning(ctx, request) { assert.equal(ctx, context); assert.equal(request.continuousTaskId, 42); calls.push(['update', modes(request)]); return { continuousTaskId: 42 } },
    async stopBackgroundRunning(ctx, id) { assert.equal(ctx, context); assert.equal(id,42); calls.push(['stop']) },
  }
  const { backgroundMediaTasks: tasks } = loadTs('ZV-HarmonyOS/entry/src/main/ets/services/BackgroundMediaTasks.ets', {
    '@kit.AbilityKit': { wantAgent: { getWantAgent: async () => agent, OperationType: { START_ABILITY: 0 }, WantAgentFlags: { UPDATE_PRESENT_FLAG: 0 } } },
    '@kit.BackgroundTasksKit': { backgroundTaskManager: manager },
  })
  return { tasks, calls, context, manager, listeners }
}

test('capture and playback owners update the union; stopping either never stops the surviving owner', async () => {
  const t = harness()
  await t.tasks.set(t.context, 'capture:one', 'audioRecording')
  await t.tasks.set(t.context, 'playback', 'audioPlayback')
  await t.tasks.release('capture:one')
  assert.deepEqual(t.calls, [['start', ['audioRecording']], ['update', ['audioRecording']], ['update', ['audioPlayback']]])
  await t.tasks.set(t.context, 'capture:two', 'audioRecording')
  await t.tasks.release('playback')
  assert.deepEqual(t.calls.at(-1), ['update', ['audioRecording']])
  await t.tasks.release('capture:two'); assert.deepEqual(t.calls.at(-1), ['stop'])
  await t.tasks.release('capture:two'); assert.equal(t.calls.filter(([kind]) => kind === 'stop').length, 1)
})

test('failed task start and update roll back owners without poisoning subsequent operations', async () => {
  const t = harness(), start = t.manager.startBackgroundRunning, update = t.manager.updateBackgroundRunning
  t.manager.startBackgroundRunning = async () => { throw new Error('start failed') }
  await assert.rejects(t.tasks.set(t.context, 'capture:failed', 'audioRecording'), /start failed/)
  t.manager.startBackgroundRunning = start
  await t.tasks.set(t.context, 'playback', 'audioPlayback')
  assert.deepEqual(t.calls.at(-1), ['start', ['audioPlayback']])
  t.manager.updateBackgroundRunning = async () => { throw new Error('update failed') }
  await assert.rejects(t.tasks.set(t.context, 'capture:failed', 'audioRecording'), /update failed/)
  t.manager.updateBackgroundRunning = update
  await t.tasks.release('playback'); assert.deepEqual(t.calls.at(-1), ['stop'])
})

test('a failed stop remains retryable and cannot silently drop the running task owner', async () => {
  const t = harness(); await t.tasks.set(t.context, 'capture:one', 'audioRecording')
  const stop = t.manager.stopBackgroundRunning
  t.manager.stopBackgroundRunning = async () => { throw new Error('stop failed') }
  await assert.rejects(t.tasks.release('capture:one'), /stop failed/)
  t.manager.stopBackgroundRunning = stop
  await t.tasks.release('capture:one')
  assert.deepEqual(t.calls.at(-1), ['stop'])
})

test('a release queued during task startup waits for startup and preserves a concurrently added playback owner', async () => {
  const t = harness(), opening = deferred(), start = t.manager.startBackgroundRunning
  t.manager.startBackgroundRunning = async (...args) => { await opening.promise; return start(...args) }
  const capture = t.tasks.set(t.context, 'capture:one', 'audioRecording')
  await flush()
  const playback = t.tasks.set(t.context, 'playback', 'audioPlayback'), ending = t.tasks.release('capture:one')
  assert.equal(t.calls.length, 0)
  opening.resolve(); await Promise.all([capture, playback, ending])
  assert.deepEqual(t.calls, [['start', ['audioRecording']], ['update', ['audioRecording']], ['update', ['audioPlayback']]])
})

test('immediate cancellation before the task queue runs releases the newly requested task', async () => {
  const t = harness()
  const start = t.tasks.set(t.context, 'capture:one', 'audioRecording')
  const stop = t.tasks.release('capture:one')
  await Promise.all([start, stop])
  assert.deepEqual(t.calls, [['start', ['audioRecording']], ['stop']])
})

test('an OS cancellation revokes current owners once and cannot stop a new session through a stale callback', async () => {
  const t = harness(); let ended = 0
  await t.tasks.set(t.context, 'capture:one', 'audioRecording', () => ended++)
  t.listeners.get('continuousTaskCancel')({ id: 12 }); assert.equal(ended,0)
  t.listeners.get('continuousTaskCancel')({ id: 42 }); assert.equal(ended,1)
  t.listeners.get('continuousTaskCancel')({ id: 42 }); assert.equal(ended,1)
  await t.tasks.release('capture:one')
  assert.equal(t.calls.filter(([kind])=>kind==='stop').length,0)
  await t.tasks.set(t.context, 'capture:two', 'audioRecording')
  assert.equal(t.calls.at(-1)[0],'start')
})

test('a transient OS stop error is retried within the ordinary release operation', async () => {
  const t = harness(); await t.tasks.set(t.context,'capture:one','audioRecording')
  let attempts=0; const stop=t.manager.stopBackgroundRunning
  t.manager.stopBackgroundRunning=async(...args)=>{if(++attempts===1)throw Error('transient');return stop(...args)}
  await t.tasks.release('capture:one'); assert.equal(attempts,2)
})
