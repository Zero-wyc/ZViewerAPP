import type { NativePlayerPort } from './mediaAdapter.ts';
import type { nativeVideoSource } from './media.ts';

export type VideoSource = ReturnType<typeof nativeVideoSource>;
export type VlcViewPort = { play(): Promise<void>; pause(): Promise<void>; stop(): Promise<void>; seek(milliseconds: number, type?: 'time'): Promise<void> };
export type VlcSnapshot = { id: number; source: VideoSource; initialTime: number; rate: number };
type Events = {
  playingChange: { isPlaying: boolean };
  playbackRateChange: { playbackRate: number };
  timeUpdate: { currentTime: number };
  sourceLoad: { duration: number; availableAudioTracks: unknown[]; availableVideoTracks: unknown[]; availableSubtitleTracks: unknown[] };
  statusChange: { status: string; error?: { message: string } };
};

// The sole VLC kernel exposes one room clock and control port. VLC times are milliseconds;
// room times are seconds. Every native callback carries a load revision.
export class VlcPlayer implements NativePlayerPort {
  private render: (snapshot: VlcSnapshot | null) => void;
  private available: boolean;
  private vlc: VlcViewPort | null = null;
  private snapshot: VlcSnapshot | null = null;
  private revision = 0;
  private position = 0;
  private length = 0;
  private rate = 1;
  private desiredPlaying = false;
  private actualPlaying = false;
  private prepared = false;
  private pendingSeek: number | null = null;
  private disposed = false;
  private listeners = new Map<keyof Events, Set<(value: never) => void>>();

  constructor(render: (snapshot: VlcSnapshot | null) => void, available: boolean) {
    this.render = render; this.available = available;
  }
  connect() {
    this.disposed = false;
  }
  get currentTime() { return this.position; }
  set currentTime(time: number) {
    if (this.disposed || !Number.isFinite(time)) return;
    const next = Math.max(0, time);
    this.position = next; this.pendingSeek = next;
    if (this.snapshot) { this.snapshot = { ...this.snapshot, initialTime: next }; this.render(this.snapshot); }
    if (this.prepared) this.seekPending();
  }
  get playbackRate() { return this.rate; }
  set playbackRate(rate: number) {
    if (this.disposed || !Number.isFinite(rate) || rate <= 0) return;
    this.rate = rate;
    if (this.snapshot) { this.snapshot = { ...this.snapshot, rate }; this.render(this.snapshot); }
    this.emit('playbackRateChange', { playbackRate: rate });
  }
  get playing() { return this.actualPlaying; }
  get duration() { return this.length; }
  play() {
    if (this.disposed) return;
    this.desiredPlaying = true;
    // The view starts paused to avoid playing before the adapter applies seek.
    this.command(() => this.vlc?.play());
  }
  pause() {
    if (this.disposed) return;
    this.desiredPlaying = false; this.actualPlaying = false;
    this.command(() => this.vlc?.pause());
  }
  private command(work: () => Promise<void> | undefined) {
    const id = this.revision;
    void work()?.catch(() => this.fail(id, '播放器控制失败，请重试'));
  }
  private seekPending() {
    if (!this.vlc || this.pendingSeek === null) return;
    const time = this.pendingSeek; this.pendingSeek = null;
    this.command(() => this.vlc?.seek(Math.round(time * 1000), 'time'));
  }
  async replaceAsync(source: VideoSource | null) {
    if (this.disposed) return;
    ++this.revision;
    const old = this.vlc; this.vlc = null; this.snapshot = null;
    this.prepared = false; this.pendingSeek = null; this.actualPlaying = false; this.desiredPlaying = false;
    this.render(null);
    if (old) await old.stop();
    if (this.disposed) return;
    if (!source) { this.position = 0; this.length = 0; this.emit('statusChange', { status: 'idle' }); return; }
    if (!this.available) throw new Error('VLC 原生模块不可用，请安装包含 VLCKit 的 development/preview 构建（Expo Go 不支持）');
    this.position = 0; this.length = 0; this.rate = 1;
    this.snapshot = { id: this.revision, source, initialTime: 0, rate: 1 };
    this.render(this.snapshot);
    this.emit('statusChange', { status: 'loading' });
  }
  attach(id: number, view: VlcViewPort | null) {
    if (this.disposed || id !== this.revision) return;
    this.vlc = view;
    if (view && this.desiredPlaying) this.command(() => view.play());
  }
  loaded(id: number, lengthMilliseconds: number) {
    if (!this.accepts(id)) return;
    this.prepared = true; this.length = Math.max(0, lengthMilliseconds / 1000);
    this.seekPending();
    if (!this.desiredPlaying) this.command(() => this.vlc?.pause());
    this.emit('sourceLoad', { duration: this.length, availableAudioTracks: [], availableVideoTracks: [], availableSubtitleTracks: [] });
    this.emit('statusChange', { status: 'readyToPlay' });
  }
  progress(id: number, milliseconds: number) {
    if (!this.accepts(id) || !Number.isFinite(milliseconds) || this.pendingSeek !== null) return;
    this.position = Math.max(0, milliseconds / 1000);
    this.emit('timeUpdate', { currentTime: this.position });
  }
  playingChanged(id: number, playing: boolean) {
    if (!this.accepts(id)) return;
    if (playing && !this.desiredPlaying) { this.command(() => this.vlc?.pause()); return; }
    this.actualPlaying = playing;
    this.emit('playingChange', { isPlaying: playing });
  }
  tracks(id: number, tracks: { audio: unknown[]; video: unknown[]; subtitle: unknown[] }) {
    if (this.accepts(id)) this.emit('sourceLoad', { duration: this.length, availableAudioTracks: tracks.audio, availableVideoTracks: tracks.video, availableSubtitleTracks: tracks.subtitle });
  }
  fail(id: number, message: string) {
    if (!this.accepts(id)) return;
    this.desiredPlaying = false; this.actualPlaying = false;
    this.emit('statusChange', { status: 'error', error: { message } });
  }
  private accepts(id: number) { return !this.disposed && id === this.revision; }
  private emit<E extends keyof Events>(event: E, value: Events[E]) { for (const listener of this.listeners.get(event) || []) listener(value as never); }
  addListener<E extends keyof Events>(event: E, listener: (data: Events[E]) => void) {
    let set = this.listeners.get(event);
    if (!set) { set = new Set(); this.listeners.set(event, set); }
    set.add(listener as (value: never) => void);
    return { remove: () => set!.delete(listener as (value: never) => void) };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; ++this.revision;
    const old = this.vlc; this.vlc = null;
    void old?.stop().catch(() => {});
    this.snapshot = null;
    this.listeners.clear();
  }
}
