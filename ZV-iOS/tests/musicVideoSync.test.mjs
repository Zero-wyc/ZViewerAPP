import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { MusicVideoSync } from '../src/lib/musicVideoSync.ts';

function fixture() {
  let now = 0, position = 10, rate = 1;
  const seeks = [], rates = [], commands = [];
  const audio = { currentTime: 10, playbackRate: 1, playing: true, seeking: false };
  const video = { preparing: false, duration: 300, seeking: false,
    get currentTime() { return position; }, set currentTime(value) { position = value; seeks.push(value); },
    get playbackRate() { return rate; }, set playbackRate(value) { rate = value; rates.push(value); },
    play() { commands.push('play'); }, pause() { commands.push('pause'); } };
  const sync = new MusicVideoSync(audio, video, () => now);
  return { audio, video, sync, seeks, rates, commands, advance(ms) { now += ms; } };
}

test('steady playback sends one play intent; ordinary drift catches up without seeking or pausing', () => {
  const f = fixture(); f.sync.sync();
  for (let i = 0; i < 120; i++) {
    f.advance(250); f.audio.currentTime += .25;
    f.video.currentTime = f.audio.currentTime - 1.5;
    f.seeks.length = 0; f.sync.sync();
    assert.deepEqual(f.seeks, []);
    assert(f.video.playbackRate > 1 && f.video.playbackRate <= 1.1);
  }
  assert.deepEqual(f.commands, ['play']);
  f.advance(250); f.video.currentTime = f.audio.currentTime; f.sync.sync();
  assert.equal(f.video.playbackRate, 1);
  f.advance(250); f.video.currentTime = f.audio.currentTime + 1.5; f.sync.sync();
  assert(f.video.playbackRate < 1 && f.video.playbackRate >= .9);
});

test('soft correction converges to the audio clock without a hard seek', () => {
  const f = fixture(); f.sync.sync(); f.video.currentTime = 8.5; f.seeks.length = 0;
  for (let i = 0; i < 240; i++) {
    f.advance(250); f.audio.currentTime += .25;
    f.video.currentTime += .25 * f.video.playbackRate;
    // Model native progress, rather than recording it as a seek command.
    f.seeks.length = 0; f.sync.sync(); assert.deepEqual(f.seeks, []);
  }
  assert(Math.abs(f.audio.currentTime - f.video.currentTime) < .3);
  assert.equal(f.video.playbackRate, 1);
  assert.deepEqual(f.commands, ['play']);
});

test('initial alignment reads the latest clock and waits for both decoders to settle', () => {
  const f = fixture(); f.video.preparing = true; f.sync.sync();
  f.audio.currentTime = 38; f.video.preparing = false; f.audio.seeking = true;
  f.sync.sync(); assert.deepEqual(f.seeks, []);
  f.audio.currentTime = 40; f.audio.seeking = false; f.sync.sync();
  assert.deepEqual(f.seeks, [40]); assert.deepEqual(f.commands, ['play']);
  f.video.seeking = true; f.audio.currentTime = 44; f.sync.sync();
  assert.deepEqual(f.seeks, [40]);
  f.video.seeking = false; f.sync.sync();
  assert.deepEqual(f.seeks, [40], 'ordinary residual drift must not restart a settled seek');
});

test('explicit backward seek follows confirmed audio once, with pause and resume intent deduplicated', () => {
  const f = fixture(); f.sync.sync(); f.audio.seeking = true;
  f.audio.currentTime = 2; f.sync.requestSeek(); f.sync.sync();
  assert.deepEqual(f.seeks, []);
  f.audio.seeking = false; f.audio.currentTime = 2.2; f.sync.sync();
  assert.deepEqual(f.seeks, [2.2]);
  f.audio.playing = false; f.video.currentTime = 2.8; f.seeks.length = 0;
  f.sync.sync(); f.sync.sync(); assert.deepEqual(f.seeks, [2.2]);
  assert.deepEqual(f.commands, ['play', 'pause']); assert.equal(f.video.playbackRate, 1);
  f.audio.playing = true; f.sync.sync(); f.sync.sync();
  assert.deepEqual(f.commands, ['play', 'pause', 'play']);
});

test('large buffering gaps have a cooldown, but explicit user seeks stay responsive', () => {
  const f = fixture(); f.audio.currentTime = 100; f.sync.sync();
  assert.deepEqual(f.seeks, [100]);
  f.advance(1000); f.audio.currentTime = 108; f.sync.sync();
  assert.deepEqual(f.seeks, [100]);
  f.advance(9000); f.sync.sync(); assert.deepEqual(f.seeks, [100, 108]);
  f.audio.currentTime = 20; f.sync.requestSeek(); f.sync.sync();
  assert.deepEqual(f.seeks, [100, 108, 20]);
});

