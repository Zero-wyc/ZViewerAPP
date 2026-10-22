import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as danmakuRoom from '../src/lib/danmakuRoom.ts';
import * as layout from '../src/lib/danmakuLayout.ts';
import * as timeline from '../src/lib/timeline.ts';
import { importDanmaku } from '../src/lib/danmakuImport.ts';
import * as danmakuImport from '../src/lib/danmakuImport.ts';
import * as danmakuSource from '../src/lib/danmakuSource.ts';

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
      useMemo(factory, deps) { const i = cursor++; const old = slots[i]; if (!old || old.deps.some((value, index) => value !== deps[index])) slots[i] = { deps, value: factory() }; return slots[i].value; },
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
    '@/lib/danmakuRoom': danmakuRoom, '@/lib/danmakuSource': danmakuSource, '@/lib/danmakuImport': danmakuImport, './RoomUi': { ui: {}, RoomButton: 'Button', RoomIconButton: 'IconButton', RoomInput: 'Input' }, './MusicUi': { MusicIcon: 'IconButton', MusicOption: 'Option' }, './MediaPanelUi': { MediaSlider: 'Slider', MediaSwitch: 'Switch', useMediaPalette: () => palette }, ...extra };
  const compiled = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {}; vm.runInNewContext(compiled, { exports, require: name => { assert.ok(modules[name], name); return modules[name]; }, AbortController, TextEncoder, URL, URLSearchParams }); return exports;
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
  let tree; const render = () => tree = runtime.render(() => module.DanmakuManager({ roomId: 'room-1', host: true, tracks: [track], mutate: async (path, options) => { requests.push({ path, ...options }); } }));
  const by = label => find(tree, value => value.props?.label === label || value.props?.accessibilityLabel === label || value.props?.placeholder === label);
  render(); by('管理弹幕轨道').props.onPress(); render(); by('隐藏轨道 Episode one').props.onValueChange(true); await tick(); render();
  assert.equal(JSON.parse(requests[0].body).source, 'bilibili-video'); assert.equal(JSON.parse(requests[0].body).hidden, true);
  by('调整偏移').props.onPress(); render(); by('轨道偏移秒数').props.onChangeText('-1.5'); render(); await by('保存偏移').props.onPress(); await tick();
  assert.equal(requests[1].method, 'PUT'); assert.equal(requests[1].path, '/api/rooms/room-1/danmaku-tracks/source%3Aep-1/offset'); assert.deepEqual(JSON.parse(requests[1].body), { offset: -1.5 }); runtime.unmount();
});

