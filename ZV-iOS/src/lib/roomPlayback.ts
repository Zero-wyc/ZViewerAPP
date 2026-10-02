import type { Playback } from './mediaAdapter.ts';
import { moviePlayback, type Movie } from './sources.ts';

// The server sends three independent events. Never attach another device's CLI
// URL while waiting for the authoritative movie/cid.
export class RoomPlayback {
  private movies: Movie[] = [];
  private movieId: number | null | undefined;
  private pending: Playback | null = null;
  private identity = 0;
  private retired = new Set<number>();
  reset() { this.movies = []; this.movieId = undefined; this.pending = null; this.retired.clear(); this.identity++; }
  list(movies: Movie[]) { this.movies = movies; return this.value(); }
  current(movieId: number | null) {
    if (this.movieId != null && this.movieId !== movieId) { this.retired.add(this.movieId); if (this.retired.size > 100) this.retired.delete(this.retired.values().next().value!); }
    if (movieId !== null) this.retired.delete(movieId);
    if (movieId === null) { this.pending = null; this.movieId = null; this.identity++; return null; }
    if (this.movieId !== undefined && this.movieId !== movieId && this.pending?.movieId !== movieId) { this.pending = null; this.identity++; }
    this.movieId = movieId; return this.value();
  }
  state(state: Playback) {
    if (state.currentMovieId != null) state = { ...state, movieId: state.currentMovieId };
    if (state.movieId != null && this.retired.has(state.movieId) && state.movieId !== this.movieId) return this.value();
    if (state.movieId != null && this.pending?.movieId != null && state.movieId !== this.pending.movieId) this.pending = null;
    this.pending = { ...this.pending, ...state }; return this.value();
  }
  get waiting() { return !!this.pending && this.pending.sourceType === 'bilibili' && !this.value(); }
  get revision() { return this.identity; }
  value(): Playback | null {
    const state = this.pending;
    if (!state || this.movieId === null || state.movieId != null && this.movieId != null && state.movieId !== this.movieId) return null;
    if (state.sourceType !== 'bilibili') return state;
    const movie = this.movies.find(item => item.id === this.movieId);
    if (!movie) return null;
    if (state.cid && movie.cid && state.cid !== movie.cid) return null;
    return { ...state, ...moviePlayback(movie), movieId: movie.id, cid: movie.cid ?? state.cid };
  }
}
