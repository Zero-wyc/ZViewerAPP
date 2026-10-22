import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NativeMediaAdapter } from '../src/lib/mediaAdapter.ts';
import { ScreenReceiver, screenFlvUrl, loadScreenPull } from '../src/lib/screenReceiver.ts';

function fixture() {
  const peers = [], streams = [], sent = [], states = [];
  class Stream {
    tracks = []; released = false;
    constructor() { streams.push(this); }
    getTracks() { return [...this.tracks]; }
    addTrack(track) { this.tracks.push(track); }
    removeTrack(track) { this.tracks = this.tracks.filter(value => value !== track); }
    release() { this.released = true; }
  }
  class Peer {
    connectionState = 'new'; signalingState = 'stable'; remoteDescription = null; closed = false; candidates = [];
    constructor() { peers.push(this); }
    close() { this.closed = true; }
    async setRemoteDescription(value) { this.remoteDescription = value; }
    async addIceCandidate(value) { this.candidates.push(value); if (value.candidate === 'bad') throw new Error('bad candidate'); }
    async createAnswer() { return { type: 'answer', sdp: 'fixture-answer' }; }
    async setLocalDescription(value) { this.localDescription = value; }
  }
  class Description { constructor(value) { Object.assign(this, value); } }
  class Candidate { constructor(value) { if (value.candidate === 'malformed') throw new Error('invalid'); Object.assign(this, value); } }
  const socket = { emit(name, data, ack) { sent.push({ name, data, ack }); } };
  const receiver = new ScreenReceiver({ RTCPeerConnection: Peer, MediaStream: Stream, RTCSessionDescription: Description, RTCIceCandidate: Candidate }, socket, 'room', value => states.push(value));
  receiver.start();
  const track = (id, kind) => {
    const events = new Map(); const value = { id, kind, enabled: true, muted: false, readyState: 'live', stopped: false, gains: [], _setVolume(gain) { this.gains.push(gain); }, addEventListener(name, fn) { events.set(name, fn); }, removeEventListener(name) { events.delete(name); }, stop() { this.stopped = true; this.readyState = 'ended'; }, mute() { this.muted = true; events.get('mute')?.(); }, unmute() { this.muted = false; events.get('unmute')?.(); }, end() { this.readyState = 'ended'; events.get('ended')?.(); } }; return value;
  };
  return { receiver, peers, streams, sent, states, track, latest: () => states.at(-1) };
}
const offer = { from: 'owner', data: { type: 'offer', sdp: 'fixture-offer' } };

test('separate and streamless tracks share one rendering stream, requiring connected video for receiving', () => {
  const f = fixture(); const peer = f.peers[0]; const video = f.track('screen', 'video'), audio = f.track('sound', 'audio');
  peer.ontrack({ track: video, streams: [] });
  assert.notEqual(f.latest().phase, 'connected');
  peer.ontrack({ track: audio, streams: [{ getTracks: () => [audio] }] });
  assert.deepEqual(f.latest().stream.getTracks().map(track => track.id), ['screen', 'sound']);
  assert.equal(f.latest().hasVideo, true); assert.equal(f.latest().hasAudio, true);
  peer.connectionState = 'connected'; peer.onconnectionstatechange(); assert.equal(f.latest().phase, 'connected');
  video.end(); assert.equal(f.latest().hasVideo, false); assert.notEqual(f.latest().phase, 'connected');
  assert.deepEqual(f.latest().stream.getTracks().map(track => track.id), ['sound']); f.receiver.dispose();
});

test('pause and mute apply to late audio/video without disconnecting or acquiring capture permissions', () => {
  const f = fixture(); const peer = f.peers[0]; f.receiver.setPlayback(true, 0);
  const video = f.track('video', 'video'), audio = f.track('audio', 'audio'); peer.ontrack({ track: video }); peer.ontrack({ track: audio });
  assert.equal(video.enabled, false); assert.equal(audio.enabled, false); assert.equal(audio.gains.at(-1), 0);
  f.receiver.setPlayback(false, .4); assert.equal(video.enabled, true); assert.equal(audio.enabled, true); assert.equal(audio.gains.at(-1), .4);
  assert.equal(peer.closed, false); assert.deepEqual(f.sent.map(item => item.name), ['viewer-ready']); f.receiver.dispose();
});

test('authoritative sharer-ready replaces a still-connected old peer before remote ICE notices restart', () => {
  const f = fixture(); const peer = f.peers[0]; const video = f.track('video', 'video'); peer.connectionState = 'connected'; peer.ontrack({ track: video });
  assert.equal(f.latest().phase, 'connected'); f.receiver.sharerReady();
  assert.equal(f.peers.length, 2); assert.equal(peer.closed, true); assert.equal(video.stopped, true); assert.equal(f.streams[0].released, true);
  assert.equal(f.sent.filter(item => item.name === 'viewer-ready').length, 2); assert.equal(f.latest().stream, null); f.receiver.dispose();
});

