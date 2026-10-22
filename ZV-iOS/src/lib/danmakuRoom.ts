import type { DanmakuItem } from './timeline.ts';
export type RealtimeDanmaku = { id: string; content: string; sender?: string; time?: number };
export type DanmakuMeta = { blockKeywords: string[]; deletedLog: unknown[]; realtimeLog: RealtimeDanmaku[] };
export function normalizeDanmakuMeta(value: unknown): DanmakuMeta {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const realtimeLog = Array.isArray(raw.realtimeLog) ? raw.realtimeLog.flatMap(entry => {
    if (!entry || typeof entry !== 'object') return [];
    const item = entry as Record<string, unknown>;
    if ((typeof item.id !== 'string' && typeof item.id !== 'number') || typeof item.content !== 'string') return [];
    return [{ id: String(item.id), content: item.content, ...(typeof item.sender === 'string' ? { sender: item.sender } : {}), ...(typeof item.time === 'number' && Number.isFinite(item.time) && item.time >= 0 ? { time: item.time } : {}) }];
  }).slice(-500) : [];
  return { blockKeywords: Array.isArray(raw.blockKeywords) ? raw.blockKeywords.filter((word): word is string => typeof word === 'string' && !!word.trim()) : [], deletedLog: Array.isArray(raw.deletedLog) ? raw.deletedLog : [], realtimeLog };
}
export function mergeRealtimeDanmaku(existing: RealtimeDanmaku[], incoming: RealtimeDanmaku[]) {
  const byId = new Map(existing.map(item => [item.id, item]));
  for (const item of incoming) byId.set(item.id, { ...byId.get(item.id), ...item });
  // Server ids start with their creation timestamp. Video time may seek back,
  // so it must not be used to order or evict real-time history.
  const created = (id: string) => /^\d{10,16}-/.test(id) ? Number(id.split('-')[0]) : null;
  return [...byId.values()].sort((a, b) => { const first = created(a.id), second = created(b.id); return first !== null && second !== null ? first - second : 0; }).slice(-500);
}
export function danmakuRoomBlocked(item: DanmakuItem, blockKeywords: string[], deletedLog: unknown[]) {
  if (blockKeywords.some(word => !!word && item.content.includes(word))) return true;
  return deletedLog.some(value => {
    if (!value || typeof value !== 'object') return false;
    const entry = value as { trackId?: unknown; item?: { id?: unknown } };
    return typeof entry.trackId === 'string' && entry.item?.id != null && item.id === `${entry.trackId}:${String(entry.item.id)}`;
  });
}
