export type QueueIdentity = { id: number; songId: number; biliBvid?: string; biliCid?: number };
export const musicKey = (song: Omit<QueueIdentity, 'id'>) => song.biliBvid ? `bili:${song.biliBvid}:${song.biliCid || 0}` : `ncm:${song.songId}`;
// Queue position is local: v4.2.1 does not have a queue-item field in sync state.
export class QueueCursor {
  id: number | null = null;
  private index = -1;
  locate(items: QueueIdentity[], key: string | null) {
    const found = items.findIndex(item => item.id === this.id && musicKey(item) === key);
    if (found >= 0) { this.index = found; return found; }
    const next = items.findIndex(item => musicKey(item) === key);
    this.id = next < 0 ? null : items[next].id; this.index = next; return next;
  }
  select(items: QueueIdentity[], id: number) { const index = items.findIndex(item => item.id === id); if (index >= 0) { this.id = id; this.index = index; } }
  advance(items: QueueIdentity[], key: string | null, direction: 'next' | 'prev', shuffle = false, wrap = true) {
    if (!items.length) return null;
    const removedIndex = this.index;
    const removed = this.id !== null && !items.some(item => item.id === this.id);
    const index = this.locate(items, key);
    if (!shuffle && !wrap && !removed && (direction === 'next' ? index >= items.length - 1 : index <= 0)) return null;
    const next = shuffle ? Math.floor(Math.random() * items.length) : removed && direction === 'next' ? Math.min(Math.max(0, removedIndex), items.length - 1) : (index + (direction === 'next' ? 1 : -1) + items.length) % items.length;
    this.select(items, items[next].id); return items[next];
  }
}
