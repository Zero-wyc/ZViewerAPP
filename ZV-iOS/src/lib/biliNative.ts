import { biliOperation, nativeBridge } from './nativeBridge';
import { nativeVideoSource, type NativeVideoSource, type PlaybackSource } from './media';
import { readPreference, writePreference } from './preferences';
import { biliSelection } from './biliSelection';
import { ScopedCache } from './scopedCache';
import { parseResolvedMedia } from './resolvers';
export type BiliStatus = { ready: boolean; loggedIn: boolean; sessionVersion: number; user?: { name: string; vipStatus: number } };
export type BiliMedia = { videoUrl: string; audioUrl?: string; title: string; duration?: number; currentQn: number; currentPage?: number; pages?: { page: number; cid: number; part: string }[]; fallbackReason?: string; sessionVersion: number };
export type BiliPolicy = NonNullable<PlaybackSource['biliPolicy']>;
export const defaultBiliPolicy: BiliPolicy = { qn: 0, cliEnabled: true, preferMp4: true, dashAllowed: true, revision: 0 };
export const qualities = [0, 127, 120, 116, 112, 80, 74, 64, 32, 16];
const cache = new ScopedCache<BiliMedia>(20, 300_000);
const failures = new Map<string, number>();
const listeners = new Set<() => void>();
const mediaListeners = new Set<(url: string, qn: number) => void>();
export function onBiliQualityResolved(callback: (url: string, qn: number) => void) { mediaListeners.add(callback); return () => { mediaListeners.delete(callback); }; }
let epoch = 0;
let stopping: Promise<unknown> = Promise.resolve();
export function onBiliChange(callback: () => void) { listeners.add(callback); return () => { listeners.delete(callback); }; }
export function resetBiliPlayback() { epoch++; cache.clear(); failures.clear(); listeners.forEach(fn => fn()); }
export async function stopBiliPlayback() { epoch++; cache.clear(); failures.clear(); await nativeBridge?.biliCancelResolve().catch(() => {}); stopping = stopping.then(() => biliOperation('stop')).catch(() => {}); await stopping; }
export async function setBiliQuality(qn: number) { if (!qualities.includes(qn)) throw new Error('不支持此画质'); await writePreference('zviewer-bili-quality', { qn }); resetBiliPlayback(); }
export function biliFallback(url: string): boolean { const count = failures.get(url) || 0; if (count >= 2) return false; failures.set(url, count + 1); cache.clear(); return true; }
export async function readMovieBiliPolicy(server: string, movieId: number) {
  const value = await readPreference<{ entries: Record<string, BiliPolicy> }>('zviewer-bili-films-v1', { entries: {} });
  return { ...defaultBiliPolicy, ...value.entries[`${server}:${movieId}`] };
}
export async function saveMovieBiliPolicy(server: string, movieId: number, policy: BiliPolicy) {
  const value = await readPreference<{ entries: Record<string, BiliPolicy> }>('zviewer-bili-films-v1', { entries: {} });
  const key = `${server}:${movieId}`; delete value.entries[key]; value.entries[key] = policy;
  while (Object.keys(value.entries).length > 12) delete value.entries[Object.keys(value.entries)[0]];
  await writePreference('zviewer-bili-films-v1', value); resetBiliPlayback();
}
export async function resolveLocalBili(url: string, scope = '', policy?: BiliPolicy): Promise<BiliMedia> {
  await stopping; const revision = epoch;
  const status = await biliOperation<BiliStatus>('start');
  const { qn: savedQn } = await readPreference('zviewer-bili-quality', { qn: 0 });
  const qn = policy?.qn ?? savedQn;
  if (revision !== epoch) throw new Error('本机播放会话已变化');
  const count = failures.get(url) || 0; const selection = biliSelection(url);
  const options = { url: selection.url, cid: selection.cid, qn: count || !qualities.includes(qn) ? 0 : qn, fallbackQn: count ? count === 1 ? 64 : 32 : 0 };
  const key = JSON.stringify([scope, status.sessionVersion, selection, options, policy?.revision]);
  const result = await cache.get(key, async () => {
    let media = await biliOperation<BiliMedia>('resolve', JSON.stringify(options));
    if (!selection.cid && selection.page > 1) {
      const part = media.pages?.find(value => value.page === selection.page);
      if (!part) throw new Error('该视频没有指定的分 P');
      media = await biliOperation<BiliMedia>('resolve', JSON.stringify({ ...options, cid: part.cid }));
    }
    if (revision !== epoch || media.sessionVersion !== status.sessionVersion) throw new Error('本机播放会话已变化，请重新选择');
    for (const value of [media.videoUrl, media.audioUrl].filter(Boolean) as string[]) {
      const parsed = new URL(value);
      if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || !parsed.port || !/^\/[a-f0-9]{48}\/proxy$/.test(parsed.pathname)) throw new Error('本机解析返回了无效的媒体地址');
    }
    return media;
  });
  mediaListeners.forEach(listener => listener(url, result.currentQn)); return result;
}
async function fetchLimited<T>(url: string, init: RequestInit, milliseconds: number, consume: (response: Response) => Promise<T>, signal?: AbortSignal) {
  const cancellation = new AbortController(); const abort = () => cancellation.abort();
  if (signal?.aborted) cancellation.abort(); else signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, milliseconds);
  try { return await consume(await fetch(url, { ...init, signal: cancellation.signal })); }
  finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}
