import { strict as assert } from 'node:assert';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { roomLayout } from '../src/lib/roomLayout.ts';
const { default: Yoga } = await import(pathToFileURL(resolve(process.argv[2])).href);
const config = Yoga.Config.create(); config.setUseWebDefaults(false); config.setErrata(Yoga.ERRATA_ALL);
const node = (styles, parent) => {
  const value = Yoga.Node.createWithConfig(config);
  for (const [key, item] of Object.entries(styles)) {
    if (key === 'flexDirection') value.setFlexDirection(item === 'row' ? Yoga.FLEX_DIRECTION_ROW : Yoga.FLEX_DIRECTION_COLUMN);
    else if (key === 'width' && item === '100%') value.setWidthPercent(100);
    else if (key === 'flexBasis' && typeof item === 'string' && item.endsWith('%')) value.setFlexBasisPercent(parseFloat(item));
    else if (key === 'gap') value.setGap(Yoga.GUTTER_ALL, item);
    else value[`set${key[0].toUpperCase()}${key.slice(1)}`](item);
  }
  if (parent) parent.insertChild(value, parent.getChildCount());
  return value;
};
const checks = [];
for (const [width, height] of [[1390, 970], [1180, 820], [820, 1180], [390, 844], [844, 390], [320, 568]]) {
  for (const mode of ['watch-together', 'listen-together']) for (const sideVisible of [false, true]) {
    const wide = width >= 900 && width > height;
    const stacked = height >= width && sideVisible;
    const root = node({ width: width - 32, height: height - 48 - 32 });
    node({ height: 104, flexShrink: 0 }, root);
    const body = node({ ...roomLayout.body, ...(wide ? roomLayout.wide : {}) }, root);
    const frame = node({ ...roomLayout.mediaFrame, ...(stacked ? roomLayout.stackedMedia : {}) }, body);
    let sidebar;
    if (wide && sideVisible) sidebar = node(roomLayout.sidebar, body);
    else if (stacked) sidebar = node(roomLayout.stackedSidebar, body);
    // The new frame is independent of ScrollView's intrinsic measured contents.
    const surface = node(mode === 'listen-together' ? { flex: 1, minHeight: 0, minWidth: 0 } : roomLayout.mediaScroll, frame);
    root.calculateLayout(undefined, undefined, Yoga.DIRECTION_LTR);
    assert(frame.getComputedWidth() > 250 && frame.getComputedHeight() > 170, 'Media never collapses to an empty column');
    assert.equal(surface.getComputedHeight(), frame.getComputedHeight(), 'Watch scroll viewport/music root fills the media frame');
    assert.equal(surface.getComputedWidth(), frame.getComputedWidth());
    if (sidebar && wide) assert(sidebar.getComputedLeft() >= frame.getComputedWidth(), 'Landscape chat stays to the right of media');
    if (sidebar && stacked) assert(sidebar.getComputedTop() >= frame.getComputedHeight() && sidebar.getComputedHeight() > 150, 'Portrait panel stays below the media and receives remaining height');
    checks.push({ size: `${width}x${height}`, mode, sideVisible, media: frame.getComputedLayout(), sidebar: sidebar?.getComputedLayout() });
    root.freeRecursive();
  }
}
config.free(); console.log(JSON.stringify({ scope: 'Yoga 3.2.1, Fabric ErrataAll; actual roomLayout; not device acceptance', checks }, null, 2));
