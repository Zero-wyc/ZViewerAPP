import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(readFileSync(new URL('../src/hooks/useSystemMedia.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

test('background metadata replaces native ownership immediately and rejects the old song command', async () => {
  const effects = [], published = [], cleared = [], commands = [], listeners = new Map(); let nativeCommand;
  const metadata = id => ({ mediaId: `room:${id}`, sourceIdentity: id, kind: 'audio', title: id, host: true, actions: ['play', 'pause', 'next', 'prev'] });
  const player = { nativeOwnerId: 'native-audio', sourceRevision: 7, sourceIdentity: 'first', sourceUri: 'https://audio.invalid/first', currentTime: 12, duration: 180, playbackRate: 1, playing: true, addListener(event, fn) { listeners.set(event, fn); return { remove() {} }; } };
  const native = { async mediaUpdate(raw) { published.push(JSON.parse(raw)); }, async mediaClear(id) { cleared.push(id); }, addListener(_event, fn) { nativeCommand = fn; return { remove() {} }; } };
  const exports = {};
  vm.runInNewContext(code, { exports, Date, require(name) {
    if (name === 'react') return { useRef: value => ({ current: value }), useId: () => 'owner', useCallback: fn => fn, useEffect: fn => effects.push(fn) };
    if (name === 'react-native') return { AppState: { addEventListener() { return { remove() {} }; } } };
    return { nativeBridge: native };
  } });
  const publish = exports.useSystemMedia(player, metadata('first'), (action, value) => commands.push({ action, value }));
  for (const effect of effects) effect();
  publish(metadata('second')); // No React render/effect runs after this point.
  assert.equal(published.at(-1).mediaId, 'room:second');
  assert.equal(published.at(-1).uri, '', 'never attach the previous audio to the new metadata');
  assert.equal(published.at(-1).ownerId, 'native-audio');
  assert.equal(published.at(-1).inputRevision, 7);
  nativeCommand({ sessionId: 'owner', mediaId: 'room:first', action: 'next' });
  assert.equal(commands.length, 0);
  player.sourceIdentity = 'second'; player.sourceRevision = 8; player.sourceUri = 'https://audio.invalid/second'; player.currentTime = 0;
  listeners.get('sourceLoad')();
  assert.equal(published.at(-1).uri, player.sourceUri);
  assert.equal(published.at(-1).title, 'second');
  assert.equal(published.at(-1).inputRevision, 8);
  nativeCommand({ sessionId: 'owner', mediaId: 'room:second', action: 'next' });
  assert.equal(commands.length, 1);
  publish(null);
  assert.equal(cleared.at(-1), 'owner');
  nativeCommand({ sessionId: 'owner', mediaId: 'room:second', action: 'next' });
  assert.equal(commands.length, 1);
});
