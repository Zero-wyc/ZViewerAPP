export type DisplayOrientation = 'portrait' | 'landscape' | 'auto';
export type PlayerDisplayState = { available: boolean; busy: boolean; locked: boolean; landscape: boolean; fullscreen: boolean; error: string };
export type PlayerDisplayPort = { supported(): Promise<boolean>; landscape(): Promise<boolean | null>; lock(orientation: 'portrait' | 'landscape'): Promise<void>; unlock(): Promise<void> };
export const initialPlayerDisplay = (landscape = false): PlayerDisplayState => ({ available: false, busy: false, locked: false, landscape, fullscreen: false, error: '' });
export function orientationAction(state: Pick<PlayerDisplayState, 'locked' | 'landscape'>) {
  if (state.locked) return { target: 'auto', icon: 'unlock', label: '解除旋转锁定（自动旋转）' } as const;
  return state.landscape ? { target: 'portrait', icon: 'portrait', label: '切换并锁定竖屏' } as const : { target: 'landscape', icon: 'landscape', label: '切换并锁定横屏' } as const;
}

// One controller owns header/player orientation. Serialize native requests so an
// old lock cannot land after fullscreen exit, mode change or room teardown.
export class PlayerDisplay {
  private state: PlayerDisplayState;
  private active = false;
  private revision = 0;
  private orientationRevision = 0;
  private ready: Promise<void> = Promise.resolve();
  private queue: Promise<void> = Promise.resolve();
  private port: PlayerDisplayPort;
  private changed: (state: PlayerDisplayState) => void;
  constructor(port: PlayerDisplayPort, changed: (state: PlayerDisplayState) => void, landscape = false) { this.port = port; this.changed = changed; this.state = initialPlayerDisplay(landscape); }
  get snapshot() { return this.state; }
  private update(value: Partial<PlayerDisplayState>) { this.state = { ...this.state, ...value }; if (this.active) this.changed(this.state); }
  start() {
    this.active = true; const version = this.orientationRevision;
    this.ready = Promise.all([this.port.supported(), this.port.landscape()]).then(([available, landscape]) => {
      if (!this.active) return;
      this.update({ available, ...(version === this.orientationRevision && landscape !== null ? { landscape } : {}) });
    }).catch(() => { if (this.active) this.update({ available: false }); });
    return this.ready;
  }
  orientationChanged(landscape: boolean) { this.orientationRevision++; if (this.active) this.update({ landscape }); }
  toggleOrientation() {
    if (!this.active || !this.state.available || this.state.busy) return Promise.resolve();
    return this.apply(orientationAction(this.state).target);
  }
  setFullscreen(fullscreen: boolean) {
    if (!this.active) return Promise.resolve();
    this.update({ fullscreen, error: '' });
    return this.apply(fullscreen ? 'landscape' : 'auto');
  }
  reset() { return this.setFullscreen(false); }
  private apply(target: DisplayOrientation) {
    const version = ++this.revision; this.update({ busy: true, error: '' });
    const task = this.queue.catch(() => {}).then(async () => {
      await this.ready;
      if (!this.active || version !== this.revision) return;
      try {
        if (this.state.available) {
          if (target === 'auto') await this.port.unlock();
          else await this.port.lock(target);
        }
        if (this.active && version === this.revision) this.update({ locked: this.state.available && target !== 'auto', ...(this.state.available && target !== 'auto' ? { landscape: target === 'landscape' } : {}) });
      } catch {
        if (this.active && version === this.revision) this.update({ error: '当前设备无法更改方向，请检查系统方向锁后重试' });
      } finally { if (this.active && version === this.revision) this.update({ busy: false }); }
    });
    this.queue = task; return task;
  }
  dispose() {
    this.active = false; this.revision++;
    this.queue = this.queue.catch(() => {}).then(() => this.port.unlock()).catch(() => {});
    return this.queue;
  }
}
