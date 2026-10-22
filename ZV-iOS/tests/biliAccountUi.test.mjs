import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const tick = () => new Promise(resolve => setImmediate(resolve));
const jsx = (type, props) => ({ type, props });
function runtime() {
  const slots = [], effects = [], queued = []; let cursor = 0, effectCursor = 0;
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = value; }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useEffect(fn, deps) { const i = effectCursor++; const old = effects[i]; if (!old || old.deps.some((v, j) => v !== deps[j])) queued.push(() => { old?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; }); },
  };
  react.useLayoutEffect = react.useEffect;
  return { react, render(fn) { cursor = 0; effectCursor = 0; const tree = fn(); for (const fn of queued.splice(0)) fn(); return tree; }, unmount() { effects.forEach(e => e.cleanup?.()); } };
}
function load(file, hooks, extra) {
  const modules = {
    react: hooks.react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': { View: 'View', Text: 'Text', Image: 'Image', Pressable: 'Pressable' },
    '@/state/appearance': { useAppearance: () => ({ styles: x => x }) }, '@/lib/server': { messageFor: error => error.message },
    './RoomUi': { RoomButton: 'Button', ui: {} }, './SourceDropdown': { SourceDropdown: 'Dropdown' }, ...extra,
  };
  const compiled = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {}; vm.runInNewContext(compiled, { exports, require: name => { assert.ok(modules[name], name); return modules[name]; }, AbortController, setInterval, clearInterval }); return exports;
}
function find(tree, predicate) { if (!tree || typeof tree !== 'object') return null; if (predicate(tree)) return tree; for (const child of [tree.props?.children].flat(Infinity)) { const item = find(child, predicate); if (item) return item; } return null; }
function text(tree) { if (typeof tree === 'string' || typeof tree === 'number') return String(tree); return tree && typeof tree === 'object' ? [tree.props?.children].flat(Infinity).map(text).join(' ') : ''; }

test('actual movie settings show quality and network failures without instructing an already logged-in user to log in', async () => {
  for (const reason of ['源站未提供所选画质', '本机 B站解析超时']) {
    const hooks = runtime(), policy = { qn: 0, cliEnabled: true, preferMp4: true, dashAllowed: true, revision: 0 };
    const session = { serverUrl: 'https://fixture.invalid', user: { id: 1 }, accessToken: 'fixture' };
    const request = async () => ({ settings: { dashDisabled: false } });
    const component = load('../src/components/BiliMovieSettings.tsx', hooks, {
      '@/state/session': { useSession: () => ({ session, request }) }, '@/lib/sources': { moviePlayback: () => ({ sourceUrl: 'BV17x411w7KC' }) },
      '@/lib/biliNative': { defaultBiliPolicy: policy, qualities: [0, 64, 32], readMovieBiliPolicy: async () => policy, onBiliQualityResolved: () => () => {}, applyMovieBiliPolicy: async () => { throw new Error(reason); } },
    });
    const movie = { id: 7 }; let child, tree;
    const render = () => { const parent = component.BiliMovieSettings({ movie }); child = parent; return tree = hooks.render(() => child.type(child.props)); };
    render(); await tick(); render(); const dropdown = find(tree, n => n.type === 'Dropdown');
    dropdown.props.onChange('64'); await tick(); render();
    assert(text(tree).includes(reason)); assert(!text(tree).includes('需要本机登录')); assert(text(tree).includes('保留原画质策略'));
    assert.equal(find(tree, n => n.type === 'Dropdown').props.value, '0'); hooks.unmount();
  }
});

test('account status reflects failed restoration and refreshes on foreground, explicit retry and reopening', async () => {
  const hooks = runtime(); let foreground, changed, calls = 0, removed = 0;
  const pending = []; let state = { ready: true, loggedIn: false, sessionVersion: 1, loginError: '本机 B站登录恢复失败，请检查网络后重试' };
  const component = load('../src/components/BiliAccount.tsx', hooks, {
    'react-native': { View: 'View', Text: 'Text', Image: 'Image', Pressable: 'Pressable', AppState: { addEventListener(_name, fn) { foreground = fn; return { remove() { removed++; } }; } } },
    '@expo/vector-icons/FontAwesome6': { default: 'Icon' }, './AppDialog': { AppDialog: 'Dialog' }, './MediaPanelUi': { useMediaPalette: () => ({}) },
    '@/lib/biliNative': { onBiliChange(fn) { changed = fn; return () => { removed++; }; }, resetBiliPlayback() {} },
    '@/lib/nativeBridge': { async biliOperation(kind) { assert.equal(kind, 'start'); calls++; return pending.length ? pending.shift() : state; } },
  });
  let tree; const render = () => tree = hooks.render(() => component.BiliAccount({ presentation: 'entry' }));
  render(); await tick(); render(); assert(text(tree).includes('登录待恢复')); assert(text(tree).includes('登录恢复失败'));
  state = { ready: true, loggedIn: true, sessionVersion: 2, user: { name: 'Fixture' } };
  foreground('active'); await tick(); render(); assert(text(tree).includes('本机 CLI 服务已启动 · 已登录')); assert(!text(tree).includes('登录恢复失败'));
  const count = calls; find(tree, n => n.props?.accessibilityLabel === '刷新本机状态').props.onPress(); await tick(); render(); assert.equal(calls, count + 1);
  find(tree, n => n.props?.accessibilityLabel === 'B站账号').props.onPress(); render(); await tick(); render(); assert.equal(calls, count + 2);
  let finish; pending.push(new Promise(resolve => { finish = resolve; })); foreground('active');
  changed(); await tick(); finish({ ready: true, loggedIn: false, sessionVersion: 1 }); await tick(); render();
  assert(text(tree).includes('本机 CLI 服务已启动 · 已登录')); hooks.unmount(); assert.equal(removed, 4);
});
