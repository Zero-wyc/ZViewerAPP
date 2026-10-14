import type { DanmakuItem } from './timeline.ts';
export const defaultDanmakuFilters = { fixed: true, scroll: true, color: true, advanced: true };
export type DanmakuFilters = typeof defaultDanmakuFilters;
export const defaultDanmakuPreferences = { enabled: true, scaleWithScreen: true, size: 20, opacity: 0.85, speed: 8, displayArea: 0.7, filters: defaultDanmakuFilters };
type SavedPreferences = Partial<Omit<typeof defaultDanmakuPreferences, 'filters'>> & { filters?: Partial<DanmakuFilters> };
export function normalizeDanmakuPreferences(value: SavedPreferences) {
  return { ...defaultDanmakuPreferences, ...value, filters: { ...defaultDanmakuFilters, ...value.filters } };
}
// Match Android / HarmonyOS danmakuEngine.isBlockedByType. Color is a
// separate filter, so a colored fixed comment must pass both switches.
export function danmakuVisible(item: DanmakuItem, filters: DanmakuFilters) {
  const mode = item.mode ?? 1;
  return !((!filters.scroll && [1, 2, 3, 6].includes(mode)) || (!filters.fixed && [4, 5].includes(mode)) || (!filters.advanced && [7, 8].includes(mode)) || (!filters.color && (item.color ?? 0xffffff) !== 0xffffff));
}
export function danmakuArea(height: number, fraction: number) {
  return Math.max(0, height) * (Number.isFinite(fraction) ? Math.min(1, Math.max(0.25, fraction)) : defaultDanmakuPreferences.displayArea);
}
export function danmakuLanes(height: number, fraction: number, font: number) {
  return Math.max(1, Math.floor(danmakuArea(height, fraction) / (font + 8)));
}
