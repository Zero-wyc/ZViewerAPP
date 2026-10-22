import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const jsx = (type, props) => ({ type, props });
function find(root, predicate) { if (!root || typeof root !== 'object') return null; if (predicate(root)) return root; for (const child of [root.props?.children].flat(Infinity)) { const result = find(child, predicate); if (result) return result; } return null; }
const byId = (tree, id) => find(tree, node => node.props?.testID === id);
const byLabel = (tree, label) => find(tree, node => node.props?.label === label || node.props?.accessibilityLabel === label);
function hooks() {
  const state = [], effects = [], queued = []; let cursor = 0, effectCursor = 0;
  const changed = (a, b) => !a || a.length !== b.length || a.some((value, index) => value !== b[index]);
  const memo = (fn, deps) => { const key = cursor++; if (!(key in state) || changed(state[key].deps, deps)) state[key] = { value: fn(), deps }; return state[key].value; };
  return {
    react: {
      useState(initial) { const key = cursor++; if (!(key in state)) state[key] = typeof initial === 'function' ? initial() : initial; return [state[key], value => { state[key] = typeof value === 'function' ? value(state[key]) : value; }]; },
      useRef(initial) { const key = cursor++; if (!(key in state)) state[key] = { current: initial }; return state[key]; },
      useMemo: memo, useCallback: (fn, deps) => memo(() => fn, deps),
      useEffect(fn, deps) { const key = effectCursor++, old = effects[key]; if (!old || changed(old.deps, deps)) queued.push(() => { old?.cleanup?.(); effects[key] = { deps, cleanup: fn() }; }); },
    },
    render(fn) { cursor = 0; effectCursor = 0; const tree = fn(); for (const effect of queued.splice(0)) effect(); return tree; },
    dispose() { for (const effect of effects) effect?.cleanup?.(); },
  };
}
const palette = { text: '#111', muted: '#456', surface: '#fff', container: '#dde', line: '#aaa', error: '#a00', field: '#eee' };
function load(file, runtime, extra = {}) {
  const modules = {
    react: runtime.react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { ScrollView: 'ScrollView', Text: 'Text', View: 'View' },
    './RoomUi': { RoomInput: 'Input' }, './MusicUi': { MusicButton: 'Button' }, './RoomSideDrawer': { RoomSideDrawer: 'Drawer' },
    './MediaPanelUi': { useMediaPalette: () => palette }, '@/lib/server': { messageFor: error => error.message },
    ...extra,
  };
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {}; vm.runInNewContext(code, { exports, require: name => { assert.ok(modules[name], name); return modules[name]; }, setTimeout, clearTimeout }); return exports;
}
function socket() { const listeners = new Map(); return { connected: true, on(event, fn) { const values = listeners.get(event) || new Set(); values.add(fn); listeners.set(event, values); }, off(event, fn) { listeners.get(event)?.delete(fn); }, emit(event, value) { for (const fn of [...listeners.get(event) || []]) fn(value); }, count(event) { return listeners.get(event)?.size || 0; } }; }
function mountComments(ack) {
  const runtime = hooks(), live = socket(), calls = [], props = { roomId: 'music-a', visible: false, close() {} };
  const component = load('../src/components/RoomDiscussion.tsx', runtime, { '@/state/session': { useSession: () => ({ socket: live }) }, '@/lib/socket': { emitAck: (socket, event, payload) => { calls.push({ event, payload }); return ack(event, payload); } } });
  let tree; const render = () => tree = runtime.render(() => component.RoomDiscussion(props));
  const settle = async () => { render(); await tick(); render(); };
  render(); return { props, live, calls, render, settle, get tree() { return tree; }, dispose: runtime.dispose };
}
const comment = (id, roomId, content) => ({ id, roomId, username: 'fixture member', content });
const textPresent = (tree, text) => !!find(tree, node => node.type === 'Text' && node.props.children === text);

