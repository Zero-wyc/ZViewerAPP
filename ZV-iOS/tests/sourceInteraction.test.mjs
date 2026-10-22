import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { addSourceBatch } from '../src/lib/sourceBatch.ts';
import { loadSourceAvailability } from '../src/lib/sourceAvailability.ts';
import * as mediaLibrary from '../src/lib/mediaLibrary.ts';
import { systemWindowDisplayPort, PlayerDisplay } from '../src/lib/playerDisplay.ts';
const { windowOrientations } = createRequire(import.meta.url)('../plugins/with-ios-scene-support.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

// Execute the production React component with deterministic effects and actual
// event callbacks. Children stay as elements so assertions inspect user actions.
function mountComponent(name, props, request, overrides = {}) {
  const slots = [], effects = []; let cursor = 0, tree, queued = [], dirty = true;
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const hooks = {
    useState(initial) { const id = cursor++; if (!(id in slots)) slots[id] = typeof initial === 'function' ? initial() : initial; return [slots[id], value => { const next = typeof value === 'function' ? value(slots[id]) : value; if (!Object.is(next, slots[id])) { slots[id] = next; dirty = true; } }]; },
    useRef(initial) { const id = cursor++; if (!(id in slots)) slots[id] = { current: initial }; return slots[id]; },
    useCallback(fn, deps) { const id = cursor++; if (!slots[id] || !equal(slots[id].deps, deps)) slots[id] = { fn, deps }; return slots[id].fn; },
    useEffect(fn, deps) { const id = cursor++; if (!effects[id] || !equal(effects[id].deps, deps)) queued.push(() => { effects[id]?.cleanup?.(); effects[id] = { deps, cleanup: fn() }; }); },
  };
  const element = (type, props) => ({ type, props });
  const session = { serverUrl: 'https://fixture.invalid', accessToken: 'fixture', user: { id: 1, role: 'root' } };
  const theme = { styles: value => value, color: value => value, preferences: { radius: 16 } };
  const modules = {
    react: hooks, 'react/jsx-runtime': { jsx: element, jsxs: element },
    'react-native': { Text: 'Text', View: 'View', Pressable: 'Pressable', Modal: 'Modal', ScrollView: 'ScrollView', KeyboardAvoidingView: 'KeyboardAvoidingView', Switch: 'Switch', ActivityIndicator: 'ActivityIndicator', Platform: { OS: 'ios' }, useWindowDimensions: () => ({ width: 600, height: 800 }) },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' }, '@expo/vector-icons/Feather': { default: 'Feather' },
    '@/state/session': { useSession: () => ({ session, request }) }, '@/state/appearance': { useAppearance: () => theme },
    '@/hooks/useMediaPreferences': { useMediaPreferences: () => ({ fullNames: true, episodeMode: 'list' }) },
    '@/lib/server': { messageFor: error => error.message }, '@/lib/sourceAvailability': { loadSourceAvailability },
    '@/lib/sourceBatch': { addSourceBatch }, '@/lib/mediaLibrary': mediaLibrary,
    '@/lib/cancellation': { checkAbort(signal) { if (signal?.aborted) throw new Error('cancelled'); } },
    '@/lib/sources': { canonicalSelection: value => value },
    './RoomUi': { RoomButton: 'RoomButton', RoomIconButton: 'RoomIconButton', RoomInput: 'RoomInput', ui: {} },
    './MediaPanelUi': { useMediaPalette: () => ({}) },
    ...Object.fromEntries(['CmsPicker','BiliVideoPicker','AnimePicker','SourceDropdown','Surface','MediaLibraryPicker','DirectoryPicker','AppDialog','EpisodePicker','MediaDisplayTools','SourcePoster','SourceBreadcrumbs'].map(child => ['./'+child, { [child]: child }])),
    ...overrides,
  };
  const compiled = ts.transpileModule(readFileSync(new URL(`../src/components/${name}.tsx`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require(id) { if (!modules[id]) throw new Error('Missing fixture module '+id); return modules[id]; }, AbortController, URLSearchParams });
  const render = () => { cursor = 0; queued = []; dirty = false; tree = exports[name](props); for (const effect of queued) effect(); return tree; };
  render();
  const all = () => { const result = []; const visit = value => { if (!value || typeof value !== 'object') return; if (Array.isArray(value)) { value.forEach(visit); return; } if (value.props) { result.push(value); visit(value.props.children); visit(value.props.footer); visit(value.props.titleActions); } }; visit(tree); return result; };
  return { render, all, find: predicate => all().find(predicate), async settle() { for (let i=0; i<12; i++) { await tick(); if (dirty) render(); } }, unmount() { effects.forEach(effect => effect?.cleanup?.()); } };
}

test('source loading shows network failure and retries without pretending the mount is absent', async () => {
  let fail = true;
  const request = async path => { if (path.endsWith('public-settings')) return { settings: { betaFeaturesEnabled: true } }; if (path.includes('jellyfin') && fail) throw new Error('network unavailable'); return { mounts: path.includes('jellyfin') ? [{}] : [] }; };
  const ui = mountComponent('SourcePicker', { visible: true, onClose() {}, onAdd: async () => {} }, request);
  await ui.settle();
  assert(ui.find(node => node.type === 'Text' && String(node.props.children).includes('来源加载失败')));
  const retry = ui.find(node => node.props.label === '重试加载来源'); assert.equal(retry.props.disabled, false);
  fail = false; retry.props.onPress(); ui.render(); await ui.settle();
  const dropdown = ui.find(node => node.props.testID === 'movie-source');
  assert(dropdown.props.options.some(item => item.id === 'jellyfin'));
  assert(!ui.find(node => node.type === 'Text' && String(node.props.children).includes('来源加载失败')));
  ui.unmount();
});

test('first media-library selection inherits a direct mount and a removed selection falls back to the next real mount', async () => {
  const mounts = [{ id: 7, directLink: true }, { id: 8, directLink: false }];
  assert.equal(mediaLibrary.selectLibraryMount(mounts, '').directLink, true);
  assert.equal(mediaLibrary.selectLibraryMount(mounts, '8').directLink, false);
  assert.equal(mediaLibrary.selectLibraryMount(mounts, 'missing').id, 7);
  assert.equal(mediaLibrary.selectLibraryMount([], ''), undefined);
  const ui = mountComponent('MediaLibraryPicker', { kind: 'jellyfin', add: async () => {}, onBusyChange() {} }, async () => ({ mounts }));
  await ui.settle();
  assert.equal(ui.find(node => node.props.label === '播放方式').props.value, 'direct');
  ui.find(node => node.props.testID === 'library-mount').props.onChange('8'); ui.render();
  assert.equal(ui.find(node => node.props.label === '播放方式').props.value, 'proxy');
  ui.unmount();
});

test('cancel waits for an in-flight write confirmation, retains it, and never starts the next item', async () => {
  const controller = new AbortController(); const pending = deferred(); const writes = [];
  const run = addSourceBatch(['first', 'second'], value => value, async value => { writes.push(value); await pending.promise; }, controller.signal);
  controller.abort(); await tick(); assert.deepEqual(writes, ['first']);
  pending.resolve(); const result = await run;
  assert.deepEqual(result, { added: ['first'], failures: [], cancelled: true });
  const retry = await addSourceBatch(['first', 'second'].filter(id => !result.added.includes(id)), value => value, async value => { writes.push(value); });
  assert.deepEqual(retry.added, ['second']); assert.deepEqual(writes, ['first', 'second']);
});

test('cancellation before a batch performs no writes; ordinary failures still allow later items', async () => {
  const controller = new AbortController(); controller.abort(); let writes = 0;
  assert.deepEqual(await addSourceBatch(['one'], value => value, async () => { writes++; }, controller.signal), { added: [], failures: [], cancelled: true });
  assert.equal(writes, 0);
  const result = await addSourceBatch(['one', 'two', 'two', 'three'], value => value, async value => { if (value === 'two') throw new Error('denied'); });
  assert.deepEqual(result, { added: ['one', 'three'], failures: [{ id: 'two', message: 'denied' }] });
});

test('media-library cancellation during confirmation keeps the confirmed entry instead of reporting it as unadded', async () => {
  const controller = new AbortController(); const entry = { name: 'fixture', path: '/one', type: 'file' };
  const result = await addSourceBatch([entry, { ...entry, path: '/two' }], item => item.path, item => mediaLibrary.addLibraryEntry(async () => ({ videoUrl: '/api/jellyfin/stream', format: 'mkv', duration: 10 }), 'jellyfin', { id: 7 }, item, false, async () => { controller.abort(); }, controller.signal), controller.signal);
  assert.deepEqual(result, { added: ['/one'], failures: [], cancelled: true });
});

test('episode picker exposes cancellation while adding and keeps only unfinished selections without a false failure', async () => {
  const pending = deferred(); let cancelled = false;
  const ui = mountComponent('EpisodePicker', { episodes: [{ id: 'one', title: 'one' }, { id: 'two', title: 'two' }], onCancel() { cancelled = true; }, onAdd: async () => pending.promise }, async () => ({}));
  ui.find(node => node.props.label === '多选').props.onPress(); ui.render();
  ui.find(node => node.props.label === '全选').props.onPress(); ui.render();
  const submit = ui.find(node => node.props.label === '添加所选 (2)').props.onPress(); ui.render();
  const stop = ui.find(node => node.props.label === '停止添加'); assert.equal(stop.props.disabled, false); stop.props.onPress(); assert.equal(cancelled, true);
  pending.resolve({ added: ['one'], cancelled: true }); await submit; await ui.settle();
  assert(ui.find(node => node.props.label === '添加所选 (1)'));
  assert(ui.find(node => node.type === 'Text' && String(node.props.children).includes('已停止添加')));
  assert(!ui.find(node => node.type === 'Text' && String(node.props.children).includes('集添加失败')));
  ui.unmount();
});

test('iPad fullscreen follows current window dimensions without claiming or invoking a native lock', async () => {
  let window = { width: 700, height: 900 };
  const port = systemWindowDisplayPort(() => window); const changes = []; const display = new PlayerDisplay(port, value => changes.push(value));
  await display.start(); await display.videoSize(1920, 1080); await display.setFullscreen(true);
  assert.equal(display.snapshot.fullscreen, true); assert.equal(display.snapshot.available, false); assert.equal(display.snapshot.locked, false); assert.equal(display.snapshot.landscape, false);
  window = { width: 1000, height: 600 }; display.orientationChanged(await port.landscape());
  assert.equal(display.snapshot.landscape, true);
  await display.videoSize(720, 1280); await display.toggleOrientation();
  assert.equal(display.snapshot.landscape, true); assert.equal(display.snapshot.locked, false);
  await display.setFullscreen(false); await display.dispose(); assert.equal(display.snapshot.fullscreen, false); assert(changes.every(state => !state.locked));
});

test('window configuration preserves single-scene startup and gives iPad four orientations while retaining iPhone default mask', () => {
  const plist = { EXDefaultScreenOrientationMask: 'UIInterfaceOrientationMaskAllButUpsideDown', CFBundleName: 'fixture', UIApplicationSceneManifest: { UIApplicationSupportsMultipleScenes: false } };
  windowOrientations(plist);
  assert.equal(plist.UIRequiresFullScreen, false); assert.equal(plist.CFBundleName, 'fixture'); assert.equal(plist.EXDefaultScreenOrientationMask, undefined);
  assert.equal(plist['UISupportedInterfaceOrientations~ipad'].length, 4); assert(plist['UISupportedInterfaceOrientations~ipad'].includes('UIInterfaceOrientationPortraitUpsideDown'));
  assert.equal(plist.UISupportedInterfaceOrientations.length, 3); assert(!plist.UISupportedInterfaceOrientations.includes('UIInterfaceOrientationPortraitUpsideDown'));
  assert.equal(plist.UIApplicationSceneManifest.UIApplicationSupportsMultipleScenes, false);
  const before = JSON.stringify(plist); windowOrientations(plist); assert.equal(JSON.stringify(plist), before);
});


test('source breadcrumbs give every long level equal shrinkable width, keep one line, and dispatch its existing back action', () => {
  const visits = [];
  const labels = ['custom:3:/', 'VeryLongContinuousDirectoryName', '第二层很长的名称', '当前层'];
  const ui = mountComponent('SourceBreadcrumbs', { items: labels.map((label, index) => ({ id: String(index), label, ...(index < labels.length - 1 ? { onPress: () => visits.push(index) } : {}) })) }, async () => ({}));
  assert.equal(ui.find(node => node.props.testID === 'source-breadcrumbs').props.style.flexWrap, 'nowrap');
  for (let index = 0; index < labels.length; index++) {
    const level = ui.find(node => node.props.testID === `source-breadcrumb-${index}`);
    assert.equal(level.props.style.flex, 1); assert.equal(level.props.style.minWidth, 0);
    assert.equal(level.props.children.props.numberOfLines, 1); assert.equal(level.props.children.props.ellipsizeMode, 'tail');
    assert.equal(level.props.children.props.children, labels[index]);
  }
  ui.find(node => node.props.testID === 'source-breadcrumb-1').props.onPress();
  ui.find(node => node.props.testID === 'source-breadcrumb-0').props.onAccessibilityTap();
  assert.deepEqual(visits, [1, 0]); ui.unmount();
});
