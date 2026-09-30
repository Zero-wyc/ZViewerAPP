import type { DanmakuItem } from './timeline.ts';
const entity = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
export function importDanmaku(raw: string): DanmakuItem[] {
  const values: unknown[] = raw.trimStart().startsWith('<') ? [...raw.matchAll(/<d\s+p="([^"]+)"[^>]*>([\s\S]*?)<\/d>/g)].map((item, index) => { const fields = item[1].split(','); return { id: String(index), time: Number(fields[0]), mode: Number(fields[1]), size: Number(fields[2]), color: Number(fields[3]), content: entity(item[2]) }; }) : JSON.parse(raw);
  if (!Array.isArray(values) || values.length > 50000) throw new Error('弹幕需要 JSON 数组或 B站 XML，最多 50000 条');
  return values.map((value, index) => { const item = value as DanmakuItem; if (!item || typeof item.content !== 'string' || !Number.isFinite(item.time) || item.time < 0 || item.content.length > 300) throw new Error(`第 ${index + 1} 条弹幕格式无效`); return { id: String(item.id || index), content: item.content, time: item.time, color: Number.isInteger(item.color) ? item.color : 0xffffff, mode: [1, 4, 5].includes(item.mode || 1) ? item.mode || 1 : 1 }; });
}
