import { nativeVideoSource, type PlaybackSource } from './media.ts';

export type Playback = PlaybackSource & {
  currentMovieId?: number;
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
  private invalidation = 0;
  private cancellation: AbortController | null = null;
  private player: NativePlayerPort;
  private resolve: (state: PlaybackSource, server: string, token: string, signal?: AbortSignal) => Promise<ReturnType<typeof nativeVideoSource>>;
  constructor(player: NativePlayerPort, resolve = async (state: PlaybackSource, server: string, token: string) => nativeVideoSource(state, server, token)) { this.player = player; this.resolve = resolve; }
  get busy() { return this.pending > 0; }
  invalidate() { this.invalidation++; }
  cancelPending() { this.version++; this.cancellation?.abort(); }

  apply(state: Playback | null, server: string, token: string, revision = 0): Promise<void> {
    const version = ++this.version;
    this.cancellation?.abort();
    const cancellation = new AbortController(); this.cancellation = cancellation;
    this.pending++;
    const task = this.queue.then(async () => {
      if (this.disposed || version !== this.version) return;
      try {
        if (!state?.sourceUrl) {
          this.player.pause(); this.key = ''; this.uri = ''; this.needsInitialSeek = false;
          await this.player.replaceAsync(null);
          return;
        }
        let aborted: (() => void) | undefined;
        const cancelled = new Promise<never>((_, reject) => { aborted = () => reject(new Error('播放任务已取消')); cancellation.signal.addEventListener('abort', aborted, { once: true }); });
        const source = await Promise.race([this.resolve(state, server, token, cancellation.signal), cancelled]).finally(() => { if (aborted) cancellation.signal.removeEventListener('abort', aborted); });
        if (this.disposed || version !== this.version) return;
        const key = JSON.stringify([source.uri, source.contentType, source.headers, source.slaves.map(slave => slave.uri), revision, this.invalidation]);
        if (key !== this.key) {
          const preserveTime = source.identity === this.uri;
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
        // Cancel a pending native start too: actualPlaying can still be false
        // while the view is preparing a source that was requested to play.
        if (!state.isPlaying) this.player.pause();
      } catch (error) {
        if (!this.disposed && version === this.version) { this.key = ''; this.player.pause(); throw error; }
      }
    });
    this.queue = task.catch(() => {});
    return task.finally(() => { this.pending--; });
  }

  dispose() {
    this.disposed = true; this.version++; this.cancellation?.abort();
    // The view controller owns native release; the adapter stops queued writes.
    try { this.player.pause(); } catch { /* the hook may already have released it */ }
  }
}
