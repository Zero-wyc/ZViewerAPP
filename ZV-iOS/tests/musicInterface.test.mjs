import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as biliCatalog from '../src/lib/biliCatalog.ts';
import { musicLyrics } from '../src/lib/musicLyrics.ts';

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const element = (type, props) => ({ type, props });
function find(root, predicate) { if (!root || typeof root !== 'object') return null; if (predicate(root)) return root; for (const child of [root.props?.children].flat(Infinity)) { const result = find(child, predicate); if (result) return result; } return null; }
function all(root, predicate, result = []) { if (!root || typeof root !== 'object') return result; if (predicate(root)) result.push(root); for (const child of [root.props?.children].flat(Infinity)) all(child, predicate, result); return result; }
function runtime() {
  const state = [], effects = [], queued = []; let cursor = 0, effectCursor = 0;
  return {
    react: {
      useRef(value) { const index = cursor++; if (!(index in state)) state[index] = { current: value }; return state[index]; },
      useState(initial) { const index = cursor++; if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial; return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }]; },
      useCallback: callback => callback,
      useEffect(fn, deps) { const index = effectCursor++; const old = effects[index]; if (!old || deps.some((value, i) => value !== old.deps[i])) queued.push(() => { old?.cleanup?.(); effects[index] = { deps, cleanup: fn() }; }); },
    },
    render(fn) { cursor = 0; effectCursor = 0; const tree = fn(); for (const effect of queued.splice(0)) effect(); return tree; },
    unmount() { for (const effect of effects) effect?.cleanup?.(); },
  };
}
const palette = { text: '#111', muted: '#456', surface: '#fff', container: '#dde', line: '#aaa' };
function load(file, hooks, extra = {}, size = { width: 390, height: 844 }) {
  const modules = {
    react: hooks.react, 'react/jsx-runtime': { jsx: element, jsxs: element, Fragment: 'Fragment' },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', ActivityIndicator: 'Spinner', Linking: { openURL: async () => {} }, StyleSheet: { create: value => value, absoluteFill: {} }, useWindowDimensions: () => size },
    '@expo/vector-icons/Feather': { default: 'Icon' }, '@react-native-community/slider': { default: 'Slider' }, 'expo-blur': { BlurView: 'Blur' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
    '@/state/appearance': { useAppearance: () => ({ dark: false, preferences: { reduceMotion: true }, styles: value => value, color: value => value }) },
    '@/lib/preferences': { readPreference: async (_key, fallback) => fallback, writePreference: async () => {} },
    './RoomUi': { ui: {}, RoomButton: 'Button', RoomIconButton: 'IconButton', RoomInput: 'Input' }, './MusicUi': { MusicButton: 'Button', MusicIcon: 'IconButton', MusicOption: 'Option', MusicSection: 'Section', useMusicColors: () => palette }, './MediaPanelUi': { useMediaPalette: () => palette },
    './AppDialog': { AppDialog: 'Dialog' }, './MediaImage': { MediaImage: 'Image' }, './SourcePoster': { SourcePoster: 'Poster' },
    '@/hooks/useMediaPreferences': { useMediaPreferences: () => ({ fullNames: true }) }, '@/lib/server': { messageFor: error => error.message }, '@/lib/sources': { formatTime: value => String(value) },
    './MusicModeIcon': { MusicModeIcon: 'ModeIcon' }, './MusicSeekSlider': { MusicSeekSlider: 'Seek' }, './MusicVideo': { MusicVideo: 'MusicVideo' },
    ...extra,
  };
  const compiled = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {}; vm.runInNewContext(compiled, { exports, require: name => { assert.ok(modules[name], name); return modules[name]; }, AbortController, URL, URLSearchParams, Date, setTimeout, clearTimeout }); return exports;
}
const by = (tree, label) => find(tree, node => node.props?.accessibilityLabel === label || node.props?.label === label);

test('NCM romanization and translation attach to their own timestamp, including zero', () => {
  const lines = musicLyrics({ lrc: { lyric: '[00:00]原文零\n[00:02]原文二' }, romalrc: { lyric: '[00:00.02]yuan wen\n[00:10]wrong' }, tlyric: { lyric: '[00:02]Translation' } });
  assert.equal(lines[0].roman, 'yuan wen'); assert.equal(lines[0].translation, undefined);
  assert.equal(lines[1].roman, undefined); assert.equal(lines[1].translation, 'Translation');
});

test('wide music navigation retains a search field without replacing source navigation', () => {
  const hooks = runtime(); const calls = []; const size = { width: 1024, height: 768 }; const props = { page: 'bilibili', menu: 'account', setMenu(value) { props.menu = value; }, onPage: value => calls.push(value), onAccount() {}, onBiliSearch: keyword => calls.push(`bili:${keyword}`), search: { value: '歌曲', change() {}, submit: () => calls.push('submit'), busy: false } };
  const component = load('../src/components/MusicNavigation.tsx', hooks, { './MusicLibrary': { musicPages: [] } }, size);
  const tree = hooks.render(() => component.MusicNavigation(props));
  assert.ok(find(tree, node => node.props?.testID === 'music-wide-search'));
  assert.ok(by(tree, '网易云音乐')); assert.ok(by(tree, '哔哩哔哩'));
  by(tree, '搜索').props.onPress(); assert.deepEqual(calls, ['bili:歌曲']); assert.equal(props.menu, null);
  props.page = 'home'; const ncmTree = hooks.render(() => component.MusicNavigation(props));
  by(ncmTree, '搜索').props.onPress(); assert.deepEqual(calls, ['bili:歌曲', 'search', 'submit']);
});

test('portrait music toolbar follows source capabilities, preserves mode cycle and readable close control', async () => {
  const hooks = runtime(); const modes = []; const urls = [];
  const component = load('../src/components/ExpandedMusicPlayer.tsx', hooks, { 'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', Linking: { openURL: async value => urls.push(value) }, StyleSheet: { create: value => value, absoluteFill: {} }, useWindowDimensions: () => ({ width: 390, height: 844 }) } });
  const props = { trackKey: 'bili:BV1UHpw6LESy:11', expanded: true, pure: false, setPure() {}, audio: { mediaSettings: { volume: 100 }, currentTime: 37.8, configure() {} }, playing: false, time: 0, duration: 100, lyrics: [{ time: 0, content: '原文', roman: 'yuan wen', translation: 'Translation' }], lyricIndex: 0, lyricError: '', retryLyrics() {}, close() {}, openQueue() {}, openComments() {}, host: true, mode: 'order', setMode: value => modes.push(value), quality: 'standard', setQuality() {}, control() {}, commentBadge: '12' };
  let root, foreground;
  const render = () => { root = hooks.render(() => component.ExpandedMusicPlayer(props)); foreground = find(root, node => node.type === 'MusicVideo').props.children({ hasVideo: true, videoReady: true, openPicker() {}, enterPure() {}, error: '' }); };
  render(); await tick(); render();
  const toolbar = find(foreground, node => node.props?.testID === 'player-tool-strip');
  const labels = [toolbar.props.children].flat(Infinity).filter(Boolean).map(node => node.props.accessibilityLabel);
  assert.deepEqual(labels, ['显示歌词', '纯净视频', '播放模式：按顺序播放', '歌曲评论', '播放队列', '更多播放选项']);
  by(foreground, '播放模式：按顺序播放').props.onPress(); assert.deepEqual(modes, ['repeat-one']);
  assert.equal(by(foreground, '歌曲评论').props.disabled, false, 'Bili comments are reachable without an NCM song ID');
  const close = by(foreground, '收起 / 关闭'); assert.equal(close.props.style.width, 44); assert.equal(close.props.style.backgroundColor, 'rgba(255,255,255,.94)');
  by(foreground, '更多播放选项').props.onPress(); render();
  assert.equal(find(foreground, node => node.props?.title === '播放选项').props.visible, true);
  assert.ok(by(foreground, '隐藏罗马音')); assert.ok(by(foreground, '隐藏翻译'));
  by(foreground, '在哔哩哔哩打开原视频').props.onPress(); await tick(); render(); assert.match(urls[0], /BV1UHpw6LESy\?t=37$/);
  assert.equal(find(foreground, node => node.props?.title === '播放选项').props.visible, false);
  props.host = false; render(); assert.equal(by(foreground, '播放模式：按顺序播放'), null);
  hooks.unmount();
});

