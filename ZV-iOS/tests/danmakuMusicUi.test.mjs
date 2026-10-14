import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as layout from '../src/lib/danmakuLayout.ts';
import * as timeline from '../src/lib/timeline.ts';
import { importDanmaku } from '../src/lib/danmakuImport.ts';

const tick = () => new Promise(resolve => setImmediate(resolve));
const comment = (id, mode = 1, color = 0xffffff) => ({ id, mode, color, time: 1, content: id });
test('danmaku type filters match all native client mode groups and combine with color filtering', () => {
  for (const [key, modes] of Object.entries({ scroll: [1, 2, 3, 6], fixed: [4, 5], advanced: [7, 8] })) {
    const filters = { ...layout.defaultDanmakuFilters, [key]: false };
    for (let mode = 1; mode <= 8; mode++) assert.equal(layout.danmakuVisible(comment('text', mode), filters), !modes.includes(mode), `${key}:${mode}`);
  }
  const whiteOnly = { ...layout.defaultDanmakuFilters, color: false };
  assert.equal(layout.danmakuVisible(comment('fixed red', 5, 0xff0000), whiteOnly), false);
  assert.equal(layout.danmakuVisible(comment('scroll white'), whiteOnly), true);
  assert.equal(layout.danmakuVisible({ id: 'live', time: 1, content: 'live' }, { ...whiteOnly, scroll: false }), false);
});
test('older saved preferences enable new filters, and partial saved filters retain explicit blocking', () => {
  const saved = layout.normalizeDanmakuPreferences({ opacity: .4 });
  assert.equal(saved.opacity, .4); assert.deepEqual(saved.filters, layout.defaultDanmakuFilters);
  const partial = layout.normalizeDanmakuPreferences({ filters: { color: false } });
  assert.deepEqual(partial.filters, { ...layout.defaultDanmakuFilters, color: false });
});
test('online danmaku normalization preserves mode identity for type filtering', () => {
  const items = importDanmaku(JSON.stringify(Array.from({ length: 9 }, (_, index) => comment(String(index), index + 1))));
  assert.deepEqual(items.map(item => item.mode), [1, 2, 3, 4, 5, 6, 7]);
  const filtered = items.filter(item => layout.danmakuVisible(item, { ...layout.defaultDanmakuFilters, advanced: false }));
  assert.deepEqual(filtered.map(item => item.mode), [1, 2, 3, 4, 5, 6]);
});

