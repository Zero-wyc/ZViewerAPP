import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlayerDisplay, orientationAction } from '../src/lib/playerDisplay.ts';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(overrides = {}) {
  const calls = [], changes = [];
  const port = { supported: async () => true, landscape: async () => false, lock: async value => { calls.push(value); }, unlock: async () => { calls.push('auto'); }, ...overrides };
  const display = new PlayerDisplay(port, value => changes.push(value));
  return { display, calls, changes };
}
test('direction uses the Android/Harmony contextual action and the three matching icons', async () => {
  const { display, calls } = fixture(); await display.start();
  assert.deepEqual(orientationAction(display.snapshot), { target: 'landscape', icon: 'landscape', label: '切换并锁定横屏' });
  await display.toggleOrientation();
  assert.deepEqual(orientationAction(display.snapshot), { target: 'auto', icon: 'unlock', label: '解除旋转锁定（自动旋转）' });
  await display.toggleOrientation();
  assert.deepEqual(orientationAction(display.snapshot), { target: 'portrait', icon: 'portrait', label: '切换并锁定竖屏' });
  await display.toggleOrientation(); await display.toggleOrientation();
  assert.deepEqual(calls, ['landscape', 'auto', 'portrait', 'auto']); assert.equal(display.snapshot.locked, false);
});
test('fullscreen locks landscape; its direction action unlocks rotation while staying fullscreen', async () => {
  const { display, calls } = fixture(); await display.start();
  await display.setFullscreen(true); assert.equal(display.snapshot.fullscreen, true); assert.equal(display.snapshot.locked, true);
  await display.toggleOrientation(); assert.equal(display.snapshot.fullscreen, true); assert.equal(display.snapshot.locked, false);
  await display.setFullscreen(false);
  assert.deepEqual(calls, ['landscape', 'auto', 'auto']); assert.equal(display.snapshot.fullscreen, false);
});
test('exiting fullscreen restores automatic rotation even when portrait had been manually locked', async () => {
  const { display, calls } = fixture({ landscape: async () => true }); await display.start();
  await display.toggleOrientation(); await display.setFullscreen(true); await display.setFullscreen(false);
  assert.deepEqual(calls, ['portrait', 'landscape', 'auto']); assert.equal(display.snapshot.locked, false);
});
test('a pending fullscreen lock cannot finish after a newer exit or mode reset', async () => {
  for (const action of ['exit', 'reset']) {
    const pending = deferred(); const calls = [];
    const { display } = fixture({ lock: async value => { calls.push(value); await pending.promise; }, unlock: async () => { calls.push('auto'); } });
    await display.start(); const enter = display.setFullscreen(true); await tick();
    const exit = action === 'exit' ? display.setFullscreen(false) : display.reset(); pending.resolve(); await Promise.all([enter, exit]);
    assert.deepEqual(calls, ['landscape', 'auto']); assert.equal(display.snapshot.fullscreen, false); assert.equal(display.snapshot.locked, false); assert.equal(display.snapshot.busy, false);
  }
});
test('leaving the room retires in-flight rotation, unlocks last and stops UI updates', async () => {
  const pending = deferred(); const calls = [];
  const { display, changes } = fixture({ lock: async value => { calls.push(value); await pending.promise; }, unlock: async () => { calls.push('auto'); } });
  await display.start(); const enter = display.setFullscreen(true); await tick();
  const dispose = display.dispose(); const count = changes.length; pending.resolve(); await Promise.all([enter, dispose]);
  assert.deepEqual(calls, ['landscape', 'auto']); assert.equal(changes.length, count);
});
test('failed rotation can be retried and rapid repeated taps issue only one native operation', async () => {
  const pending = deferred(); let count = 0;
  const { display } = fixture({ lock: async () => { count++; if (count === 1) throw new Error('unavailable'); await pending.promise; } });
  await display.start(); await display.toggleOrientation();
  assert.equal(display.snapshot.locked, false); assert.equal(display.snapshot.busy, false); assert.ok(display.snapshot.error);
  const retry = display.toggleOrientation(); await display.toggleOrientation(); await tick();
  assert.equal(count, 2); pending.resolve(); await retry;
  assert.equal(display.snapshot.error, ''); assert.equal(display.snapshot.locked, true); assert.equal(display.snapshot.busy, false);
});
test('unsupported orientation still permits fullscreen without native lock calls', async () => {
  const { display, calls } = fixture({ supported: async () => false }); await display.start();
  await display.toggleOrientation(); await display.setFullscreen(true);
  assert.equal(display.snapshot.fullscreen, true); assert.equal(display.snapshot.locked, false); assert.deepEqual(calls, []);
  await display.reset(); assert.equal(display.snapshot.fullscreen, false);
});
test('a late initial query cannot overwrite a newer device orientation event', async () => {
  const pending = deferred(); const { display } = fixture({ landscape: () => pending.promise });
  const start = display.start(); display.orientationChanged(true); pending.resolve(false); await start;
  assert.equal(display.snapshot.landscape, true); assert.equal(orientationAction(display.snapshot).target, 'portrait');
});
