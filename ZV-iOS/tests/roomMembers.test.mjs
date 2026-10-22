import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/roomMembers.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports });
const apply = (...values) => JSON.parse(JSON.stringify(exports.viewersAfterHostTransfer(...values)));

test('promotion removes the new host and the authority event adds the demoted host without guessing identity', () => {
  const original = [{ socketId: 'phone', username: 'viewer', userId: 3, role: 'user' }, { socketId: 'observer', userId: 5 }];
  const next = apply(original, { newHostSocketId: 'phone', oldHostSocketId: 'tablet' });
  assert.deepEqual(next, [{ socketId: 'observer', userId: 5 }, { socketId: 'tablet', username: '原房主' }]);
  assert.equal(original.length, 2);
  assert.equal(original[0].socketId, 'phone');
  assert.equal('userId' in next[1], false);
  assert.equal('role' in next[1], false);
});

test('a matching previous-host identity retains authenticated account fields', () => {
  const host = { socketId: 'tablet', username: 'original', userId: 1, role: 'root' };
  assert.deepEqual(apply([{ socketId: 'phone' }], { newHostSocketId: 'phone', oldHostSocketId: 'tablet' }, host), [host]);
  assert.deepEqual(host, { socketId: 'tablet', username: 'original', userId: 1, role: 'root' });
});

test('a previous-host cache belonging to another socket cannot leak its account onto the demoted host', () => {
  const next = apply([], { newHostSocketId: 'phone', oldHostSocketId: 'tablet' }, { socketId: 'retired', userId: 99, username: 'wrong', role: 'root' });
  assert.deepEqual(next, [{ socketId: 'tablet', username: '原房主' }]);
});

test('duplicate transfer events are idempotent and retain a real viewer identity', () => {
  const event = { newHostSocketId: 'phone', oldHostSocketId: 'tablet' };
  const real = { socketId: 'tablet', userId: 1, username: 'real', role: 'root' };
  const next = apply([{ socketId: 'phone' }, real, real], event, { socketId: 'tablet', username: 'stale' });
  assert.deepEqual(next, [real]);
  assert.deepEqual(apply(next, event), next);
});

test('later viewer-joined metadata supersedes fallback and a round trip produces the other real viewer', () => {
  let viewers = apply([{ socketId: 'phone', username: 'viewer', userId: 3 }], { newHostSocketId: 'phone', oldHostSocketId: 'tablet' });
  // Existing room viewer-joined wiring replaces the record by socket ID.
  const joined = { socketId: 'tablet', username: 'original', userId: 1, role: 'root' };
  viewers = [...viewers.filter(value => value.socketId !== joined.socketId), joined];
  assert.deepEqual(viewers, [joined]);
  const previous = { socketId: 'phone', username: 'viewer', userId: 3, role: 'user' };
  viewers = apply(viewers, { newHostSocketId: 'tablet', oldHostSocketId: 'phone' }, previous);
  assert.deepEqual(viewers, [previous]);
});

test('missing or invalid old-host data cannot create a guessed member', () => {
  const list = [{ socketId: 'phone' }, { socketId: 'other' }];
  assert.deepEqual(apply(list, { newHostSocketId: 'phone' }), [{ socketId: 'other' }]);
  assert.deepEqual(apply(list, { newHostSocketId: '', oldHostSocketId: 'tablet' }), list);
  assert.deepEqual(apply(list, { newHostSocketId: 'phone', oldHostSocketId: 'phone' }), list);
});