const jsx = (type, props) => ({ type, props });
function find(root, predicate) { if (!root || typeof root !== 'object') return null; if (predicate(root)) return root; for (const child of [root.props?.children].flat(Infinity)) { const result = find(child, predicate); if (result) return result; } return null; }
function hooks() {
  const slots = [], effects = [], queued = []; let cursor = 0, effectCursor = 0;
  return {
    react: {
      useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
      useRef(value) { const i = cursor++; if (!(i in slots)) slots[i] = { current: value }; return slots[i]; },
      useEffect(fn, deps) { const i = effectCursor++; const old = effects[i]; if (!old || old.deps.length !== deps.length || old.deps.some((v, j) => v !== deps[j])) queued.push(() => { old?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; }); },
    },
    render(fn) { cursor = 0; effectCursor = 0; const result = fn(); for (const effect of queued.splice(0)) effect(); return result; },
    unmount() { for (const effect of effects) effect.cleanup?.(); },
  };
}
const palette = { text: '#111', muted: '#333', accent: '#06c', surface: '#fff', container: '#eee', field: '#eee', line: '#aaa' };
function load(file, runtime, extra) {
  const modules = { react: runtime?.react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { Animated: {}, Easing: {}, View: 'View', ScrollView: 'ScrollView', Text: 'Text', Pressable: 'Pressable', Switch: 'Switch', StyleSheet: { create: value => value, absoluteFill: {} }, useWindowDimensions: () => ({ width: 390, height: 844 }), Alert: { alert() {} } },
    '@expo/vector-icons/Feather': { default: 'Icon' }, '@/state/appearance': { useAppearance: () => ({ styles: value => value, color: value => value }) },
    './RoomUi': { ui: {}, RoomButton: 'Button', RoomIconButton: 'IconButton', RoomInput: 'Input' }, './MediaPanelUi': { MediaSlider: 'Slider', MediaSwitch: 'Switch', useMediaPalette: () => palette }, ...extra };
  const compiled = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {}; vm.runInNewContext(compiled, { exports, require: name => { assert.ok(modules[name], name); return modules[name]; } }); return exports;
}
function mountOverlay(items, filters = layout.defaultDanmakuFilters) {
  const runtime = hooks(), listeners = new Map();
  const player = { currentTime: 0, playing: false, addListener(name, fn) { listeners.set(name, fn); return { remove() { if (listeners.get(name) === fn) listeners.delete(name); } }; } };
  const module = load('../src/components/Danmaku.tsx', runtime, { '@/lib/danmakuLayout': layout, '@/lib/timeline': timeline, '@/state/session': {}, '@/lib/preferences': {}, './DanmakuTypeIcon': { DanmakuTypeIcon: 'Icon' } });
  const state = { preferences: { ...layout.defaultDanmakuPreferences, scaleWithScreen: false, filters }, tracks: [{ trackId: 'track', label: 'test', items }], live: [] };
  let tree; const render = () => tree = runtime.render(() => module.DanmakuOverlay({ player, state, width: 800, height: 400 })); render();
  const visible = () => [tree.props.children].flat().map(item => item.props.item.id);
  return { render, state, visible, time(value) { player.currentTime = value; listeners.get('timeUpdate')({ currentTime: value }); render(); }, unmount: runtime.unmount };
}
test('blocking a type hides already displayed comments immediately while paused', () => {
  const screen = mountOverlay([comment('scroll'), comment('fixed', 5), comment('advanced', 7)]); screen.time(1);
  assert.deepEqual(screen.visible(), ['track:scroll', 'track:fixed', 'track:advanced']);
  screen.state.preferences = { ...screen.state.preferences, filters: { ...layout.defaultDanmakuFilters, fixed: false, advanced: false } }; screen.render();
  assert.deepEqual(screen.visible(), ['track:scroll']); screen.unmount();
});
test('blocked comments cannot consume the display budget before an enabled type', () => {
  const screen = mountOverlay([...Array.from({ length: 20 }, (_, index) => comment(`scroll-${index}`)), comment('fixed', 4)], { ...layout.defaultDanmakuFilters, scroll: false });
  screen.time(1); assert.deepEqual(screen.visible(), ['track:fixed']); screen.unmount();
});
function mountNavigation() {
  const module = load('../src/components/MusicNavigation.tsx', null, { './MusicLibrary': { musicPages: [{ key: 'home', label: '首页' }, { key: 'mymusic', label: '我的音乐' }, { key: 'bilibili', label: '哔哩哔哩' }] } });
  const routes = [], account = []; let tree;
  const props = { page: 'mymusic', menu: null, setMenu(value) { props.menu = value; }, onPage(value) { routes.push(value); props.page = value; }, onAccount() { account.push(props.menu); } };
  const render = () => tree = module.MusicNavigation(props); render();
  const by = label => find(tree, item => item.props?.accessibilityLabel === label || item.props?.label === label);
  return { routes, account, render, by, has: id => !!find(tree, item => item.props?.testID === id) };
}
test('music navigation and account menus replace each other in either direction and toggle closed', () => {
  const ui = mountNavigation();
  for (let i = 0; i < 3; i++) {
    ui.by('网易云音乐').props.onPress(); ui.render(); assert.equal(ui.has('ncm-menu'), true); assert.equal(ui.has('music-account-menu'), false);
    ui.by('账号').props.onPress(); ui.render(); assert.equal(ui.has('ncm-menu'), false); assert.equal(ui.has('music-account-menu'), true);
  }
  ui.by('账号').props.onPress(); ui.render(); assert.equal(ui.has('music-account-menu'), false);
  ui.by('网易云音乐').props.onPress(); ui.render(); ui.by('网易云音乐').props.onPress(); ui.render(); assert.equal(ui.has('ncm-menu'), false);
});
test('navigation, search and login dismiss music menus before opening the destination', () => {
  const ui = mountNavigation(); ui.by('网易云音乐').props.onPress(); ui.render(); ui.by('首页').props.onPress(); ui.render();
  assert.equal(ui.has('ncm-menu'), false); assert.equal(ui.routes.at(-1), 'home');
  ui.by('账号').props.onPress(); ui.render(); ui.by('搜索').props.onPress(); ui.render(); assert.equal(ui.has('music-account-menu'), false); assert.equal(ui.routes.at(-1), 'search');
  ui.by('账号').props.onPress(); ui.render(); ui.by('账号登录').props.onPress(); ui.render(); assert.deepEqual(ui.account, [null]); assert.equal(ui.has('music-account-menu'), false);
});
test('remaining track controls preserve source metadata and update only the offset', async () => {
  const runtime = hooks(), requests = []; const track = { trackId: 'source:ep-1', source: 'bilibili-video', label: 'Episode one', items: [comment('one')], offset: 0, hidden: false };
  const module = load('../src/components/DanmakuManager.tsx', runtime, { '@/state/session': { useSession: () => ({ request: async (path, options) => { requests.push({ path, ...options }); } }) }, '@/lib/danmakuImport': { danmakuBody: JSON.stringify }, '@/lib/server': { messageFor: value => value.message }, './DanmakuSearchDialog': { DanmakuSearchDialog: 'Search' } });
  let tree; const render = () => tree = runtime.render(() => module.DanmakuManager({ roomId: 'room-1', host: true, tracks: [track] }));
  const by = label => find(tree, value => value.props?.label === label || value.props?.accessibilityLabel === label || value.props?.placeholder === label);
  render(); by('管理弹幕轨道').props.onPress(); render(); by('隐藏轨道 Episode one').props.onValueChange(true); await tick(); render();
  assert.equal(JSON.parse(requests[0].body).source, 'bilibili-video'); assert.equal(JSON.parse(requests[0].body).hidden, true);
  by('调整偏移').props.onPress(); render(); by('轨道偏移秒数').props.onChangeText('-1.5'); render(); await by('保存偏移').props.onPress(); await tick();
  assert.equal(requests[1].method, 'PUT'); assert.equal(requests[1].path, '/api/rooms/room-1/danmaku-tracks/source%3Aep-1/offset'); assert.deepEqual(JSON.parse(requests[1].body), { offset: -1.5 }); runtime.unmount();
});
