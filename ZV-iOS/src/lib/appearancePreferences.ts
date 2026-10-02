export type AppearancePreferences = { mode: 'light' | 'dark' | 'system'; image: string; radius: number; opacity: number; glassBlur: number; blur: number; x: number; y: number; scale: number; rotation: number; overlay: number; whiteOverlay: number; reduceMotion: boolean };
export const appearanceDefaults: AppearancePreferences = { mode: 'system', image: '', radius: 16, opacity: 0.6, glassBlur: 12, blur: 13, x: 0, y: 0, scale: 1, rotation: 0, overlay: 0, whiteOverlay: 0, reduceMotion: false };

export function normalizeAppearance(value: unknown): AppearancePreferences {
  const result = { ...appearanceDefaults };
  if (!value || typeof value !== 'object') return result;
  const raw = value as Record<string, unknown>;
  if (raw.mode === 'light' || raw.mode === 'dark' || raw.mode === 'system') result.mode = raw.mode;
  if (typeof raw.image === 'string' && raw.image.length <= 4096) result.image = raw.image;
  if (typeof raw.reduceMotion === 'boolean') result.reduceMotion = raw.reduceMotion;
  for (const [key, low, high] of [
    ['radius', 0, 28], ['opacity', 0.2, 1], ['glassBlur', 0, 40], ['blur', 0, 30], ['x', -200, 200],
    ['y', -200, 200], ['scale', 0.5, 3], ['rotation', -180, 360], ['overlay', 0, 1], ['whiteOverlay', 0, 1],
  ] as const) {
    const number = raw[key];
    if (typeof number === 'number' && Number.isFinite(number)) result[key] = Math.min(high, Math.max(low, number));
  }
  return result;
}