test('correction follows the audio rate and a shorter video never seeks past its end', () => {
  const f = fixture(); f.audio.playbackRate = 1.5; f.sync.sync();
  assert.equal(f.video.playbackRate, 1.5);
  f.advance(300); f.audio.currentTime = 11; f.sync.sync();
  assert(f.video.playbackRate > 1.5 && f.video.playbackRate <= 1.65);
  f.audio.currentTime = 400; f.sync.requestSeek(); f.sync.sync();
  assert.equal(f.seeks.at(-1), 299.9);
  f.advance(11000); f.sync.sync(); assert.equal(f.seeks.length, 1);
});

test('native video surface keeps complete frames in both foreground and music decoration', () => {
  const source = readFileSync(new URL('../src/components/VlcVideo.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const jsx = (type, props) => ({ type, props });
  const modules = { expo: { requireOptionalNativeModule: () => ({}) }, react: { useRef: () => ({ current: null }), useMemo: fn => fn(), useEffect() {} }, 'react/jsx-runtime': { jsx }, 'react-native': { Platform: { OS: 'ios' } }, 'expo-device': { isDevice: true }, 'expo-libvlc-player': { LibVlcPlayerView: 'NativeView' }, '@/lib/connectionTransport': { connectionUrl: value => value } };
  const exports = {}; vm.runInNewContext(code, { exports, __DEV__: false, require: name => modules[name] || {} });
  for (const background of [false, true]) {
    const wrapper = exports.VlcVideo({ video: { player: { nativeOwnerId: 'fixture' }, snapshot: { id: 1, source: { uri: 'https://fixture.invalid/video', options: [], slaves: [] }, settings: { volume: 0, subtitleDelay: 0 } } }, style: {}, background });
    const native = wrapper.type(wrapper.props);
    assert.equal(native.props.contentFit, 'contain');
    assert.equal(native.props.zviewerBackgroundDecoration, background);
  }
});

test('persistent native replacements preserve initial decoder policy and bound view methods', async () => {
  const source = readFileSync(new URL('../src/components/VlcVideo.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const [development, device] of [[true, false], [true, true], [false, false]]) {
    const effects = [], calls = []; let port;
    const view = Object.fromEntries(['play', 'pause', 'stop', 'seek', 'replaceSource', 'startPictureInPicture'].map(name => [name, function (...args) { assert.equal(this, view); calls.push({ name, args }); return Promise.resolve(); }]));
    const jsx = (type, props) => ({ type, props });
    const modules = { expo: { requireOptionalNativeModule: () => ({}) }, react: { useRef: () => ({ current: view }), useMemo: fn => fn(), useEffect: fn => effects.push(fn) }, 'react/jsx-runtime': { jsx }, 'react-native': { Platform: { OS: 'ios' } }, 'expo-device': { isDevice: device }, 'expo-libvlc-player': { LibVlcPlayerView: 'NativeView' }, '@/lib/connectionTransport': { connectionUrl: value => value } };
    const exports = {}; vm.runInNewContext(code, { exports, __DEV__: development, require: name => modules[name] || {} });
    const options = ['network-caching=1000'];
    const player = { attach(id, native) { assert.equal(id, 3); port = native; } };
    const wrapper = exports.VlcVideo({ video: { player, snapshot: { id: 3, source: { uri: 'https://fixture.invalid/first', options, slaves: [] }, settings: { volume: 100, subtitleDelay: 0 } } }, style: {}, backgroundAudio: true });
    const native = wrapper.type(wrapper.props); effects.forEach(fn => fn());
    await port.replaceSource('https://fixture.invalid/next', options, 4);
    assert.deepEqual(Array.from(calls[0].args[1]), Array.from(native.props.options));
    assert.equal(calls[0].args[2], 4);
    assert.equal(calls[0].args[1].includes('codec=avcodec'), development && !device);
    assert.deepEqual(options, ['network-caching=1000']);
    await port.play(); await port.pause(); await port.stop(); await port.seek(12345, 'time'); await port.startPictureInPicture();
    assert.deepEqual(calls.map(call => call.name), ['replaceSource', 'play', 'pause', 'stop', 'seek', 'startPictureInPicture']);
  }
});
