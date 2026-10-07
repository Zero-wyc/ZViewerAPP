import { http } from '@kit.NetworkKit';
import { cryptoFramework } from '@kit.CryptoArchitectureKit';
import { util, url } from '@kit.ArkTS';

interface WbiImages { img_url: string; sub_url: string; }
interface NavData { wbi_img: WbiImages; }
interface NavResponse { code: number; message: string; data?: NavData; }
interface VideoPage { cid: number; page: number; part: string; duration: number; }
interface VideoInfo { title: string; cid: number; duration: number; pages: VideoPage[]; }
interface ViewResponse { code: number; message: string; data?: VideoInfo; }
export interface CodecCapability { codec: string; maxWidth: number; maxHeight: number; maxFrameRate: number; }
interface DashTrack {
  frameRate?: string;
  frame_rate?: string;
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
interface DashData { duration?: number; video: DashTrack[]; audio: DashTrack[]; }
interface DurlSegment { url: string; length?: number; backup_url?: string[]; }
interface PlayData { quality: number; accept_quality: number[]; dash?: DashData; durl?: DurlSegment[]; is_preview?: boolean | number; timelength?: number; }
interface PlayResponse { code: number; message: string; data?: PlayData; }
export interface QualityOption { id: number; label: string; }
export interface ResolvedPage { cid: number; page: number; part: string; duration: number; epId?: number; badge?: string; }
export interface BilibiliResolution {
  epId?: number;
  seasonId?: number;
  seasonTitle?: string;
  preview?: boolean;
  resolvedUrl?: string;
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

interface PgcEpisode { id?: number; ep_id?: number; cid: number; bvid: string; title: string; long_title?: string; badge?: string; duration: number; }
interface PgcSection { episodes?: PgcEpisode[]; }
interface PgcSeason { season_id: number; title: string; episodes?: PgcEpisode[]; main_section?: PgcSection; section?: PgcSection[]; }
interface PgcSeasonEnvelope { code: number; message: string; result?: PgcSeason; data?: PgcSeasonData; }
interface PgcSeasonData { result?: PgcSeason; }
interface PgcPlayData { result?: PlayData; }
interface PgcPlayEnvelope { code: number; message: string; result?: PlayData; data?: PgcPlayData; }
interface PgcInfo { info: VideoInfo; epId: number; seasonId: number; url: string; }

function pgcError(code: number, message: string): Error {
  if (code === -10403) return new Error('REGION_LIMITED: 该内容存在地区观看限制');
  if (code === -404) return new Error('EP_NOT_FOUND: 该番剧或集数不存在/已下架');
  if (code === -403 || code === -514) return new Error('NO_PERMISSION: 该内容需购买或有效大会员资格');
  if (code === -101) return new Error('NOT_LOGGED_IN: B 站凭据已过期，请重新登录');
  return new Error(message || '番剧解析失败');
}

async function pgcInfo(input: string, cid: number, cookie: string): Promise<PgcInfo> {
  const match = input.match(/^(ep|ss)([1-9][0-9]*)$/i);
  if (!match) throw new Error('番剧 ID 无效');
  const id = Number(match[2]);
  if (!Number.isSafeInteger(id)) throw new Error('番剧 ID 无效');
  const key = match[1].toLowerCase() === 'ep' ? 'ep_id' : 'season_id';
  const response = await getJson<PgcSeasonEnvelope>(`https://api.bilibili.com/pgc/view/web/season?${key}=${id}`, cookie);
  const season = response.result || response.data?.result;
  if (response.code !== 0 || !season) throw pgcError(response.code, response.message);
  let episodes = season.episodes || season.main_section?.episodes || [];
  if (episodes.length === 0) {
    for (const section of season.section || []) episodes = episodes.concat(section.episodes || []);
  }
  episodes = episodes.filter((ep: PgcEpisode) => (ep.ep_id || ep.id || 0) > 0 && ep.cid > 0);
  const target = key === 'ep_id' ? episodes.find((ep: PgcEpisode) => (ep.ep_id || ep.id) === id)
    : cid > 0 ? episodes.find((ep: PgcEpisode) => ep.cid === cid) : episodes[0];
  if (!target) throw new Error('EP_NOT_FOUND: 该番剧暂无目标分集');
  if (cid > 0 && cid !== target.cid) throw new Error('番剧集号与 cid 不一致');
  const pages: ResolvedPage[] = episodes.map((ep: PgcEpisode, index: number): ResolvedPage => ({
    page: index + 1, cid: ep.cid, epId: ep.ep_id || ep.id, part: `${ep.title}${ep.long_title ? ' ' + ep.long_title : ''}`,
    badge: ep.badge || '', duration: Math.round(ep.duration / 1000)
  }));
  const epId = target.ep_id || target.id || 0;
  return { info: { title: season.title, cid: target.cid, duration: Math.round(target.duration / 1000), pages },
    epId, seasonId: season.season_id, url: `https://www.bilibili.com/bangumi/play/ep${epId}` };
}

async function pgcPlay(epId: number, cid: number, qn: number, cookie: string, mp4: boolean): Promise<PlayData> {
  const response = await getJson<PgcPlayEnvelope>(`https://api.bilibili.com/pgc/player/web/playurl?ep_id=${epId}&cid=${cid}&qn=${qn}&fnver=0&fnval=${mp4 ? 1 : 2128}&fourk=1`, cookie);
  const play = response.result || response.data?.result;
  if (response.code !== 0 || !play) throw pgcError(response.code, response.message);
  return play;
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

async function expandInput(input: string): Promise<string> {
  if (!/^https?:\/\/(b23\.tv|bili2233\.cn)\//i.test(input)) return input;
  let current = input;
  for (let i = 0; i < 5; i++) {
    const target = new url.URL(current); const host = target.hostname.toLowerCase();
    if (!['http:', 'https:'].includes(target.protocol) || target.username !== '' || target.password !== '' ||
      !(host === 'b23.tv' || host === 'bili2233.cn' || host === 'bilibili.com' || host.endsWith('.bilibili.com'))) throw new Error('短链接重定向目标不受支持');
    if (host === 'bilibili.com' || host.endsWith('.bilibili.com')) return current;
    const request = http.createHttp();
    try {
      const response = await request.request(current, { method: http.RequestMethod.GET, header: { 'User-Agent': USER_AGENT }, maxRedirects: 0, connectTimeout: 10000, readTimeout: 10000, usingCache: false });
      const headers = response.header as Record<string, string>;
      const location = headers['location'] || headers['Location'];
      if (response.responseCode < 300 || response.responseCode >= 400 || !location) throw new Error('短链接未指向可播放的 BV / ep / ss');
      current = new url.URL(location, current).toString();
    } finally { request.destroy(); }
  }
  throw new Error('短链接重定向次数过多');
}

export async function resolveBilibili(bvid: string, requestedCid: number, requestedQn: number, mode: string, fallbackQn: number, cookie: string, vipStatus: number, preferMp4: boolean = false, capabilities: CodecCapability[] | undefined = undefined): Promise<BilibiliResolution> {
  bvid = await expandInput(bvid);
  const identity = bvid.match(/\/bangumi\/play\/(ep|ss)([1-9][0-9]*)/i);
  if (identity) bvid = identity[1].toLowerCase() + identity[2];
  const bvMatch = bvid.match(/BV[0-9A-Za-z]{10}/);
  if (bvMatch) bvid = bvMatch[0];
  if (!/^(ep|ss)[1-9][0-9]*$/i.test(bvid) && !/^BV[0-9A-Za-z]{10}$/.test(bvid)) throw new Error('BV / 番剧 ID 无效');
  if (mode !== 'autoMax' && mode !== 'manual') throw new Error('画质模式无效');
  let info: VideoInfo;
  let pgcData: PgcInfo | undefined = undefined;
  if (/^(ep|ss)[1-9][0-9]*$/i.test(bvid)) { pgcData = await pgcInfo(bvid, requestedCid, cookie); info = pgcData.info; }
  else {
    const view = await getJson<ViewResponse>(`https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`, cookie);
    if (view.code !== 0 || !view.data) throw new Error(view.message || 'B 站视频信息不可用');
    info = view.data;
  }
  const pages = info.pages || [];
  const cid = requestedCid > 0 ? requestedCid : info.cid;
  const page = pages.find((item: VideoPage) => item.cid === cid) || pages[0];
  if (requestedCid > 0 && !pages.some((item: VideoPage) => item.cid === requestedCid)) throw new Error('分集不属于该视频');
  const pgc = !!pgcData;
  const vip = vipStatus > 0;
  // Prefer the regular AVC 1080P track on phones. The high-bitrate VIP track
  // is available through the explicit quality selector but may stall in ArkWeb.
  const defaultQn = cookie === '' ? 32 : 80;
  const qn = mode === 'manual' && requestedQn > 0 ? requestedQn : fallbackQn > 0 ? fallbackQn : defaultQn;
  const play = pgcData ? await pgcPlay(pgcData.epId, cid, qn, cookie, preferMp4) : await signedPlayUrl(bvid, cid, qn, cookie, vip);
  const qualities: QualityOption[] = (play.accept_quality || []).map((id: number): QualityOption => ({ id, label: qualityLabel(id) }));
  const fullDuration = page?.duration || info.duration;
  const playDuration = Math.round((play.timelength || 0) / 1000) || play.dash?.duration || 0;
  if (play.dash?.video?.length) {
    const caps: CodecCapability[] = capabilities || [{ codec: 'avc', maxWidth: 1920, maxHeight: 1080, maxFrameRate: 30 }];
    const supported = play.dash.video.filter((track: DashTrack) => {
      const rate = (track.frameRate || track.frame_rate || '30').split('/');
      const fps = Number(rate[0]) / Number(rate[1] || '1');
      return !!mediaUrl(track) && track.codecs.startsWith('avc1') && track.id !== 125 && track.id !== 126 &&
        (vip || ![127, 120, 116, 112].includes(track.id)) && caps.some((cap: CodecCapability) =>
          cap.codec === 'avc' && track.width > 0 && track.height > 0 && track.width <= Math.min(1920, cap.maxWidth) && track.height <= Math.min(1080, cap.maxHeight) && fps <= cap.maxFrameRate);
    });
    supported.sort((a: DashTrack, b: DashTrack) => b.id - a.id || b.bandwidth - a.bandwidth);
    // The playurl response may include tracks above the requested fallback quality.
    // Honour both manual selection and automatic recovery after a decoder failure.
    const video = mode === 'manual' ? supported.find((track: DashTrack) => track.id === qn) : supported.find((track: DashTrack) => track.id <= qn);
    const audio = (play.dash.audio || []).filter((track: DashTrack) => track.codecs.startsWith('mp4a.40.') && !!mediaUrl(track)).sort((a: DashTrack, b: DashTrack) => b.bandwidth - a.bandwidth)[0];
    if (!video || !mediaUrl(video)) throw new Error('设备无可播放的对应画质 B 站视频编码');
    if (!audio) throw new Error('未获取到可播放的 AAC 音轨');
    return {
      epId: pgcData?.epId, seasonId: pgcData?.seasonId, seasonTitle: pgcData?.info.title, resolvedUrl: pgcData?.url || `https://www.bilibili.com/video/${bvid}`, preview: play.is_preview === true || play.is_preview === 1 || !!pgcData && !!playDuration && playDuration + 3 < fullDuration,
      success: true, title: info.title, duration: pgcData && playDuration > 0 && playDuration + 3 < fullDuration ? playDuration : fullDuration, cid,
      videoUrl: mediaUrl(video), audioUrl: audio ? mediaUrl(audio) : '',
      videoCodec: video.codecs, audioCodec: audio?.codecs || '', format: 'dash',
      loggedIn: cookie !== '', vipStatus, currentQn: video.id, acceptQuality: qualities,
      pages, currentPage: page?.page || 1,
      videoBackupUrls: backupUrls(video), audioBackupUrls: audio ? backupUrls(audio) : [],
    };
  }
  const segment = play.durl?.[0];
  if (mode === 'manual' && requestedQn > 0 && play.quality !== requestedQn) throw new Error('源站未返回所选 MP4 画质，请选择实际可用画质或 DASH');
  if ((play.durl?.length || 0) > 1) throw new Error('当前番剧返回多段 MP4，请改用 DASH');
  const actualDuration = Math.round((segment?.length || 0) / 1000);
  const preview = (play.is_preview === true || play.is_preview === 1) || pgc && actualDuration > 0 && actualDuration + 3 < fullDuration;
  if (!segment?.url) throw new Error('B 站未返回可播放媒体');
  return {
    epId: pgcData?.epId, seasonId: pgcData?.seasonId, seasonTitle: pgcData?.info.title, resolvedUrl: pgcData?.url, preview,
      success: true, title: info.title, duration: preview && actualDuration > 0 ? actualDuration : fullDuration, cid,
    videoUrl: segment.url, audioUrl: '', videoCodec: '', audioCodec: '', format: 'mp4',
    loggedIn: cookie !== '', vipStatus, currentQn: play.quality, acceptQuality: qualities,
    pages, currentPage: page?.page || 1, videoBackupUrls: [], audioBackupUrls: [],
  };
}
