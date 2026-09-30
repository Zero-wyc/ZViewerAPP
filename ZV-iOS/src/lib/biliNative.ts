import { biliOperation } from './nativeBridge';
import { nativeVideoSource, type NativeVideoSource, type PlaybackSource } from './media';
import { readPreference, writePreference } from './preferences';
import { biliSelection } from './biliSelection';
export type BiliStatus = { ready: boolean; loggedIn: boolean; sessionVersion: number; user?: { name: string; vipStatus: number } };
export type BiliMedia = { videoUrl: string; audioUrl?: string; title: string; duration?: number; currentQn: number; currentPage?: number; pages?: { page: number; cid: number; part: string }[]; fallbackReason?: string; sessionVersion: number };
export const qualities = [0, 127, 120, 116, 112, 80, 74, 64, 32, 16];
const cache = new Map<string, { media: BiliMedia; until: number }>();
const failures = new Map<string, number>();
const listeners = new Set<() => void>();
let epoch = 0;
let stopping: Promise<unknown> = Promise.resolve();
export function onBiliChange(callback: () => void) { listeners.add(callback); return () => { listeners.delete(callback); }; }
export function resetBiliPlayback() { epoch++; cache.clear(); failures.clear(); listeners.forEach(fn => fn()); }
export async function stopBiliPlayback() { epoch++; cache.clear(); failures.clear(); stopping = stopping.then(() => biliOperation('stop')).catch(() => {}); await stopping; }
export async function setBiliQuality(qn: number) { if (!qualities.includes(qn)) throw new Error('不支持此画质'); await writePreference('zviewer-bili-quality', { qn }); resetBiliPlayback(); }
export function biliFallback(url: string): boolean { const count = failures.get(url) || 0; if (count >= 2) return false; failures.set(url, count + 1); cache.delete(url); return true; }
export async function resolveLocalBili(url: string): Promise<BiliMedia> {
  await stopping; const revision = epoch;
  const stored = cache.get(url); if (stored && stored.until > Date.now()) return stored.media;
  const { qn } = await readPreference('zviewer-bili-quality', { qn: 0 });
  const count = failures.get(url) || 0;
  const selection = biliSelection(url);
  const options = { url: selection.url, cid: selection.cid, qn: count || !qualities.includes(qn) ? 0 : qn, fallbackQn: count ? count === 1 ? 64 : 32 : 0 };
  let media = await biliOperation<BiliMedia>('resolve', JSON.stringify(options));
  if (!selection.cid && selection.page > 1) {
    const part = media.pages?.find(value => value.page === selection.page);
    if (!part) throw new Error('该视频没有指定的分 P');
    media = await biliOperation<BiliMedia>('resolve', JSON.stringify({ ...options, cid: part.cid }));
  }
  if (revision !== epoch) throw new Error('本机播放会话已变化，请重新选择');
  // Only module-issued random capability URLs can enter the native port. The
  // ordinary room URL validator still rejects every loopback address.
  for (const value of [media.videoUrl, media.audioUrl].filter(Boolean) as string[]) {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || !parsed.port || !/^\/[a-f0-9]{48}\/proxy$/.test(parsed.pathname)) throw new Error('本机解析返回了无效的媒体地址');
  }
  cache.set(url, { media, until: Date.now() + 10 * 60 * 1000 }); return media;
}
export async function playbackSource(source: PlaybackSource, server: string, token: string): Promise<NativeVideoSource> {
  if (source.sourceType !== 'bilibili' || !/bilibili\.com\/video\/|b23\.tv\//i.test(source.sourceUrl)) return nativeVideoSource(source, server, token);
  const media = await resolveLocalBili(source.sourceUrl);
  const track = (uri: string): NativeVideoSource => ({ uri, identity: source.sourceUrl, headers: {}, serverApi: false, options: ['network-caching=1500'], contentType: 'progressive', slaves: [] });
  if (source.format === 'audio') return track(media.audioUrl || media.videoUrl);
  const video = track(media.videoUrl); if (media.audioUrl) video.slaves = [track(media.audioUrl)]; return video;
}
