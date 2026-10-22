import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const run = promisify(execFile);

test('native Bili session retries saved login after an initially offline service start', { skip: process.platform !== 'darwin', timeout: 30000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zviewer-bili-session-'));
  try {
    const binary = join(directory, 'smoke');
    await run('xcrun', ['clang', '-fobjc-arc', '-fblocks', '-framework', 'Foundation', new URL('../modules/zviewer-native/ios/ZVBiliSession.m', import.meta.url).pathname, new URL('../scripts/bili-session-smoke.m', import.meta.url).pathname, '-o', binary]);
    const { stdout } = await run(binary); assert.match(stdout, /Bili session smoke passed/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
