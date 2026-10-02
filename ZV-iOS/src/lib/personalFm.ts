import type { Song } from './musicCollection.ts';
export type FmMode = 'DEFAULT' | 'FAMILIAR' | 'EXPLORE' | 'SCENE_RCMD' | 'aidj';
export type FmScene = 'EXERCISE' | 'FOCUS' | 'NIGHT_EMO';
export const fmModes: { value: FmMode; label: string }[] = [{ value: 'DEFAULT', label: '默认推荐' }, { value: 'FAMILIAR', label: '熟悉偏好' }, { value: 'EXPLORE', label: '探索发现' }, { value: 'SCENE_RCMD', label: '场景推荐' }, { value: 'aidj', label: 'AI DJ' }];
export const fmScenes: { value: FmScene; label: string }[] = [{ value: 'EXERCISE', label: '运动' }, { value: 'FOCUS', label: '专注' }, { value: 'NIGHT_EMO', label: '夜晚情绪' }];
export type FmState = { mode: FmMode; scene: FmScene; pool: Song[]; history: Song[]; current: Song | null; active: boolean; loading: boolean; switching: boolean; error: string };
export const emptyFm = (): FmState => ({ mode: 'DEFAULT', scene: 'FOCUS', pool: [], history: [], current: null, active: false, loading: false, switching: false, error: '' });
// Candidate data is local; only selected songs are put in the shared queue.
// No total-count/end marker: recommendations continue until the user stops.
export class PersonalFm {
  state = emptyFm();
  private generation = 0;
  private abort = new AbortController();
  private pending: Promise<void> | null = null;
  private changing = false;
  private port: { fetch: (mode: FmMode, scene: FmScene, signal: AbortSignal) => Promise<Song[]>; play: (song: Song, signal: AbortSignal) => Promise<void>; change: (state: FmState) => void };
  constructor(port: PersonalFm['port']) { this.port = port; }
  private patch(value: Partial<FmState>) { this.state = { ...this.state, ...value }; this.port.change(this.state); }
  isActive(key: string | null) { return this.state.active && key === `ncm:${this.state.current?.songId}`; }
  stop() { this.generation++; this.abort.abort(); this.abort = new AbortController(); this.pending = null; this.changing = false; this.patch({ active: false, switching: false, loading: false }); }
  reset() { this.generation++; this.abort.abort(); this.abort = new AbortController(); this.pending = null; this.changing = false; this.state = emptyFm(); this.port.change(this.state); }
  dispose() { this.generation++; this.abort.abort(); this.pending = null; }
  async refill() {
    if (this.pending) return this.pending;
    const generation = this.generation; const signal = this.abort.signal;
    this.patch({ loading: true, error: '' });
    const work = Promise.resolve().then(async () => {
      try {
        let songs = await this.port.fetch(this.state.mode, this.state.scene, signal);
        if (!songs.length && this.state.mode !== 'DEFAULT') songs = await this.port.fetch('DEFAULT', 'FOCUS', signal);
        if (signal.aborted || generation !== this.generation) return;
        const seen = new Set([this.state.current?.songId, ...this.state.pool.map(song => song.songId)]);
        const fresh = songs.filter(song => { if (!Number.isSafeInteger(song.songId) || song.songId < 1 || seen.has(song.songId)) return false; seen.add(song.songId); return true; });
        const current = this.state.current || fresh.shift() || null;
        this.patch({ current, pool: [...this.state.pool, ...fresh].slice(0, 32), error: fresh.length || current !== this.state.current ? '' : '暂时没有新的漫游推荐，请重试' });
      } catch (error) { if (!signal.aborted && generation === this.generation) this.patch({ error: error instanceof Error ? error.message : '无法加载漫游歌曲' }); }
      finally { if (generation === this.generation) { this.pending = null; this.patch({ loading: false }); } }
    });
    this.pending = work; return work;
  }
  async changeMode(mode: FmMode, scene: FmScene = this.state.scene) {
    this.generation++; this.abort.abort(); this.abort = new AbortController(); this.pending = null; this.changing = false;
    this.patch({ mode, scene, pool: [], history: [], loading: false, switching: false, error: '' });
    await this.refill();
  }
  private async select(song: Song, next: (state: FmState) => Partial<FmState>) {
    const generation = this.generation;
    this.changing = true; this.patch({ switching: true, error: '' });
    try {
      await this.port.play(song, this.abort.signal);
      if (generation !== this.generation || this.abort.signal.aborted) return;
      this.patch({ ...next(this.state), current: song, active: true });
      if (this.state.pool.length < 2) void this.refill();
    } finally { if (generation === this.generation) { this.changing = false; this.patch({ switching: false }); } }
  }
  async start() {
    if (this.changing) return;
    const generation = this.generation;
    this.changing = true;
    try {
      if (!this.state.current) await this.refill();
      if (generation !== this.generation) return;
      if (!this.state.current) throw new Error(this.state.error || '没有可用的漫游歌曲');
      await this.select(this.state.current, () => ({}));
    } finally { if (generation === this.generation) this.changing = false; }
  }
  async next() {
    if (this.changing) return;
    const generation = this.generation;
    this.changing = true;
    try {
      if (!this.state.pool.length) await this.refill();
      if (generation !== this.generation) return;
      const next = this.state.pool[0];
      if (!next) throw new Error(this.state.error || '漫游候选暂不可用，请重试');
      await this.select(next, state => ({ pool: state.pool.filter(song => song.songId !== next.songId), history: state.current ? [...state.history, state.current].slice(-200) : state.history }));
    } finally { if (generation === this.generation) this.changing = false; }
  }
  async prev() {
    if (this.changing) return;
    const previous = this.state.history.at(-1); if (!previous) throw new Error('没有上一首了');
    await this.select(previous, state => ({ history: state.history.slice(0, -1), pool: [...(state.current ? [state.current] : []), ...state.pool].filter(song => song.songId !== previous.songId) }));
  }
}
