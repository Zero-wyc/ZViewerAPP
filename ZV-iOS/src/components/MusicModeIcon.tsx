import { Image } from 'expo-image';

// Vector equivalents of the user's four toolbar references. The transparent
// strokes follow the player tone without carrying a screenshot background.
const paths = {
  order: '<path d="M3 5h11M3 11h11M3 17h5M21 5v12c0 2-1 3-3 3h-7m3-3-3 3 3 3"/>',
  sequence: '<path d="m17 2 4 4-4 4M3 11V9c0-2 1-3 3-3h15M7 22l-4-4 4-4m14-1v2c0 2-1 3-3 3H3"/>',
  'repeat-one': '<path d="m17 2 4 4-4 4M3 11V9c0-2 1-3 3-3h15M7 22l-4-4 4-4m14-1v2c0 2-1 3-3 3H3m7-7 2-1v5"/>',
  shuffle: '<path d="M3 6h3c5 0 7 12 12 12h3m-4-4 4 4-4 4M3 18h3c2 0 3-2 4-4m4-4c1-2 2-4 4-4h3m-4-4 4 4-4 4"/>',
};
export function MusicModeIcon({ mode, color }: { mode: keyof typeof paths; color: string }) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[mode]}</svg>`;
  return <Image source={{ uri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` }} contentFit="contain" style={{ width: 22, height: 22 }} accessible={false} />;
}
