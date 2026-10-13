import type { Movie, SourceSelection } from './sources.ts';
export class MovieAddTransaction {
  // A batch can continue after one item's refresh fails. Retain each unfinished
  // transaction so retrying that selection does not POST an already-created item.
  private created = new Map<string, Movie>();
  reset() { this.created.clear(); }
  async run(scope: string, value: SourceSelection, playNow: boolean, port: { create: (value: SourceSelection) => Promise<Movie>; patchLocalOnly: (id: number) => Promise<void>; refresh: () => Promise<void>; play: (movie: Movie) => Promise<void>; status: (text: string) => void }) {
    const key = JSON.stringify([scope, value]); port.status('正在添加影片…');
    let movie = this.created.get(key) ?? await port.create(value);
    if (!movie?.id) throw new Error('服务器未返回新影片身份');
    this.created.set(key, movie);
    if (value.cliOnly && !movie.cliOnly) { await port.patchLocalOnly(movie.id); movie = { ...movie, cliOnly: true }; this.created.set(key, movie); }
    await port.refresh();
    if (playNow) { port.status('已添加，正在开始播放…'); await port.play(movie); port.status('已添加，正在加载播放…'); }
    else port.status('影片已添加');
    this.created.delete(key);
    return movie;
  }
}
