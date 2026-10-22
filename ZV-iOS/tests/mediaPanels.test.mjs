import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { ScreenReceiver, initialScreenReceiver, screenFlvUrl, loadScreenPull } from '../src/lib/screenReceiver.ts';
import { applyVoiceVolumes } from '../src/lib/voiceVolumes.ts';

const tick = () => new Promise(resolve => setImmediate(resolve));
test('voice volume affects remote playback and the local source, without enabling a microphone', () => {
  const remote = [], microphone = [];
  const room = { remoteParticipants: new Map([['a', { setVolume: value => remote.push(value) }]]), localParticipant: { audioTrackPublications: new Map([['mic', { track: { mediaStreamTrack: { _setVolume: value => microphone.push(value) } } }]]) } };
  applyVoiceVolumes(room, .4, .6, false);
  applyVoiceVolumes(room, .4, .6, true);
  applyVoiceVolumes(room, .4, .6, false);
  assert.deepEqual(remote, [.4, 0, .4]); assert.deepEqual(microphone, [.6, .6, .6]);
  applyVoiceVolumes(room, 4, -1, false);
  assert.equal(remote.at(-1), 1); assert.equal(microphone.at(-1), 0);
});
test('volume applies to a newly published microphone and tolerates absent native tracks', () => {
  const values = []; const publications = new Map();
  const room = { remoteParticipants: new Map(), localParticipant: { audioTrackPublications: publications } };
  applyVoiceVolumes(room, 1, .25, false);
  publications.set('new', { track: { mediaStreamTrack: { _setVolume: value => values.push(value) } } });
  publications.set('pending', {});
  applyVoiceVolumes(room, 1, .25, false);
  assert.deepEqual(values, [.25]);
});

test('individual listening gains multiply global output and survive deafening and resubscription', () => {
  const calls = { a: [], b: [] }; const microphone = [];
  const room = { remoteParticipants: new Map(Object.keys(calls).map(identity => [identity, { setVolume: value => calls[identity].push(value) }])), localParticipant: { audioTrackPublications: new Map([['mic', { track: { mediaStreamTrack: { _setVolume: value => microphone.push(value) } } }]]) } };
  const gains = { a: .25, b: 0 };
  applyVoiceVolumes(room, .8, .7, false, gains);
  applyVoiceVolumes(room, .8, .7, true, gains);
  room.remoteParticipants.set('a', { setVolume: value => calls.a.push(value) });
  applyVoiceVolumes(room, .8, .7, false, gains);
  assert.deepEqual(calls, { a: [.2, 0, .2], b: [0, 0, 0] });
  assert.deepEqual(microphone, [.7, .7, .7], 'local listening gains never change microphone capture');
  applyVoiceVolumes(room, 3, .7, false, { a: 10, b: -2 });
  assert.equal(calls.a.at(-1), 1); assert.equal(calls.b.at(-1), 0);
});

