import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MusicHostStatus } from '../src/lib/musicAuthority.ts';

test('server host availability wins over legacy timing and honors explicit disconnect grace', () => {
  const host = new MusicHostStatus(); host.reset(1000);
  assert.equal(host.server(true, 2000), false);
  assert.equal(host.poll(8000), false);
  assert.equal(host.disconnected(9000), true);
  assert.equal(host.server(true, 10_000), true, 'server online cache cannot erase a fresh disconnect');
  assert.equal(host.ready(11_000), false);
  assert.equal(host.server(false, 12_000), true);
  assert.equal(host.server(true, 13_000), false);
});

test('legacy heartbeat fallback cannot mistake own reconnection or foreground resumption for host absence', () => {
  const host = new MusicHostStatus(); host.reset(1000);
  assert.equal(host.poll(8001), true);
  assert.equal(host.host(9000), false);
  host.reset(20_000); assert.equal(host.offline, false);
  host.resume(60_000); assert.equal(host.poll(60_001), false);
  assert.equal(host.poll(67_001), true);
});
