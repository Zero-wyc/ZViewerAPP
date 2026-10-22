export type MenuRect = { x: number; y: number; width: number; height: number };
type Insets = { top: number; bottom: number; left: number; right: number };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

// Coordinates are local to the full-screen Modal portal, never its parent
// ScrollView. Below the trigger is preferred even when the menu must scroll.
export function playbackMenuPlacement(anchor: MenuRect, viewport: { width: number; height: number }, insets: Insets, contentHeight: number) {
  const leftBound = insets.left + 8, rightBound = Math.max(leftBound, viewport.width - insets.right - 8);
  const topBound = insets.top + 8, bottomBound = Math.max(topBound, viewport.height - insets.bottom - 8);
  const width = Math.min(260, rightBound - leftBound);
  const desiredHeight = contentHeight > 0 ? Math.min(410, contentHeight + 18) : 410;
  const belowTop = clamp(anchor.y + anchor.height + 8, topBound, bottomBound);
  const aboveBottom = clamp(anchor.y - 8, topBound, bottomBound);
  const below = bottomBound - belowTop, above = aboveBottom - topBound;
  const placement = below >= Math.min(62, desiredHeight) || below >= above ? 'below' : 'above';
  const maxHeight = Math.min(desiredHeight, placement === 'below' ? below : above);
  return {
    left: clamp(anchor.x + anchor.width - width, leftBound, rightBound - width),
    top: placement === 'below' ? belowTop : aboveBottom - maxHeight,
    width, maxHeight, placement,
  };
}

export function menuAnchorInPortal(trigger: MenuRect, portal: MenuRect): MenuRect {
  return { ...trigger, x: trigger.x - portal.x, y: trigger.y - portal.y };
}
