import { Image } from 'expo-image';
import type { DanmakuFilters } from '@/lib/danmakuLayout';

// Lucide PanelTop / AlignLeft / Palette / Sparkles, shared with the other
// clients' MobileDanmakuSettings. License: assets/icons/lucide-LICENSE.
const paths = {
  fixed: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/>',
  scroll: '<path d="M21 5H3M15 12H3M17 19H3"/>',
  color: '<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>',
  advanced: '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4M22 4h-4"/><circle cx="4" cy="20" r="2"/>',
};
export function DanmakuTypeIcon({ type, color }: { type: keyof DanmakuFilters; color: string }) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" color="${color}" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[type]}</svg>`;
  return <Image source={{ uri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` }} contentFit="contain" style={{ width: 26, height: 26 }} accessible={false} />;
}
