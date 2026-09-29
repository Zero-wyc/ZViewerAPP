import { http, socket } from '@kit.NetworkKit';
import { cryptoFramework } from '@kit.CryptoArchitectureKit';
import { util } from '@kit.ArkTS';
import { BilibiliResolution, resolveBilibili } from './BilibiliResolver';
import { BilibiliCredentialStore } from './BilibiliCredentialStore';

const TRUSTED_ORIGIN = 'https://zviewer.local';
const BILIBILI_REFERER = 'https://www.bilibili.com';
const BILIBILI_USER_AGENT = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36';

interface QrGenerateData { url: string; qrcode_key: string; }
interface QrPollData { code: number; message: string; url: string; }
interface NavData { isLogin: boolean; uname: string; vipStatus: number; }
interface NativeUser { name: string; vipStatus: number; valid: boolean; }

interface QrGeneratePayload {
  code: number;
  message: string;
  data?: QrGenerateData;
}

interface QrPollPayload {
  data?: QrPollData;
}

interface NavPayload {
  data?: NavData;
}

export interface NativeProxyStatus {
  supported: boolean;
  ready: boolean;
  loggedIn: boolean;
  proxyUrl: string;
  sessionVersion: number;
  user?: NativeUser;
}

export interface NativeQrSession {
  qrcodeKey: string;
  qrUrl: string;
}

export interface NativeQrPoll {
  status: number;
  message: string;
  loggedIn: boolean;
  proxyStatus?: NativeProxyStatus;
}

function bodyText(response: http.HttpResponse): string {
  return typeof response.result === 'string' ? response.result : JSON.stringify(response.result);
}

async function biliGet(url: string, cookie: string = '', maxRedirects: number = 5,
  receivedCookies?: Map<string, string>): Promise<http.HttpResponse> {
  const request = http.createHttp();
  try {
    if (receivedCookies) {
      request.on('headersReceive', (headers: Object) => {
        addCookies(receivedCookies, headerValue(headers as Record<string, string>, 'set-cookie'));
      });
    }
    const headers: Record<string, string> = {
      'User-Agent': BILIBILI_USER_AGENT,
      'Referer': BILIBILI_REFERER,
    };
    if (cookie !== '') headers['Cookie'] = cookie;
    return await request.request(url, {
      method: http.RequestMethod.GET,
      header: headers,
      maxRedirects: maxRedirects,
      usingCache: false,
      connectTimeout: 10000,
      readTimeout: 10000,
    });
  } finally {
    request.destroy();
  }
}

function addCookies(jar: Map<string, string>, raw: string): void {
  const names = ['SESSDATA', 'bili_jct', 'DedeUserID', 'DedeUserID__ckMd5', 'sid', 'buvid3'];
  for (const name of names) {
    const pattern = new RegExp(`(?:^|[;,\\n]\\s*)${name}=([^;,\\s]+)`);
    const match = raw.match(pattern);
    if (match !== null && match[1] !== '') jar.set(name, match[1]);
  }
}

function cookieString(jar: Map<string, string>): string {
  const parts: string[] = [];
  jar.forEach((value: string, name: string) => parts.push(`${name}=${value}`));
  return parts.join('; ');
}

function queryValue(raw: string, key: string): string {
  const question = raw.indexOf('?');
  if (question < 0) return '';
  for (const pair of raw.slice(question + 1).split('&')) {
    const equal = pair.indexOf('=');
    if (equal < 0) continue;
    if (decodeURIComponent(pair.slice(0, equal)) === key) return decodeURIComponent(pair.slice(equal + 1));
  }
  return '';
}

