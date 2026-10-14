import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
function runtime() {
  const slots = [], effects = [], queued = []; let cursor = 0, effectCursor = 0;
  const changed = (a, b) => !a || a.length !== b.length || a.some((value, index) => value !== b[index]);
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useCallback(fn, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) { const i = effectCursor++; const old = effects[i]; if (!old || changed(old.deps, deps)) queued.push(() => { old?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; }); },
  };
  return { react, render(fn) { cursor = 0; effectCursor = 0; const value = fn(); for (const effect of queued.splice(0)) effect(); return value; }, unmount() { effects.forEach(effect => effect.cleanup?.()); } };
}
const jsx = (type, props) => ({ type, props });
function find(root, predicate) { if (!root || typeof root !== 'object') return null; if (predicate(root)) return root; const values = root.props?.children; for (const child of [values].flat(Infinity)) { const found = find(child, predicate); if (found) return found; } return null; }
function textOf(root) { if (typeof root === 'string' || typeof root === 'number') return String(root); if (!root || typeof root !== 'object') return ''; return [root.props?.children].flat(Infinity).map(textOf).join(' '); }
function port() {
  const listeners = new Map(), sent = [];
  const socket = { connected: true, id: 'self', on(name, fn) { const set = listeners.get(name) || new Set(); set.add(fn); listeners.set(name, set); }, off(name, fn) { listeners.get(name)?.delete(fn); } };
  let fail = false;
  return { socket, sent, receive(name, data) { for (const fn of [...listeners.get(name) || []]) fn(data); }, setFail(value) { fail = value; }, async ack(_, event, data) { sent.push({ event, data }); if (fail) throw new Error('server refused'); return { success: true }; } };
}
function mountSettings({ host = true, initial } = {}) {
  const hooks = runtime(), network = port(), copied = [];
  const request = () => initial || Promise.resolve({ rooms: [{ roomId: 'room-1', maxViewers: 20, requireApproval: false }] });
  const modules = {
    react: hooks.react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { Alert: { alert() {} }, Pressable: 'Pressable', StyleSheet: { create: v => v }, Switch: 'Switch', Text: 'Text', View: 'View' },
    '@expo/vector-icons/Feather': { default: 'Icon' }, 'expo-clipboard': { async setStringAsync(value) { copied.push(value); return true; } },
    '@/lib/roomModes': { roomModes: [{ id: 'watch-together', name: '一起看' }, { id: 'screen-share', name: '投屏' }, { id: 'listen-together', name: '一起听' }] },
    '@/lib/socket': { emitAck: network.ack }, '@/lib/server': { messageFor: e => e.message },
    '@/state/session': { useSession: () => ({ socket: network.socket, connected: true, request, session: { serverUrl: 'http://fixture.invalid/base' } }) },
    './BiliAccount': { BiliAccount: 'Account' }, './MediaPanelUi': { useMediaPalette: () => ({ text: '#111', muted: '#333', accent: '#06c', onAccent: '#fff', line: '#aaa', container: '#eee', surface: '#fff', field: '#eee', error: '#a00' }) },
    './RoomUi': { RoomButton: 'Button', RoomInput: 'Input' },
  };
  const exports = {}; vm.runInNewContext(compile('../src/components/RoomSettings.tsx'), { exports, require: name => { assert.ok(modules[name], name); return modules[name]; } });
  let tree; const props = { roomId: 'room-1', roomName: 'Room one', host, mode: 'watch-together', close() {}, viewers: [], openAppearance() {}, autoApprove: false, toggleAutoApprove() {} };
  const render = () => tree = hooks.render(() => exports.RoomSettings(props)); render();
  return { ...network, copied, render, text: () => textOf(tree), find: label => find(tree, n => n.props?.accessibilityLabel === label || n.props?.label === label), input: placeholder => find(tree, n => n.props?.placeholder === placeholder), unmount: hooks.unmount };
}
test('viewers retain sharing and member access while host mutation controls stay absent or disabled', async () => {
  const ui = mountSettings({ host: false }); await tick(); ui.render();
  assert.equal(ui.find('修改房间名称'), null); assert.equal(ui.find('加入条件'), null); assert.equal(ui.find('自动通过播放控制申请'), null);
  assert.equal(ui.find('投屏').props.disabled, true); ui.find('投屏').props.onPress(); await tick();
  assert.equal(ui.sent.length, 0); ui.find('分享').props.onPress(); await tick(); assert.equal(ui.copied[0], 'http://fixture.invalid/base/room/room-1'); ui.unmount();
});
test('a late room snapshot cannot overwrite a newer settings broadcast from the active room', async () => {
  const pending = deferred(), ui = mountSettings({ initial: pending.promise });
  ui.receive('room-settings-updated', { roomId: 'other-room', maxViewers: 5, requireApproval: false });
  ui.receive('room-settings-updated', { roomId: 'room-1', maxViewers: 30, requireApproval: true });
  pending.resolve({ rooms: [{ roomId: 'room-1', maxViewers: 10, requireApproval: false }] }); await tick(); ui.render();
  assert.equal(ui.find('切换入房审批').props.selected, true); ui.find('加入条件').props.onPress(); ui.render(); assert.ok(/当前人数上限\s+30/.test(ui.text())); ui.unmount();
});
test('saving a password alone preserves untouched capacity and admission settings', async () => {
  const ui = mountSettings(); await tick(); ui.render(); ui.find('加入条件').props.onPress(); ui.render();
  ui.find('修改房间密码').props.onValueChange(true); ui.render(); ui.input('新密码（留空移除密码）').props.onChangeText('new password'); ui.render();
  await ui.find('保存加入条件').props.onPress(); await tick();
  assert.deepEqual(JSON.parse(JSON.stringify(ui.sent.at(-1))), { event: 'update-room-settings', data: { roomId: 'room-1', password: 'new password' } }); ui.unmount();
});
test('admission approval reflects server acknowledgement and retains its value when rejected', async () => {
  const ui = mountSettings(); await tick(); ui.render(); ui.setFail(true); await ui.find('切换入房审批').props.onPress(); await tick(); ui.render();
  assert.equal(ui.find('切换入房审批').props.selected, false); assert.ok(ui.text().includes('server refused'));
  ui.setFail(false); await ui.find('切换入房审批').props.onPress(); await tick(); ui.render(); assert.equal(ui.find('切换入房审批').props.selected, true); ui.unmount();
});
function mountControl(host = true) {
  const hooks = runtime(), network = port(), writes = [], publishes = [];
  const player = { duration: 100, play() { writes.push('play'); }, pause() { writes.push('pause'); }, set currentTime(value) { writes.push(value); } };
  const publish = (...args) => publishes.push(args);
  const modules = { react: hooks.react, '@/lib/socket': { emitAck: network.ack } }; const exports = {};
  vm.runInNewContext(compile('../src/hooks/useWatchControl.ts'), { exports, require: name => modules[name], setTimeout, clearTimeout });
  let auto = false, value; const render = () => value = hooks.render(() => exports.useWatchControl(network.socket, 'room-1', host, player, publish, auto)); render();
  return { ...network, writes, publishes, render, enable() { auto = true; render(); }, value: () => value, unmount: hooks.unmount };
}
test('playback requests remain manual until the host explicitly enables automatic approval', async () => {
  const control = mountControl(); control.receive('pause-request', { viewerSocketId: 'viewer-a' }); control.render();
  assert.equal(control.value().requests.length, 1); assert.equal(control.writes.length, 0);
  control.enable(); assert.equal(control.value().requests.length, 1);
  control.receive('seek-request', { viewerSocketId: 'viewer-b', time: 130 }); await tick(); control.render();
  assert.deepEqual(control.writes, [100]); assert.equal(control.sent.at(-1).event, 'seek-response'); assert.equal(control.sent.at(-1).data.accept, true); control.unmount();
});
test('an audience client cannot auto-approve or execute another audience request', async () => {
  const control = mountControl(false); control.enable(); control.receive('play-request', { viewerSocketId: 'another-viewer' }); await tick(); control.render();
  assert.equal(control.writes.length, 0); assert.equal(control.sent.length, 0); assert.equal(control.value().requests.length, 0); control.unmount();
});
