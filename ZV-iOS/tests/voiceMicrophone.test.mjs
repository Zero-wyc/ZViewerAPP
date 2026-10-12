import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeVoiceMicrophone } from '../src/lib/voiceMicrophone.ts';
import { adminMuted } from '../src/lib/livekitProtocol.ts';

test('microphone publication rolls back when background, room retirement or admin mute arrives in flight', async () => {
  for (const reason of ['background', 'retired', 'adminMute']) {
    let allowed = true; const calls = [];
    const enabled = await changeVoiceMicrophone(true, () => allowed, async value => { calls.push(value); if (value) allowed = false; });
    assert.equal(enabled, false, reason); assert.deepEqual(calls, [true, false], reason);
  }
});
test('revoked join cannot publish; permission restoration alone never enables microphone', async () => {
  const calls = []; assert.equal(await changeVoiceMicrophone(true, () => false, async value => calls.push(value)), false); assert.deepEqual(calls, []);
  assert.equal(await changeVoiceMicrophone(false, () => true, async value => calls.push(value)), false); assert.deepEqual(calls, [false]);
  assert.equal(await changeVoiceMicrophone(true, () => true, async value => calls.push(value)), true); assert.deepEqual(calls, [false, true]);
  assert(!adminMuted('null')); assert(!adminMuted('[]')); assert(adminMuted('{"adminMuted":true}'));
});
test('WebRTC publication errors propagate instead of marking UI microphone enabled', async () => {
  await assert.rejects(changeVoiceMicrophone(true, () => true, async () => { throw new Error('capture failed'); }), /capture failed/);
});