function allowedCdn(raw: string): boolean {
  const match = raw.match(/^https?:\/\/([^/?#]+)/i);
  if (!match) return false;
  const authority = match[1].toLowerCase();
  if (authority.includes('@')) return false;
  const host = authority.split(':')[0];
  const port = authority.split(':')[1] || '';
  if (port !== '' && port !== '80' && port !== '443' && port !== '8082') return false;
  return host.endsWith('.bilivideo.com') || host.endsWith('.bilivideo.cn') || host.endsWith('.bilivideo.net');
}

function trustedMediaCandidates(primary: string, backups: string[]): string[] {
  const result: string[] = [];
  for (const url of [primary, ...backups]) {
    if (!allowedCdn(url)) continue;
    const cleaned = removeNbsParameter(url);
    if (!result.includes(cleaned)) result.push(cleaned);
  }
  return result;
}

function removeNbsParameter(url: string): string {
  const question = url.indexOf('?');
  if (question < 0) return url;
  const query = url.slice(question + 1).split('&').filter((part: string) => part.split('=')[0].toLowerCase() !== 'nbs');
  return query.length > 0 ? `${url.slice(0, question)}?${query.join('&')}` : url.slice(0, question);
}

function allowedBilibiliSso(raw: string): boolean {
  const match = raw.match(/^https:\/\/([^/?#]+)/i);
  if (!match || match[1].includes('@')) return false;
  const authority = match[1].toLowerCase();
  const host = authority.split(':')[0];
  const port = authority.split(':')[1] || '';
  return (port === '' || port === '443') &&
    (host === 'bilibili.com' || host.endsWith('.bilibili.com') || host === 'passport.biligame.com');
}

function headerValue(headers: Record<string, string>, name: string): string {
  for (const key of Object.keys(headers)) if (key.toLowerCase() === name) return String(headers[key]);
  return '';
}

function randomPath(): string {
  const bytes = cryptoFramework.createRandom().generateRandomSync(24).data;
  let value = '';
  for (let i = 0; i < bytes.length; i++) {
    value += bytes[i].toString(16).padStart(2, '0');
  }
  return value;
}

function ascii(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let value = '';
  for (let i = 0; i < bytes.length; i++) value += String.fromCharCode(bytes[i]);
  return value;
}

export class BilibiliLocalProxy {
  private server: socket.TCPSocketServer | null = null;
  private baseUrl = '';
  private port = 0;
  private cookie = '';
  private qrKey = '';
  private sessionVersion = 0;
  private userName = '';
  private vipStatus = 0;
  private targets = new Map<string, string[]>();
  private credentials = new BilibiliCredentialStore();
  private restored = false;

  status(): NativeProxyStatus {
    const status: NativeProxyStatus = {
      supported: true,
      ready: this.server !== null,
      loggedIn: this.cookie !== '',
      proxyUrl: this.baseUrl,
      sessionVersion: this.sessionVersion,
    };
    if (this.cookie !== '') status.user = { name: this.userName, vipStatus: this.vipStatus, valid: true };
    return status;
  }

  async createQr(): Promise<NativeQrSession> {
    const response = await biliGet('https://passport.bilibili.com/x/passport-login/web/qrcode/generate');
    if (response.responseCode !== 200) throw new Error(`B 站二维码请求失败 (${response.responseCode})`);
    const payload = JSON.parse(bodyText(response)) as QrGeneratePayload;
    if (payload.code !== 0 || !payload.data?.qrcode_key || !payload.data.url) {
      throw new Error(payload.message || 'B 站二维码无效');
    }
    this.qrKey = payload.data.qrcode_key;
    return { qrcodeKey: this.qrKey, qrUrl: payload.data.url };
  }

  cancelQr(): void { this.qrKey = ''; }

  async pollQr(key: string): Promise<NativeQrPoll> {
    if (!key || key !== this.qrKey) throw new Error('二维码会话已取消');
    const response = await biliGet(`https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=${encodeURIComponent(key)}`);
    if (response.responseCode !== 200) throw new Error(`B 站扫码状态请求失败 (${response.responseCode})`);
    const data = (JSON.parse(bodyText(response)) as QrPollPayload).data;
    if (!data) throw new Error('B 站扫码状态无效');
    if (data.code === 86038) return { status: 3, message: data.message, loggedIn: false };
    if (data.code === 86090) return { status: 1, message: data.message, loggedIn: false };
    if (data.code !== 0 || !data.url) return { status: 0, message: data.message, loggedIn: false };
    const cookie = await this.fetchSsoCookie(data.url);
    if (!cookie) throw new Error('已确认登录，但未取得有效 B 站凭据');
    const nav = await biliGet('https://api.bilibili.com/x/web-interface/nav', cookie);
    const payload = JSON.parse(bodyText(nav)) as NavPayload;
    if (!payload.data?.isLogin) throw new Error('B 站登录校验失败');
    await this.credentials.save(cookie);
    this.cookie = cookie;
    this.userName = payload.data.uname;
    this.vipStatus = payload.data.vipStatus;
    this.sessionVersion++;
    this.targets.clear();
    this.qrKey = '';
    return { status: 2, message: '登录成功', loggedIn: true, proxyStatus: this.status() };
  }

  async logout(): Promise<NativeProxyStatus> {
    await this.credentials.clear();
    this.cookie = '';
    this.userName = '';
    this.vipStatus = 0;
    this.sessionVersion++;
    this.targets.clear();
    return this.status();
  }

  private async fetchSsoCookie(firstUrl: string): Promise<string> {
    const jar = new Map<string, string>();
    // Older QR responses carry the session in the top-level URL query. Newer
    // crossDomain responses carry a one-time ticket and set cookies on GET.
    for (const name of ['SESSDATA', 'bili_jct', 'DedeUserID', 'DedeUserID__ckMd5', 'sid']) {
      const value = queryValue(firstUrl, name);
      if (value !== '') jar.set(name, value);
    }
    if (jar.has('SESSDATA') && jar.has('bili_jct') && jar.has('DedeUserID')) return cookieString(jar);
    if (!allowedBilibiliSso(firstUrl)) return '';
    try {
      // HarmonyOS reports 2300047 for maxRedirects=0 instead of returning a
      // 302 response. Capture each response's Set-Cookie while it follows SSO.
      const response = await biliGet(firstUrl, '', 10, jar);
      addCookies(jar, response.cookies);
      addCookies(jar, headerValue(response.header as Record<string, string>, 'set-cookie'));
    } catch (error) {
      // A redirect chain may exceed the limit after the session was issued.
      if (!jar.has('SESSDATA') || !jar.has('bili_jct') || !jar.has('DedeUserID')) {
        throw new Error(error instanceof Error ? error.message : String(error));
      }
    }
    return jar.has('SESSDATA') && jar.has('bili_jct') && jar.has('DedeUserID') ? cookieString(jar) : '';
  }

  async start(): Promise<string> {
    if (this.server !== null) return this.baseUrl;
    const server = socket.constructTCPSocketServerInstance();
    await server.listen({ address: '127.0.0.1', port: 0 });
    const address = await server.getLocalAddress();
    this.port = address.port ?? 0;
    if (this.port === 0) throw new Error('Loopback port unavailable');
    this.baseUrl = `http://127.0.0.1:${this.port}/${randomPath()}`;
    server.on('connect', (connection: socket.TCPSocketConnection) => this.accept(connection));
    this.server = server;
    if (!this.restored) {
      this.restored = true;
      const saved = await this.credentials.load();
      if (saved !== '') {
        try {
          const nav = await biliGet('https://api.bilibili.com/x/web-interface/nav', saved);
          const payload = JSON.parse(bodyText(nav)) as NavPayload;
          if (!payload.data?.isLogin) throw new Error('Saved Bilibili session expired');
          this.cookie = saved;
          this.userName = payload.data.uname;
          this.vipStatus = payload.data.vipStatus;
          this.sessionVersion++;
        } catch (_error) {
          await this.credentials.clear();
        }
      }
    }
    return this.baseUrl;
  }

  private accept(connection: socket.TCPSocketConnection): void {
    let raw = '';
    let done = false;
    connection.on('message', (message: socket.SocketMessageInfo) => {
      if (done) return;
      raw += ascii(message.message);
      if (raw.length > 8192) {
        done = true;
        this.reply(connection, 431, 'Request Header Fields Too Large', '');
        return;
      }
      if (!raw.includes('\r\n\r\n')) return;
      done = true;
      this.handle(connection, raw);
    });
  }

  private handle(connection: socket.TCPSocketConnection, raw: string): void {
    const lines = raw.split('\r\n');
    const parts = lines[0].split(' ');
    if (parts.length !== 3 || parts[2] !== 'HTTP/1.1') {
      this.reply(connection, 400, 'Bad Request', '');
      return;
    }
    let host = '';
    let origin = '';
    let range = '';
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line === '') break;
      const separator = line.indexOf(':');
      if (separator < 1) continue;
      const name = line.slice(0, separator).toLowerCase();
      const value = line.slice(separator + 1).trim();
      if (name === 'host') host = value;
      if (name === 'origin') origin = value;
      if (name === 'range') range = value;
    }
    if (host !== `127.0.0.1:${this.port}` || (origin !== '' && origin !== TRUSTED_ORIGIN)) {
      this.reply(connection, 403, 'Forbidden', '');
      return;
    }
    if (parts[0] !== 'GET' && parts[0] !== 'HEAD' && parts[0] !== 'OPTIONS') {
      this.reply(connection, 405, 'Method Not Allowed', '');
      return;
    }
    const basePath = this.baseUrl.slice(this.baseUrl.indexOf('/', 8));
    const path = parts[1].split('?')[0];
    if (path !== `${basePath}/health` && path !== `${basePath}/resolve` && path !== `${basePath}/proxy`) {
      this.reply(connection, 404, 'Not Found', '');
      return;
    }
    if (parts[0] === 'OPTIONS') {
      this.reply(connection, 204, 'No Content', '', origin);
    } else if (path === `${basePath}/health`) {
      this.reply(connection, 200, 'OK', parts[0] === 'HEAD' ? '' : '{"ok":true}', origin);
    } else if (path === `${basePath}/resolve` && parts[0] === 'GET') {
      this.resolveEndpoint(connection, parts[1], origin);
    } else if (path === `${basePath}/proxy`) {
      this.proxyEndpoint(connection, queryValue(parts[1], 'url'), range, parts[0], origin);
    } else {
      this.reply(connection, 501, 'Not Implemented', '{"success":false,"message":"媒体代理尚未就绪"}', origin);
    }
  }

  private async proxyEndpoint(connection: socket.TCPSocketConnection, target: string, range: string, method: string, origin: string): Promise<void> {
    const backups = this.targets.get(target);
    if (!backups || !allowedCdn(target)) {
      this.reply(connection, 403, 'Forbidden', '');
      return;
    }
    if (range !== '' && !/^bytes=\d+-\d*$/.test(range)) {
      this.reply(connection, 416, 'Range Not Satisfiable', '');
      return;
    }
    const candidates = [target, ...backups];
    for (const candidate of candidates) {
      if (!allowedCdn(candidate)) continue;
      const request = http.createHttp();
      let sentHeaders = false;
      let rejected = false;
      let queuedBytes = 0;
      let receivedBytes = 0;
      let expectedBytes = 0;
      let pendingBeforeHeaders: ArrayBuffer[] = [];
      let chain: Promise<void> = Promise.resolve();
      const forwardChunk = (chunk: ArrayBuffer): void => {
        queuedBytes += chunk.byteLength;
        if (queuedBytes > 16 * 1024 * 1024) {
          rejected = true;
          request.destroy();
          return;
        }
        chain = chain.then(async () => {
          if (method !== 'HEAD') await connection.send({ data: chunk });
          queuedBytes -= chunk.byteLength;
        });
      };
      try {
        request.on('headersReceive', (rawHeaders: Object) => {
          const headers = rawHeaders as Record<string, string>;
          const denyReason = headerValue(headers, 'deny-reason');
          const statusLine = headerValue(headers, 'status-line');
          const match = statusLine.match(/\s(\d{3})(?:\s|$)/);
          const status = match ? Number(match[1]) : range !== '' ? 206 : 200;
          if (status === 403 || status >= 500 || status >= 300 && status < 400) {
            rejected = true;
            return;
          }
          const contentType = headerValue(headers, 'content-type') || 'application/octet-stream';
          const contentLength = headerValue(headers, 'content-length');
          const contentRange = headerValue(headers, 'content-range');
          expectedBytes = Number(contentLength) || 0;
          if (denyReason !== '' || (range !== '' && method !== 'HEAD' && contentRange === '') ||
            contentType.startsWith('text/') || contentType.includes('xml')) {
            rejected = true;
            return;
          }
          const transfer = contentLength !== '' ? `Content-Length: ${contentLength}\r\n` : '';
          const cors = origin === TRUSTED_ORIGIN ? `Access-Control-Allow-Origin: ${TRUSTED_ORIGIN}\r\nVary: Origin\r\n` : '';
          const header = `HTTP/1.1 ${status} OK\r\nContent-Type: ${contentType}\r\n${transfer}${contentRange ? `Content-Range: ${contentRange}\r\n` : ''}Accept-Ranges: bytes\r\nAccess-Control-Expose-Headers: Content-Range, Accept-Ranges, Content-Length\r\nConnection: close\r\n${cors}\r\n`;
          sentHeaders = true;
          chain = chain.then(() => connection.send({ data: header }));
          for (const chunk of pendingBeforeHeaders) forwardChunk(chunk);
          pendingBeforeHeaders = [];
        });
        request.on('dataReceive', (data: ArrayBuffer) => {
          if (rejected) return;
          receivedBytes += data.byteLength;
          if (!sentHeaders) {
            if (receivedBytes > 16 * 1024 * 1024) {
              rejected = true;
              request.destroy();
              return;
            }
            pendingBeforeHeaders.push(data);
            return;
          }
          forwardChunk(data);
        });
        const header: Record<string, string> = {
          'User-Agent': BILIBILI_USER_AGENT,
          'Referer': BILIBILI_REFERER,
          'Origin': 'https://www.bilibili.com',
        };
        if (range !== '') header['Range'] = range;
        const status = await request.requestInStream(candidate, {
          method: method === 'HEAD' ? http.RequestMethod.HEAD : http.RequestMethod.GET,
          header,
          maxRedirects: 0,
          usingCache: false,
          connectTimeout: 10000,
          readTimeout: 30000,
        });
        await chain;
        if (!rejected && expectedBytes > 0 && receivedBytes !== expectedBytes) throw new Error('Incomplete CDN stream');
        if (rejected || status === 403 || status >= 500 || status >= 300 && status < 400) continue;
        if (!sentHeaders) throw new Error('CDN response missing headers');
        await connection.close();
        request.destroy();
        return;
      } catch (_error) {
        if (sentHeaders) {
          await connection.close().catch(() => {});
          request.destroy();
          return;
        }
      }
      request.destroy();
    }
    this.reply(connection, 502, 'Bad Gateway', '{"success":false,"message":"CDN 不可用"}', origin);
  }

  private async resolveEndpoint(connection: socket.TCPSocketConnection, path: string, origin: string): Promise<void> {
    try {
      const bvid = queryValue(path, 'bvid');
      const cid = Number(queryValue(path, 'cid')) || 0;
      const qn = Number(queryValue(path, 'qn')) || 0;
      const fallbackQn = Number(queryValue(path, 'fallbackQn')) || 0;
      const mode = queryValue(path, 'qualityMode') || 'autoMax';
      const epoch = this.sessionVersion;
      const result: BilibiliResolution = await resolveBilibili(bvid, cid, qn, mode, fallbackQn, this.cookie, this.vipStatus);
      if (epoch !== this.sessionVersion) throw new Error('账号已切换，请重新解析');
      const videoCandidates = trustedMediaCandidates(result.videoUrl, result.videoBackupUrls);
      const audioCandidates = result.audioUrl === '' ? [] : trustedMediaCandidates(result.audioUrl, result.audioBackupUrls);
      if (videoCandidates.length === 0 || (result.audioUrl !== '' && audioCandidates.length === 0)) {
        throw new Error('B 站没有返回受信任的媒体节点');
      }
      result.videoUrl = videoCandidates[0];
      result.videoBackupUrls = videoCandidates.slice(1);
      if (audioCandidates.length > 0) {
        result.audioUrl = audioCandidates[0];
        result.audioBackupUrls = audioCandidates.slice(1);
      }
      this.targets.set(result.videoUrl, result.videoBackupUrls);
      if (result.audioUrl !== '') this.targets.set(result.audioUrl, result.audioBackupUrls);
      this.reply(connection, 200, 'OK', JSON.stringify(result), origin);
    } catch (error) {
      const message = error instanceof Error ? error.message : '解析失败';
      this.reply(connection, 502, 'Bad Gateway', JSON.stringify({ success: false, message }), origin);
    }
  }

  private reply(connection: socket.TCPSocketConnection, status: number, reason: string, body: string, origin: string = ''): void {
    const cors = origin === TRUSTED_ORIGIN ? `Access-Control-Allow-Origin: ${TRUSTED_ORIGIN}\r\nVary: Origin\r\n` : '';
    const length = new util.TextEncoder().encode(body).length;
    const payload = `HTTP/1.1 ${status} ${reason}\r\nContent-Type: application/json\r\nContent-Length: ${length}\r\nConnection: close\r\nAccess-Control-Allow-Methods: GET, HEAD, OPTIONS\r\nAccess-Control-Allow-Headers: Range, Content-Type\r\nAccess-Control-Expose-Headers: Content-Range, Accept-Ranges, Content-Length\r\n${cors}\r\n${body}`;
    connection.send({ data: payload }).then(() => connection.close()).catch(() => connection.close());
  }
}
