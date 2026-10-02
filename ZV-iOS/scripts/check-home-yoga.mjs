// Run with Meta's standalone yoga-layout WASM package. No browser CSS is used.
// npm pack yoga-layout@3.2.1 outside the app; extract and pass its index.js path.
import { strict as assert } from 'node:assert';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { homeLayout } from '../src/lib/homeLayout.ts';
const engine = process.argv[2];
if (!engine) throw new Error('Pass the extracted yoga-layout/dist/src/index.js path');
const { default: Yoga } = await import(pathToFileURL(resolve(engine)).href);
const config = Yoga.Config.create(); config.setUseWebDefaults(false); config.setPointScaleFactor(1); config.setErrata(Yoga.ERRATA_ALL);
const node = (style = {}, parent) => {
  const value = Yoga.Node.createWithConfig(config);
  for (const [key, item] of Object.entries(style)) {
    if (key === 'flexDirection') value.setFlexDirection(item === 'row' ? Yoga.FLEX_DIRECTION_ROW : Yoga.FLEX_DIRECTION_COLUMN);
    else if (key === 'justifyContent') value.setJustifyContent(Yoga.JUSTIFY_FLEX_END);
    else if (key === 'alignSelf') value.setAlignSelf(Yoga.ALIGN_FLEX_END);
    else if (key === 'paddingHorizontal') value.setPadding(Yoga.EDGE_HORIZONTAL, item);
    else if (key === 'paddingVertical') value.setPadding(Yoga.EDGE_VERTICAL, item);
    else if (key === 'gap') value.setGap(Yoga.GUTTER_ALL, item);
    else value[`set${key[0].toUpperCase()}${key.slice(1)}`](item);
  }
  if (parent) parent.insertChild(value, parent.getChildCount());
  return value;
};
const text = (parent, scale = 1) => {
  const value = node({}, parent);
  value.setMeasureFunc(width => {
    const natural = 88 * scale; const available = Number.isFinite(width) ? Math.max(1, width) : natural;
    return { width: Math.min(natural, available), height: 20 * scale * Math.ceil(natural / available) };
  });
};
const checks = [];
// Prove the fixture exposes the reported native failure before checking the fix.
{
  const root = node({ width: 1180, height: 796 });
  const top = node({ alignSelf: 'flex-end', paddingHorizontal: 16 }, root);
  const action = node({ minHeight: 44, flexGrow: 1, paddingHorizontal: 15 }, top); text(action);
  const remaining = node({ flex: 1 }, root);
  root.calculateLayout(undefined, undefined, Yoga.DIRECTION_LTR);
  assert(action.getComputedHeight() > 700 && remaining.getComputedHeight() < 80, 'Fixture must reproduce the old growing button');
  checks.push({ name: 'old column/growing button reproduces blank native screen', button: action.getComputedHeight(), content: remaining.getComputedHeight() });
  root.freeRecursive();
}
for (const [width, height] of [[390, 844], [844, 390], [820, 1180], [1180, 820], [1390, 970], [320, 568]]) {
  for (const scale of [1, 1.5, 2]) for (const restoring of [false, true]) {
    const safeHeight = height - 48;
    const root = node({ ...homeLayout.root, width, height: safeHeight });
    const top = node(homeLayout.topBar, root);
    const action = node({ ...homeLayout.action, paddingHorizontal: 15 }, top); text(action, scale);
    if (restoring) node({ height: 48, flexShrink: 0 }, root);
    const scroll = node(homeLayout.scroll, root);
    root.calculateLayout(undefined, undefined, Yoga.DIRECTION_LTR);
    assert(action.getComputedHeight() >= 44 && action.getComputedHeight() <= 100, 'Appearance button has an intrinsic touch target');
    assert(scroll.getComputedHeight() >= safeHeight - top.getComputedHeight() - (restoring ? 48 : 0) - 1, 'Scrollable form retains the remaining viewport');
    assert(scroll.getComputedHeight() > 170, 'Content remains visible in small landscape/large text');
    checks.push({ name: `${width}x${height}, text ${scale}, restoring ${restoring}`, button: action.getComputedHeight(), scroll: scroll.getComputedHeight() });
    root.freeRecursive();
    const row = node({ width: Math.min(width, 640) - 40, flexDirection: 'row', gap: 8 });
    const left = node({ ...homeLayout.action, ...homeLayout.rowAction, paddingHorizontal: 15 }, row); text(left, scale);
    const right = node({ ...homeLayout.action, ...homeLayout.rowAction, paddingHorizontal: 15 }, row); text(right, scale);
    row.calculateLayout(undefined, undefined, Yoga.DIRECTION_LTR);
    assert(Math.abs(left.getComputedWidth() - right.getComputedWidth()) <= 1, 'Account/guest controls share row width');
    assert(right.getComputedLeft() + right.getComputedWidth() <= row.getComputedWidth() + 1, 'Row controls never overflow');
    row.freeRecursive();
  }
}
config.free();
console.log(JSON.stringify({ scope: 'Yoga 3.2.1 WASM native layout model; not UIKit/device acceptance', checks }, null, 2));
