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
async function mountPanel({ host = false, trackKey = 'ncm:420', playMode = 'sequence', request, upsertWait } = {}) {
  const initial = { trackKey, trackSongId: trackKey.startsWith('ncm:') ? Number(trackKey.slice(4)) : null, isPlaying: false, positionSec: 0, playMode, updatedAt: 10_000 };
  let queue = trackKey.startsWith('ncm:') ? [song(initial.trackSongId)] : [{ ...song(0), biliBvid: trackKey.split(':')[1], biliCid: Number(trackKey.split(':')[2]) }];
  const effects = [], cleanups = [], sent = [], timers = [], listeners = new Map();
  let stateIndex = 0, snapshot, systemControl, systemMetadata, fm, clock = 10_000;
  const player = new VlcPlayer(value => { snapshot = value; }, true);
  const session = { serverUrl: 'https://room.invalid', user: { id: 7 }, accessToken: 'test-token' };
  const socket = {
    id: 'connection-1', connected: true,
    on(event, listener) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(listener); },
    off(event, listener) { listeners.get(event)?.delete(listener); },
    emit(event, payload) { sent.push({ event, payload }); },
  };
  const receive = (event, payload) => { for (const listener of listeners.get(event) || []) listener(payload); };
  const noop = () => {};
  const uiModule = new Proxy({}, { get: (_, key) => key === 'ui' ? {} : noop });
  const modules = {
    react: {
      useRef: value => ({ current: value }), useCallback: callback => callback,
      useState(value) { const index = stateIndex++; return [index === 0 ? queue : index === 1 ? initial : typeof value === 'function' ? value() : value, noop]; },
      useEffect: effect => effects.push(effect),
    },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': { StyleSheet: { create: styles => styles }, useWindowDimensions: () => ({ width: 390, height: 844 }) },
    '@/state/appearance': { useAppearance: () => ({ styles: value => value, color: value => value }) },
    '@/state/session': { useSession: () => ({ session, socket, request: request || (async () => ({ items: [] })), requestText: async () => JSON.stringify({ code: 200, lrc: { lyric: '' } }) }) },
    './VlcVideo': { useVlcVideo: () => ({ player }), VlcVideo: noop },
    './RoomUi': uiModule,
    './MusicLibrary': { MusicLibrary: noop, musicPages: [] },
    '@/lib/cancellation': cancellation, '@/lib/mediaAdapter': mediaAdapter,
    '@/lib/timeline': timeline, '@/lib/musicSyncReceipt': receipts,
    '@/lib/musicQueue': queueCursor, '@/lib/scopedCache': scopedCache,
    '@/lib/personalFm': personalFm,
    '@/lib/server': { messageFor: error => error.message },
    '@/lib/nativeBridge': { biliOperation: async () => ({ data: { lines: [] } }) },
    '@/lib/biliNative': { onBiliChange: () => noop, biliFallback: () => false, playbackSource: async (source, server, token) => nativeVideoSource(source, server, token) },
    '@/lib/preferences': { readPreference: async (key, fallback) => key === 'music-auto-recommend' ? { entries: { 'https://room.invalid:7': true } } : fallback, writePreference: async () => {} },
    '@/hooks/useSystemMedia': { useSystemMedia: (_player, metadata, control) => { systemControl = control; systemMetadata = metadata; return next => { systemMetadata = next; }; } },
    '@/hooks/usePersonalFm': { usePersonalFm: ({ play }) => { fm = new personalFm.PersonalFm({ play, change: noop, fetch: async () => [song(420), song(421), song(422)] }); return { fm, state: fm.state, loggedIn: true }; } },
    '@/lib/socket': { emitAck: async (_socket, event, payload) => {
      sent.push({ event, payload });
      if (event === 'music:queue-upsert') {
        if (upsertWait) await upsertWait(payload.item);
        queue = [...queue, { ...payload.item, id: queue.length + 1000 }];
        receive('music:queue-changed', { roomId: 'room', items: queue });
      }
      return { queue, syncState: initial };
    } },
  };
  const exports = {};
  vm.runInNewContext(panelCode, {
    exports, require: name => modules[name] || uiModule, AbortController,
    Date: class extends Date { static now() { return clock; } },
    setInterval: callback => { timers.push(callback); return callback; }, clearInterval: noop,
  });
  exports.MusicPanel({ roomId: 'room', host, onExpandedLandscape: noop, switchMode: noop });
  for (const effect of effects) { const cleanup = effect(); if (typeof cleanup === 'function') cleanups.push(cleanup); }
  await tick();
  player.attach(snapshot.id, { play: async () => {}, pause: async () => {}, stop: async () => {}, seek: async () => {} });
  player.loaded(snapshot.id, 100_000);
  player.progress(snapshot.id, 0);
  await tick();
  return {
    player, fm, socket, sent, receive, get systemMetadata() { return systemMetadata; },
    native: { progress: ms => player.progress(snapshot.id, ms), paused: () => player.playingChanged(snapshot.id, false), stopped: () => player.stopped(snapshot.id) },
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