test('music browser reads real rank routes, renders cards and retires old-account responses', async () => {
  const hooks = runtime(); const stale = deferred(); const calls = []; let session = { serverUrl: 'https://first.invalid', user: { id: 1 }, accessToken: 'fixture' };
  const request = async (path, options) => { calls.push({ path, signal: options.signal }); if (session.user.id === 1) return stale.promise; return { items: [{ bvid: 'BV1UHpw6LESy', cid: 11, title: 'Current account', pic: 'https://i0.hdslb.com/test.jpg', upName: 'UP', view: 100, duration: 20 }], total: 1 }; };
  const component = load('../src/components/MusicBiliBrowser.tsx', hooks, { '@/state/session': { useSession: () => ({ session, request }) }, '@/lib/biliCatalog': biliCatalog, '@/lib/biliSelectionFlow': {}, '@/lib/biliNative': {}, './BiliVideoPicker': { BiliVideoPicker: 'Picker' } });
  let tree; const props = { add: async () => {}, play: async () => {} }; const render = () => tree = hooks.render(() => component.MusicBiliBrowser(props));
  render(); await tick(); assert.match(calls[0].path, /region-new\?.*rid=3/);
  session = { serverUrl: 'https://second.invalid', user: { id: 2 }, accessToken: 'fixture' }; render(); await tick(); render();
  assert.equal(calls[0].signal.aborted, true);
  stale.resolve({ items: [{ bvid: 'BV1GJ411x7h7', title: 'Old account' }], total: 1 }); await tick(); render();
  assert.ok(by(tree, '播放 Current account')); assert.equal(by(tree, '播放 Old account'), null);
  assert.ok(by(tree, '解析 B站音乐链接')); assert.ok(by(tree, '我的收藏'));
  assert.equal(by(tree, '搜索 B站音乐'), null, 'top navigation owns the search entrance');
  props.searchRequest = { id: 1, keyword: '音樂' }; render(); await tick(); render(); await tick();
  assert.ok(calls.some(call => /search\?.*keyword=/.test(call.path)));
  assert.ok(by(tree, 'B站音乐关键词'));
  hooks.unmount();
});

test('Bili song comments are read-only and closing a target aborts a late response', async () => {
  const hooks = runtime(); const old = deferred(); const requests = []; const counts = [];
  const request = (path, options) => { requests.push({ path, signal: options.signal }); return old.promise; };
  const component = load('../src/components/SongComments.tsx', hooks, { '@/state/session': { useSession: () => ({ request, requestText: async () => assert.fail('Bili must not post NCM comments') }) } });
  const props = { songId: null, bvid: 'BV1UHpw6LESy', close() {}, onCount: value => counts.push(value) }; let tree;
  const render = () => tree = hooks.render(() => component.SongComments(props)); render(); await tick(); render();
  assert.match(requests[0].path, /bilibili\/comments\?bvid=BV1UHpw6LESy/);
  assert.equal(by(tree, '发送评论'), null);
  props.bvid = null; render(); assert.equal(requests[0].signal.aborted, true);
  old.resolve({ replies: [{ rpid: 1, content: 'Stale comment', name: 'Old member', avatar: '', time: 0 }], total: 100 }); await tick(); render();
  assert.deepEqual(counts, []); assert.equal(find(tree, node => node.type === 'Text' && node.props.children === 'Stale comment'), null);
  hooks.unmount();
});
