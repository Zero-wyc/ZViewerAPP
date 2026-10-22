import { test } from 'node:test';
import assert from 'node:assert/strict';
import { menuAnchorInPortal, playbackMenuPlacement } from '../src/lib/playbackMenu.ts';
const safe = { top: 20, bottom: 34, left: 0, right: 0 };

test('More prefers below the trigger and scrolls in remaining space rather than reserving 410pt above', () => {
  const anchor = { x: 280, y: 600, width: 44, height: 44 };
  const result = playbackMenuPlacement(anchor, { width: 390, height: 844 }, safe, 220);
  assert.equal(result.placement, 'below'); assert.equal(result.top, 652); assert.equal(result.maxHeight, 150);
  assert.equal(result.left + result.width, anchor.x + anchor.width);
});

test('when below cannot contain one touch target, measured content bottom stays exactly 8pt above the trigger', () => {
  const anchor = { x: 280, y: 760, width: 44, height: 44 };
  const result = playbackMenuPlacement(anchor, { width: 390, height: 844 }, safe, 220);
  assert.equal(result.placement, 'above'); assert.equal(result.maxHeight, 238);
  assert.equal(result.top + result.maxHeight, anchor.y - 8);
  const larger = playbackMenuPlacement(anchor, { width: 390, height: 844 }, safe, 350);
  assert.equal(larger.top + larger.maxHeight, anchor.y - 8); assert(larger.top < result.top);
});

test('portal conversion, rotated safe area and a keyboard-constrained viewport keep the menu in visible bounds', () => {
  const portal = { x: 50, y: 24, width: 844, height: 390 };
  const anchor = menuAnchorInPortal({ x: 700, y: 254, width: 44, height: 44 }, portal);
  assert.deepEqual(anchor, { x: 650, y: 230, width: 44, height: 44 });
  for (const viewport of [{ width: 844, height: 390 }, { width: 320, height: 500 }, { width: 390, height: 300 }]) {
    const insets = { top: 0, bottom: 0, left: 47, right: 34 };
    const result = playbackMenuPlacement(anchor, viewport, insets, 440);
    assert(result.left >= insets.left + 8); assert(result.left + result.width <= viewport.width - insets.right - 8);
    assert(result.top >= 8); assert(result.top + result.maxHeight <= viewport.height - 8);
  }
});
