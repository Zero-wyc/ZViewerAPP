export type BiliCatalogItem = { bvid: string; title: string; cid?: number; duration?: number; author?: string; cover?: string; play?: number; url?: string; epId?: number; seasonId?: number };
export type BiliPage = { page: number; cid: number; part: string; epId?: number; duration?: number };
export type BiliView = { title: string; duration?: number; cid?: number; pic?: string; cover?: string; pages?: BiliPage[]; currentPage?: number };
export function biliGrid(width: number) {
  const available = Math.max(1, Number.isFinite(width) ? width : 1); const gap = 12;
  const columns = Math.max(1, Math.min(4, Math.floor((available + gap) / (220 + gap))));
  // onLayout may round the fractional CSS/Yoga width up. Integer card widths
  // leave room for that rounding so the final column cannot wrap unexpectedly.
  return { columns, gap, width: Math.max(1, Math.floor((available - gap * (columns - 1)) / columns)) };
}
export function posterHeight(width: number, originalWidth = 16, originalHeight = 9) {
  const ratio = originalWidth > 0 && originalHeight > 0 && Number.isFinite(originalWidth / originalHeight) ? originalWidth / originalHeight : 16 / 9;
  return width / ratio;
}
export function biliCount(count?: number) { return count ? count >= 100000000 ? `${(count / 100000000).toFixed(1)}亿` : count >= 10000 ? `${(count / 10000).toFixed(1)}万` : String(count) : ''; }
export function biliImage(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  let text = raw.trim(); if (text.startsWith('//')) text = `https:${text}`;
  else if (/^(?:[\w-]+\.)*(?:hdslb\.com|biliimg\.com)\//.test(text)) text = `https://${text}`;
  try { const url = new URL(text); if (url.protocol === 'http:' && ['hdslb.com', 'biliimg.com'].some(host => url.hostname === host || url.hostname.endsWith('.' + host))) url.protocol = 'https:'; return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.toString() : ''; } catch { return ''; }
}
export function normalizeBiliCatalog(data: Record<string, unknown>, kind: string, allowPgc: boolean): BiliCatalogItem[] {
  const values = [data.items, data.result, data.item, data.medias, data.archives, data.episodes].find(Array.isArray) || [];
  return (values as Record<string, unknown>[]).flatMap(raw => {
    const epId = kind === 'episodes' ? Number(raw.ep_id || raw.id) : Number(raw.epId || 0);
    const seasonId = Number(raw.season_id || raw.seasonId || 0);
    const bvid = typeof raw.bvid === 'string' ? raw.bvid : '';
    const pgc = epId > 0 || seasonId > 0;
    if (pgc ? !allowPgc : !/^BV[0-9A-Za-z]{10}$/.test(bvid)) return [];
    const length = typeof raw.duration === 'string' ? raw.duration.split(':').reduce((sum, part) => sum * 60 + Number(part), 0) : Number(raw.duration || 0);
    const title = String(raw.title || raw.name || 'B站视频').replace(/<[^>]*>/g, '');
    return [{ bvid, title, ...(raw.cid ? { cid: Number(raw.cid) } : {}), duration: Number.isFinite(length) ? length : 0, author: String(raw.author || raw.upName || (raw.upper as { name?: string })?.name || ''), cover: biliImage(raw.pic || raw.cover), play: Number(raw.play || raw.view || (raw.cnt_info as { play?: number })?.play || 0), ...(pgc ? { epId, seasonId, url: `https://www.bilibili.com/bangumi/play/${epId > 0 ? 'ep' + epId : 'ss' + seasonId}` } : { url: `https://www.bilibili.com/video/${bvid}` }) }];
  });
}
export function chooseBiliPage(item: BiliCatalogItem, view: BiliView, page?: BiliPage): BiliCatalogItem {
  const part = page || view.pages?.find(value => value.page === (view.currentPage || 1)) || view.pages?.[0];
  const epId = part?.epId || item.epId;
  const url = new URL(epId ? `https://www.bilibili.com/bangumi/play/ep${epId}` : item.url || `https://www.bilibili.com/video/${item.bvid}`);
  if (part?.cid || view.cid || item.cid) url.searchParams.set('cid', String(part?.cid || view.cid || item.cid));
  if (part && !epId) url.searchParams.set('p', String(part.page));
  return { ...item, epId, title: part && (view.pages?.length || 0) > 1 ? `${view.title} · ${part.part}` : view.title || item.title, url: url.toString(), cid: part?.cid || view.cid || item.cid, cover: item.cover || biliImage(view.cover || view.pic) };
}
