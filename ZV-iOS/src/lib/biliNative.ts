import { resolveAggregateSource } from './aggregatePlayback';
import { biliOperation, nativeBridge } from './nativeBridge';
import { nativeVideoSource, type NativeVideoSource, type PlaybackSource } from './media';
import { readPreference, writePreference } from './preferences';
import { biliSelection } from './biliSelection';
import { ScopedCache } from './scopedCache';
import { isUnverifiedBiliHdr, parseResolvedMedia } from './resolvers';
import { serverBiliSource } from './biliRoomProtocol';
import { detectLibraryHls } from './libraryHls';
import { connectionUrl } from './connectionTransport';
export type BiliStatus = { ready: boolean; loggedIn: boolean; sessionVersion: number; loginError?: string; user?: { name: string; vipStatus: number } };
export type BiliMedia = { videoUrl: string; audioUrl?: string; format?: string; resolvedUrl?: string; cid?: number; epId?: number; seasonId?: number; title: string; duration?: number; currentQn: number; currentPage?: number; pages?: { page: number; cid: number; part: string; epId?: number; seasonId?: number; duration?: number }[]; fallbackReason?: string; sessionVersion: number; isHdr?: boolean; hdrType?: string; videoCodec?: string; audioCodec?: string; videoCodecid?: number };
export type BiliPolicy = NonNullable<PlaybackSource['biliPolicy']>;
export const defaultBiliPolicy: BiliPolicy = { qn: 0, cliEnabled: true, preferMp4: true, dashAllowed: true, revision: 0 };
export const qualities = [0, 127, 120, 116, 112, 80, 74, 64, 32, 16];
const cache = new ScopedCache<BiliMedia>(20, 300_000);
const failures = new Map<string, number>();
const listeners = new Set<() => void>();
const mediaListeners = new Set<(url: string, qn: number) => void>();
export function onBiliQualityResolved(callback: (url: string, qn: number) => void) { mediaListeners.add(callback); return () => { mediaListeners.delete(callback); }; }
function reportPlaybackSource(url: string, media: { currentQn?: number; format?: string; cid?: number; currentPage?: number; videoCodec?: string; audioCodec?: string }, branch: 'local-cli' | 'server', source: NativeVideoSource) {
  if (Number.isFinite(media.currentQn) && media.currentQn! > 0) mediaListeners.forEach(listener => listener(url, media.currentQn!));
  // This records resolution, not decoded playback. Never log signed URLs,
  // loopback capability paths, session identifiers or request headers.
  if (typeof __DEV__ !== 'undefined' && __DEV__) console.info('[ZViewerBiliPlayback]', JSON.stringify({ event: 'resolved-source', branch, format: media.format, currentQn: media.currentQn, cid: media.cid, currentPage: media.currentPage, videoCodec: media.videoCodec, audioCodec: media.audioCodec, audioSlaves: source.slaves.length, serverApi: source.serverApi, localLoopback: /^http:\/\/127\.0\.0\.1:/.test(source.uri) }));
}
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
function assertPolicyOperation(signal?: AbortSignal, current?: () => boolean) { if (signal?.aborted || current?.() === false) throw new Error('画质设置操作已取消'); }
export async function saveMovieBiliPolicy(server: string, movieId: number, policy: BiliPolicy, signal?: AbortSignal, current?: () => boolean) {
  assertPolicyOperation(signal, current);
  const value = await readPreference<{ entries: Record<string, BiliPolicy> }>('zviewer-bili-films-v1', { entries: {} });
  assertPolicyOperation(signal, current);
  const key = `${server}:${movieId}`; delete value.entries[key]; value.entries[key] = policy;
  while (Object.keys(value.entries).length > 12) delete value.entries[Object.keys(value.entries)[0]];
  await writePreference('zviewer-bili-films-v1', value);
  // A write already submitted can finish, but an abandoned editor must never
  // invalidate a newer account/movie's playback after the storage await.
  assertPolicyOperation(signal, current); resetBiliPlayback();
}
export async function applyMovieBiliPolicy(input: { url: string; server: string; token: string; movieId: number; policy: BiliPolicy }, signal: AbortSignal, current?: () => boolean) {
  assertPolicyOperation(signal, current);
  const { url, server, token, movieId, policy } = input;
  const media = policy.cliEnabled ? await resolveLocalBili(url, `${server}:${movieId}`, policy) : await resolveServerBili(url, server, token, policy, signal);
  assertPolicyOperation(signal, current);
  await saveMovieBiliPolicy(server, movieId, policy, signal, current);
  assertPolicyOperation(signal, current);
  return media;
}
export async function resolveLocalBili(url: string, scope = '', policy?: BiliPolicy): Promise<BiliMedia> {
  await stopping; const revision = epoch;
  const status = await biliOperation<BiliStatus>('start');
  if (status.loginError) throw new Error(status.loginError);
  const { qn: savedQn } = await readPreference('zviewer-bili-quality', { qn: 0 });
  const qn = policy?.qn ?? savedQn;
  if (revision !== epoch) throw new Error('本机播放会话已变化');
  const count = failures.get(url) || 0; const selection = biliSelection(url);
  const options = { url: selection.url, cid: selection.cid, page: new URL(selection.url).searchParams.has('p') ? selection.page : 0, epId: selection.epId || 0, seasonId: selection.seasonId || 0, qn: count || !qualities.includes(qn) ? 0 : qn, fallbackQn: count ? count === 1 ? 64 : 32 : 0 };
  const key = JSON.stringify([scope, status.sessionVersion, selection, options, policy?.revision]);
  const result = await cache.get(key, async () => {
    let media = await biliOperation<BiliMedia>('resolve', JSON.stringify(options));
    if (!selection.cid && selection.page > 1) {
      const part = media.pages?.find(value => value.page === selection.page);
      if (!part) throw new Error('该视频没有指定的分 P');
      media = await biliOperation<BiliMedia>('resolve', JSON.stringify({ ...options, cid: part.cid, ...(part.epId ? { epId: part.epId } : {}) }));
    }
    if (revision !== epoch || media.sessionVersion !== status.sessionVersion) throw new Error('本机播放会话已变化，请重新选择');
    for (const value of [media.videoUrl, media.audioUrl].filter(Boolean) as string[]) {
      const parsed = new URL(value);
      if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || !parsed.port || !/^\/[a-f0-9]{48}\/proxy$/.test(parsed.pathname)) throw new Error('本机解析返回了无效的媒体地址');
    }
    return media;
  });
  return result;
}
async function fetchLimited<T>(url: string, init: RequestInit, milliseconds: number, consume: (response: Response) => Promise<T>, signal?: AbortSignal) {
  const cancellation = new AbortController(); const abort = () => cancellation.abort();
  if (signal?.aborted) cancellation.abort(); else signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, milliseconds);
  try { return await consume(await fetch(connectionUrl(url), { ...init, credentials: 'omit', signal: cancellation.signal })); }
  finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}
