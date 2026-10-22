import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const run = promisify(execFile);

test('native loopback HLS relay preserves dynamic media-library authentication and bounds requests', { skip: process.platform !== 'darwin', timeout: 45000 }, async () => {
  let sequence = 0; const failures = []; const capability = 'a'.repeat(48);
  const route = resource => `/api/emby/stream?movieId=7&resource=${resource}`;
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://fixture.invalid');
    const path = url.pathname.startsWith(`/${capability}/`) ? url.pathname.slice(capability.length + 1) : url.pathname;
    if (path !== '/prefix/api/emby/stream' || url.searchParams.get('token') !== 'current' || request.headers.authorization !== 'Bearer current') {
      failures.push('selected prefix/auth was not preserved'); response.writeHead(403); response.end(); return;
    }
    const resource = url.searchParams.get('resource');
    if (resource === 'master.m3u8') { response.setHeader('Content-Type', 'application/vnd.apple.mpegurl'); response.end(`#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=500000\n${route('dynamic.m3u8')}\n`); }
    else if (resource === 'dynamic.m3u8') { response.setHeader('Content-Type', 'application/vnd.apple.mpegurl'); response.end(`#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:${++sequence}\n#EXT-X-KEY:METHOD=AES-128,URI="${route('key.bin')}"\n#EXT-X-MAP:URI="${route('init.mp4')}"\n#EXTINF:2,\n${route('segment.ts')}\n`); }
    else if (resource === 'denied.m3u8') { response.setHeader('Content-Type', 'application/vnd.apple.mpegurl'); response.end('#EXTM3U\n#EXTINF:2,\nhttps://other.invalid/leak.ts\n'); }
    else if (resource === 'oversized.ts') { response.writeHead(200, { 'Content-Type': 'video/mp2t', 'Content-Length': 33 * 1024 * 1024 }); response.flushHeaders(); response.write('x'); }
    else if (resource === 'segment.ts' && request.headers.range === 'bytes=2-5') { response.writeHead(206, { 'Content-Type': 'video/mp2t', 'Content-Range': 'bytes 2-5/10', 'Accept-Ranges': 'bytes' }); response.end('2345'); }
    else { response.setHeader('Content-Type', 'application/octet-stream'); response.end('0123456789'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const directory = await mkdtemp(join(tmpdir(), 'zviewer-hls-relay-'));
  try {
    const binary = join(directory, 'smoke');
    await run('xcrun', ['swiftc', new URL('../modules/zviewer-native/ios/ZVServerConnectionTransport.swift', import.meta.url).pathname, new URL('../modules/zviewer-native/ios/ZVHLSRelay.swift', import.meta.url).pathname, new URL('../scripts/hls-relay-smoke.swift', import.meta.url).pathname, '-o', binary]);
    const { stdout } = await run(binary, [`http://127.0.0.1:${server.address().port}/prefix`], { timeout: 20000 });
    assert.match(stdout, /Native HLS relay smoke passed/); assert.deepEqual(failures, []); assert.equal(sequence, 2);
    const mapped = await run(binary, ['https://selected.invalid:8443/prefix', `http://127.0.0.1:${server.address().port}/${capability}/prefix`], { timeout: 20000 });
    assert.match(mapped.stdout, /Native HLS relay smoke passed/); assert.deepEqual(failures, []); assert.equal(sequence, 4);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); }
});
