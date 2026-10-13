import { biliSelection } from './biliSelection.ts';
import type { BiliMedia } from './biliNative';
import type { BiliCatalogItem } from './biliCatalog.ts';
import type { SourceSelection } from './sources.ts';
export async function addSelectedBili(item: BiliCatalogItem, port: { active: () => boolean; resolve: (url: string) => Promise<BiliMedia>; add: (value: SourceSelection, play: boolean) => Promise<void>; status: (text: string) => void }) {
  const check = () => { if (!port.active()) throw new Error('影片选择已取消'); };
  check(); const parsed = biliSelection(item.url || `https://www.bilibili.com/video/${item.bvid}`);
  port.status('正在解析视频…'); const media = await port.resolve(parsed.url); check();
  const part = media.pages?.find(value => value.page === (media.currentPage || parsed.page)) || media.pages?.[0];
  const target = new URL(parsed.url); const cid = parsed.cid || part?.cid;
  if (cid) target.searchParams.set('cid', String(cid));
  const value: SourceSelection = { title: item.title || media.title, source: 'bilibili', url: target.toString(), cid, duration: media.duration, cover: item.cover, pages: media.pages, currentPage: media.currentPage || parsed.page, cliOnly: !!parsed.epId || !!parsed.seasonId };
  port.status('解析成功，正在添加并播放…'); check(); await port.add(value, true); port.status('已添加，正在加载播放…');
  return media;
}