test('closed comments keep their subscription, merge late history without duplicates, and filter other rooms', async () => {
  const history = deferred(); const panel = mountComments(() => history.promise);
  try {
    panel.live.emit('new-comment', comment(2, 'music-a', 'live while closed'));
    panel.live.emit('new-comment', comment(3, 'other-room', 'foreign'));
    history.resolve({ comments: [comment(1, 'music-a', 'history'), comment(2, 'music-a', 'live while closed'), comment(4, 'other-room', 'foreign history')] });
    await panel.settle(); assert(textPresent(panel.tree, 'history')); assert(textPresent(panel.tree, 'live while closed')); assert(!textPresent(panel.tree, 'foreign')); assert(!textPresent(panel.tree, 'foreign history'));
    assert.equal(byId(panel.tree, 'room-discussion-list').props.children.length, 2);
    panel.props.visible = true; panel.render(); panel.props.visible = false; panel.render();
    assert.equal(panel.calls.length, 1, 'opening and closing must not refetch or restart listeners'); assert.equal(panel.live.count('new-comment'), 1);
  } finally { panel.dispose(); assert.equal(panel.live.count('new-comment'), 0); }
});

test('reconnect retires stale history and old-room send ACK cannot clear the new-room draft', async () => {
  const historyA = deferred(), oldSend = deferred(); let historyCount = 0;
  const panel = mountComments((event, payload) => event === 'send-comment' ? oldSend.promise : ++historyCount === 1 ? historyA.promise : Promise.resolve({ comments: [comment(10, payload.roomId, 'current history')] }));
  try {
    panel.live.connected = false; panel.live.emit('disconnect'); panel.live.connected = true; panel.live.emit('connect');
    await panel.settle(); historyA.resolve({ comments: [comment(1, 'music-a', 'stale history')] }); await panel.settle();
    assert(textPresent(panel.tree, 'current history')); assert(!textPresent(panel.tree, 'stale history'));
    byLabel(panel.tree, '房间评论内容').props.onChangeText(' old draft '); panel.render();
    const pending = byLabel(panel.tree, '发送').props.onPress(); panel.render();
    assert.equal(panel.calls.at(-1).event, 'send-comment'); assert.equal(panel.calls.at(-1).payload.isDanmaku, false); assert.equal(panel.calls.at(-1).payload.content, 'old draft');
    panel.props.roomId = 'music-b'; await panel.settle(); byLabel(panel.tree, '房间评论内容').props.onChangeText('new draft'); panel.render();
    oldSend.resolve({}); await pending; await panel.settle();
    assert.equal(byLabel(panel.tree, '房间评论内容').props.value, 'new draft'); assert.equal(byLabel(panel.tree, '发送').props.disabled, false);
  } finally { panel.dispose(); }
});

test('send permissions/errors preserve the draft, disconnect disables send, and edited text survives a successful ACK', async () => {
  const history = deferred(); let pending = deferred(); const panel = mountComments(event => event === 'send-comment' ? pending.promise : history.promise);
  try {
    await panel.settle(); byLabel(panel.tree, '房间评论内容').props.onChangeText('muted draft'); panel.render(); byLabel(panel.tree, '发送').props.onPress();
    pending.reject(new Error('您已被房主禁言')); await panel.settle();
    assert(textPresent(panel.tree, '您已被房主禁言')); assert.equal(byLabel(panel.tree, '房间评论内容').props.value, 'muted draft');
    history.resolve({ comments: [] }); await panel.settle(); assert(textPresent(panel.tree, '您已被房主禁言'), 'a late successful history response cannot clear a send permission error');
    pending = deferred(); byLabel(panel.tree, '发送').props.onPress(); panel.render();
    byLabel(panel.tree, '房间评论内容').props.onChangeText('continued typing'); panel.render(); pending.resolve({}); await panel.settle();
    assert.equal(byLabel(panel.tree, '房间评论内容').props.value, 'continued typing');
    panel.live.connected = false; panel.live.emit('disconnect'); panel.render(); assert.equal(byLabel(panel.tree, '发送').props.disabled, true);
  } finally { panel.dispose(); }
});

