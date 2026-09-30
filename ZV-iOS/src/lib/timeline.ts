export type TimedText = { time: number; content: string };
export function parseLyrics(raw: string): TimedText[] {
  return raw.split(/\r?\n/).flatMap(line => {
    const content = line.replace(/\[[^\]]*\]/g, '').trim();
    if (!content) return [];
    return [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)].map(match => ({ time: Number(match[1]) * 60 + Number(match[2]), content }));
  }).sort((a, b) => a.time - b.time);
}
export function upperBound(items: { time: number }[], time: number): number {
  let left = 0, right = items.length;
  while (left < right) { const middle = (left + right) >>> 1; if (items[middle].time <= time) left = middle + 1; else right = middle; }
  return left;
}
export function roomTime(position: number, playing: boolean, updatedAt?: number, now = Date.now()) {
  const age = updatedAt && Number.isFinite(updatedAt) ? Math.min(5, Math.max(0, (now - updatedAt) / 1000)) : 0;
  return Math.max(0, position + (playing ? age : 0));
}
export type DanmakuItem = TimedText & { id: string; mode?: number; color?: number; size?: number };
export type DanmakuTrack = { trackId: string; label: string; items: DanmakuItem[]; offset?: number; hidden?: boolean };
export function trackTimeline(tracks: DanmakuTrack[]): DanmakuItem[] {
  return tracks.filter(track => !track.hidden).flatMap(track => track.items.map(item => ({ ...item, id: `${track.trackId}:${item.id}`, time: item.time + (track.offset || 0) })))
    .filter(item => Number.isFinite(item.time) && item.time >= 0 && typeof item.content === 'string').sort((a, b) => a.time - b.time);
}
