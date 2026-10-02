import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { withDeadline } from '../src/lib/deadline.ts';
import { SessionLease } from '../src/lib/sessionLease.ts';
import { normalizeAppearance, appearanceDefaults } from '../src/lib/appearancePreferences.ts';
import { authenticationFailure } from '../src/lib/httpAuth.ts';

test('v4.2.1 403 distinguishes expired authentication from valid user permission denial', () => {
  assert(authenticationFailure(401, ''));
  assert(authenticationFailure(403, JSON.stringify({ message: '认证令牌无效或已过期' })));
  assert(!authenticationFailure(403, JSON.stringify({ message: '无权限：仅超级管理员可操作' })));
  assert(!authenticationFailure(403, 'Forbidden'));
  assert(!authenticationFailure(500, JSON.stringify({ message: 'token expired' })));
});

test('startup storage/transport that ignores cancellation still settles on deadline', async () => {
  let signal;
  await assert.rejects(withDeadline(value => { signal = value; return new Promise(() => {}); }, 20), /超时/);
  assert.equal(signal.aborted, true);
});
test('deadline covers a stalled response body after successful headers', async () => {
  await assert.rejects(withDeadline(async () => {
    const response = { ok: true, text: () => new Promise(() => {}) };
    return await response.text();
  }, 20), /超时/);
});
test('completed operations retain their result and do not abort later', async () => {
  let signal;
  assert.equal(await withDeadline(async value => { signal = value; return 'ready'; }, 10), 'ready');
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(signal.aborted, false);
});
test('pre-cancelled and newly cancelled requests stop even if native transport ignores abort', async () => {
  const cancelled = new AbortController(); cancelled.abort(); let calls = 0;
  await assert.rejects(withDeadline(async () => ++calls, 100, cancelled.signal), /取消/);
  assert.equal(calls, 0);
  const active = new AbortController();
  const pending = withDeadline(() => new Promise(() => {}), 100, active.signal);
  active.abort(); await assert.rejects(pending, /取消/);
});
test('a late rejection after timeout is handled and cannot change the result', async () => {
  let fail;
  await assert.rejects(withDeadline(() => new Promise((_, reject) => { fail = reject; }), 10), /超时/);
  fail(new Error('late native error'));
  await new Promise(resolve => setImmediate(resolve));
});
test('logout and login invalidate late restore, verification and refresh results', () => {
  const session = new SessionLease(); const startup = session.capture();
  session.replace(null); assert.equal(session.accepts(startup), false);
  const accountA = { token: 'a' }; session.replace(accountA); const refreshA = session.capture();
  session.replace(null); session.replace({ token: 'b' });
  assert.equal(session.accepts(refreshA), false); assert.equal(session.value.token, 'b');
});
test('valid appearance preferences persist without losing any customization', () => {
  const value = { ...appearanceDefaults, mode: 'dark', image: 'file:///background.png', scale: 2, x: -100, reduceMotion: true };
  assert.deepEqual(normalizeAppearance(value), value);
});
test('corrupt appearance types and non-finite numbers cannot break startup or sliders', () => {
  assert.deepEqual(normalizeAppearance({ radius: null, mode: 'neon', opacity: '0.9', blur: Infinity, scale: NaN, image: {}, reduceMotion: 'true' }), appearanceDefaults);
  assert.deepEqual(normalizeAppearance(null), appearanceDefaults);
});
test('appearance values from older/outside-range preferences are clamped to UI bounds', () => {
  const value = normalizeAppearance({ radius: 1000, opacity: 0, scale: -1, x: -1000, overlay: 10 });
  assert.equal(value.radius, 28); assert.equal(value.opacity, 0.2); assert.equal(value.scale, 0.5);
  assert.equal(value.x, -200); assert.equal(value.overlay, 1);
});