const compiled = ts.transpileModule(readFileSync(new URL('../src/components/ScreenShare.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
function mountShare(method = 'webrtc') {
  const state = [], effects = [], queued = [], listeners = new Map(), sent = [], peers = [], adapters = [], playerCalls = [];
  const timers = new Map(); let now = 0, nextTimer = 0;
  let connected = true;
  let cursor = 0, effectCursor = 0, tree, apply = () => Promise.resolve();
  const socket = { on(name, fn) { listeners.set(name, fn); }, off(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); }, emit(name, payload) { sent.push({ name, payload }); } };
  const player = { configure() {}, replaceAsync: async () => {}, play() { playerCalls.push('play'); }, pause() { playerCalls.push('pause'); }, addListener() { return { remove() {} }; }, startPictureInPicture: async () => {} };
  const video = { player }; const session = { serverUrl: 'https://fixture.invalid', accessToken: 'fixture', user: { id: 1 } };
  class Peer {
    signalingState = 'stable'; connectionState = 'new'; remoteDescription = null; closed = false;
    constructor() { peers.push(this); }
    close() { this.closed = true; }
    async setRemoteDescription(value) { this.remoteDescription = value; }
    async addIceCandidate() {}
    async createAnswer() { return { type: 'answer' }; }
    async setLocalDescription() {}
  }
  class Stream { tracks = []; getTracks() { return this.tracks; } addTrack(track) { this.tracks.push(track); } toURL() { return 'merged-stream'; } release() { this.released = true; } }
  const element = (type, props) => ({ type, props });
  const modules = {
    react: { useRef(initial) { const i = cursor++; if (!(i in state)) state[i] = { current: initial }; return state[i]; }, useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; }, useEffect(fn, deps) { const i = effectCursor++; const prev = effects[i]; if (!prev || deps.some((v, j) => v !== prev.deps[j])) queued.push(() => { prev?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; }); } },
    'react/jsx-runtime': { jsx: element, jsxs: element, Fragment: 'Fragment' },
    'react-native': { NativeModules: { WebRTCModule: {} }, Platform: { OS: 'ios' }, useWindowDimensions: () => ({ width: 390, height: 844 }), View: 'View', Text: 'Text', Pressable: 'Pressable', ActivityIndicator: 'Spinner' },
    '@expo/vector-icons/Feather': { default: 'Icon' }, '@react-native-community/slider': { default: 'Slider' }, 'expo-device': { isDevice: false },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }) },
    '@livekit/react-native-webrtc': { MediaStream: Stream, RTCPeerConnection: Peer, RTCSessionDescription: class { constructor(value) { Object.assign(this, value); } }, RTCIceCandidate: class {}, RTCView: 'RTCView' },
    '@/state/appearance': { useAppearance: () => ({ styles: v => v, color: v => v }) },
    '@/state/session': { useSession: () => ({ session, socket, connected }) },
    '@/lib/screenReceiver': { ScreenReceiver, initialScreenReceiver, screenFlvUrl, loadScreenPull },
    '@/lib/mediaAdapter': { NativeMediaAdapter: class { constructor() { adapters.push(this); } apply(...args) { this.args = args; (this.history ||= []).push(args); return apply(); } cancelPending() { this.cancelled = (this.cancelled || 0) + 1; } dispose() { this.disposed = true; } } },
    './AppDialog': { AppDialog: 'Dialog' }, './ScreenOrientationButton': { ScreenOrientationButton: 'OrientationButton' }, './VlcVideo': { useVlcVideo: () => video, VlcVideo: 'Video' }, './RoomUi': { ui: {}, RoomButton: 'Button', RoomInput: 'Input' },
  };
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: name => { assert.ok(modules[name], name); return modules[name]; }, URL, Date: { now: () => now }, setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, due: now + delay }); return id; }, clearTimeout(id) { timers.delete(id); } });
  const props = { roomId: 'fixture-room', share: { shareMethod: method, streamKey: 'fixture-key' }, height: 240, fullscreen: true, toggleFullscreen() {}, orientation: { available: true, busy: false, locked: true, landscape: true, error: '', toggle: async () => {} } };
  const render = () => { cursor = 0; effectCursor = 0; tree = exports.ScreenShare(props); for (const effect of queued.splice(0)) effect(); return tree; };
  const find = (label, node = tree) => { if (!node || typeof node !== 'object') return null; if (node.props?.accessibilityLabel === label || node.props?.testID === label) return node; const children = node.props?.children; for (const child of Array.isArray(children) ? children.flat(Infinity) : [children]) { if (!child || typeof child !== 'object') continue; const found = find(label, child); if (found) return found; } return null; };
  render();
  return { advance(ms) { now += ms; for (const [id, timer] of [...timers]) if (timer.due <= now) { timers.delete(id); timer.fn(); } }, render, find, sent, peers, adapters, state, listeners, playerCalls, setConnected: value => { connected = value; }, setApply: value => { apply = value; }, unmount: () => { effects.forEach(effect => effect.cleanup?.()); } };
}
test('screen-share refresh retires the old peer and registers one fresh receiver; cleanup removes signaling', () => {
  const screen = mountShare(); assert.equal(screen.peers.length, 1);
  screen.find('刷新投屏').props.onPress(); screen.render();
  assert.equal(screen.peers.length, 2); assert.equal(screen.peers[0].closed, true);
  assert.equal(screen.sent.filter(item => item.name === 'viewer-ready').length, 2);
  screen.unmount(); assert.equal(screen.peers[1].closed, true); assert.equal(screen.listeners.size, 0);
});
test('a retired WebRTC offer cannot send an answer into the refreshed connection', async () => {
  const screen = mountShare(); let resolveDescription;
  screen.peers[0].setRemoteDescription = () => new Promise(resolve => { resolveDescription = resolve; });
  const pending = screen.listeners.get('signal-offer')({ from: 'sharer', data: { type: 'offer' } });
  screen.find('刷新投屏').props.onPress(); screen.render(); resolveDescription(); await pending;
  assert.equal(screen.sent.filter(item => item.name === 'signal-answer').length, 0); screen.unmount();
});
test('pausing reception disables existing and newly received remote tracks, then resumes them', () => {
  const screen = mountShare(); const makeTrack = (id, kind = 'audio') => ({ id, kind, enabled: true, _setVolume() {}, addEventListener() {}, removeEventListener() {}, stop() {} }); const tracks = [makeTrack('video', 'video'), makeTrack('audio')];
  screen.peers[0].ontrack({ streams: [{ getTracks: () => tracks, toURL: () => 'fixture-stream' }] }); screen.render();
  screen.find('暂停接收').props.onPress(); screen.render(); assert.ok(tracks.every(track => !track.enabled));
  const incoming = [makeTrack('incoming')]; const sameStream = { getTracks: () => incoming, toURL: () => 'fixture-stream-2' }; screen.peers[0].ontrack({ streams: [sameStream] }); screen.render(); assert.equal(incoming[0].enabled, false);
  incoming.push(makeTrack('new')); screen.peers[0].ontrack({ streams: [sameStream] }); screen.render(); assert.equal(incoming[1].enabled, false);
  screen.find('继续接收').props.onPress(); screen.render(); assert.equal(incoming[0].enabled, true); screen.unmount();
});
test('OBS refresh cancels the retired pull and reuses one serialized VLC adapter', async () => {
  const screen = mountShare('stream-push'); await tick(); let rejectOld;
  screen.setApply(() => new Promise((_, reject) => { rejectOld = reject; }));
  screen.find('刷新投屏').props.onPress(); screen.render(); await tick();
  const retired = screen.adapters.at(-1);
  screen.setApply(() => Promise.resolve()); screen.find('刷新投屏').props.onPress(); screen.render();
  rejectOld(new Error('retired request')); await tick();
  assert.ok(retired.cancelled > 0); assert.equal(screen.adapters.length, 1); assert.equal(JSON.stringify(screen.render()).includes('无法播放推流'), false);
  assert.ok(screen.adapters.at(-1).args[0].sourceUrl.includes('/live/fixture-key.flv')); screen.unmount();
});

