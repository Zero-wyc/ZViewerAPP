export function getDefaultSubtitleFontSize(
  width = typeof window === 'undefined' ? 390 : window.innerWidth,
  height = typeof window === 'undefined' ? 844 : window.innerHeight,
): number {
  // Use the short edge so a landscape phone keeps the phone default.
  return Math.min(width, height) < 600 ? 12 : 15
}
