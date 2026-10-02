export class ScopedCache<T> {
  private entries = new Map<string, { value: T; until: number }>();
  private pending = new Map<string, Promise<T>>();
  private epoch = 0;
  private limit: number; private ttl: number;
  constructor(limit = 20, ttl = 300_000) { this.limit = limit; this.ttl = ttl; }
  clear() { this.epoch++; this.entries.clear(); this.pending.clear(); }
  async get(key: string, work: () => Promise<T>) {
    const entry = this.entries.get(key);
    if (entry && entry.until > Date.now()) return entry.value;
    const existing = this.pending.get(key); if (existing) return existing;
    const epoch = this.epoch;
    const promise = work().then(value => {
      if (epoch !== this.epoch) throw new Error('媒体会话已变化');
      this.entries.delete(key); this.entries.set(key, { value, until: Date.now() + this.ttl });
      while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value!);
      return value;
    }).finally(() => { if (this.pending.get(key) === promise) this.pending.delete(key); });
    this.pending.set(key, promise); return promise;
  }
}
