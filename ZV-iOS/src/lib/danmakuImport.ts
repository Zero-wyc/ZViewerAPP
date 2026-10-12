import type { DanmakuItem } from './timeline.ts';
export const MAX_DANMAKU_BYTES = 5 * 1024 * 1024;
export const MAX_DANMAKU_ITEMS = 20000;
const entity = (s: string) => s.replace(/&#(x[0-9a-f]+|\d+);/gi, (_, value) => { const code = value[0].toLowerCase() === 'x' ? parseInt(value.slice(1), 16) : Number(value); return code <= 0x10ffff && code >= 0 ? String.fromCodePoint(code) : ''; }).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
export function danmakuBody(value: object): string { const body = JSON.stringify(value); if (new TextEncoder().encode(body).length > MAX_DANMAKU_BYTES) throw new Error('弹幕请求不能超过 5 MiB，请减少条目后重试'); return body; }
export function importDanmaku(raw: string): DanmakuItem[] {
  if (new TextEncoder().encode(raw).length > MAX_DANMAKU_BYTES) throw new Error('弹幕文件不能超过 5 MiB');
  const xml = raw.trimStart().startsWith('<');
  let values: unknown;
  if (xml) values = [...raw.matchAll(/<d\b[^>]*\bp=["']([^"']+)["'][^>]*>([\s\S]*?)<\/d>/g)].map((item, index) => { const fields = item[1].split(','); return { id: fields[7] || String(index), time: Number(fields[0]), mode: Number(fields[1]), size: Number(fields[2]), color: Number(fields[3]), content: entity(item[2]) }; });
  else {
    const data = JSON.parse(raw);
    if (Array.isArray(data)) values = data;
    else if (Array.isArray(data?.comments)) values = data.comments.map((item: { cid?: string; p?: string; m?: string }) => { const fields = String(item.p || '').split(','); return { id: item.cid, time: Number(fields[0]), mode: Number(fields[1]), color: Number(fields[2] || 16777215), content: item.m }; });
    else if (Array.isArray(data?.elements)) values = data.elements;
    else values = [data];
  }
  if (!Array.isArray(values) || values.length > MAX_DANMAKU_ITEMS) throw new Error('弹幕最多 20000 条，请分轨导入');
  const items: DanmakuItem[] = [];
  for (const [index, value] of values.entries()) {
    const item = value as Record<string, unknown>;
    if (!item) throw new Error(`第 ${index + 1} 条弹幕格式无效`);
    const content = item.content ?? item.str ?? item.m ?? item.text;
    const time = Number(item.time ?? item.stime ?? (item.progress != null ? Number(item.progress) / 1000 : NaN));
    const mode = Number(item.mode ?? 1); if ([8, 9].includes(mode)) continue;
    if (typeof content !== 'string' || !Number.isFinite(time) || time < 0 || content.length > 300) throw new Error(`第 ${index + 1} 条弹幕格式无效`);
    const color = Number(item.color ?? 0xffffff);
    items.push({ id: String(item.id ?? item.dmid ?? item.cid ?? index), content, time, color: Number.isInteger(color) && color >= 0 && color <= 0xffffff ? color : 0xffffff, mode: [1, 4, 5].includes(mode) ? mode : 1 });
  }
  return items.sort((a, b) => a.time - b.time);
}
