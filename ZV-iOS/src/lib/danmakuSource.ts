import type { DanmakuTrack } from './timeline.ts';

export type DanmakuMedia = { movieId?: number; currentMovieId?: number; sourceType?: string; cid?: number; epId?: number; currentPage?: number };
export type DanmakuBinding = { media: DanmakuMedia | null; canManage: boolean };
export type DanmakuMutation = (path: string, init: RequestInit) => Promise<unknown>;
const integer = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : 0;
export function danmakuMediaKey(media?: DanmakuMedia | null) {
  if (!media) return '';
  const type = /^[a-z-]{1,32}$/.test(media.sourceType || '') ? media.sourceType : 'unknown';
  return JSON.stringify([integer(media.movieId) || integer(media.currentMovieId), type, integer(media.cid), integer(media.epId), integer(media.currentPage)]);
}
export function danmakuTrackPrefix(key: string) { return `zv-media:${encodeURIComponent(key)}:`; }
export function scopeDanmakuTrack(track: DanmakuTrack, key: string): DanmakuTrack {
  const prefix = danmakuTrackPrefix(key);
  if (track.trackId.startsWith(prefix)) return track;
  if (track.trackId.startsWith('zv-media:')) throw new Error('弹幕轨道属于另一个视频，请重新选择');
  return { ...track, trackId: prefix + track.trackId };
}
export function sourceDanmakuTracks(tracks: DanmakuTrack[], key: string, legacy: boolean) {
  const prefix = danmakuTrackPrefix(key);
  return tracks.filter(track => track && typeof track.trackId === 'string' && Array.isArray(track.items) &&
    (track.trackId.startsWith('zv-media:') ? track.trackId.startsWith(prefix) : legacy && track.trackId !== 'default'));
}
export type DanmakuTicket = { scope: string; mediaKey: string; active: boolean; canManage: boolean };
// Submitted writes deliberately keep their acknowledgement: aborting a POST
// does not prove the NAS stopped it. The next source's clear runs after it.
export class DanmakuWrites {
  readonly roomKey: string;
  constructor(roomKey: string) { this.roomKey = roomKey; }
  private tail: Promise<unknown> = Promise.resolve();
  private current: DanmakuTicket | null = null;
  private previous = '';
  private transitioned = false;
  private deletedDefault = false;
  open(ticket: DanmakuTicket) {
    const changed = !!this.previous && !!ticket.mediaKey && this.previous !== ticket.mediaKey;
    if (changed) { this.transitioned = true; this.deletedDefault = false; }
    if (ticket.mediaKey) this.previous = ticket.mediaKey;
    ticket.active = true; this.current = ticket;
    return { changed, legacy: !this.transitioned };
  }
  accepts(ticket: DanmakuTicket) { return ticket.active && this.current === ticket; }
  suppressDefault(ticket: DanmakuTicket) { if (this.accepts(ticket)) this.deletedDefault = true; }
  defaultSuppressed(ticket: DanmakuTicket) { return this.accepts(ticket) && this.deletedDefault; }
  close(ticket: DanmakuTicket) { ticket.active = false; if (this.current === ticket) this.current = null; }
  run<T>(ticket: DanmakuTicket, work: () => Promise<T>) {
    const result = this.tail.then(() => {
      if (!this.accepts(ticket) || !ticket.canManage) throw new Error('视频或弹幕管理权限已变化，请重新操作');
      return work();
    });
    this.tail = result.catch(() => {});
    return result;
  }
}