export async function resolveServerBili(url: string, server: string, token: string, policy = defaultBiliPolicy, signal?: AbortSignal) {
  // Public setting governs server DASH only; local CLI remains independent.
  let dashAllowed = false;
  try { const value = await fetchLimited(`${server.replace(/\/+$/, '')}/api/auth/public-settings`, {}, 10000, response => response.json(), signal); dashAllowed = value.settings?.dashDisabled === false; } catch {}
  policy = { ...policy, dashAllowed };
  const params = new URLSearchParams({ url, preferMp4: String(policy.preferMp4 || !policy.dashAllowed), forceDash: String(!policy.preferMp4 && policy.dashAllowed), qn: String(policy.qn || 64) });
  return fetchLimited(`${server.replace(/\/+$/, '')}/api/stream/resolve-bilibili?${params}`, { headers: { Authorization: `Bearer ${token}` } }, 45000, async response => {
    if (!response.ok) throw new Error('服务器 B站解析失败');
    return parseResolvedMedia(await response.text());
  }, signal);
}
export async function playbackSource(source: PlaybackSource, server: string, token: string, signal?: AbortSignal): Promise<NativeVideoSource> {
  if (source.sourceType !== 'bilibili') return nativeVideoSource(source, server, token);
  biliSelection(source.sourceUrl);
  const policy = source.biliPolicy ?? (source.movieId ? await readMovieBiliPolicy(server, source.movieId) : defaultBiliPolicy);
  let status: BiliStatus | null = null;
  if (policy.cliEnabled) try { status = await biliOperation<BiliStatus>('start'); } catch {}
  if (signal?.aborted) throw new Error('播放任务已取消');
  if (status?.ready && status.loggedIn) {
    const media = await resolveLocalBili(source.sourceUrl, `${server}:${source.movieId ?? 'music'}:${source.cid ?? 0}`, policy);
    const track = (uri: string): NativeVideoSource => ({ uri, identity: source.sourceUrl, headers: {}, serverApi: false, options: ['network-caching=1500'], contentType: 'progressive', slaves: [] });
    if (source.format === 'audio') return track(media.audioUrl || media.videoUrl);
    const video = track(media.videoUrl); if (media.audioUrl && source.format !== 'muted-video') video.slaves = [track(media.audioUrl)]; return video;
  }
  const media = await resolveServerBili(source.sourceUrl, server, token, { ...policy, preferMp4: policy.cliEnabled || policy.preferMp4 }, signal);
  const proxy = (url: string) => `/api/stream/proxy?${new URLSearchParams({ url, referer: 'https://www.bilibili.com/', userAgent: 'Mozilla/5.0' })}`;
  return { ...nativeVideoSource({ ...source, sourceUrl: proxy(source.format === 'audio' ? media.audioUrl || media.videoUrl : media.videoUrl), format: media.format, audioUrl: source.format === 'audio' || source.format === 'muted-video' ? undefined : media.audioUrl ? proxy(media.audioUrl) : undefined }, server, token), identity: source.sourceUrl };
}
