import { biliSelection } from './biliSelection.ts';
import type { BiliMedia } from './biliNative';
import type { BiliCatalogItem } from './biliCatalog.ts';
import type { SourceSelection } from './sources.ts';
import type { Song } from './musicCollection.ts';

export function biliPartSelection(raw: string, media: BiliMedia, part?: NonNullable<BiliMedia['pages']>[number], whole = false): SourceSelection {
  const input = biliSelection(raw); const resolved = biliSelection(media.resolvedUrl || input.url);
  const selected = part || media.pages?.find(value => value.cid === input.cid && input.cid > 0) || media.pages?.find(value => value.page === (media.currentPage || input.page)) || media.pages?.[0];
  const cid = part?.cid || input.cid || selected?.cid || media.cid;
  if (!Number.isSafeInteger(cid) || !cid || cid < 1) throw new Error('没有可用的 B站分 P 身份，请重新解析');
  const epId = selected?.epId || media.epId || resolved.epId || input.epId;
  const target = new URL(biliSelection(epId ? `ep${epId}` : resolved.url).url);
  const page = selected?.page || media.currentPage || input.page;
  target.searchParams.set('cid', String(cid));
  if (!epId) target.searchParams.set('p', String(page));
  return { title: part && !whole ? `${media.title} · ${part.part}` : media.title, source: 'bilibili', url: target.toString(), cid, currentPage: page, epId, seasonId: selected?.seasonId || media.seasonId || input.seasonId, duration: whole ? media.duration : selected?.duration ?? media.duration, cliOnly: !!epId || !!input.seasonId || !!resolved.seasonId, ...(whole ? { pages: media.pages } : {}) };
}

export function biliMusicItem(value: SourceSelection): Song {
  const selection = biliSelection(value.url);
  const bvid = new URL(selection.url).pathname.match(/\/video\/(BV[0-9A-Za-z]{10})(?:\/|$)/)?.[1];
  const cid = value.cid || selection.cid;
  if (value.cliOnly || selection.epId || selection.seasonId) throw new Error('一起听播放列表暂不支持番剧身份，请选择普通 B站视频');
  if (!bvid || !Number.isSafeInteger(cid) || !cid || cid < 1) throw new Error('一起听需要有效的 BV 号和分 P CID，请重新解析');
  const duration = value.pages?.find(part => part.cid === cid)?.duration ?? value.duration;
  return { songId: 0, biliBvid: bvid, biliCid: cid, name: value.title, artist: '哔哩哔哩', album: '', cover: value.cover || '', durationMs: Math.max(0, duration || 0) * 1000, vip: false };
}
export async function addSelectedBili(item: BiliCatalogItem, port: { active: () => boolean; resolve: (url: string) => Promise<BiliMedia>; add: (value: SourceSelection, play: boolean) => Promise<void>; status: (text: string) => void }) {
  const check = () => { if (!port.active()) throw new Error('影片选择已取消'); };
  check(); const parsed = biliSelection(item.url || `https://www.bilibili.com/video/${item.bvid}`);
  port.status('正在解析视频…'); const media = await port.resolve(parsed.url); check();
  const value = { ...biliPartSelection(parsed.url, media, undefined, true), title: item.title || media.title, cover: item.cover };
  port.status('解析成功，正在添加并播放…'); check(); await port.add(value, true); port.status('已添加，正在加载播放…');
  return media;
}
