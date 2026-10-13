import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
const { apply, verify, verifySystemMedia } = createRequire(import.meta.url)('../scripts/patch-vlc-native.cjs');

test('native compilation guard detects missing slave retry and background patches', () => {
  const root = mkdtempSync(join(tmpdir(), 'zv-native-guard-'));
  try {
    cpSync(new URL('../node_modules/expo-libvlc-player/ios/', import.meta.url), join(root, 'ios'), { recursive: true });
    apply(root);
    const file = join(root, 'ios/Player/MediaPlayer.swift');
    const original = readFileSync(file, 'utf8');
    apply(root);
    assert.equal(readFileSync(file, 'utf8'), original);
    for (const marker of ['ZViewerDeferredSlaves', 'ZViewerVlcProgress', 'zviewerAddedSlaves.removeAll()']) {
      writeFileSync(file, original.replaceAll(marker, 'removed-by-dependency-reinstall'));
      assert.throws(() => verify(root), /VLC native patch missing/);
    }
    writeFileSync(file, original);
    for (const [relative, marker] of [
      ['Managers/MediaPlayerManager.swift', 'if !view.backgroundAudio && view.source !='],
      ['Managers/AudioSessionManager.swift', 'func prepareForBackgroundAudio()'],
      ['LibVlcPlayerModule.swift', 'Prop("backgroundAudio", false)'],
      ['Player/MediaPlayer.swift', 'if view.backgroundAudio { args.append(":no-video") }'],
      ['Player/MediaPlayer.swift', 'VLCLibrary.sharedEventsConfiguration = VLCEventsLegacyConfiguration()'],
      ['Player/MediaPlayer.swift', 'mediaPlayer?.delegate = nil\n    mediaPlayer?.stop()'],
    ]) {
      const target = join(root, 'ios', relative);
      const saved = readFileSync(target, 'utf8');
      writeFileSync(target, saved.replace(marker, 'removed-by-dependency-reinstall'));
      assert.throws(() => verify(root), /VLC native patch missing/);
      writeFileSync(target, saved);
    }
    verify(root);
    const configuration = 'VLCLibrary.sharedEventsConfiguration = VLCEventsLegacyConfiguration()';
    writeFileSync(file, original.replace(configuration, '').replace('    mediaPlayer = VLCMediaPlayer(library: library!)', `    mediaPlayer = VLCMediaPlayer(library: library!)\n    ${configuration}`));
    assert.throws(() => verify(root), /configuration must precede/);
    writeFileSync(file, original);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('VLC callbacks release their lock before main can run player operations', async () => {
  // Real worker lock: the old synchronous observer holds the native lock while
  // waiting for UI delivery. A main-thread player call scheduled first cannot
  // finish. Async callbacks release it without waiting for main. This verifies
  // the wait cycle, not VLCKit decoding or iOS device acceptance.
  const simulate = async synchronous => {
    const shared = new SharedArrayBuffer(8);
    const locks = new Int32Array(shared);
    const worker = new Worker(`
      const { parentPort, workerData } = require('node:worker_threads');
      const locks = new Int32Array(workerData.shared);
      Atomics.store(locks, 0, 1); // libvlc holds its player lock
      parentPort.postMessage('callback');
      if (workerData.synchronous) Atomics.wait(locks, 1, 0, 2000);
      Atomics.store(locks, 0, 0); Atomics.notify(locks, 0);
    `, { eval: true, workerData: { shared, synchronous } });
    try {
      return await new Promise((resolve, reject) => {
        worker.once('error', reject);
        worker.once('message', () => {
          const waited = Atomics.wait(locks, 0, 1, synchronous ? 100 : 1500);
          const blocked = waited === 'timed-out';
          // Let the old callback escape after we have detected the wait cycle.
          Atomics.store(locks, 1, 1); Atomics.notify(locks, 1);
          resolve(blocked);
        });
      });
    } finally { await worker.terminate(); }
  };
  assert.equal(await simulate(true), true, 'old inline callback + synchronous observer blocks UI');
  for (let i = 0; i < 10; i++) assert.equal(await simulate(false), false, 'async callback must release native lock');
});

test('native event configuration precedes player creation and system observers never wait for main', () => {
  const swift = readFileSync(new URL('../node_modules/expo-libvlc-player/ios/Player/MediaPlayer.swift', import.meta.url), 'utf8');
  const configured = swift.indexOf('VLCLibrary.sharedEventsConfiguration = VLCEventsLegacyConfiguration()');
  assert(configured >= 0 && configured < swift.indexOf('mediaPlayer = VLCMediaPlayer(library: library!)'));
  const media = readFileSync(new URL('../modules/zviewer-native/ios/ZVSystemMedia.swift', import.meta.url), 'utf8');
  assert(!media.includes('queue: .main'), 'NotificationCenter queue delivery can synchronously wait for main');
  assert(media.includes('DispatchQueue.main.async { [weak self] in'));
  assert(media.includes('!uri.isEmpty, uri == self.state["uri"] as? String'));
});

test('compilation rejects the old blocking system media observer', () => {
  const root = mkdtempSync(join(tmpdir(), 'zv-media-observer-'));
  try {
    mkdirSync(join(root, 'modules/zviewer-native/ios'), { recursive: true });
    const file = join(root, 'modules/zviewer-native/ios/ZVSystemMedia.swift');
    const source = readFileSync(new URL('../modules/zviewer-native/ios/ZVSystemMedia.swift', import.meta.url), 'utf8');
    writeFileSync(file, source);
    verifySystemMedia(root);
    writeFileSync(file, source.replace('object: nil, queue: nil)', 'object: nil, queue: .main)'));
    assert.throws(() => verifySystemMedia(root), /must not synchronously wait/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('music uses explicit native audio background ownership without hidden PiP', () => {
  const music = readFileSync(new URL('../src/components/MusicPanel.tsx', import.meta.url), 'utf8');
  const view = readFileSync(new URL('../src/components/VlcVideo.tsx', import.meta.url), 'utf8');
  assert(music.includes('<VlcVideo video={video} backgroundAudio'));
  assert(view.includes('pictureInPicture={!background && !backgroundAudio}'));
  assert(view.includes('backgroundAudio={backgroundAudio}'));
  const native = readFileSync(new URL('../modules/zviewer-native/ios/ZViewerNativeModule.swift', import.meta.url), 'utf8');
  assert(native.includes('guard ownedAudioSession else { return }'));
});

test('unsigned pipeline restores patches after EAS prebuild and checks before xcodebuild', () => {
  const pipeline = readFileSync(new URL('../.eas/build/ios-unsigned.yml', import.meta.url), 'utf8');
  assert(pipeline.indexOf('eas/prebuild') < pipeline.indexOf('node scripts/patch-vlc-native.cjs'));
  assert(pipeline.indexOf('node scripts/patch-vlc-native.cjs') < pipeline.indexOf('command: pod install'));
  const build = readFileSync(new URL('../scripts/build-unsigned-ios.sh', import.meta.url), 'utf8');
  assert(build.indexOf('node scripts/patch-vlc-native.cjs --check') < build.indexOf('xcodebuild'));
  assert(build.includes('LiveKitExpoAppDelegate VLCEventsLegacyConfiguration'));
});