function mountDrawer() {
  const runtime = hooks(), animations = []; let dismissals = 0, closes = 0; const size = { width: 390, height: 844 }, insets = { top: 47, bottom: 34, left: 0, right: 0 };
  class Value { constructor(value) { this.value = value; } setValue(value) { this.value = value; } stopAnimation() {} interpolate(config) { return { config, value: this.value }; } }
  const rn = { View: 'View', Text: 'Text', Pressable: 'Pressable', Modal: 'Modal', KeyboardAvoidingView: 'KeyboardAvoidingView', StyleSheet: { absoluteFill: { position: 'absolute' } }, useWindowDimensions: () => size, Platform: { OS: 'ios' }, Keyboard: { dismiss() { dismissals++; } }, PanResponder: { create: handlers => ({ panHandlers: handlers }) }, Easing: { out: value => value, cubic: 'cubic' }, Animated: { View: 'AnimatedView', Value, timing(value, config) { const record = { config, stopped: false, callback: null, start(callback) { record.callback = callback; }, stop() { record.stopped = true; }, finish() { value.value = config.toValue; record.callback?.({ finished: true }); } }; animations.push(record); return record; } } };
  const component = load('../src/components/RoomSideDrawer.tsx', runtime, { 'react-native': rn, '@expo/vector-icons/Feather': { default: 'Icon' }, 'react-native-safe-area-context': { useSafeAreaInsets: () => insets }, '@/state/appearance': { useAppearance: () => ({ preferences: { reduceMotion: false } }) } });
  const props = { visible: false, close() { closes++; props.visible = false; }, title: '房间评论', children: 'fixture composer' }; let tree;
  const render = () => tree = runtime.render(() => component.RoomSideDrawer(props)); render();
  return { props, size, insets, animations, component, runtime, render, get tree() { return tree; }, get closes() { return closes; }, get dismissals() { return dismissals; }, dispose: runtime.dispose };
}

test('right drawer survives interrupted close/open, adapts rotation/safe areas, and supports backdrop, swipe and accessibility dismissal', () => {
  const panel = mountDrawer(); try {
    assert.equal(panel.tree, null); assert.equal(panel.dismissals, 0, 'a closed dock must not dismiss another input keyboard');
    panel.props.visible = true; panel.render(); panel.render(); panel.animations.at(-1).finish(); panel.render();
    assert.equal(byId(panel.tree, 'room-discussion-keyboard').props.behavior, 'padding');
    let drawer = byId(panel.tree, 'room-discussion-drawer'); assert.equal(drawer.props.style.width, 344); assert.equal(drawer.props.style.marginRight, 6);
    assert(panel.tree.props.supportedOrientations.includes('landscape-left'));
    panel.props.visible = false; panel.render(); const closing = panel.animations.at(-1); assert(panel.tree);
    panel.props.visible = true; panel.render(); closing.finish(); panel.render(); assert(panel.tree, 'late completion from the old close cannot hide a reopened dock');
    panel.size.width = 320; panel.size.height = 390; panel.insets.left = 44; panel.insets.right = 44; panel.render();
    drawer = byId(panel.tree, 'room-discussion-drawer'); assert.equal(drawer.props.style.width, 208); assert(drawer.props.style.height <= 261); assert.equal(drawer.props.style.marginRight, 44);
    const drag = byId(panel.tree, 'room-discussion-drag'); assert.equal(drag.props.onMoveShouldSetPanResponder(null, { dx: 15, dy: 30 }), false);
    assert.equal(drag.props.onMoveShouldSetPanResponder(null, { dx: 60, dy: 2 }), true);
    drag.props.onPanResponderRelease(null, { dx: 70, vx: 0 }); assert.equal(panel.closes, 1);
    panel.props.visible = true; panel.render(); byId(panel.tree, 'room-discussion-backdrop').props.onPress(); assert.equal(panel.closes, 2);
    panel.props.visible = true; panel.render(); byId(panel.tree, 'room-discussion-drawer').props.onAccessibilityEscape(); assert.equal(panel.closes, 3);
    panel.render(); panel.animations.at(-1).finish(); panel.render(); assert.equal(panel.tree, null);
  } finally { panel.dispose(); }
});

test('music edge handle opens by touch, left swipe, or accessibility without a draggable floating bubble', () => {
  const panel = mountDrawer(); try {
    let opens = 0; const edge = panel.runtime.render(() => panel.component.RoomCommentButton({ onPress() { opens++; } }));
    assert.equal(edge.props.testID, 'room-comment-edge'); edge.props.onPress(); edge.props.onAccessibilityTap();
    assert.equal(edge.props.onMoveShouldSetPanResponder(null, { dx: -40, dy: 1 }), true); edge.props.onPanResponderRelease(null, { dx: -40 }); assert.equal(opens, 3);
  } finally { panel.dispose(); }
});
