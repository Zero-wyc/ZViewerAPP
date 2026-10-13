import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const { apply, verify } = createRequire(import.meta.url)('../scripts/patch-vlc-native.cjs');

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
    verify(root);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('unsigned pipeline restores patches after EAS prebuild and checks before xcodebuild', () => {
  const pipeline = readFileSync(new URL('../.eas/build/ios-unsigned.yml', import.meta.url), 'utf8');
  assert(pipeline.indexOf('eas/prebuild') < pipeline.indexOf('node scripts/patch-vlc-native.cjs'));
  assert(pipeline.indexOf('node scripts/patch-vlc-native.cjs') < pipeline.indexOf('command: pod install'));
  const build = readFileSync(new URL('../scripts/build-unsigned-ios.sh', import.meta.url), 'utf8');
  assert(build.indexOf('node scripts/patch-vlc-native.cjs --check') < build.indexOf('xcodebuild'));
});