test('a bad queued ICE candidate does not discard valid candidates or prevent the answer', async () => {
  const f = fixture(); f.receiver.ice({ from: 'other', data: { candidate: 'foreign' } });
  f.receiver.ice({ from: 'owner', data: { candidate: 'bad' } }); f.receiver.ice({ from: 'owner', data: { candidate: 'good' } });
  await f.receiver.offer(offer);
  assert.deepEqual(f.peers[0].candidates.map(value => value.candidate), ['bad', 'good']);
  assert.equal(f.sent.at(-1).name, 'signal-answer'); assert.equal(f.sent.at(-1).data.to, 'owner');
  assert.doesNotThrow(() => f.receiver.ice({ from: 'owner', data: { candidate: 'malformed' } }));
  f.receiver.ice({ from: 'other', data: { candidate: 'foreign-late' } }); assert.equal(f.peers[0].candidates.length, 2); f.receiver.dispose();
});

test('refresh during pending answer creation cannot write SDP or emit an answer for the retired peer', async () => {
  const f = fixture(); const peer = f.peers[0]; let complete;
  peer.createAnswer = () => new Promise(resolve => { complete = resolve; });
  const pending = f.receiver.offer(offer); await new Promise(resolve => setImmediate(resolve));
  f.receiver.start(); complete({ type: 'answer', sdp: 'old' }); await pending;
  assert.equal(peer.localDescription, undefined); assert.equal(f.sent.some(item => item.name === 'signal-answer'), false); assert.equal(f.peers[1].closed, false); f.receiver.dispose();
});

test('join denial, sender failure, and disposal never report a live stream and release owned tracks', () => {
  const f = fixture(); f.sent[0].ack({ success: false, message: '不在该房间中' }); assert.equal(f.latest().error, '不在该房间中'); assert.notEqual(f.latest().phase, 'connected');
  const video = f.track('video', 'video'); const oldTrack = f.peers[0].ontrack; f.peers[0].ontrack({ track: video });
  f.receiver.fail('共享端启动失败'); assert.equal(video.stopped, true); assert.equal(f.latest().stream, null); assert.equal(f.latest().error, '共享端启动失败');
  const count = f.states.length; oldTrack({ track: f.track('late', 'video') }); assert.equal(f.states.length, count);
  f.receiver.dispose(); f.receiver.sharerReady(); assert.equal(f.peers.length, 1);
});

test('HTTP-FLV keeps HTTPS proxy prefixes and supports explicit HTTP endpoints without accepting credentials', () => {
  assert.equal(screenFlvUrl('https://nas.invalid:16667/prefix/', 'separate-key'), 'https://nas.invalid:16667/prefix/live/separate-key.flv');
  assert.equal(screenFlvUrl('http://nas.invalid:3000/prefix', 'key'), 'http://nas.invalid:3335/live/key.flv');
  assert.equal(screenFlvUrl('https://nas.invalid', 'a/b', 'http://127.0.0.1:8767'), 'http://127.0.0.1:8767/live/a%2Fb.flv');
  for (const base of ['ftp://nas.invalid', 'http://user:password@nas.invalid', 'http://nas.invalid/?token=value', 'http://nas.invalid/#fragment']) assert.throws(() => screenFlvUrl('https://nas.invalid', 'key', base));
  assert.throws(() => screenFlvUrl('https://nas.invalid', ''));
});

test('remote mute from track removal clears receiving even while the peer stays connected, and unmute recovers', () => {
  const f = fixture(); const peer = f.peers[0]; const video = f.track('video', 'video'); peer.connectionState = 'connected'; peer.ontrack({ track: video });
  assert.equal(f.latest().phase, 'connected'); video.mute(); assert.equal(peer.connectionState, 'connected'); assert.equal(video.readyState, 'live');
  assert.equal(f.latest().hasVideo, false); assert.equal(f.latest().stream, null); assert.notEqual(f.latest().phase, 'connected');
  video.unmute(); assert.equal(f.latest().phase, 'connected'); assert.equal(f.latest().hasVideo, true); f.receiver.dispose();
});

test('refreshing the same live FLV after 30 seconds resets native identity and never seeks to the old clock', async () => {
  let clock = 0; const seeks = [], replacements = [];
  const player = { playing: false, duration: 0, playbackRate: 1, get currentTime() { return clock; }, set currentTime(value) { clock = value; seeks.push(value); }, play() { this.playing = true; }, pause() { this.playing = false; }, async replaceAsync(source) { replacements.push(source); clock = 0; } };
  const adapter = new NativeMediaAdapter(player, async state => ({ uri: state.sourceUrl, identity: state.sourceUrl, contentType: 'progressive', headers: {}, slaves: [], options: [], serverApi: false }));
  await loadScreenPull(adapter, 'https://nas.invalid/live/key.flv', 'https://nas.invalid', 'fixture', () => true);
  clock = 30; seeks.length = 0;
  await loadScreenPull(adapter, 'https://nas.invalid/live/key.flv', 'https://nas.invalid', 'fixture', () => true, 1);
  assert.deepEqual(seeks, [0]); assert.equal(clock, 0); assert.equal(replacements.at(-2), null); adapter.dispose();
});

test('a retired live pull cannot start a new source after its queued clear finishes', async () => {
  const calls = []; let active = true, complete;
  const adapter = { apply(...args) { calls.push(args); return new Promise(resolve => { complete = resolve; }); } };
  const pending = loadScreenPull(adapter, 'https://nas.invalid/live/key.flv', 'https://nas.invalid', 'fixture', () => active);
  active = false; complete(); assert.equal(await pending, false); assert.equal(calls.length, 1); assert.equal(calls[0][0], null);
});