export async function resolveServerBili(url: string, server: string, token: string, policy = defaultBiliPolicy, signal?: AbortSignal, movieId?: number) {
  const selection = biliSelection(url); url = selection.url;
  // Public setting governs server DASH only; local CLI remains independent.
  let dashAllowed = false;
  try { const value = await fetchLimited(`${server.replace(/\/+$/, '')}/api/auth/public-settings`, {}, 10000, response => response.json(), signal); dashAllowed = value.settings?.dashDisabled === false; } catch {}
  policy = { ...policy, dashAllowed };
  const params = new URLSearchParams({ url, preferMp4: String(policy.preferMp4 || !policy.dashAllowed), forceDash: String(!policy.preferMp4 && policy.dashAllowed), qn: String(policy.qn || 64) });
  // Preserve a user-selected P even when a short-link redirect drops its query.
  // An unknown P stays unspecified so an expanded share link can supply it.
  if (new URL(selection.url).searchParams.has('p')) params.set('page', String(selection.page));
  if (movieId) params.set('movieId', String(movieId));
  const fetchMedia = () => fetchLimited(`${server.replace(/\/+$/, '')}/api/stream/resolve-bilibili?${params}`, { headers: { Authorization: `Bearer ${token}` } }, 45000, async response => {
    if (!response.ok) throw new Error('服务器 B站解析失败');
    return parseResolvedMedia(await response.text());
  }, signal);
  let media = await fetchMedia();
  // v4.7.4's HTTP resolver does not forward an explicit CID to its core.
  // Resolve it against that video's real page list instead of accepting P1.
  if (selection.cid && media.cid !== selection.cid) {
    const page = media.pages?.find(value => value.cid === selection.cid);
    if (!page || !Number.isSafeInteger(page.page) || page.page < 1 || page.page > 10000) throw new Error('所选 CID 不属于该 B站视频，请重新选集');
    params.set('page', String(page.page)); media = await fetchMedia();
    if (media.cid !== selection.cid) throw new Error('服务器未返回所选 B站分 P，请重新选集');
  }
  if (!selection.cid && new URL(selection.url).searchParams.has('p') && media.currentPage != null && media.currentPage !== selection.page) throw new Error('该 B站视频没有指定的分 P，请重新选集');
  if (selection.cid) {
    const resolved = new URL(biliSelection(media.resolvedUrl || selection.url).url);
    resolved.searchParams.set('cid', String(selection.cid));
    const page = media.currentPage || media.pages?.find(value => value.cid === selection.cid)?.page;
    if (page) resolved.searchParams.set('p', String(page));
    media = { ...media, resolvedUrl: resolved.toString() };
  }
  return media;
}
// All selection/part/quality entry points obey the playback account boundary.
export async function resolveInputBili(url: string, server: string, token: string, policy = defaultBiliPolicy, signal?: AbortSignal): Promise<BiliMedia> {
  const selection = biliSelection(url);
  let status: BiliStatus | null = null;
  if (policy.cliEnabled) try { status = await biliOperation<BiliStatus>('start'); } catch {}
  if (status?.loginError) throw new Error(status.loginError);
  if (signal?.aborted) throw new Error('解析已取消');
  if (status?.ready && status.loggedIn) return resolveLocalBili(selection.url, server, policy);
  if (selection.epId || selection.seasonId) throw new Error('此番剧需要在本机登录有播放权限的 B站账号');
  const media = await resolveServerBili(selection.url, server, token, policy, signal);
  if (isUnverifiedBiliHdr(media)) throw new Error('当前 HDR / 杜比档位尚未通过本机验证，请选择 SDR 画质');
  const resolved = media.resolvedUrl ? biliSelection(media.resolvedUrl) : selection;
  if (resolved.epId || resolved.seasonId) throw new Error('此番剧需要在本机登录有播放权限的 B站账号');
  return { ...media, title: media.title || selection.url, currentQn: media.currentQn || policy.qn || 64, sessionVersion: 0 };
}
// VLC's MP4 streaming demuxer can stop its clock after seeking Bili fMP4.
// Keep the music audio and its muted video on the bundled avformat demuxer;
// watch playback and adaptive sources retain their existing demux selection.
function biliMusicOptions(format: PlaybackSource['format']): string[] {
  return format === 'audio' ? ['demux=avformat']
    : format === 'muted-video' ? ['demux=avformat', 'no-audio'] : [];
}
export async function playbackSource(source: PlaybackSource, server: string, token: string, signal?: AbortSignal): Promise<NativeVideoSource> {
  if (source.sourceType !== 'bilibili') {
    if (['anime', 'kazumi', 'cms'].includes(source.sourceType || '')) source = await resolveAggregateSource(source, async <T,>(path: string, init?: RequestInit) => fetchLimited(`${server.replace(/\/+$/, '')}${path}`, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } }, 45000, async response => {
      if (!response.ok) throw new Error(`数据源解析失败（HTTP ${response.status}）`);
      return await response.json() as T;
    }, signal), signal);
    const native = await detectLibraryHls(nativeVideoSource(source, server, token), server, token,
      uri => fetchLimited(uri, { method: 'HEAD', headers: { Authorization: `Bearer ${token}` }, redirect: 'error' }, 10000,
        async response => response.ok ? response.headers.get('content-type') || '' : '', signal), signal);
    return native.hlsProxy || native.libraryHls ? (await import('./hlsNative')).prepareNativeHls(native, signal) : native;
  }
  source = { ...source, sourceUrl: biliSelection(source.sourceUrl).url };
  const policy = source.biliPolicy ?? (source.movieId ? await readMovieBiliPolicy(server, source.movieId) : defaultBiliPolicy);
  let status: BiliStatus | null = null;
  if (policy.cliEnabled) try { status = await biliOperation<BiliStatus>('start'); } catch {}
  if (status?.loginError) throw new Error(status.loginError);
  if (signal?.aborted) throw new Error('播放任务已取消');
  const selection = biliSelection(source.sourceUrl);
  if ((source.cliOnly || selection.epId || selection.seasonId) && (!policy.cliEnabled || !status?.ready || !status.loggedIn)) throw new Error('此番剧仅支持本机 B站解析，请在此设备启用本机解析并登录有播放权限的 B站账号');
  if (status?.ready && status.loggedIn) {
    const media = await resolveLocalBili(source.sourceUrl, `${server}:${source.movieId ?? 'music'}:${source.cid ?? 0}`, policy);
    if (signal?.aborted) throw new Error('播放任务已取消');
    const track = (uri: string): NativeVideoSource => ({ uri, identity: source.sourceUrl, headers: {}, serverApi: false, options: ['network-caching=1500', ...biliMusicOptions(source.format)], contentType: 'progressive', slaves: [] });
    const video = source.format === 'audio' ? track(media.audioUrl || media.videoUrl) : track(media.videoUrl);
    if (media.audioUrl && source.format !== 'audio' && source.format !== 'muted-video') video.slaves = [track(media.audioUrl)];
    reportPlaybackSource(source.sourceUrl, media, 'local-cli', video); return video;
  }
  const media = await resolveServerBili(source.sourceUrl, server, token, { ...policy, preferMp4: policy.cliEnabled || policy.preferMp4 }, signal, source.movieId);
  if (signal?.aborted) throw new Error('播放任务已取消');
  if (isUnverifiedBiliHdr(media)) throw new Error('当前 HDR / 杜比档位尚未通过本机验证，请选择 SDR 画质');
  const video = { ...nativeVideoSource(serverBiliSource(source, media), server, token), identity: source.sourceUrl };
  video.options.push(...biliMusicOptions(source.format));
  reportPlaybackSource(source.sourceUrl, media, 'server', video); return video;
}

export async function resolveSharedBili(source: PlaybackSource, server: string, token: string, signal?: AbortSignal) {
  if (source.cliOnly || source.epId || source.seasonId) return { ...source, cliOnly: true, audioUrl: undefined };
  const media = await resolveServerBili(source.sourceUrl, server, token, { ...defaultBiliPolicy, cliEnabled: false, preferMp4: true }, signal, source.movieId);
  return serverBiliSource(source, media);
}
