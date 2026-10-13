import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { RoomPlayback } from '../src/lib/roomPlayback.ts';
import { moviePlayback } from '../src/lib/sources.ts';
import { serverBiliSource, sharedPlayback } from '../src/lib/biliRoomProtocol.ts';
import { nativeVideoSource } from '../src/lib/media.ts';
import { probeMedia, probeNativeMedia } from '../src/lib/mediaDiagnostics.ts';
import { danmakuArea, danmakuLanes } from '../src/lib/danmakuLayout.ts';
import { VlcPlayer } from '../src/lib/vlcPlayer.ts';

const film = { id: 6, source: 'bilibili', title: '多 P', url: 'BV1xx411c7mD', cid: 101, currentPage: 2, pages: [{ page: 1, cid: 101, part: '第一 P' }, { page: 2, cid: 202, part: '第二 P' }], audioUrl: 'http://127.0.0.1:9000/old-audio' };
test('authoritative Bili movie restores provider, current P and CID from a mislabelled host stream', () => {
  const room = new RoomPlayback(); room.current(film.id); room.list([film]);
  const state = room.state({ sourceType: 'url', sourceUrl: 'http://127.0.0.1:9000/proxy', cid: 202, isPlaying: true, currentTime: 49 });
  assert.equal(state.sourceType, 'bilibili'); assert.equal(state.cid, 202); assert.equal(state.currentTime, 49);
  assert.equal(new URL(state.sourceUrl).searchParams.get('p'), '2'); assert.equal(state.audioUrl, undefined);
  assert.equal(room.state({ ...state, cid: 101 }), null, 'old P must wait for matching authoritative metadata');
});
test('browser broadcast has proxied media and separate audio, while local room state retains page identity', () => {
  const local = { ...moviePlayback(film), currentTime: 132, isPlaying: true };
  const shared = serverBiliSource(local, { videoUrl: 'https://cdn.bilivideo.com/video?signature=fixture', audioUrl: 'https://cdn.bilivideo.com/audio', format: 'dash' });
  const broadcast = sharedPlayback(local, shared);
  assert.match(broadcast.sourceUrl, /^\/api\/stream\/proxy\?/); assert.match(broadcast.audioUrl, /^\/api\/stream\/proxy\?/);
  assert.equal(broadcast.currentTime, 132); assert.equal(broadcast.isPlaying, true);
  const paused = sharedPlayback({ ...local, currentTime: 12, isPlaying: false }, shared);
  assert.equal(paused.currentTime, 12); assert.equal(paused.isPlaying, false);
  assert.equal(sharedPlayback({ ...local, cid: 303 }, shared), null);
  const privateSource = nativeVideoSource(shared, 'https://room.invalid/prefix', 'private-token');
  assert.equal(new URL(privateSource.uri).pathname, '/prefix/api/stream/proxy');
  assert.equal(new URL(privateSource.slaves[0].uri).searchParams.get('token'), 'private-token');
  assert(!JSON.stringify(broadcast).includes('private-token')); assert(!JSON.stringify(broadcast).includes('127.0.0.1'));
  const room = new RoomPlayback(); room.current(film.id); room.list([film]);
  assert.equal(room.state(broadcast).sourceUrl, local.sourceUrl);
  for (const url of ['http://127.0.0.1:9000/proxy', 'https://user:pass@cdn.bilivideo.com/video']) assert.throws(() => serverBiliSource(local, { videoUrl: url }), /无效/);
});
test('probe checks the resolved local media capability and continues to reject loopback room URLs', async () => {
  const fetchBefore = globalThis.fetch; const calls = [];
  const uri = `http://127.0.0.1:8123/${'a'.repeat(48)}/proxy?url=fixture`;
  const bytes = new Uint8Array(64); bytes.set([102, 116, 121, 112], 4);
  globalThis.fetch = async (url, init) => {
    calls.push(url); assert.equal(url, uri);
    if (init.method === 'HEAD') return new Response(null, { headers: { 'content-type': 'video/mp4', 'content-length': '64', 'accept-ranges': 'bytes' } });
    const range = init.headers.Range;
    if (range === 'bytes=64-') return new Response(null, { status: 416, headers: { 'content-range': 'bytes */64' } });
    const begin = range === 'bytes=-32' ? 32 : Number(/bytes=(\d+)/.exec(range)[1]);
    const match = /bytes=\d+-(\d+)$/.exec(range); const end = match ? Number(match[1]) : 63;
    return new Response(bytes.slice(begin, end + 1), { status: 206, headers: { 'content-range': `bytes ${begin}-${end}/64`, 'content-length': String(end - begin + 1) } });
  };
  try {
    const result = await probeNativeMedia({ uri, identity: 'https://www.bilibili.com/video/BV1xx411c7mD', headers: {}, options: [], serverApi: false, contentType: 'progressive', slaves: [] });
    assert.equal(result.category, 'ready'); assert.equal(result.signature, 'mp4'); assert.equal(calls.length, 7);
    await assert.rejects(probeMedia({ sourceUrl: uri }, 'https://room.invalid', 'private'), /其他设备/);
  } finally { globalThis.fetch = fetchBefore; }
});
test('display area constrains scrolling and fixed bottom comments at phone/tablet dimensions', () => {
  for (const height of [219, 390, 664, 1024]) {
    assert.equal(danmakuArea(height, .25), height / 4); assert.equal(danmakuArea(height, 1), height);
    assert(danmakuLanes(height, .25, 20) < danmakuLanes(height, 1, 20));
  }
  assert.equal(danmakuArea(400, NaN), 280); assert.equal(danmakuArea(400, 2), 400);
});
test('native plugin defers DASH audio until input readiness and is repeatable against installed Swift sources', () => {
  const root = mkdtempSync(join(tmpdir(), 'zv-slave-order-'));
  const { patchVlcTracks } = createRequire(import.meta.url)('../plugins/with-vlc-tracks.cjs');
  const files = ['Records/Tracks.swift', 'Records/MediaTrack.swift', 'Player/MediaPlayer.swift'];
  try {
    for (const file of files) {
      mkdirSync(join(root, 'ios', file.split('/')[0]), { recursive: true });
      writeFileSync(join(root, 'ios', file), readFileSync(new URL('../node_modules/expo-libvlc-player/ios/' + file, import.meta.url)));
    }
    patchVlcTracks(root); const patched = readFileSync(join(root, 'ios/Player/MediaPlayer.swift'), 'utf8');
    const create = patched.slice(patched.indexOf('private func createPlayer()'), patched.indexOf('func destroyPlayer()'));
    assert(!create.includes('addPlayerSlaves(view.slaves)'));
    assert(patched.includes('guard mediaPlayer?.isPlaying == true else { return }'));
    assert(patched.includes('if newState == .playing {\n        addPlayerSlaves(view.slaves)'));
    assert(patched.includes('enforce: selected) == 0')); assert(patched.includes('zviewerAddedSlaves.contains(key)'));
    patchVlcTracks(root); assert.equal(readFileSync(join(root, 'ios/Player/MediaPlayer.swift'), 'utf8'), patched);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('near-end seek ignores old progress and temporary stop, restores play and honors a later pause', async () => {
  let snapshot; const calls = []; let finish;
  const player = new VlcPlayer(value => { snapshot = value; }, true);
  await player.replaceAsync(nativeVideoSource({ sourceUrl: 'https://cdn.invalid/audio.mp4' }, 'https://room.invalid', ''));
  const id = snapshot.id;
  player.attach(id, { play: async () => calls.push('play'), pause: async () => calls.push('pause'), stop: async () => {}, seek: () => new Promise(resolve => { finish = resolve; }) });
  player.play(); player.loaded(id, 134000);
  player.currentTime = 132; player.progress(id, 50000); player.stopped(id);
  assert.equal(player.currentTime, 132); assert.equal(player.ended, false); assert.equal(player.seeking, true);
  finish(); await Promise.resolve(); assert.equal(calls.at(-1), 'play');
  player.progress(id, 132000); assert.equal(player.seeking, false);
  player.progress(id, 133900); player.stopped(id); assert.equal(player.ended, true);
  player.currentTime = 20; player.pause(); const before = calls.length;
  finish(); await Promise.resolve(); assert.equal(calls.length, before, 'seek completion cannot undo an explicit pause');
  player.progress(id, 20000); player.stopped(id); assert.equal(player.ended, false);
  player.dispose();
});
