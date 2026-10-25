import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm'
import { FmRecovery } from '../src/upstream/modules/music/fm-recovery.ts'
import { usePersonalFmStore as fm } from '../src/upstream/modules/music/personal-fm.ts'
import { getAddressScope } from '../src/upstream/lib/netAddress.ts'
import * as transport from '../src/platform/connectionTransport.ts'

async function loadShareUrl() {
  const module = new SourceTextModule(stripTypeScriptTypes(await readFile(new URL('../src/upstream/modules/room/roomShareLink.ts', import.meta.url), 'utf8')), { context: createContext({ URL }) })
  await module.link(() => new SyntheticModule(['logicalConnectionUrl'], function () {
    this.setExport('logicalConnectionUrl', transport.logicalConnectionUrl)
  }, { context: module.context }))
  await module.evaluate()
  return module.namespace.buildRoomShareUrl
}

test('FM recovery retries at 2/5/10 seconds and then reports exhaustion once', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const recovery = new FmRecovery()
  recovery.setPlaying(true)
  let advances = 0, exhausted = 0
  for (const delay of [2000, 5000, 10000]) {
    recovery.retry(() => true, () => advances++, () => exhausted++)
    t.mock.timers.tick(delay - 1)
    assert.equal(advances, [2000, 5000, 10000].indexOf(delay))
    t.mock.timers.tick(1)
  }
  recovery.retry(() => true, () => advances++, () => exhausted++)
  t.mock.timers.tick(60_000)
  assert.equal(advances, 3)
  assert.equal(exhausted, 1)
})

for (const action of ['pause', 'seek', 'switch track', 'change mode', 'leave room', 'lose host role']) {
  test(`a pending FM retry cannot revive playback after ${action}`, t => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const recovery = new FmRecovery()
    recovery.setPlaying(true)
    fm.getState().reset()
    fm.getState().activate('room', { songId: 1 })
    const generation = fm.getState().generation
    let host = true, advances = 0
    const valid = () => host && fm.getState().generation === generation && fm.getState().activeRoomId === 'room'
    recovery.retry(valid, () => advances++, () => assert.fail('stale error'))
    if (action === 'lose host role') host = false
    else if (action === 'leave room') fm.getState().reset()
    else if (action === 'change mode') fm.getState().setMode('EXPLORE')
    else if (action === 'switch track') fm.getState().activate('room', { songId: 2 })
    else fm.getState().invalidate()
    t.mock.timers.tick(2000)
    assert.equal(advances, 0)
    recovery.retry(valid, () => advances++, () => assert.fail('stale error'))
    t.mock.timers.tick(60_000)
    assert.equal(advances, 0)
  })
}

test('cancel and session reset remove timers and restore the retry budget', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const recovery = new FmRecovery()
  recovery.setPlaying(true)
  let advances = 0
  recovery.retry(() => true, () => advances++, () => {})
  recovery.cancel()
  t.mock.timers.tick(60_000)
  assert.equal(advances, 0)
  recovery.retry(() => true, () => advances++, () => {})
  t.mock.timers.tick(2000)
  assert.equal(advances, 1)
  recovery.reset()
})

test('bad FM songs skip at most four times per minute and inactive songs consume no budget', t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 })
  const recovery = new FmRecovery()
  assert.equal(recovery.skip(() => false), 'inactive')
  recovery.setPlaying(true)
  for (let i = 0; i < 4; i++) assert.equal(recovery.skip(() => true), 'skipped')
  assert.equal(recovery.skip(() => assert.fail('must stop')), 'exhausted')
  t.mock.timers.tick(60_000)
  assert.equal(recovery.skip(() => true), 'skipped')
  recovery.reset()
  recovery.setPlaying(true)
  assert.equal(recovery.skip(() => true), 'skipped')
})

test('a late media error or retry after manual pause cannot skip or resume a song', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const recovery = new FmRecovery()
  recovery.setPlaying(true)
  recovery.retry(() => true, () => assert.fail('paused playback revived'), () => {})
  recovery.setPlaying(false)
  assert.equal(recovery.skip(() => assert.fail('paused song skipped')), 'inactive')
  t.mock.timers.tick(60_000)
})

test('share warnings classify IPv4, IPv6, CGNAT and local names using the logical server host', () => {
  for (const host of ['localhost', '127.9.8.7', '[::1]', '[0:0:0:0:0:0:0:1]', '[::ffff:127.0.0.1]']) assert.equal(getAddressScope(host), 'loopback', host)
  for (const host of ['10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.2', '169.254.1.1', '100.64.0.1', '100.127.255.255', 'nas', 'nas.local', 'nas.lan.', '[fd12::1]', '[fe80::1]', '[::ffff:192.168.1.2]', '[::ffff:c0a8:102]']) assert.equal(getAddressScope(host), 'lan', host)
  for (const host of ['media.example.com', '8.8.8.8', '172.32.0.1', '100.128.0.1', '[2606:4700:4700::1111]', '[::ffff:8.8.8.8]']) assert.equal(getAddressScope(host), 'public', host)
})

test('room sharing strips native capability paths, preserves server prefix and encodes room IDs', async () => {
  const build = await loadShareUrl()
  try {
    transport.bindConnectionTransport('https://media.example.com/zv', 'http://127.0.0.1:9280/private-session/zv')
    assert.equal(build('http://127.0.0.1:9280/private-session/zv', 'a/b ?'), 'https://media.example.com/zv/room/a%2Fb%20%3F')
    assert.equal(build('https://media.example.com/zv/', 'room'), 'https://media.example.com/zv/room/room')
    assert.equal(build('https://user:password@other.example.com/zv/?token=secret#hash', 'room'), 'https://other.example.com/zv/room/room')
  } finally { transport.clearConnectionTransport() }
})
