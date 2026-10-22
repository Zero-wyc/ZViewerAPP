export type MusicClock = { trackKey: string | null; isPlaying: boolean; positionSec: number; updatedAt: number };

// Server positions are already extrapolated. Their updatedAt is the original
// baseline, so extrapolating it again would add the same elapsed time twice.
export class MusicAuthority {
  private serverAt = -Infinity;
  private seekAt = -Infinity;
  reset() { this.serverAt = -Infinity; this.seekAt = -Infinity; }
  sample<T extends MusicClock>(state: T, origin: 'server' | 'host' | 'control', now = Date.now()): T | null {
    if (!Number.isFinite(state.positionSec) || state.positionSec < 0 || typeof state.isPlaying !== 'boolean') return null;
    if (origin === 'host' && now - this.serverAt < 7000) return null;
    if (origin === 'server') this.serverAt = now;
    return { ...state, updatedAt: origin === 'server' ? now : state.updatedAt };
  }
  correction(state: MusicClock, position: number, ready: boolean, seeking: boolean, now = Date.now(), control = false) {
    // Explicit room controls must not be dropped during heartbeat cooldown.
    // Otherwise a seek followed by a second seek/pause can stop at the old time.
    if (!ready || !Number.isFinite(position) || !control && (seeking || now - this.seekAt < 6000) || Math.abs(position - state.positionSec) <= (state.isPlaying ? 3 : 1)) return null;
    this.seekAt = now;
    return Math.max(0, state.positionSec);
  }
}

// Host availability is separate from the server playback clock. In particular,
// a cached "online" heartbeat must not immediately undo host-disconnected.
export class MusicHostStatus {
  offline = false;
  private serverAt = -Infinity;
  private hostAt = 0;
  private disconnectedUntil = 0;
  reset(now = Date.now()) { this.offline = false; this.serverAt = -Infinity; this.hostAt = now; this.disconnectedUntil = 0; }
  server(online: boolean | undefined, now = Date.now()) {
    this.serverAt = now;
    if (typeof online === 'boolean' && (!online || now >= this.disconnectedUntil)) this.offline = !online;
    return this.offline;
  }
  host(now = Date.now()) {
    this.hostAt = now;
    if (now - this.serverAt >= 7000) { this.offline = false; this.disconnectedUntil = 0; }
    return this.offline;
  }
  disconnected(now = Date.now()) { this.disconnectedUntil = now + 6000; this.offline = true; return this.offline; }
  ready(now = Date.now()) { this.offline = false; this.hostAt = now; this.disconnectedUntil = 0; return this.offline; }
  resume(now = Date.now()) { this.hostAt = now; }
  poll(now = Date.now()) { if (now - this.serverAt >= 7000 && now - this.hostAt > 7000) this.offline = true; return this.offline; }
}
