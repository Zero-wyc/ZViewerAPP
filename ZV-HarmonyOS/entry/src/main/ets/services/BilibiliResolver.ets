import { http } from '@kit.NetworkKit';
import { cryptoFramework } from '@kit.CryptoArchitectureKit';
import { util } from '@kit.ArkTS';

interface WbiImages { img_url: string; sub_url: string; }
interface NavData { wbi_img: WbiImages; }
interface NavResponse { code: number; message: string; data?: NavData; }
interface VideoPage { cid: number; page: number; part: string; duration: number; }
interface VideoInfo { title: string; cid: number; duration: number; pages: VideoPage[]; }
interface ViewResponse { code: number; message: string; data?: VideoInfo; }
interface DashTrack {
  id: number;
  baseUrl?: string;
  base_url?: string;
  backupUrl?: string[];
  backup_url?: string[];
  codecs: string;
  bandwidth: number;
  width: number;
  height: number;
}
interface DashData { video: DashTrack[]; audio: DashTrack[]; }
interface DurlSegment { url: string; }
interface PlayData { quality: number; accept_quality: number[]; dash?: DashData; durl?: DurlSegment[]; }
interface PlayResponse { code: number; message: string; data?: PlayData; }
export interface QualityOption { id: number; label: string; }
export interface ResolvedPage { cid: number; page: number; part: string; duration: number; }
export interface BilibiliResolution {
  success: boolean;
  title: string;
  duration: number;
  cid: number;
  videoUrl: string;
  audioUrl: string;
  videoCodec: string;
  audioCodec: string;
  format: string;
  loggedIn: boolean;
  vipStatus: number;
  currentQn: number;
  acceptQuality: QualityOption[];
  pages: ResolvedPage[];
  currentPage: number;
  videoBackupUrls: string[];
  audioBackupUrls: string[];
}

const MIXIN_INDEX = [46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 20, 42, 19, 29, 28, 14, 7, 41, 12, 1];
const USER_AGENT = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36';

function query(parameters: Map<string, string>): string {
  const keys = Array.from(parameters.keys()).sort();
  const parts: string[] = [];
  for (const key of keys) {
    const value = parameters.get(key) ?? '';
    if (value !== '') parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  }
  return parts.join('&');
}

function hex(bytes: Uint8Array): string {
  let value = '';
  for (const byte of bytes) value += byte.toString(16).padStart(2, '0');
  return value;
}

async function getJson<T>(url: string, cookie: string): Promise<T> {
  const request = http.createHttp();
  try {
    const header: Record<string, string> = { 'User-Agent': USER_AGENT, 'Referer': 'https://www.bilibili.com/' };
    if (cookie !== '') header['Cookie'] = cookie;
    const response = await request.request(url, { method: http.RequestMethod.GET, header, usingCache: false, connectTimeout: 10000, readTimeout: 10000 });
    if (response.responseCode !== 200) throw new Error(`B 站请求失败 (${response.responseCode})`);
    const body = typeof response.result === 'string' ? response.result : JSON.stringify(response.result);
    return JSON.parse(body) as T;
  } finally {
    request.destroy();
  }
}

function imageKey(url: string): string {
  const name = url.slice(url.lastIndexOf('/') + 1).split('?')[0];
  return name.endsWith('.png') ? name.slice(0, -4) : name;
}

async function signedPlayUrl(bvid: string, cid: number, qn: number, cookie: string, vip: boolean): Promise<PlayData> {
  const nav = await getJson<NavResponse>('https://api.bilibili.com/x/web-interface/nav', cookie);
  // Anonymous nav reports code -101 while still returning the public WBI image keys.
  if (!nav.data?.wbi_img) throw new Error('B 站 WBI 密钥不可用');
  const raw = imageKey(nav.data.wbi_img.img_url) + imageKey(nav.data.wbi_img.sub_url);
  let mixin = '';
  for (const index of MIXIN_INDEX) if (index < raw.length) mixin += raw[index];
  mixin = mixin.slice(0, 32);
  const params = new Map<string, string>();
  params.set('bvid', bvid);
  params.set('cid', String(cid));
  params.set('qn', String(qn));
  params.set('fnver', '0');
  params.set('fnval', vip ? '80' : '16');
  params.set('fourk', '1');
  params.set('wts', String(Math.floor(Date.now() / 1000)));
  const md = cryptoFramework.createMd('MD5');
  await md.update({ data: new util.TextEncoder().encode(query(params) + mixin) });
  params.set('w_rid', hex((await md.digest()).data));
  const play = await getJson<PlayResponse>(`https://api.bilibili.com/x/player/wbi/playurl?${query(params)}`, cookie);
  if (play.code !== 0 || !play.data) throw new Error(play.message || 'B 站播放地址不可用');
  return play.data;
}

