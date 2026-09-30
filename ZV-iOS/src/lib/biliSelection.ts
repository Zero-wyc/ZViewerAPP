export function biliSelection(raw: string): { url: string; cid: number; page: number } {
  const url = new URL(/^BV[\w]+$/.test(raw) ? `https://www.bilibili.com/video/${raw}` : raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !['www.bilibili.com', 'bilibili.com', 'm.bilibili.com', 'b23.tv'].includes(url.hostname)) throw new Error('B站链接无效');
  const cid = Number(url.searchParams.get('cid') || 0); const page = Number(url.searchParams.get('p') || 1);
  if (!Number.isSafeInteger(cid) || cid < 0 || !Number.isSafeInteger(page) || page < 1 || page > 10000) throw new Error('B站分 P 参数无效');
  return { url: url.toString(), cid, page };
}
