import { nativeVideoSource, type PlaybackSource } from './media.ts';

export type Playback = PlaybackSource & {
  isPlaying: boolean;
  currentTime: number;
  playbackRate?: number;
  duration?: number;
};
export type NativePlayerPort = {
  currentTime: number;
  playbackRate: number;
  playing: boolean;
  duration: number;
  play(): void;
  pause(): void;
  replaceAsync(source: ReturnType<typeof nativeVideoSource> | null): Promise<void>;
};

// Serialized native replacements prevent a slow old movie winning a source
// switch. State-only updates never rewind progress; control/heartbeat own seek.
export class NativeMediaAdapter {
  private queue: Promise<void> = Promise.resolve();
  private version = 0;
  private disposed = false;
  private key = '';
  private uri = '';
  private needsInitialSeek = false;
  private initialTime = 0;
  private pending = 0;
  private player: NativePlayerPort;
  constructor(player: NativePlayerPort) { this.player = player; }
  get busy() { return this.pending > 0; }
  invalidate() { this.key = ''; }

  apply(state: Playback | null, server: string, token: string, revision = 0): Promise<void> {
    const version = ++this.version;
    this.pending++;
    const task = this.queue.then(async () => {
      if (this.disposed || version !== this.version) return;
      try {
        if (!state?.sourceUrl) {
          this.player.pause(); this.key = ''; this.uri = ''; this.needsInitialSeek = false;
          await this.player.replaceAsync(null);
          return;
        }
        const source = nativeVideoSource(state, server, token);
        const key = JSON.stringify([source.uri, source.contentType, source.headers, revision]);
        if (key !== this.key) {
          const preserveTime = source.identity === this.uri && !!this.key;
          const position = preserveTime ? this.player.currentTime : state.currentTime;
          this.player.pause();
          await this.player.replaceAsync(source);
          if (this.disposed) return;
          this.key = key; this.uri = source.identity;
          this.initialTime = Math.max(0, Number.isFinite(position) ? position : 0);
          this.needsInitialSeek = true;
        }
        if (this.disposed || version !== this.version) return;
        if (this.needsInitialSeek) { this.player.currentTime = this.initialTime; this.needsInitialSeek = false; }
        const rate = Number.isFinite(state.playbackRate) && state.playbackRate! > 0 ? state.playbackRate! : 1;
        if (this.player.playbackRate !== rate) this.player.playbackRate = rate;
        if (state.isPlaying && !this.player.playing) this.player.play();
        if (!state.isPlaying && this.player.playing) this.player.pause();
      } catch (error) {
        if (!this.disposed && version === this.version) { this.key = ''; this.player.pause(); throw error; }
      }
    });
    this.queue = task.catch(() => {});
    return task.finally(() => { this.pending--; });
  }

  dispose() {
    this.disposed = true; this.version++;
    // The view controller owns native release; the adapter stops queued writes.
    try { this.player.pause(); } catch { /* the hook may already have released it */ }
  }
}
