import type { Movie, SourceSelection } from './sources.ts';
export class MovieAddTransaction {
  private created: { key: string; movie: Movie } | null = null;
  reset() { this.created = null; }
  async run(scope: string, value: SourceSelection, playNow: boolean, port: { create: (value: SourceSelection) => Promise<Movie>; patchLocalOnly: (id: number) => Promise<void>; refresh: () => Promise<void>; play: (movie: Movie) => Promise<void>; status: (text: string) => void }) {
    const key = JSON.stringify([scope, value]); port.status('正在添加影片…');
    let movie = playNow && this.created?.key === key ? this.created.movie : await port.create(value);
    if (!movie?.id) throw new Error('服务器未返回新影片身份');
    if (playNow) this.created = { key, movie };
    if (value.cliOnly && !movie.cliOnly) { await port.patchLocalOnly(movie.id); movie = { ...movie, cliOnly: true }; if (playNow) this.created = { key, movie }; }
    await port.refresh();
    if (playNow) { port.status('已添加，正在开始播放…'); await port.play(movie); port.status('已添加，正在加载播放…'); }
    else port.status('影片已添加');
    return movie;
  }
}
