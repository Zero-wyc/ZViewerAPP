import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const run = promisify(execFile);

test('native Bili capability probes decode owned AVC/HEVC SDR keyframes through 4K and reject corrupt input', { skip: process.platform !== 'darwin', timeout: 30000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zviewer-bili-capabilities-'));
  try {
    const binary = join(directory, 'smoke');
    await run('xcrun', ['clang', '-fobjc-arc', '-fblocks', '-framework', 'Foundation', '-framework', 'VideoToolbox', '-framework', 'CoreMedia', '-framework', 'CoreVideo', new URL('../modules/zviewer-native/ios/ZVBiliCapabilities.m', import.meta.url).pathname, new URL('../scripts/bili-capability-smoke.m', import.meta.url).pathname, '-o', binary]);
    const { stdout } = await run(binary); assert.match(stdout, /20 real SDR keyframe decodes/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