const deferred = () => { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };
function mountDanmaku(binding) {
  const runtime = hooks(), listeners = new Map(), requests = [];
  const socket = { id: 'socket-1', on(name, callback) { listeners.set(name, callback); }, off(name, callback) { if (listeners.get(name) === callback) listeners.delete(name); } };
  const request = (path, options) => { const operation = deferred(); requests.push({ path, options, ...operation }); return operation.promise; };
  const player = { currentTime: 10 }; const props = { roomId: 'room-1', enabled: true, binding }; let state;
  const module = load('../src/components/Danmaku.tsx', runtime, { '@/lib/danmakuLayout': layout, '@/lib/timeline': timeline, '@/state/session': { useSession: () => ({ socket, request, session: { serverUrl: 'https://fixture.invalid', user: { id: 1 } } }) }, '@/lib/preferences': { readPreference: async (_key, fallback) => fallback, writePreference: async () => {} }, './DanmakuTypeIcon': { DanmakuTypeIcon: 'Icon' } });
  const render = () => state = runtime.render(() => module.useDanmaku(props.roomId, player, props.enabled, props.binding)); render();
  return { player, props, socket, requests, listeners, render, get state() { return state; }, unmount: runtime.unmount };
}
test('new track/meta broadcasts retire late initial GET snapshots independently', async () => {
  const screen = mountDanmaku();
  screen.listeners.get('danmaku-tracks-updated')({ roomId: 'room-1', tracks: [{ trackId: 'new', items: [] }] });
  screen.listeners.get('danmaku-meta-updated')({ roomId: 'room-1', meta: { blockKeywords: ['new-block'], realtimeLog: [{ id: '1760000000001-new', content: 'latest', sender: 'member', time: 0 }] } }); screen.render();
  screen.requests[0].resolve({ tracks: [{ trackId: 'old', items: [] }] }); screen.requests[1].resolve({ meta: { blockKeywords: ['old-block'], realtimeLog: [] } }); await tick(); screen.render();
  assert.equal(screen.state.tracks[0].trackId, 'new'); assert.deepEqual(screen.state.blockKeywords, ['new-block']); assert.equal(screen.state.realtime[0].time, 0); assert.equal(screen.state.live.length, 0, 'restored history never replays as live overlay'); screen.unmount();
});
test('live broadcast deduplicates by id and preserves authoritative sender and zero video time from meta', () => {
  const screen = mountDanmaku(); const id = '1760000000001-one';
  screen.listeners.get('danmaku-meta-updated')({ roomId: 'room-1', meta: { realtimeLog: [{ id, content: 'iOS验收弹幕', sender: 'sender', time: 0 }] } });
  for (let index = 0; index < 2; index++) screen.listeners.get('danmaku')({ id, text: 'iOS验收弹幕', sender: 'sender' }); screen.render();
  assert.equal(screen.state.realtime.length, 1); assert.equal(screen.state.realtime[0].sender, 'sender'); assert.equal(screen.state.realtime[0].time, 0); assert.equal(screen.state.live.length, 1); assert.equal(screen.state.live[0].time, 10); screen.unmount();
});
test('changing room clears visible data and rejects old callbacks, late GETs and foreign room events', async () => {
  const screen = mountDanmaku(); const oldLive = screen.listeners.get('danmaku'); const oldRequests = [...screen.requests];
  oldLive({ id: 'old', text: 'old room' }); screen.render(); assert.equal(screen.state.realtime.length, 1);
  screen.props.roomId = 'room-2'; screen.render(); assert.equal(screen.state.realtime.length, 0);
  oldLive({ id: 'late', text: 'retired room' }); oldRequests[0].resolve({ tracks: [{ trackId: 'late', items: [] }] }); oldRequests[1].resolve({ meta: { realtimeLog: [{ id: 'late', content: 'late' }] } });
  screen.listeners.get('danmaku-meta-updated')({ roomId: 'room-1', meta: { blockKeywords: ['foreign'] } }); screen.listeners.get('danmaku')({ roomId: 'room-1', id: 'wrong', text: 'wrong' }); await tick(); screen.render();
  assert.equal(screen.state.realtime.length, 0); assert.equal(screen.state.tracks.length, 0); assert.equal(screen.state.blockKeywords.length, 0); assert.ok(oldRequests.every(item => item.options.signal.aborted)); screen.unmount();
});
test('zero-time imported danmaku is shown on the first zero clock and metadata blocks visible paused items', () => {
  const screen = mountOverlay([{ id: 'zero', time: 0, content: 'zero', mode: 1 }, comment('blocked'), comment('removed'), comment('safe')]);
  screen.time(0); assert.deepEqual(screen.visible(), ['track:zero']); screen.time(1);
  screen.state.blockKeywords = ['blocked']; screen.state.deletedLog = [{ trackId: 'track', item: { id: 'removed' } }]; screen.render();
  assert.deepEqual(screen.visible(), ['track:zero', 'track:safe']); screen.time(5); screen.time(0); assert.deepEqual(screen.visible(), ['track:zero']); screen.unmount();
});

test('server dandanplay and Bahamut wire modes preserve scroll/top/bottom through import and timeline rendering', () => {
  for (const source of ['dandanplay', 'bahamut']) {
    const items = importDanmaku(JSON.stringify([0, 1, 2].map(mode => ({ id: String(mode), mode, time: 0, content: String(mode) }))), source);
    assert.deepEqual(items.map(item => item.mode), [0, 1, 2]);
    const rendered = timeline.trackTimeline([{ trackId: source, source, items }]);
    assert.deepEqual(rendered.map(item => item.mode), [1, 5, 4]);
    assert.deepEqual(rendered.filter(item => layout.danmakuVisible(item, { ...layout.defaultDanmakuFilters, fixed: false })).map(item => item.id), [`${source}:0`]);
  }
});

