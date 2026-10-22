import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accessTokenExpiresAt, accessRefreshDelay, RelayAuthRecovery } from '../src/lib/sessionFreshness.ts';

const jwt = value => `header.${Buffer.from(JSON.stringify(value)).toString('base64url')}.signature`;
test('NAS JWT expiry schedules a 30-second lead without requiring Buffer or global atob at runtime', () => {
  const token = jwt({ exp: 1000, name: '中文账号' });
  assert.equal(accessTokenExpiresAt(token), 1_000_000);
  assert.equal(accessRefreshDelay(token, 900_000), 70_000);
  assert.equal(accessRefreshDelay(token, 975_000), 0);
  for (const token of ['opaque', 'a.!.b', jwt({ exp: '1000' }), jwt({ exp: 0 }), jwt({ exp: -1 })]) {
    assert.equal(accessTokenExpiresAt(token), null); assert.equal(accessRefreshDelay(token), null);
  }
});

test('relay authentication recovery is limited to one NAS 401 per logical media scope, including renewed listeners', () => {
  const gate = new RelayAuthRecovery();
  assert.equal(gate.begin('room:movie:account', { id: 'one', message: '媒体库中继请求失败（HTTP 403）' }), false);
  assert.equal(gate.begin('room:movie:account', { id: 'one', message: '媒体库中继请求失败（HTTP 401）' }), true);
  assert.equal(gate.begin('room:movie:account', { id: 'two', message: '媒体库中继请求失败（HTTP 401）' }), false);
  assert.equal(gate.begin('room:other-movie:account', { id: 'three', message: '', httpStatus: 403 }), false);
  assert.equal(gate.begin('room:other-movie:account', { id: 'three', message: '', httpStatus: 401 }), true);
  gate.reset(); assert.equal(gate.begin('room:other-movie:account', { id: 'four', message: '', httpStatus: 401 }), true);
  assert.equal(new RelayAuthRecovery().begin('room', { id: 'unknown', message: '请求失败或超时' }), false);
});
