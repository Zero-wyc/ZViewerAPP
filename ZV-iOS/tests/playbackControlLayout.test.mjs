import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as playbackMenu from '../src/lib/playbackMenu.ts';

const compile = name => ts.transpileModule(readFileSync(new URL(`../src/components/${name}.tsx`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
const source = compile('PlaybackControls');
// Exercise the real 44pt orientation button rather than assuming its footprint.
const orientationSource = compile('ScreenOrientationButton');
const flatStyle = style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
function all(tree, predicate) {
  if (!tree || typeof tree !== 'object') return [];
  return [...(predicate(tree) ? [tree] : []), ...[tree.props?.children].flat(Infinity).flatMap(child => all(child, predicate))];
}
function mount({ fullscreen = false, windowWidth = 320, insets = {}, fontScale = 1 } = {}) {
  const slots = []; let cursor = 0, tree;
  const react = {
    useState(initial) { const key = cursor++; if (!(key in slots)) slots[key] = typeof initial === 'function' ? initial() : initial; return [slots[key], value => { slots[key] = typeof value === 'function' ? value(slots[key]) : value; }]; },
    useRef(initial) { const key = cursor++; if (!(key in slots)) slots[key] = { current: initial }; return slots[key]; },
    useEffect() {},
    useCallback(fn) { return fn; },
  };
  const jsx = (type, props) => typeof type === 'function' ? type(props) : { type, props };
  const modules = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', TextInput: 'TextInput', View: 'View', Alert: { alert() {} }, StyleSheet: { create: value => value, absoluteFill: {} }, useWindowDimensions: () => ({ width: windowWidth, height: 700, scale: 2, fontScale }) },
    'expo-image': { Image: 'Image' },
    '@expo/vector-icons/Feather': { default: 'Icon' },
    '@react-native-community/slider': { default: 'Slider' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0, ...insets }) },
    '@/state/appearance': { useAppearance: () => ({ color: value => value }) },
    '@/state/session': { useSession: () => ({ connected: true, socket: { connected: true } }) },
    '@/lib/sources': { formatTime: value => String(value) },
    '@/lib/preferences': { writePreference: async () => {} },
    '@/lib/socket': { emitAck: async () => {} },
    '@/lib/server': { messageFor: value => String(value) },
    '@/lib/playbackMenu': playbackMenu,
    '@/lib/playerDisplay': { orientationAction: () => ({ label: '锁定横屏方向', icon: 'landscape' }) },
    './AppDialog': { AppDialog: 'Dialog' },
    './MediaPanelUi': { MediaSlider: 'MediaSlider', MediaTabs: 'MediaTabs' },
    './PlaybackSettings': { PlaybackSettings: 'Settings' },
  };
  const evaluate = code => { const exports = {}; vm.runInNewContext(code, { exports, require: name => { assert(name in modules, `Unexpected module ${name}`); return modules[name]; } }); return exports; };
  modules['./ScreenOrientationButton'] = evaluate(orientationSource);
  const { PlaybackControls } = evaluate(source);
  const props = { fullscreen, player: { currentTime: 5, duration: 100, playing: true, playbackRate: 1, mediaSettings: { volume: 80 }, configure() {} }, nextEnabled: true, nextBusy: false, next() {}, sync() {}, roomId: 'fixture', subtitles: {}, danmaku: { preferences: { enabled: true }, change() {} }, host: true, control() {}, toggleFullscreen() {}, refresh() {}, orientation: { available: true, locked: false, busy: false, error: '', toggle() {} }, hide() {}, interact() {} };
  const render = () => { cursor = 0; tree = PlaybackControls(props); return tree; };
  render();
  return {
    get tree() { return tree; },
    render,
    layout(rowWidth) { tree.props.onLayout({ nativeEvent: { layout: { width: windowWidth } } }); render(); this.row().props.onLayout({ nativeEvent: { layout: { width: rowWidth } } }); render(); },
    row() { return all(tree, node => node.props?.testID === 'watch-control-actions')[0]; },
    buttons() { return all(this.row(), node => node.type === 'Pressable'); },
    menu() { return all(tree, node => node.type === 'Modal')[0]; },
    settings() { return all(tree, node => node.type === 'Settings')[0]; },
    quick() { return all(tree, node => node.type === 'Dialog')[0]; },
  };
}

