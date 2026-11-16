import resourceManager from '@ohos.resourceManager';
import util from '@ohos.util';
import zlib from '@ohos.zlib';

interface WebResourceEntry { path: string; size: number; compressed: boolean; }

// Memory-only cache: upgrades and process restart read the installed package.
export class LocalWebResources {
  private manager: resourceManager.ResourceManager;
  private entries: Map<string, WebResourceEntry> = new Map();
  private loaded: boolean = false;
  private cache: Map<string, ArrayBuffer> = new Map();
  private pending: Map<string, Promise<ArrayBuffer>> = new Map();
  private bytes: number = 0;
  private generation: number = 0;
  private queue: Promise<void> = Promise.resolve();
  private readonly limit: number = 16 * 1024 * 1024;

  constructor(manager: resourceManager.ResourceManager) { this.manager = manager; }

  private loadManifest(): void {
    if (this.loaded) return;
    const data = this.manager.getRawFileContentSync('web/resources.json');
    const entries = JSON.parse(new util.TextDecoder().decodeToString(data)) as WebResourceEntry[];
    const validated: Map<string, WebResourceEntry> = new Map();
    for (const entry of entries) {
      if (!/^[A-Za-z0-9_./-]+$/.test(entry.path) || entry.path.includes('..') ||
        !Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > 32 * 1024 * 1024 ||
        typeof entry.compressed !== 'boolean' || validated.has(entry.path)) throw new Error('Invalid web manifest');
      validated.set(entry.path, entry);
    }
    this.entries = validated;
    this.loaded = true;
  }

  async read(path: string): Promise<ArrayBuffer> {
    this.loadManifest();
    const entry = this.entries.get(path);
    if (!entry) throw new Error('Unknown web resource');
    const cached = this.cache.get(path);
    if (cached) {
      this.cache.delete(path);
      this.cache.set(path, cached);
      return cached;
    }
    const pending = this.pending.get(path);
    if (pending) return pending;
    const generation = this.generation;
    // Serialize decompression to bound transient memory; duplicates share work.
    const task: Promise<ArrayBuffer> = this.queue.then(async (): Promise<ArrayBuffer> => {
      if (generation !== this.generation) throw new Error('Web resources disposed');
      const data = await this.manager.getRawFileContent(`web/${path}${entry.compressed ? '.zlib' : ''}`);
      const source = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
      let body = source;
      if (entry.compressed) {
        body = new ArrayBuffer(entry.size);
        const zip = await zlib.createZip();
        const result = await zip.uncompress(body, source, source.byteLength);
        if (result.status !== zlib.ReturnStatus.OK || result.destLen !== entry.size) throw new Error('Invalid compressed resource');
      }
      if (body.byteLength !== entry.size) throw new Error('Invalid resource size');
      if (generation !== this.generation) throw new Error('Web resources disposed');
      if (body.byteLength <= this.limit) {
        for (const key of this.cache.keys()) {
          if (this.bytes + body.byteLength <= this.limit) break;
          const old = this.cache.get(key);
          if (old) this.bytes -= old.byteLength;
          this.cache.delete(key);
        }
        this.cache.set(path, body);
        this.bytes += body.byteLength;
      }
      return body;
    });
    this.pending.set(path, task);
    this.queue = task.then(() => {}, () => {});
    try { return await task; }
    finally { if (generation === this.generation) this.pending.delete(path); }
  }

  clear(): void {
    this.generation++;
    this.cache.clear();
    this.pending.clear();
    this.bytes = 0;
    this.entries.clear();
    this.loaded = false;
  }
}