const biliMedia = (movieId = 1, cid = 11, currentPage = 1) => ({ movieId, sourceType: 'bilibili', cid, currentPage });
const currentTrack = (media, name = 'default', items = [comment('current')]) => danmakuSource.scopeDanmakuTrack({ trackId: name, source: 'bilibili-video', label: name, items }, danmakuSource.danmakuMediaKey(media));
const pending = (screen, path, method = 'GET') => screen.requests.filter(entry => entry.path.includes(path) && (entry.options?.method || 'GET') === method);
const finishInitial = screen => {
  pending(screen, '/danmaku-tracks')[0]?.resolve({ tracks: [] });
  pending(screen, '/danmaku-meta')[0]?.resolve({ meta: {} });
};
test('Bili auto track starts at zero and persists scoped default without deleting initial manual tracks', async () => {
  const media = biliMedia(), screen = mountDanmaku({ media, canManage: true });
  pending(screen, '/danmaku-tracks')[0].resolve({ tracks: [{ trackId: 'manual', label: 'manual', items: [comment('legacy')] }] });
  pending(screen, '/bilibili/danmaku')[0].resolve({ danmaku: [{ id: 'zero', time: 0, content: 'zero', mode: 1 }] });
  await tick(); screen.render();
  assert.equal(screen.state.tracks.length, 2); assert(screen.state.tracks.some(track => track.trackId === 'manual'));
  const automatic = screen.state.tracks.find(track => track.label === '当前视频');
  assert.equal(automatic.items[0].time, 0); assert.equal(automatic.source, 'bilibili-video'); assert(automatic.trackId.endsWith(':default'));
  const posts = pending(screen, '/danmaku-tracks', 'POST'); assert.equal(posts.length, 1); assert(!posts[0].path.endsWith('/bulk'));
  assert.equal(JSON.parse(posts[0].options.body).trackId, automatic.trackId); assert.equal(posts[0].options.signal, undefined);
  posts[0].resolve({ success: true }); await tick(); screen.unmount();
});
test('viewer auto-fetches locally, ignores a late old CID and never writes or deletes NAS tracks', async () => {
  const first = biliMedia(), second = biliMedia(1, 22, 2), screen = mountDanmaku({ media: first, canManage: false });
  const old = [...screen.requests], oldBroadcast = screen.listeners.get('danmaku-tracks-updated');
  screen.props.binding = { media: second, canManage: false }; screen.render(); assert.equal(screen.state.tracks.length, 0);
  assert(old.every(entry => entry.options.signal.aborted));
  oldBroadcast({ roomId: 'room-1', tracks: [currentTrack(first)] });
  old.find(entry => entry.path.includes('/bilibili/danmaku')).resolve({ danmaku: [comment('old-cid')] });
  old.find(entry => entry.path.endsWith('/danmaku-tracks')).resolve({ tracks: [currentTrack(first)] });
  pending(screen, '/bilibili/danmaku?cid=22')[0].resolve({ danmaku: [comment('second-cid')] });
  await tick(); screen.render();
  assert.deepEqual(Array.from(screen.state.tracks, track => track.items[0]?.content), ['second-cid']);
  screen.listeners.get('danmaku-tracks-updated')({ roomId: 'room-1', tracks: [currentTrack(first), { trackId: 'legacy-old', items: [comment('old')] }, currentTrack(second, 'manual', [comment('second-manual')])] }); screen.render();
  assert.deepEqual(Array.from(screen.state.tracks, track => track.items[0]?.content), ['second-manual', 'second-cid']);
  assert.equal(screen.requests.filter(entry => entry.options.method).length, 0); screen.unmount();
});
test('a submitted old manual POST finishes before source clear and new automatic POST', async () => {
  const first = biliMedia(), second = biliMedia(2, 22), screen = mountDanmaku({ media: first, canManage: true }); finishInitial(screen);
  const oldMutation = screen.state.mutate('/api/rooms/room-1/danmaku-tracks', { method: 'POST', body: JSON.stringify({ trackId: 'manual', label: 'manual', source: 'local', items: [comment('manual')] }) });
  const outcome = oldMutation.catch(error => error.message); await tick();
  const submitted = pending(screen, '/danmaku-tracks', 'POST')[0]; assert(submitted); assert.equal(submitted.options.signal, undefined);
  const oldAuto = pending(screen, '/bilibili/danmaku?cid=11')[0];
  screen.props.binding = { media: second, canManage: true }; screen.render();
  pending(screen, '/bilibili/danmaku?cid=22')[0].resolve({ danmaku: [comment('new')] });
  oldAuto.resolve({ danmaku: [comment('late-old')] }); await tick();
  assert.equal(pending(screen, '/danmaku-tracks', 'POST').length, 1, 'clear and new POST wait for the submitted old write');
  submitted.resolve({ success: true }); await tick();
  assert.match(await outcome, /视频已切换/);
  const clear = pending(screen, '/danmaku-tracks/bulk', 'POST')[0]; assert.deepEqual(JSON.parse(clear.options.body), { tracks: [] });
  assert.equal(pending(screen, '/danmaku-tracks', 'POST').length, 2);
  clear.resolve({ success: true }); await tick();
  pending(screen, '/danmaku-tracks').at(-1).resolve({ tracks: [] }); await tick();
  const posts = pending(screen, '/danmaku-tracks', 'POST'); assert.equal(posts.length, 3);
  assert.equal(JSON.parse(posts[2].options.body).trackId, currentTrack(second).trackId);
  posts[2].resolve({ success: true }); screen.render(); assert(screen.state.tracks.every(track => !track.items.some(item => item.content === 'late-old'))); screen.unmount();
});
test('queued stale writes are skipped and MP4 switch cannot retain Bili or legacy tracks', async () => {
  const first = biliMedia(), second = { movieId: 2, sourceType: 'mp4' }, screen = mountDanmaku({ media: first, canManage: true });
  const old = screen.state.mutate('/api/rooms/room-1/danmaku-tracks', { method: 'POST', body: JSON.stringify({ trackId: 'never', label: 'never', source: 'local', items: [] }) }).catch(error => error.message);
  screen.props.binding = { media: second, canManage: true }; screen.render(); assert.equal(screen.state.tracks.length, 0); await tick();
  assert.match(await old, /视频或弹幕管理权限/);
  const posts = pending(screen, '/danmaku-tracks', 'POST'); assert.equal(posts.length, 1); assert(posts[0].path.endsWith('/bulk'));
  posts[0].resolve({ success: true }); await tick();
  screen.listeners.get('danmaku-tracks-updated')({ roomId: 'room-1', tracks: [currentTrack(first), { trackId: 'default', items: [comment('legacy-bili')] }, { trackId: 'manual', items: [comment('old-manual')] }] }); screen.render();
  assert.equal(screen.state.tracks.length, 0); assert.equal(pending(screen, '/bilibili/danmaku').length, 1); screen.unmount();
});
test('late automatic fetch preserves the already confirmed hidden flag and offset of this video', async () => {
  const media = biliMedia(), screen = mountDanmaku({ media, canManage: true });
  const saved = { ...currentTrack(media), hidden: true, offset: -1.5 };
  pending(screen, '/danmaku-tracks')[0].resolve({ tracks: [saved] }); await tick(); screen.render();
  pending(screen, '/bilibili/danmaku')[0].resolve({ danmaku: [comment('fetched-later')] }); await tick(); screen.render();
  assert.equal(screen.state.tracks.length, 1); assert.equal(screen.state.tracks[0].hidden, true); assert.equal(screen.state.tracks[0].offset, -1.5);
  assert.equal(pending(screen, '/danmaku-tracks', 'POST').length, 0); screen.unmount();
});
test('explicitly deleting this video default cannot resurrect it locally or through late server snapshots', async () => {
  const media = biliMedia(), track = currentTrack(media), screen = mountDanmaku({ media, canManage: true });
  pending(screen, '/danmaku-tracks')[0].resolve({ tracks: [track] });
  pending(screen, '/bilibili/danmaku')[0].resolve({ danmaku: [comment('automatic')] }); await tick(); screen.render();
  const deletion = screen.state.mutate(`/api/rooms/room-1/danmaku-tracks/${encodeURIComponent(track.trackId)}`, { method: 'DELETE' }); await tick();
  screen.listeners.get('danmaku-tracks-updated')({ roomId: 'room-1', tracks: [] }); screen.render(); assert.equal(screen.state.tracks.length, 0);
  pending(screen, '/danmaku-tracks/', 'DELETE')[0].resolve({ success: true }); await deletion; screen.render(); assert.equal(screen.state.tracks.length, 0);
  screen.listeners.get('danmaku-tracks-updated')({ roomId: 'room-1', tracks: [track] }); screen.render(); assert.equal(screen.state.tracks.length, 0);
  const before = screen.requests.length; screen.render(); assert.equal(screen.requests.length, before, 'a deletion never triggers a background reload');
  screen.props.binding = { media: biliMedia(2, 22), canManage: false }; screen.render(); pending(screen, '/bilibili/danmaku?cid=22')[0].resolve({ danmaku: [comment('next')] }); await tick(); screen.render(); assert.equal(screen.state.tracks.length, 1); screen.unmount();
});
test('viewer honors the room deletion of an observed default even if its own CID fetch finishes later', async () => {
  const media = biliMedia(), screen = mountDanmaku({ media, canManage: false });
  pending(screen, '/danmaku-tracks')[0].resolve({ tracks: [currentTrack(media)] }); await tick(); screen.render();
  screen.listeners.get('danmaku-tracks-updated')({ roomId: 'room-1', tracks: [] });
  pending(screen, '/bilibili/danmaku')[0].resolve({ danmaku: [comment('late-current')] }); await tick(); screen.render();
  assert.equal(screen.state.tracks.length, 0); assert.equal(screen.requests.filter(entry => entry.options.method).length, 0); screen.unmount();
});
test('same CID in another movie is a new source, while refreshed URLs and heartbeats are unchanged', async () => {
  const first = biliMedia(), screen = mountDanmaku({ media: first, canManage: false }); const count = screen.requests.length, key = screen.state.mediaKey;
  screen.props.binding = { media: { ...first, sourceUrl: 'https://media.invalid/?token=refreshed', updatedAt: 22 }, canManage: false }; screen.render();
  assert.equal(screen.requests.length, count); assert.equal(screen.state.mediaKey, key);
  screen.props.binding = { media: biliMedia(2), canManage: false }; screen.render();
  assert.notEqual(screen.state.mediaKey, key); assert.equal(pending(screen, '/bilibili/danmaku').length, 2);
  assert(!screen.state.mediaKey.includes('https') && !screen.state.mediaKey.includes('token')); screen.unmount();
});
test('automatic fetch failure is visible, an empty current video is valid, and old failure cannot win', async () => {
  const screen = mountDanmaku({ media: biliMedia(), canManage: false });
  pending(screen, '/bilibili/danmaku')[0].reject(Error('network')); await tick(); screen.render(); assert.match(screen.state.error, /自动弹幕/);
  screen.props.binding = { media: biliMedia(2, 22), canManage: false }; screen.render(); assert.equal(screen.state.error, '');
  pending(screen, '/bilibili/danmaku?cid=22')[0].resolve({ danmaku: [] });
  pending(screen, '/danmaku-tracks')[0].reject(Error('late old snapshot failure')); await tick(); screen.render();
  assert.equal(screen.state.error, ''); assert.equal(screen.state.tracks.length, 1); assert.equal(screen.state.tracks[0].items.length, 0); screen.unmount();
});
test('actual search import shares the hook write queue and unmount cannot import into the next movie', async () => {
  const first = { movieId: 1, sourceType: 'mp4' }, screen = mountDanmaku({ media: first, canManage: true });
  const runtime = hooks(), imported = [], providerRequests = [];
  const request = async (path, init) => {
    providerRequests.push({ path, init });
    if (path.endsWith('/sources')) return { sources: [{ id: 'bilibili-video', name: 'B站' }] };
    if (path.includes('/search?')) return { results: [{ id: 'video', title: 'Search result' }] };
    if (path.includes('/episodes?')) return { episodes: [{ id: 'episode', title: 'Episode' }] };
    if (path.endsWith('/fetch')) return { danmaku: [comment('import')] };
    throw Error('Search component must submit room writes through mutate');
  };
  const module = load('../src/components/DanmakuSearchDialog.tsx', runtime, { '@/lib/cancellation': { checkAbort(signal) { if (signal.aborted) throw Error('cancelled'); } }, '@/state/session': { useSession: () => ({ request, session: null }) }, '@/lib/server': { messageFor: error => error.message }, './AppDialog': { AppDialog: 'Dialog' }, './SourceDropdown': { SourceDropdown: 'Dropdown' }, './MediaImage': { MediaImage: 'Image' } });
  let tree; const render = () => tree = runtime.render(() => module.DanmakuSearchDialog({ roomId: 'room-1', tracks: [], mutate: screen.state.mutate, close() {}, imported: value => imported.push(value) }));
  const by = label => find(tree, node => node.props?.label === label || node.props?.accessibilityLabel === label || node.props?.placeholder === label);
  render(); await tick(); render(); by('影片名 / BV号').props.onChangeText('fixture'); render(); by('搜索弹幕').props.onPress(); await tick(); render();
  by('Search result').props.onPress(); await tick(); render(); by('Episode').props.onPress(); await tick();
  const submitted = pending(screen, '/danmaku-tracks', 'POST')[0]; assert(submitted); assert.equal(JSON.parse(submitted.options.body).trackId, currentTrack(first, 'bilibili-video:episode').trackId);
  screen.props.binding = { media: { movieId: 2, sourceType: 'mp4' }, canManage: true }; screen.render(); runtime.unmount(); await tick();
  assert.equal(pending(screen, '/danmaku-tracks/bulk', 'POST').length, 0);
  submitted.resolve({ success: true }); await tick(); assert.equal(pending(screen, '/danmaku-tracks/bulk', 'POST').length, 1); assert.equal(imported.length, 0);
  assert(providerRequests.every(entry => !entry.path.includes('/rooms/'))); screen.unmount();
});