test('real toolbar retains 44pt targets and one evenly spaced row at narrow and safe-area boundaries', () => {
  for (const [windowWidth, fullscreen, insets, expected] of [
    [320, false, {}, 6], [326, false, {}, 7],
    [368, true, {}, 7], [370, true, {}, 8],
    [375, true, { left: 34 }, 7], [390, true, { left: 47, right: 47 }, 6],
    [700, true, { left: 80, right: 80 }, 8],
  ]) {
    for (const fontScale of [1, 1.353]) {
      const view = mount({ windowWidth, fullscreen, insets, fontScale });
      const root = flatStyle(view.tree.props.style);
      const contentWidth = windowWidth - root.paddingLeft - root.paddingRight - 2 * root.borderWidth;
      view.layout(contentWidth);
      const row = flatStyle(view.row().props.style);
      assert.equal(row.flexDirection, 'row'); assert.equal(row.justifyContent, 'space-between'); assert.notEqual(row.flexWrap, 'wrap');
      const buttons = view.buttons(); assert.equal(buttons.length, expected, `${windowWidth}/${fullscreen}/${fontScale}`);
      const widths = buttons.map(button => { const style = flatStyle(button.props.style); assert.equal(style.width, 44); assert.equal(style.minHeight, 44); return style.width; });
      assert(widths.reduce((sum, width) => sum + width, 0) <= contentWidth);
    }
  }
});

test('measured row width controls fitting independently of the outer window width and can reflow', () => {
  const view = mount({ fullscreen: true, windowWidth: 900 });
  for (const [rowWidth, count, volume, settings, orientation] of [
    [263, 5, false, false, false], [264, 6, true, false, false],
    [307, 6, true, false, false], [308, 7, true, true, false],
    [351, 7, true, true, false], [352, 8, true, true, true], [302, 6, true, false, false],
  ]) {
    view.layout(rowWidth);
    const buttons = view.buttons(), labels = buttons.map(node => node.props.accessibilityLabel);
    assert.equal(buttons.length, count);
    assert.equal(labels.includes('本机音量'), volume); assert.equal(labels.includes('播放设置'), settings);
    assert.equal(buttons.some(node => node.props.testID === 'screen-orientation-button'), orientation);
    assert(buttons.length * 44 <= rowWidth);
  }
});

test('More keeps composer first and moved controls remain reachable through their existing panels', () => {
  const view = mount({ fullscreen: true }); view.layout(250);
  const press = (tree, label, event = 'onPress') => { const button = all(tree, node => node.type === 'Pressable' && node.props.accessibilityLabel === label)[0]; assert(button, label); button.props[event](); view.render(); };
  press(view.row(), '更多播放操作'); assert.equal(view.menu().props.visible, true);
  const menuItems = () => [all(view.menu(), node => node.type === 'ScrollView')[0].props.children].flat(Infinity).filter(Boolean);
  assert.deepEqual(menuItems().slice(0, 3).map(item => item.props.children.props.children), ['发送弹幕', '本机音量', '播放设置']);
  menuItems()[0].props.onPress(); view.render();
  assert.equal(view.menu().props.visible, false);
  assert.equal(all(view.tree, node => node.type === 'TextInput' && node.props.accessibilityLabel === '发送弹幕').length, 1);
  press(view.row(), '更多播放操作'); assert.equal(menuItems()[0].props.children.props.children, '收起弹幕输入');
  menuItems()[0].props.onPress(); view.render();
  assert.equal(view.menu().props.visible, false);
  assert.equal(all(view.tree, node => node.type === 'TextInput' && node.props.accessibilityLabel === '发送弹幕').length, 0);
  press(view.row(), '更多播放操作');
  press(view.menu(), '本机音量', 'onAccessibilityTap');
  assert.equal(view.menu().props.visible, false); assert.equal(view.quick().props.visible, true); assert.equal(view.quick().props.title, '本机音量');
  view.quick().props.close(); view.render();
  press(view.row(), '更多播放操作'); press(view.menu(), '播放设置');
  assert.equal(view.menu().props.visible, false); assert.equal(view.settings().props.visible, true);
  view.settings().props.close(); view.render();
  view.layout(352); assert.equal(view.buttons().length, 8); assert.equal(view.quick().props.visible, false); assert.equal(view.settings().props.visible, false);
});