test('OBS reconnect retries the current pull when an offline viewer missed the new live broadcast', async () => {
  const screen = mountShare('stream-push'); await tick(); screen.render();
  screen.listeners.get('stream-status')({ roomId: 'fixture-room', status: 'offline' }); screen.render(); await tick();
  assert.equal(screen.adapters[0].args[0], null);
  screen.setConnected(false); screen.render(); await tick(); screen.render();
  screen.setConnected(true); screen.render(); await tick(); screen.render(); await tick();
  assert.match(screen.adapters[0].args[0].sourceUrl, /fixture-key\.flv$/); screen.unmount();
});

test('receive gestures delay a single tap, reserve double tap for pause, and cancel drags and multiple touches', () => {
  const screen = mountShare(); const peer = screen.peers[0]; peer.connectionState = 'connected';
  peer.ontrack({ track: { id: 'video', kind: 'video', readyState: 'live', enabled: true, addEventListener() {}, removeEventListener() {}, stop() {} } }); screen.render();
  const event = (x = 100, count = 1) => ({ nativeEvent: { locationX: x, locationY: 100, touches: Array.from({ length: count }, () => ({})) } });
  const gesture = () => screen.find('screen-share-gestures').props;
  gesture().onResponderGrant(event()); gesture().onResponderRelease(event()); screen.advance(100);
  gesture().onResponderGrant(event()); gesture().onResponderMove(event(130)); screen.advance(400); gesture().onResponderRelease(event(130)); screen.render();
  assert.ok(screen.find('screen-share-controls')); assert.ok(screen.find('暂停接收'));
  gesture().onResponderGrant(event()); gesture().onResponderRelease(event()); screen.advance(100); gesture().onResponderGrant(event()); gesture().onResponderRelease(event()); screen.render();
  assert.ok(screen.find('继续接收')); assert.equal(peer.closed, false);
  screen.find('继续接收').props.onPress(); screen.render();
  gesture().onResponderGrant(event()); gesture().onResponderRelease(event()); screen.advance(319); screen.render(); assert.ok(screen.find('screen-share-controls'));
  screen.advance(2); screen.render(); assert.equal(screen.find('screen-share-controls'), null);
  gesture().onAccessibilityTap(); screen.render(); gesture().onResponderGrant(event()); gesture().onResponderRelease(event()); screen.advance(100);
  assert.equal(gesture().onStartShouldSetResponder(event(100, 2)), false); screen.advance(400); screen.render(); assert.ok(screen.find('screen-share-controls')); screen.unmount();
});
