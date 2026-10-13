import type { Playback } from './mediaAdapter.ts';
import { moviePlayback, type Movie } from './sources.ts';

type PlaybackAck = { success: boolean; data?: { state?: Playback } };
type PlaybackSocket = { timeout(milliseconds: number): { emit(event: string, payload: { roomId: string }, callback: (error: Error | null, result?: PlaybackAck) => void): unknown } };

export function requestRoomPlayback(socket: PlaybackSocket, roomId: string, isCurrent: () => boolean, apply: (state: Playback) => void) {
  socket.timeout(10000).emit('watch-together-request-state', { roomId }, (error, result) => {
    // A slow ACK belongs to the requesting join/movie, not whichever room state
    // happens to be on screen when it arrives.
    if (!error && result?.success && result.data?.state && isCurrent()) apply(result.data.state);
  });
}

function libraryPage(state: Playback) {
  if (state.currentPage != null) return state.currentPage;
  // Android/HarmonyOS broadcast the complete sync DTO without currentPage.
  // Their canonical stream URL carries the episode selected in the movie list.
  try {
    const url = new URL(state.sourceUrl, 'https://room.invalid');
    if (!/\/api\/(emby|jellyfin)\/stream$/.test(url.pathname)) return undefined;
    const page = Number(url.searchParams.get('ep'));
    return Number.isSafeInteger(page) && page > 0 ? page : undefined;
  } catch { return undefined; }
}

function sameLibraryUrl(left: string, right: string) {
  const canonical = (value: string) => {
    try {
      const url = new URL(value, 'https://room.invalid');
      if (/\/api\/(emby|jellyfin)\/(stream|proxy)$/.test(url.pathname)) {
        url.searchParams.delete('token'); url.searchParams.delete('rangeMode'); url.searchParams.sort();
        return url.pathname + url.search;
      }
      return url.toString();
    } catch { return value; }
  };
  return canonical(left) === canonical(right);
}

// The server sends three independent events. Never attach another device's CLI
// URL while waiting for the authoritative movie/cid.
export class RoomPlayback {
  private movies: Movie[] = [];
  private movieId: number | null | undefined;
  private pending: Playback | null = null;
  private identity = 0;
  private retired = new Set<number>();
  reset() { this.movies = []; this.movieId = undefined; this.pending = null; this.retired.clear(); this.identity++; }
  list(movies: Movie[]) {
    const previous = this.movies.find(movie => movie.id === this.movieId);
    const next = movies.find(movie => movie.id === this.movieId);
    if (previous && next && ['emby', 'jellyfin'].includes(next.source || next.sourceType || '') &&
      ((previous.currentPage || 1) !== (next.currentPage || 1) || previous.path !== next.path)) {
      // A new episode must receive a new host state from zero. Updating only
      // the authoritative URL would seek into it at the previous episode's time.
      // Keep a newer state that arrived before its matching movie-list event.
      const nextPage = next.currentPage || 1;
      const pendingPage = this.pending ? libraryPage(this.pending) : undefined;
      const alreadyCurrent = this.pending &&
        (this.pending.movieId == null || this.pending.movieId === next.id) &&
        (pendingPage == null || pendingPage === nextPage) &&
        ((pendingPage === nextPage && nextPage !== (previous.currentPage || 1)) ||
          (!sameLibraryUrl(previous.url, next.url) && sameLibraryUrl(this.pending.sourceUrl, next.url)));
      if (!alreadyCurrent) { this.pending = null; this.identity++; }
    }
    this.movies = movies; return this.value();
  }
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
    // Every caller supplies a full state (and merges an optional diff first).
    // Keeping omitted optional fields leaks the previous episode/movie identity
    // into broadcasts from other clients, whose DTO omits those fields.
    this.pending = { ...state }; return this.value();
  }
  get waiting() { return !!this.pending && this.pending.sourceType === 'bilibili' && !this.value(); }
  get revision() { return this.identity; }
  get currentId() { return this.movieId; }
  get hostMovieToActivate() { return this.value()?.sourceUrl ? undefined : this.movies.find(movie => movie.id === this.movieId); }
  movie(id: number) { return this.movies.find(movie => movie.id === id); }
  value(): Playback | null {
    const state = this.pending;
    if (!state || this.movieId === null || state.movieId != null && this.movieId != null && state.movieId !== this.movieId) return null;
    if (!['bilibili', 'emby', 'jellyfin'].includes(state.sourceType || '')) return state;
    const movie = this.movies.find(item => item.id === this.movieId);
    if (!movie) return null;
    if (state.cid && movie.cid && state.cid !== movie.cid) return null;
    const page = ['emby', 'jellyfin'].includes(state.sourceType || '') ? libraryPage(state) : undefined;
    if (page != null && page !== (movie.currentPage || 1)) return null;
    return { ...state, ...moviePlayback(movie), movieId: movie.id, cid: movie.cid ?? state.cid };
  }
}