test('actual Modal menu uses trigger-to-portal coordinates, constrained below placement and refreshed composer layout', () => {
  const view = mount({ windowWidth: 390, insets: { top: 20, bottom: 34 } }); view.layout(372);
  const trigger = { x: 310, y: 624, width: 44, height: 44 }, portal = { x: 20, y: 24, width: 390, height: 844 };
  const triggerNode = () => all(view.row(), node => node.type === 'View' && node.props.ref)[0];
  triggerNode().props.ref.current = { measureInWindow(callback) { callback(trigger.x, trigger.y, trigger.width, trigger.height); } };
  const open = () => {
    all(view.row(), node => node.props?.accessibilityLabel === '更多播放操作')[0].props.onPress(); view.render();
    const container = view.menu().props.children;
    container.props.ref.current = { measureInWindow(callback) { callback(portal.x, portal.y, portal.width, portal.height); } };
    view.menu().props.onShow(); view.render();
    all(view.menu(), node => node.type === 'ScrollView')[0].props.onContentSizeChange(260, 220); view.render();
  };
  const panel = () => all(view.menu(), node => node.props?.testID === 'watch-more-menu')[0];
  open(); let style = flatStyle(panel().props.style);
  assert.equal(style.opacity, 1); assert.equal(style.top, 652); assert.equal(style.left, 74); assert.equal(style.maxHeight, 150);
  assert.equal(all(view.menu(), node => node.type === 'ScrollView')[0].props.style.maxHeight, 132);
  trigger.y = 784; triggerNode().props.onLayout(); view.render(); style = flatStyle(panel().props.style);
  assert.equal(style.top + style.maxHeight, 760 - 8); assert.equal(style.maxHeight, 238);
  const first = all(view.menu(), node => node.type === 'ScrollView')[0].props.children.flat().filter(Boolean)[0];
  first.props.onPress(); view.render(); assert.equal(view.menu().props.visible, false);
  trigger.y = 676; open(); style = flatStyle(panel().props.style);
  assert.equal(style.top, 704); assert.equal(style.maxHeight, 98);
  all(view.menu(), node => node.props?.accessibilityLabel === '关闭更多播放操作')[0].props.onPress(); view.render();
  assert.equal(view.menu().props.visible, false);
});

test('a late native measurement cannot reopen or position a dismissed More menu', () => {
  const view = mount(); view.layout(302); let deliver;
  all(view.row(), node => node.type === 'View' && node.props.ref)[0].props.ref.current = { measureInWindow(callback) { deliver = callback; } };
  all(view.row(), node => node.props?.accessibilityLabel === '更多播放操作')[0].props.onPress(); view.render();
  view.menu().props.children.props.ref.current = { measureInWindow(callback) { callback(0, 20, 320, 700); } };
  view.menu().props.onShow(); assert.equal(typeof deliver, 'function');
  all(view.menu(), node => node.props?.accessibilityLabel === '关闭更多播放操作')[0].props.onAccessibilityTap(); view.render();
  deliver(200, 300, 44, 44); view.render();
  assert.equal(view.menu().props.visible, false); assert.equal(all(view.tree, node => node.props?.testID === 'watch-more-menu').length, 0);
});
