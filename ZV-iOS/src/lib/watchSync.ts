import type { Playback } from './mediaAdapter.ts';

export function watchStateChanged(previous: Playback | null, next: Playback | null) {
  const metadata = (state: Playback | null) => state && Object.fromEntries(Object.entries(state).filter(([key]) => !['currentTime', 'updatedAt', 'hostSocketId'].includes(key)));
  return JSON.stringify(metadata(previous)) !== JSON.stringify(metadata(next));
}

// New servers send both the host sample and the extrapolated server sample.
// Only one clock may correct playback. Never seek a loading/old/actively seeking
// input, and allow it to settle before considering another correction.
export class WatchSync {
  private serverAt = -Infinity;
  private seekAt = -Infinity;
  reset() { this.serverAt = -Infinity; this.seekAt = -Infinity; }
  accepts(source: string | undefined, now = Date.now()) {
    if (source === 'server') { this.serverAt = now; return true; }
    return now - this.serverAt > 6000;
  }
  target(state: Playback, position: number, ready: boolean, seeking: boolean, now = Date.now()) {
    if (!ready || seeking || !Number.isFinite(state.currentTime) || now - this.seekAt < 10000) return null;
    const target = Math.max(0, state.duration && state.duration > 0 ? Math.min(state.duration, state.currentTime) : state.currentTime);
    if (Math.abs(position - target) <= (state.isPlaying ? 10 : 1)) return null;
    this.seekAt = now; return target;
  }
}
