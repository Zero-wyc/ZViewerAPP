import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nativeVideoSource } from '../src/lib/media.ts';
import { MusicSyncReceipt, musicSourceMatches } from '../src/lib/musicSyncReceipt.ts';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as cancellation from '../src/lib/cancellation.ts';
import * as mediaAdapter from '../src/lib/mediaAdapter.ts';
import * as timeline from '../src/lib/timeline.ts';
import * as lyrics from '../src/lib/musicLyrics.ts';
import * as musicAuthority from '../src/lib/musicAuthority.ts';
import * as receipts from '../src/lib/musicSyncReceipt.ts';
import * as queueCursor from '../src/lib/musicQueue.ts';
import * as scopedCache from '../src/lib/scopedCache.ts';
import * as personalFm from '../src/lib/personalFm.ts';
import { VlcPlayer } from '../src/lib/vlcPlayer.ts';

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const song = id => ({ id, songId: id, name: `Song ${id}`, artist: '', album: '', cover: '', durationMs: 100_000, vip: false });
const panelCode = ts.transpileModule(readFileSync(new URL('../src/components/MusicPanel.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;

// Mount the real component's callbacks/effects with inert UI elements. The real
// VLC controller, media adapter, FM session and queue code remain in the loop.
// Native rendering, network replies and time are explicit ports in these tests.
async function mountPanel({ host = false, trackKey = 'ncm:420', playMode = 'sequence', request, upsertWait, restoreReply, hostOnline, sourceResolver, canQueue = host } = {}) {
  const initial = { trackKey, trackSongId: trackKey.startsWith('ncm:') ? Number(trackKey.slice(4)) : null, isPlaying: false, positionSec: 0, playMode, updatedAt: 10_000 };
  let queue = trackKey.startsWith('ncm:') ? [song(initial.trackSongId)] : [{ ...song(0), biliBvid: trackKey.split(':')[1], biliCid: Number(trackKey.split(':')[2]) }];
  const effects = [], cleanups = [], sent = [], timers = [], renders = [], listeners = new Map();
  let stateIndex = 0, snapshot, systemControl, systemMetadata, fm, clock = 10_000, displayedQueue = queue;
  const player = new VlcPlayer(value => { snapshot = value; if (value) renders.push({ identity: value.source.identity, autoplay: value.autoplay }); }, true);
  const session = { serverUrl: 'https://room.invalid', user: { id: 7 }, accessToken: 'test-token' };
  const socket = {
    id: 'connection-1', connected: true,
    on(event, listener) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(listener); },
    off(event, listener) { listeners.get(event)?.delete(listener); },
    emit(event, payload) { sent.push({ event, payload }); },
    timeout() { return { emit: (event, payload, callback) => { sent.push({ event, payload }); callback(null, { success: true, data: { needsSync: false } }); } }; },
  };
  const receive = (event, payload) => { for (const listener of listeners.get(event) || []) listener(payload); };
  const noop = () => {};
  const uiModule = new Proxy({}, { get: (_, key) => key === 'ui' ? {} : noop });
  const modules = {
    react: {
      useRef: value => ({ current: value }), useCallback: callback => callback,
      useState(value) { const index = stateIndex++; return [index === 0 ? queue : index === 1 ? initial : typeof value === 'function' ? value() : value, index === 0 ? next => { displayedQueue = next; } : noop]; },
      useEffect: effect => effects.push(effect),
    },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': { AppState: { currentState: 'active', addEventListener: () => ({ remove: noop }) }, StyleSheet: { create: styles => styles }, useWindowDimensions: () => ({ width: 390, height: 844 }) },
    '@/state/appearance': { useAppearance: () => ({ styles: value => value, color: value => value }) },
    '@/state/session': { useSession: () => ({ session, socket, request: request || (async () => ({ items: [] })), requestText: async () => JSON.stringify({ code: 200, lrc: { lyric: '' } }) }) },
    './VlcVideo': { useVlcVideo: () => ({ player }), VlcVideo: noop },
    './RoomUi': uiModule,
    './MusicLibrary': { MusicLibrary: noop, musicPages: [] },
    '@/lib/cancellation': cancellation, '@/lib/mediaAdapter': mediaAdapter,
    '@/lib/musicAuthority': musicAuthority, '@/lib/timeline': timeline, '@/lib/musicLyrics': lyrics, '@/lib/musicSyncReceipt': receipts,
    '@/hooks/useRoomPermissions': { useRoomPermissions: () => ({ canQueue }) },
    '@/lib/musicQueue': queueCursor, '@/lib/scopedCache': scopedCache,
    '@/lib/personalFm': personalFm,
    '@/lib/server': { messageFor: error => error.message },
    '@/lib/nativeBridge': { biliOperation: async () => ({ data: { lines: [] } }) },
    '@/lib/biliNative': { onBiliChange: () => noop, biliFallback: () => false, playbackSource: sourceResolver || (async (source, server, token) => nativeVideoSource(source, server, token)) },
    '@/lib/preferences': { readPreference: async (key, fallback) => key === 'music-auto-recommend' ? { entries: { 'https://room.invalid:7': true } } : fallback, writePreference: async () => {} },
    '@/hooks/useSystemMedia': { useSystemMedia: (_player, metadata, control) => { systemControl = control; systemMetadata = metadata; return next => { systemMetadata = next; }; } },
    '@/hooks/usePersonalFm': { usePersonalFm: ({ play }) => { fm = new personalFm.PersonalFm({ play, change: noop, fetch: async () => [song(420), song(421), song(422)] }); return { fm, state: fm.state, loggedIn: true }; } },
    '@/lib/socket': { emitAck: async (_socket, event, payload) => {
      sent.push({ event, payload });
      if (event === 'music:get-state' && restoreReply) return restoreReply;
      if (event === 'music:queue-upsert') {
        if (upsertWait) await upsertWait(payload.item);
        queue = [...queue, { ...payload.item, id: queue.length + 1000 }];
        receive('music:queue-changed', { roomId: 'room', items: queue });
      }
      return { queue, syncState: initial, hostOnline, ...(typeof hostOnline === 'boolean' ? { serverTs: clock } : {}) };
    } },
  };
  const exports = {};
  vm.runInNewContext(panelCode, {
    exports, require: name => modules[name] || uiModule, AbortController,
    Date: class extends Date { static now() { return clock; } },
    setInterval: callback => { timers.push(callback); return callback; }, clearInterval: noop, setTimeout, clearTimeout,
  });
  const tree = exports.MusicPanel({ roomId: 'room', host, onExpandedLandscape: noop, switchMode: noop });
  const findLibrary = node => {
    if (!node || typeof node !== 'object') return null;
    if (node.props?.play && node.props?.add) return node.props;
    const children = node.props?.children;
    for (const child of Array.isArray(children) ? children.flat(Infinity) : [children]) { const result = findLibrary(child); if (result) return result; }
    return null;
  };
  const library = findLibrary(tree);
  for (const effect of effects) { const cleanup = effect(); if (typeof cleanup === 'function') cleanups.push(cleanup); }
  await tick();
  player.attach(snapshot.id, { play: async () => {}, pause: async () => {}, stop: async () => {}, seek: async () => {} });
  player.loaded(snapshot.id, 100_000);
  player.progress(snapshot.id, 0);
  await tick();
  return {
    player, fm, socket, sent, receive, renders, get systemMetadata() { return systemMetadata; }, get queue() { return displayedQueue; },
    playItem: item => library.play(item), addItem: item => library.add(item),
    native: {
      get revision() { return snapshot.id; },
      progress: ms => player.progress(snapshot.id, ms), paused: () => player.playingChanged(snapshot.id, false), stopped: () => player.stopped(snapshot.id),
      fail: message => player.fail(snapshot.id, message),
      bindSeek: seek => player.attach(snapshot.id, { play: async () => {}, pause: async () => {}, stop: async () => {}, seek }, true),
    },
    control: async (action, value) => { systemControl(action, value); await tick(); },
    heartbeat: async () => { clock += 2000; for (const timer of timers) timer(); await tick(); },
    dispose: () => { for (const cleanup of cleanups.reverse()) cleanup(); fm.dispose(); player.dispose(); },
  };
}

test('Netease playback acknowledgement matches VLC absolute identity for relative server media', () => {
  const source = { sourceUrl: '/api/music/stream?songId=42&level=lossless&roomId=room', sourceType: 'url' };
  for (const server of ['https://room.invalid', 'https://room.invalid/prefix', 'http://127.0.0.1:4312']) {
    const first = nativeVideoSource(source, server, 'private-token');
    assert.notEqual(first.identity, source.sourceUrl);
    assert(musicSourceMatches(first.identity, source, server));
    assert(musicSourceMatches(nativeVideoSource(source, server, 'refreshed-token').identity, source, server));
    assert(!musicSourceMatches(first.identity, { ...source, sourceUrl: source.sourceUrl.replace('songId=42', 'songId=43') }, server));
    const receipt = new MusicSyncReceipt(); receipt.observe('room:user:track');
    assert(!receipt.take('room:user:track', false));
    assert(receipt.take('room:user:track', musicSourceMatches(first.identity, source, server)));
    assert(!receipt.take('room:user:track', true));
  }
});

test('Bili acknowledgement uses canonical selection and never accepts a previous track or local proxy', () => {
  const source = { sourceUrl: 'https://www.bilibili.com/video/BV1UHpw6LESy?cid=42512224146', sourceType: 'bilibili' };
  assert(musicSourceMatches(source.sourceUrl, source, 'https://room.invalid'));
  assert(!musicSourceMatches('http://127.0.0.1:1234/private/proxy', source, 'https://room.invalid'));
  assert(!musicSourceMatches(source.sourceUrl.replace('42512224146', '42512224147'), source, 'https://room.invalid'));
  assert(!musicSourceMatches('', source, 'https://room.invalid'));
  assert(!musicSourceMatches('bad-url', { sourceUrl: 'bad-url' }, 'https://room.invalid'));
});

test('real sync callbacks never seek the old Netease song or another part of the same BV', async () => {
  for (const [trackKey, incoming] of [['ncm:420', 'ncm:42'], ['bili:BV1UHpw6LESy:11', 'bili:BV1UHpw6LESy:12']]) {
    const panel = await mountPanel({ trackKey });
    try {
      panel.player.currentTime = 5;
      const payload = { roomId: 'room', trackKey: incoming, trackSongId: 42, positionSec: 70, isPlaying: false, updatedAt: 10_000, playMode: 'sequence' };
      panel.receive('music:sync-state', payload);
      panel.receive('music:host-heartbeat', payload);
      assert.equal(panel.player.currentTime, 5, 'two quick sync messages must not seek the old native source');
    } finally { panel.dispose(); }
  }
  const panel = await mountPanel();
  try {
    panel.receive('music:sync-state', { roomId: 'room', trackKey: 'ncm:420', trackSongId: 420, positionSec: 70, isPlaying: false, updatedAt: 10_000, playMode: 'sequence' });
    assert.equal(panel.player.currentTime, 70, 'matching loaded songs still align to the host clock');
    assert.equal(panel.sent.filter(item => item.event === 'music:sync-ack').length, 1);
  } finally { panel.dispose(); }
});

test('server clock messages cannot discard the queue in a delayed initial restore', async () => {
  const restore = deferred(); const panel = await mountPanel({ restoreReply: restore.promise });
  try {
    panel.receive('music:sync-heartbeat', { roomId: 'room', source: 'server', state: { trackKey: 'ncm:420', trackSongId: 420, positionSec: 70, isPlaying: false, updatedAt: 1, playMode: 'sequence' } });
    await tick();
    restore.resolve({ queue: [song(420), song(421)], syncState: { trackKey: 'ncm:420', trackSongId: 420, positionSec: 10, isPlaying: false, updatedAt: 1, playMode: 'sequence' }, serverTs: 9000 });
    await tick();
    assert.deepEqual(panel.queue.map(item => item.songId), [420, 421]);
    assert.equal(panel.player.currentTime, 70, 'the newer server clock still owns playback');
  } finally { panel.dispose(); }
});

test('a delayed restore cannot replace a newer queue event or a retired connection', async () => {
  for (const retire of [false, true]) {
    const restore = deferred(); const panel = await mountPanel({ restoreReply: restore.promise });
    try {
      panel.receive('music:queue-changed', { roomId: 'room', items: [song(422)] });
      if (retire) { panel.socket.connected = false; panel.receive('disconnect'); }
      restore.resolve({ queue: [song(420), song(421)], syncState: null, serverTs: 9000 });
      await tick();
      assert.deepEqual(panel.queue.map(item => item.songId), [422]);
    } finally { panel.dispose(); }
  }
});

test('two explicit controls align paused zero without waiting for heartbeat cooldown', async () => {
  const panel = await mountPanel();
  try {
    const payload = { roomId: 'room', trackKey: 'ncm:420', trackSongId: 420, positionSec: 70, isPlaying: false, updatedAt: 10_000, playMode: 'sequence' };
    panel.receive('music:sync-state', payload); await tick();
    panel.receive('music:sync-state', { ...payload, positionSec: 0 });
    assert.equal(panel.player.currentTime, 0);
    assert.equal(panel.player.playing, false);
  } finally { panel.dispose(); }
});

test('host offline enables only local playback controls and never viewer room broadcasts', async () => {
  const panel = await mountPanel({ hostOnline: false });
  try {
    panel.receive('music:queue-changed', { roomId: 'room', items: [song(420), song(421)] });
    await panel.control('play'); await panel.control('seek', 25); await panel.control('pause');
    assert.equal(panel.player.currentTime, 25); assert.equal(panel.player.playing, false);
    await panel.playItem(song(421)); await tick();
    assert.match(panel.player.sourceIdentity, /songId=421&/);
    const before = panel.sent.length;
    await panel.addItem(song(422));
    assert.equal(panel.sent.length, before, 'offline viewer cannot modify the shared queue');
    assert.equal(panel.sent.filter(item => ['music:sync-state', 'music:host-heartbeat', 'music:queue-upsert', 'music:control-request'].includes(item.event)).length, 0);
    panel.receive('music:sync-heartbeat', { roomId: 'room', source: 'server', hostOnline: false, state: { trackKey: 'ncm:420', trackSongId: 420, positionSec: 90, isPlaying: true, updatedAt: 1, playMode: 'sequence' } });
    await tick();
    assert.match(panel.player.sourceIdentity, /songId=421&/, 'offline server memory must not replace local autonomy');
    panel.receive('sharer-ready', { roomId: 'room' });
    await panel.control('pause');
    assert.equal(panel.sent.filter(item => item.event === 'music:control-request').length, 1, 'host recovery restores approval permissions');
    panel.receive('music:sync-heartbeat', { roomId: 'room', source: 'server', hostOnline: true, state: { trackKey: 'ncm:420', trackSongId: 420, positionSec: 0, isPlaying: false, updatedAt: 1, playMode: 'sequence' } });
    await tick();
    assert.match(panel.player.sourceIdentity, /songId=420&/); assert.equal(panel.player.currentTime, 0);
  } finally { panel.dispose(); }
});

test('own disconnection does not grant autonomous viewer control or permit stale online ACKs', async () => {
  const panel = await mountPanel();
  try {
    panel.receive('host-disconnected', { roomId: 'room' });
    panel.receive('music:sync-heartbeat', { roomId: 'room', source: 'server', hostOnline: true });
    await panel.control('play');
    assert.equal(panel.sent.filter(item => item.event === 'music:control-request').length, 0, 'cached online sample has a disconnect grace period');
    panel.socket.connected = false; panel.receive('disconnect');
    const before = panel.sent.length; const position = panel.player.currentTime;
    await panel.control('seek', 80); await panel.playItem(song(421));
    assert.equal(panel.player.currentTime, position); assert.equal(panel.sent.length, before);
    assert.match(panel.player.sourceIdentity, /songId=420&/);
  } finally { panel.dispose(); }
});

test('musicQueue permission lets a viewer append directly while playback still requires host approval', async () => {
  const panel = await mountPanel({ hostOnline: true, canQueue: true });
  try {
    await panel.addItem(song(421));
    assert.equal(panel.sent.filter(item => item.event === 'music:queue-upsert').length, 1);
    assert.equal(panel.sent.filter(item => item.event === 'music:control-request').length, 0);
    assert.match(panel.player.sourceIdentity, /songId=420&/, 'queue management does not switch playback');
    await panel.control('play');
    assert.equal(panel.sent.filter(item => item.event === 'music:control-request').length, 1);
    assert.equal(panel.sent.filter(item => ['music:sync-state', 'music:host-heartbeat'].includes(item.event)).length, 0);
    panel.socket.connected = false; panel.receive('disconnect');
    const writes = panel.sent.filter(item => item.event === 'music:queue-upsert').length; await panel.addItem(song(422));
    assert.equal(panel.sent.filter(item => item.event === 'music:queue-upsert').length, writes, 'disconnection cannot enqueue buffered writes');
  } finally { panel.dispose(); }
});

test('a viewer without queue permission requests the host, and a rejected authoritative append cannot switch songs', async () => {
  const viewer = await mountPanel({ hostOnline: true, canQueue: false });
  try {
    await viewer.addItem(song(421));
    assert.equal(viewer.sent.filter(item => item.event === 'music:queue-upsert').length, 0);
    assert.equal(viewer.sent.filter(item => item.event === 'music:control-request').length, 1);
  } finally { viewer.dispose(); }
  const revoked = await mountPanel({ hostOnline: true, canQueue: true, upsertWait: async () => { throw new Error('permission revoked'); } });
  try {
    await revoked.addItem(song(421));
    assert.deepEqual(revoked.queue.map(item => item.songId), [420]); assert.match(revoked.player.sourceIdentity, /songId=420&/);
    assert.equal(revoked.sent.filter(item => item.event === 'music:sync-state').length, 0);
  } finally { revoked.dispose(); }
});

test('slow same-song resolution survives repeated server heartbeats and keeps the newest paused clock', async () => {
  const resolution = deferred(); const calls = [];
  const panel = await mountPanel({ sourceResolver: async (source, server, token, signal) => {
    if (source.sourceType === 'bilibili') { calls.push({ source, signal }); await resolution.promise; }
    return nativeVideoSource(source, server, token);
  } });
  try {
    const clock = { trackKey: 'bili:BV1UHpw6LESy:11', trackSongId: null, positionSec: 1, isPlaying: true, updatedAt: 10_000, playMode: 'sequence' };
    panel.receive('music:sync-state', { roomId: 'room', ...clock }); await tick();
    for (let positionSec = 3; positionSec <= 9; positionSec += 2) { panel.receive('music:sync-heartbeat', { roomId: 'room', source: 'server', hostOnline: true, state: { ...clock, positionSec } }); await tick(); }
    panel.receive('music:sync-state', { roomId: 'room', ...clock, positionSec: 0, isPlaying: false }); await tick();
    assert.equal(calls.length, 1); assert.equal(calls[0].signal.aborted, false);
    resolution.resolve(); await tick(); await tick();
    assert.match(panel.player.sourceIdentity, /BV1UHpw6LESy\?cid=11/); assert.equal(panel.player.currentTime, 0); assert.equal(panel.player.playing, false);
    assert.equal(panel.renders.some(value => value.identity.includes('BV1UHpw6LESy') && value.autoplay), false, 'completion cannot briefly restore the superseded play intent');
  } finally { resolution.resolve(); panel.dispose(); }
});

test('a real track change still retires an older pending song resolution', async () => {
  const resolution = deferred(); let pendingSignal;
  const panel = await mountPanel({ sourceResolver: async (source, server, token, signal) => {
    if (source.sourceType === 'bilibili') { pendingSignal = signal; await resolution.promise; }
    return nativeVideoSource(source, server, token);
  } });
  try {
    const clock = { roomId: 'room', trackKey: 'bili:BV1UHpw6LESy:11', trackSongId: null, positionSec: 10, isPlaying: true, updatedAt: 10_000, playMode: 'sequence' };
    panel.receive('music:sync-state', clock); await tick();
    panel.receive('music:sync-state', { ...clock, trackKey: 'ncm:421', trackSongId: 421, positionSec: 0, isPlaying: false }); await tick();
    assert.equal(pendingSignal.aborted, true); resolution.resolve(); await tick();
    assert.match(panel.player.sourceIdentity, /songId=421&/); assert.equal(panel.player.currentTime, 0);
  } finally { resolution.resolve(); panel.dispose(); }
});

test('pause cancels late Bili recommendations without enqueueing or broadcasting stale playback', async () => {
  const response = deferred();
  const panel = await mountPanel({ host: true, trackKey: 'bili:BV1UHpw6LESy:11', playMode: 'order', request: () => response.promise });
  try {
    await panel.control('next');
    await panel.control('pause');
    const before = panel.sent.length;
    response.resolve({ items: [{ bvid: 'BV1UHpw6LESz', cid: 12, title: 'Late recommendation' }] });
    await tick();
    assert.equal(panel.sent.length, before, 'cancelled recommendation must not append or restore the previous track');
  } finally { panel.dispose(); }
});

test('pause and seek invalidate pending FM selection but retain the active roaming session', async () => {
  for (const action of ['pause', 'seek']) {
    const pending = deferred(); let block = false;
    const panel = await mountPanel({ host: true, upsertWait: async () => { if (block) await pending.promise; } });
    try {
      await panel.fm.start(); block = true;
      await panel.control('next');
      assert.equal(panel.fm.state.switching, true);
      await panel.control(action, 25);
      const before = panel.sent.filter(item => item.event === 'music:sync-state').length;
      pending.resolve(); await tick();
      assert.equal(panel.sent.filter(item => item.event === 'music:sync-state').length, before);
      assert.equal(panel.fm.state.current.songId, 420);
      assert.equal(panel.fm.state.active, true);
      assert.equal(panel.fm.state.switching, false);
      assert.equal(panel.fm.state.pool[0].songId, 421);
    } finally { panel.dispose(); }
  }
});

test('explicit repeat-one repeats the FM song; disconnect stops its pending selection', async () => {
  const pending = deferred(); let block = false;
  const panel = await mountPanel({ host: true, playMode: 'repeat-one', upsertWait: async () => { if (block) await pending.promise; } });
  try {
    await panel.fm.start();
    const before = panel.sent.filter(item => item.event === 'music:queue-upsert').length;
    panel.native.progress(100_000); panel.native.stopped();
    await panel.heartbeat();
    assert.equal(panel.player.currentTime, 0);
    assert.equal(panel.sent.filter(item => item.event === 'music:queue-upsert').length, before);
    assert.equal(panel.fm.state.current.songId, 420);
    assert.equal(panel.fm.state.active, true);
    block = true; await panel.control('next');
    panel.socket.connected = false; panel.receive('disconnect');
    const broadcasts = panel.sent.filter(item => item.event === 'music:sync-state').length;
    pending.resolve(); await tick();
    assert.equal(panel.fm.state.active, false);
    assert.equal(panel.sent.filter(item => item.event === 'music:sync-state').length, broadcasts);
  } finally { panel.dispose(); }
});

test('late native events from the previous track cannot publish the new track clock or advance FM again', async () => {
  const panel = await mountPanel({ host: true });
  try {
    await panel.fm.start();
    await panel.control('next');
    assert.equal(panel.fm.state.current.songId, 421);
    // React has not mounted the new VLC view yet; the old track reports ended.
    panel.player.currentTime = 100;
    const before = panel.sent.length;
    await panel.heartbeat();
    assert.equal(panel.sent.length, before);
    assert.equal(panel.fm.state.current.songId, 421);
  } finally { panel.dispose(); }
});

test('tail seek and transient native pause cannot broadcast a room pause or advance the queue', async () => {
  const panel = await mountPanel({ host: true, playMode: 'order' });
  try {
    await panel.control('play'); await panel.control('seek', 99);
    panel.native.paused(); panel.native.stopped();
    await panel.heartbeat();
    assert.equal(panel.player.currentTime, 99);
    assert.equal(panel.player.ended, false);
    assert.equal(panel.sent.filter(item => item.event === 'music:host-heartbeat').at(-1).payload.isPlaying, true);
    assert.equal(panel.sent.filter(item => item.event === 'music:queue-upsert').length, 0);
    await panel.control('seek', 100); assert.equal(panel.player.currentTime, 99.75);
    await panel.control('pause'); await panel.heartbeat();
    assert.equal(panel.sent.filter(item => item.event === 'music:host-heartbeat').at(-1).payload.isPlaying, false);
  } finally { panel.dispose(); }
});

test('a playing tail seek follows queue policy instead of seeking into an EOF loop', async () => {
  for (const mode of ['sequence', 'repeat-one', 'order']) {
    const panel = await mountPanel({ host: true, playMode: mode });
    try {
      if (mode === 'sequence') panel.receive('music:queue-changed', { roomId: 'room', items: [song(420), song(421)] });
      await panel.control('play'); await panel.control('seek', 100);
      const next = panel.sent.filter(item => item.event === 'music:sync-state').at(-1).payload;
      if (mode === 'sequence') { assert.equal(next.trackKey, 'ncm:421'); assert.equal(next.positionSec, 0); assert.equal(next.isPlaying, true); }
      if (mode === 'repeat-one') { assert.equal(next.trackKey, 'ncm:420'); assert.equal(next.positionSec, 0); assert.equal(next.isPlaying, true); }
      if (mode === 'order') { assert.equal(next.trackKey, 'ncm:420'); assert.equal(next.positionSec, 100); assert.equal(next.isPlaying, false); }
    } finally { panel.dispose(); }
  }
});


test('system next/previous loads audio and metadata without a React commit in background', async () => {
  const panel = await mountPanel({ host: true });
  try {
    panel.receive('music:queue-changed', { roomId: 'room', items: [song(420), song(421)] });
    await panel.control('next');
    assert.match(panel.player.sourceIdentity, /songId=421&/);
    assert.equal(panel.systemMetadata.mediaId, 'room:ncm:421');
    assert.equal(panel.systemMetadata.title, 'Song 421');
    await panel.control('prev');
    assert.match(panel.player.sourceIdentity, /songId=420&/);
    assert.equal(panel.systemMetadata.mediaId, 'room:ncm:420');
  } finally { panel.dispose(); }
});

test('viewer receives the new host song while rendering is suspended', async () => {
  const panel = await mountPanel();
  try {
    panel.receive('music:queue-changed', { roomId: 'room', items: [song(420), song(421)] });
    panel.receive('music:sync-state', { roomId: 'room', trackKey: 'ncm:421', trackSongId: 421, positionSec: 0, isPlaying: true, updatedAt: 10_000, playMode: 'sequence' });
    await tick();
    assert.match(panel.player.sourceIdentity, /songId=421&/);
    assert.equal(panel.systemMetadata.title, 'Song 421');
    assert.equal(panel.sent.filter(item => item.event === 'music:control-request').length, 0);
  } finally { panel.dispose(); }
});

test('natural completion advances the host queue without waiting for a background JS timer', async () => {
  const panel = await mountPanel({ host: true });
  try {
    panel.receive('music:queue-changed', { roomId: 'room', items: [song(420), song(421)] });
    await panel.control('play');
    panel.native.progress(100_000); panel.native.stopped();
    await tick();
    assert.match(panel.player.sourceIdentity, /songId=421&/);
    assert.equal(panel.systemMetadata.mediaId, 'room:ncm:421');
    assert.equal(panel.sent.filter(item => item.event === 'music:sync-state').at(-1).payload.trackKey, 'ncm:421');
  } finally { panel.dispose(); }
});

test('music resolution failure stays bounded across heartbeats and explicit room play can retry', async () => {
  let resolutions = 0; let blocked = true;
  const panel = await mountPanel({ sourceResolver: async (source, server, token) => {
    resolutions++;
    if (source.sourceUrl.includes('songId=421') && blocked) throw Error('source unavailable');
    return nativeVideoSource(source, server, token);
  } });
  try {
    const next = { roomId: 'room', trackKey: 'ncm:421', trackSongId: 421, positionSec: 0, isPlaying: true, updatedAt: 10_000, playMode: 'sequence' };
    panel.receive('music:sync-state', next); await tick();
    assert.equal(resolutions, 2);
    for (let index = 1; index <= 8; index++) {
      await panel.heartbeat(); panel.receive('music:host-heartbeat', { ...next, positionSec: index * 2, updatedAt: 10_000 + index * 2000 }); await tick();
    }
    assert.equal(resolutions, 2, 'periodic room samples cannot clear the adapter failure');
    blocked = false;
    panel.receive('music:sync-state', { ...next, positionSec: 18, updatedAt: 26_000 }); await tick();
    assert.equal(resolutions, 3); assert.match(panel.player.sourceIdentity, /songId=421&/);
  } finally { panel.dispose(); }
});

test('native music failure does not rebuild on heartbeats and local play is an explicit retry', async () => {
  let resolutions = 0;
  const panel = await mountPanel({ host: true, sourceResolver: async (...values) => { resolutions++; return nativeVideoSource(...values); } });
  try {
    const revision = panel.native.revision;
    panel.native.fail('native source failed');
    for (let index = 0; index < 8; index++) await panel.heartbeat();
    assert.equal(resolutions, 1); assert.equal(panel.native.revision, revision);
    await panel.control('play');
    assert.equal(resolutions, 2); assert.equal(panel.native.revision, revision + 1);
    assert.equal(panel.renders.at(-1).autoplay, true);
  } finally { panel.dispose(); }
});

test('failed music seek keeps its prepared input and blocks automatic correction until a real control', async () => {
  let resolutions = 0; let seeks = 0; let rejected = true;
  const panel = await mountPanel({ sourceResolver: async (...values) => { resolutions++; return nativeVideoSource(...values); } });
  try {
    const revision = panel.native.revision;
    panel.native.bindSeek(async target => { seeks++; return rejected ? { success: false, actualMilliseconds: 2000 } : target; });
    const current = { roomId: 'room', trackKey: 'ncm:420', trackSongId: 420, positionSec: 40, isPlaying: true, updatedAt: 10_000, playMode: 'sequence' };
    panel.receive('music:sync-state', current); await tick();
    assert.equal(seeks, 1); assert.equal(panel.player.preparing, false);
    for (let index = 1; index <= 8; index++) {
      await panel.heartbeat(); panel.receive('music:host-heartbeat', { ...current, positionSec: 40 + index * 2, updatedAt: 10_000 + index * 2000 }); await tick();
    }
    assert.equal(seeks, 1); assert.equal(resolutions, 1); assert.equal(panel.native.revision, revision);
    rejected = false;
    panel.receive('music:sync-state', { ...current, positionSec: 20, isPlaying: false, updatedAt: 26_000 }); await tick();
    assert.equal(seeks, 2); assert.equal(panel.player.currentTime, 20);
    assert.equal(resolutions, 1); assert.equal(panel.native.revision, revision, 'an explicit seek reuses the valid prepared input');
  } finally { panel.dispose(); }
});

test('another music track can recover from the previous track native failure', async () => {
  let resolutions = 0;
  const panel = await mountPanel({ sourceResolver: async (...values) => { resolutions++; return nativeVideoSource(...values); } });
  try {
    panel.native.fail('old track failed');
    panel.receive('music:sync-state', { roomId: 'room', trackKey: 'ncm:421', trackSongId: 421, positionSec: 0, isPlaying: true, updatedAt: 10_000, playMode: 'sequence' }); await tick();
    assert.equal(resolutions, 2); assert.match(panel.player.sourceIdentity, /songId=421&/);
  } finally { panel.dispose(); }
});
