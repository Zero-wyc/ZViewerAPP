export const defaultDanmakuPreferences = { enabled: true, scaleWithScreen: true, size: 20, opacity: 0.85, speed: 8, displayArea: 0.7 };
export function danmakuArea(height: number, fraction: number) {
  return Math.max(0, height) * (Number.isFinite(fraction) ? Math.min(1, Math.max(0.25, fraction)) : defaultDanmakuPreferences.displayArea);
}
export function danmakuLanes(height: number, fraction: number, font: number) {
  return Math.max(1, Math.floor(danmakuArea(height, fraction) / (font + 8)));
}