function mediaUrl(track: DashTrack): string { return track.baseUrl || track.base_url || ''; }
function backupUrls(track: DashTrack): string[] { return track.backupUrl || track.backup_url || []; }

function qualityLabel(qn: number): string {
  if (qn >= 120) return '4K';
  if (qn >= 116) return '1080P60';
  if (qn >= 112) return '1080P 高码率';
  if (qn >= 80) return '1080P';
  if (qn >= 64) return '720P';
  if (qn >= 32) return '480P';
  return '360P';
}

export async function resolveBilibili(bvid: string, requestedCid: number, requestedQn: number, mode: string, fallbackQn: number, cookie: string, vipStatus: number): Promise<BilibiliResolution> {
  if (!/^BV[0-9A-Za-z]{10}$/.test(bvid)) throw new Error('BV 号无效');
  if (mode !== 'autoMax' && mode !== 'manual') throw new Error('画质模式无效');
  const view = await getJson<ViewResponse>(`https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`, cookie);
  if (view.code !== 0 || !view.data) throw new Error(view.message || 'B 站视频信息不可用');
  const info = view.data;
  const pages = info.pages || [];
  const page = pages.find((item: VideoPage) => item.cid === requestedCid) || pages[0];
  const cid = requestedCid > 0 ? requestedCid : info.cid;
  if (requestedCid > 0 && !pages.some((item: VideoPage) => item.cid === requestedCid)) throw new Error('分集不属于该视频');
  const vip = vipStatus > 0;
  // Prefer the regular AVC 1080P track on phones. The high-bitrate VIP track
  // is available through the explicit quality selector but may stall in ArkWeb.
  const defaultQn = cookie === '' ? 32 : 80;
  const qn = mode === 'manual' && requestedQn > 0 ? requestedQn : fallbackQn > 0 ? fallbackQn : defaultQn;
  const play = await signedPlayUrl(bvid, cid, qn, cookie, vip);
  const qualities: QualityOption[] = (play.accept_quality || []).map((id: number): QualityOption => ({ id, label: qualityLabel(id) }));
  if (play.dash?.video?.length) {
    const supported = play.dash.video.filter((track: DashTrack) => track.codecs.startsWith('avc1') && track.width <= 1920 && track.height <= 1080 && track.id !== 125 && track.id !== 126);
    supported.sort((a: DashTrack, b: DashTrack) => b.id - a.id || b.bandwidth - a.bandwidth);
    // The playurl response may include tracks above the requested fallback quality.
    // Honour both manual selection and automatic recovery after a decoder failure.
    const video = supported.find((track: DashTrack) => track.id <= qn) || supported[0];
    const audio = (play.dash.audio || []).sort((a: DashTrack, b: DashTrack) => b.bandwidth - a.bandwidth)[0];
    if (!video || !mediaUrl(video)) throw new Error('设备无可播放的 B 站视频编码');
    return {
      success: true, title: info.title, duration: page?.duration || info.duration, cid,
      videoUrl: mediaUrl(video), audioUrl: audio ? mediaUrl(audio) : '',
      videoCodec: video.codecs, audioCodec: audio?.codecs || '', format: 'dash',
      loggedIn: cookie !== '', vipStatus, currentQn: video.id, acceptQuality: qualities,
      pages, currentPage: page?.page || 1,
      videoBackupUrls: backupUrls(video), audioBackupUrls: audio ? backupUrls(audio) : [],
    };
  }
  const segment = play.durl?.[0];
  if (!segment?.url) throw new Error('B 站未返回可播放媒体');
  return {
    success: true, title: info.title, duration: page?.duration || info.duration, cid,
    videoUrl: segment.url, audioUrl: '', videoCodec: '', audioCodec: '', format: 'mp4',
    loggedIn: cookie !== '', vipStatus, currentQn: play.quality, acceptQuality: qualities,
    pages, currentPage: page?.page || 1, videoBackupUrls: [], audioBackupUrls: [],
  };
}
