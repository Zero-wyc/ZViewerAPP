import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
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

const compiled = ts.transpileModule(readFileSync(new URL('../src/components/ScreenShare.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
function mountShare(method = 'webrtc') {
  const state = [], effects = [], queued = [], listeners = new Map(), sent = [], peers = [], adapters = [], playerCalls = [];
  let cursor = 0, effectCursor = 0, tree, apply = () => Promise.resolve();
  const socket = { on(name, fn) { listeners.set(name, fn); }, off(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); }, emit(name, payload) { sent.push({ name, payload }); } };
  const player = { play() { playerCalls.push('play'); }, pause() { playerCalls.push('pause'); }, addListener() { return { remove() {} }; }, startPictureInPicture: async () => {} };
  const video = { player }; const session = { serverUrl: 'https://fixture.invalid', accessToken: 'fixture' };
  class Peer {
    signalingState = 'stable'; connectionState = 'new'; remoteDescription = null; closed = false;
    constructor() { peers.push(this); }
    close() { this.closed = true; }
    async setRemoteDescription(value) { this.remoteDescription = value; }
    async addIceCandidate() {}
    async createAnswer() { return { type: 'answer' }; }
    async setLocalDescription() {}
  }
  const element = (type, props) => ({ type, props });
  const modules = {
    react: { useRef(initial) { const i = cursor++; if (!(i in state)) state[i] = { current: initial }; return state[i]; }, useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; }, useEffect(fn, deps) { const i = effectCursor++; const prev = effects[i]; if (!prev || deps.some((v, j) => v !== prev.deps[j])) queued.push(() => { prev?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; }); } },
    'react/jsx-runtime': { jsx: element, jsxs: element, Fragment: 'Fragment' },
    'react-native': { NativeModules: { WebRTCModule: {} }, Platform: { OS: 'ios' }, View: 'View', Text: 'Text', Pressable: 'Pressable', ActivityIndicator: 'Spinner' },
    '@expo/vector-icons/Feather': { default: 'Icon' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }) },
    '@livekit/react-native-webrtc': { RTCPeerConnection: Peer, RTCSessionDescription: class { constructor(value) { Object.assign(this, value); } }, RTCIceCandidate: class {}, RTCView: 'RTCView' },
    '@/state/appearance': { useAppearance: () => ({ styles: v => v, color: v => v }) },
    '@/state/session': { useSession: () => ({ session, socket, connected: true }) },
    '@/lib/mediaAdapter': { NativeMediaAdapter: class { constructor() { adapters.push(this); } apply(...args) { this.args = args; return apply(); } dispose() { this.disposed = true; } } },
    './AppDialog': { AppDialog: 'Dialog' }, './ScreenOrientationButton': { ScreenOrientationButton: 'OrientationButton' }, './VlcVideo': { useVlcVideo: () => video, VlcVideo: 'Video' }, './RoomUi': { ui: {}, RoomButton: 'Button', RoomInput: 'Input' },
  };
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: name => { assert.ok(modules[name], name); return modules[name]; }, URL });
  const props = { roomId: 'fixture-room', share: { shareMethod: method, streamKey: 'fixture-key' }, height: 240, fullscreen: true, toggleFullscreen() {}, orientation: { available: true, busy: false, locked: true, landscape: true, error: '', toggle: async () => {} } };
  const render = () => { cursor = 0; effectCursor = 0; tree = exports.ScreenShare(props); for (const effect of queued.splice(0)) effect(); return tree; };
  const find = (label, node = tree) => { if (!node || typeof node !== 'object') return null; if (node.props?.accessibilityLabel === label) return node; const children = node.props?.children; for (const child of Array.isArray(children) ? children.flat(Infinity) : [children]) { if (!child || typeof child !== 'object') continue; const found = find(label, child); if (found) return found; } return null; };
  render();
  return { render, find, sent, peers, adapters, state, listeners, playerCalls, setApply: value => { apply = value; }, unmount: () => { effects.forEach(effect => effect.cleanup?.()); } };
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
  const screen = mountShare(); const tracks = [{ enabled: true }, { enabled: true }];
  screen.peers[0].ontrack({ streams: [{ getTracks: () => tracks, toURL: () => 'fixture-stream' }] }); screen.render();
  screen.find('暂停接收').props.onPress(); screen.render(); assert.ok(tracks.every(track => !track.enabled));
  const incoming = [{ enabled: true }]; const sameStream = { getTracks: () => incoming, toURL: () => 'fixture-stream-2' }; screen.peers[0].ontrack({ streams: [sameStream] }); screen.render(); assert.equal(incoming[0].enabled, false);
  incoming.push({ enabled: true }); screen.peers[0].ontrack({ streams: [sameStream] }); screen.render(); assert.equal(incoming[1].enabled, false);
  screen.find('继续接收').props.onPress(); screen.render(); assert.equal(incoming[0].enabled, true); screen.unmount();
});
test('OBS refresh replaces the VLC adapter and ignores failure from a retired pull', async () => {
  const screen = mountShare('stream-push'); let rejectOld;
  screen.setApply(() => new Promise((_, reject) => { rejectOld = reject; }));
  screen.find('刷新投屏').props.onPress(); screen.render();
  const retired = screen.adapters.at(-1);
  screen.setApply(() => Promise.resolve()); screen.find('刷新投屏').props.onPress(); screen.render();
  rejectOld(new Error('retired request')); await tick();
  assert.equal(retired.disposed, true); assert.equal(JSON.stringify(screen.render()).includes('无法播放推流'), false);
  assert.ok(screen.adapters.at(-1).args[0].sourceUrl.includes('/live/fixture-key.flv')); screen.unmount();
});
