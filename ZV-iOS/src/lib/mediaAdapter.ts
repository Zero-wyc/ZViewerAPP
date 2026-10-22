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
  private mediaIdentity = '';
  private resolvedKey = '';
  private resolvedSource: ReturnType<typeof nativeVideoSource> | null = null;
  private needsInitialSeek = false;
  private initialTime = 0;
  private pending = 0;
  private invalidation = 0;
  private failedKey = '';
  private nativeKey = '';
  private cancellation: AbortController | null = null;
  private player: NativePlayerPort;
  private observe?: (values: { resolve: boolean; changes: string }) => void;
  private resolve: (state: PlaybackSource, server: string, token: string, signal?: AbortSignal) => Promise<ReturnType<typeof nativeVideoSource>>;
  constructor(player: NativePlayerPort, resolve = async (state: PlaybackSource, server: string, token: string) => nativeVideoSource(state, server, token), observe?: (values: { resolve: boolean; changes: string }) => void) { this.player = player; this.resolve = resolve; this.observe = observe; }
  get busy() { return this.pending > 0; }
  get failed() { return !!this.failedKey; }
  invalidate() { this.invalidation++; this.failedKey = ''; }
  nativeFailed() { this.failedKey = this.nativeKey; this.player.pause(); }
  cancelPending() { this.version++; this.cancellation?.abort(); }

  apply(state: Playback | null, server: string, token: string, revision = 0): Promise<void> {
    const version = ++this.version;
    this.cancellation?.abort();
    const cancellation = new AbortController(); this.cancellation = cancellation;
    this.pending++;
    const task = this.queue.then(async () => {
      if (this.disposed || version !== this.version) return;
      let preparedSource: ReturnType<typeof nativeVideoSource> | null = null;
      let attemptedKey = '';
      try {
        if (!state?.sourceUrl) {
          this.player.pause(); this.key = ''; this.uri = ''; this.mediaIdentity = ''; this.needsInitialSeek = false; this.failedKey = ''; this.nativeKey = '';
          await this.player.replaceAsync(null);
          this.resolvedKey = ''; this.resolvedSource?.dispose?.(); this.resolvedSource = null;
          return;
        }
        // Play/pause, duration and clock broadcasts do not change a media
        // request. Re-resolving signed URLs here can restart the native input.
        const resolvedKey = JSON.stringify([server, token, revision, this.invalidation, state.sourceUrl, state.sourceType, state.format, state.audioUrl, state.headers, state.movieId ?? state.currentMovieId, state.cid, state.epId, state.seasonId, state.cliOnly, state.currentPage, state.biliPolicy, state.sourceMeta, state.serverProxy, state.noProxyFallback, state.sourceMountId]);
        attemptedKey = resolvedKey;
        // A room heartbeat is not a retry request. Keep failed input visible
        // until the user retries, authentication changes, or another movie wins.
        if (resolvedKey === this.failedKey) { this.player.pause(); return; }
        this.failedKey = '';
        let aborted: (() => void) | undefined;
        const cancelled = new Promise<never>((_, reject) => { aborted = () => reject(new Error('播放任务已取消')); cancellation.signal.addEventListener('abort', aborted, { once: true }); });
        const reuse = resolvedKey === this.resolvedKey && !!this.resolvedSource;
        if (this.observe) {
          const previous = this.resolvedKey ? JSON.parse(this.resolvedKey) : [];
          const next = JSON.parse(resolvedKey);
          const names = ['server', 'session', 'revision', 'retry', 'sourceUrl', 'sourceType', 'format', 'audioUrl', 'headers', 'movieId', 'cid', 'epId', 'seasonId', 'cliOnly', 'currentPage', 'biliPolicy', 'sourceMeta', 'serverProxy', 'noProxyFallback', 'sourceMountId'];
          this.observe({ resolve: !reuse, changes: names.filter((_, index) => JSON.stringify(previous[index]) !== JSON.stringify(next[index])).join(',') });
        }
        const source = await Promise.race([resolvedKey === this.resolvedKey && this.resolvedSource ? Promise.resolve(this.resolvedSource) : this.resolve(state, server, token, cancellation.signal), cancelled]).finally(() => { if (aborted) cancellation.signal.removeEventListener('abort', aborted); });
        preparedSource = source;
        if (this.disposed || version !== this.version) { if (source !== this.resolvedSource) source.dispose?.(); return; }
        // A stable stream URL can serve a different movie/episode after a list
        // update. URL equality alone must not reuse the previous native clock.
        const mediaIdentity = JSON.stringify([server, state.movieId ?? state.currentMovieId, state.sourceType, state.cid, state.epId, state.currentPage, state.sourceMountId]);
        const key = JSON.stringify([source.uri, source.contentType, source.headers, source.slaves.map(slave => slave.uri), mediaIdentity, revision, this.invalidation, state.serverProxy, state.noProxyFallback]);
        if (key !== this.key) {
          const preserveTime = source.identity === this.uri && mediaIdentity === this.mediaIdentity;
          const position = preserveTime ? this.needsInitialSeek ? this.initialTime : this.player.currentTime : state.currentTime;
          this.player.pause();
          this.nativeKey = resolvedKey;
          await this.player.replaceAsync(source);
          if (this.disposed) { if (source !== this.resolvedSource) source.dispose?.(); return; }
          this.key = key; this.uri = source.identity; this.mediaIdentity = mediaIdentity;
          this.initialTime = Math.max(0, Number.isFinite(position) ? position : 0);
          this.needsInitialSeek = true;
        }
        if (this.resolvedSource !== source) this.resolvedSource?.dispose?.();
        this.resolvedKey = resolvedKey; this.resolvedSource = source;
        if (this.disposed || version !== this.version) return;
        if (this.failedKey && this.failedKey !== resolvedKey) this.failedKey = '';
        if (this.failedKey === resolvedKey) { this.player.pause(); return; }
        if (this.needsInitialSeek) { this.player.currentTime = this.initialTime; this.needsInitialSeek = false; }
        const rate = Number.isFinite(state.playbackRate) && state.playbackRate! > 0 ? state.playbackRate! : 1;
        if (this.player.playbackRate !== rate) this.player.playbackRate = rate;
        if (state.isPlaying && !this.player.playing) this.player.play();
        // Cancel a pending native start too: actualPlaying can still be false
        // while the view is preparing a source that was requested to play.
        if (!state.isPlaying) this.player.pause();
      } catch (error) {
        if (preparedSource !== this.resolvedSource) preparedSource?.dispose?.();
        if (!this.disposed && version === this.version) { this.failedKey = attemptedKey; this.key = ''; this.resolvedKey = ''; this.resolvedSource?.dispose?.(); this.resolvedSource = null; this.player.pause(); throw error; }
      }
    });
    this.queue = task.catch(() => {});
    return task.finally(() => { this.pending--; });
  }

  dispose() {
    this.disposed = true; this.version++; this.cancellation?.abort();
    this.resolvedSource?.dispose?.(); this.resolvedSource = null;
    // The view controller owns native release; the adapter stops queued writes.
    try { this.player.pause(); } catch { /* the hook may already have released it */ }
  }
}
