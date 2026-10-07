import { http, socket } from '@kit.NetworkKit';
import { util, url } from '@kit.ArkTS';
import { cryptoFramework } from '@kit.CryptoArchitectureKit';
import { BusinessError } from '@kit.BasicServicesKit';

export interface ConnectionPolicy { url: string; allowUntrustedCertificate: boolean; }
export interface ConnectionResult { url: string; }
export interface ProbeResult { ok: boolean; code: string; status?: number; }
interface PublicSettings { roomCreationMode?: string; registrationMode?: string; }
interface PublicResponse { success?: boolean; settings?: PublicSettings; }
interface CookieEntry { name: string; value: string; path: string; expires: number; }

const LOCAL_ORIGIN = 'https://zviewer.local';
const MAX_HEADER = 32768;
const MAX_PENDING = 4 * 1024 * 1024;

function joinBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length); out.set(a); out.set(b, a.length); return out;
}
function headerEnd(data: Uint8Array): number {
  for (let i = 0; i + 3 < data.length; i++) if (data[i] === 13 && data[i + 1] === 10 && data[i + 2] === 13 && data[i + 3] === 10) return i + 4;
  return -1;
}
function text(data: Uint8Array): string { return new util.TextDecoder('utf-8').decodeWithStream(data); }
function bytes(value: string): Uint8Array { return new util.TextEncoder().encode(value); }
function buffer(data: Uint8Array): ArrayBuffer { return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer; }

/** Raw HTTP/1.1 tunnel to one immutable TLS origin, including streaming and WS upgrade. */
class ConnectionTunnel {
  private local: socket.TCPSocketConnection;
  private target: url.URL;
  private localBase: string;
  private prefix: string;
  private cookies: Map<string, CookieEntry>;
  private onClosed: () => void;
  private remote: socket.TLSSocket = socket.constructTLSSocketInstance();
  private initial = new Uint8Array(0);
  private responseHeader = new Uint8Array(0);
  private ready: boolean = false;
  private responseReady: boolean = false;
  private closed: boolean = false;
  private pending: number = 0;
  private responsePending: number = 0;
  private outbound: Promise<void> = Promise.resolve();
  private inbound: Promise<void> = Promise.resolve();
  private path: string = '/';
  private origin: string = '';
  private method: string = '';
  private expectedBody: number = -1;
  private receivedBody: number = 0;
  private chunked: boolean = false;
  private chunkRemaining: number = 0;
  private chunkLine: string = '';
  private chunkTrailers: boolean = false;
  private bodyComplete: boolean = false;

  constructor(local: socket.TCPSocketConnection, target: url.URL,
    localBase: string, prefix: string, cookies: Map<string, CookieEntry>, onClosed: () => void) {
    this.local = local; this.target = target; this.localBase = localBase; this.prefix = prefix;
    this.cookies = cookies; this.onClosed = onClosed;
    local.on('message', (event: socket.SocketMessageInfo) => this.receive(new Uint8Array(event.message)));
    local.on('close', () => this.close());
    local.on('error', () => this.close());
    setTimeout(() => { if (!this.ready && !this.closed) this.fail(); }, 10000);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.local.close().catch(() => {}); this.remote.close().catch(() => {}); this.onClosed();
  }
  private fail(): void {
    if (this.closed) return;
    if (this.responseReady) { this.endRemote(); return; }
    this.local.send({ data: 'HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n' })
      .then(() => this.close()).catch(() => this.close());
  }
  private endRemote(): void {
    // ArkTS may deliver close before queued TLS message callbacks. Drain after
    // the callbacks and the local sends, instead of truncating the final chunk.
    setTimeout(() => { this.inbound.then(() => this.close()).catch(() => this.close()); }, 100);
  }
  private receive(data: Uint8Array): void {
    if (this.closed) return;
    if (this.ready) { this.send(data); return; }
    this.initial = joinBytes(this.initial, data);
    if (this.initial.length > MAX_PENDING) { this.close(); return; }
    const end = headerEnd(this.initial);
    if (end < 0) { if (this.initial.length > MAX_HEADER) this.close(); return; }
    const head = text(this.initial.slice(0, end));
    const lines = head.trimEnd().split('\r\n'); const request = lines[0].split(' ');
    if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(request[0]) ||
      !request[1]?.startsWith(this.prefix + '/')) { this.close(); return; }
    this.path = request[1].slice(this.prefix.length);
    this.method = request[0];
    for (const line of lines.slice(1)) {
      const split = line.indexOf(':'); const name = line.slice(0, split).toLowerCase(); const value = line.slice(split + 1).trim();
      if (name === 'origin') this.origin = value;
      if (name === 'host' && value !== new url.URL(this.localBase).host) { this.close(); return; }
    }
    if (this.origin !== '' && this.origin !== LOCAL_ORIGIN) { this.close(); return; }
    if (request[0] === 'OPTIONS') {
      this.local.send({ data: `HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: ${LOCAL_ORIGIN}\r\nAccess-Control-Allow-Credentials: true\r\nAccess-Control-Allow-Methods: GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS\r\nAccess-Control-Allow-Headers: Authorization, Content-Type, Range, Accept, Cache-Control\r\nContent-Length: 0\r\nConnection: close\r\n\r\n` })
        .then(() => this.close()).catch(() => this.close()); return;
    }
    // Mark before async connect so request body chunks join the ordered send queue.
    this.ready = true;
    let forwarded = `${request[0]} ${this.path} HTTP/1.1\r\nHost: ${this.target.host}\r\n`;
    let upgrade = false;
    for (const line of lines.slice(1)) {
      const name = line.slice(0, line.indexOf(':')).toLowerCase();
      if (name === 'upgrade') upgrade = true;
      if (['host', 'origin', 'referer', 'cookie', 'connection', 'accept-encoding', 'x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-for'].includes(name)) continue;
      forwarded += line + '\r\n';
    }
    if (this.origin !== '') forwarded += `Origin: ${this.target.origin}\r\n`;
    forwarded += `Referer: ${this.target.origin}/\r\nAccept-Encoding: identity\r\nConnection: ${upgrade ? 'Upgrade' : 'keep-alive'}\r\n`;
    const cookieValues: string[] = [];
    for (const cookie of this.cookies.values()) {
      if (cookie.expires > Date.now() && (this.path.split('?')[0] === cookie.path || this.path.startsWith(cookie.path.endsWith('/') ? cookie.path : cookie.path + '/'))) cookieValues.push(`${cookie.name}=${cookie.value}`);
    }
    if (cookieValues.length > 0) forwarded += `Cookie: ${cookieValues.join('; ')}\r\n`;
    const body = this.initial.slice(end); this.initial = new Uint8Array(0);
    this.outbound = this.remote.bind({ address: this.target.hostname.includes(':') ? '::' : '0.0.0.0', port: 0,
      family: this.target.hostname.includes(':') ? 2 : 1 }).then(() => {
      // The native TLS instance is allocated by bind; earlier listeners are ignored.
      this.remote.on('message', (event: socket.SocketMessageInfo) => this.reply(new Uint8Array(event.message)));
      this.remote.on('close', () => this.endRemote());
      this.remote.on('error', () => this.fail());
      return this.remote.connect({ address: { address: this.target.hostname.replace(/^\[|\]$/g, ''), port: Number(this.target.port || '443') },
      secureOptions: { protocols: [socket.Protocol.TLSv12, socket.Protocol.TLSv13] },
      skipRemoteValidation: true, ALPNProtocols: ['http/1.1'], timeout: 10000 }); });
    this.send(joinBytes(bytes(forwarded + '\r\n'), body));
  }
  private send(data: Uint8Array): void {
    this.pending += data.length;
    if (this.pending > MAX_PENDING) { this.close(); return; }
    this.outbound = this.outbound.then(async () => { if (!this.closed) await this.remote.send(buffer(data)); this.pending -= data.length; })
      .catch(() => this.fail());
  }
  private storeCookie(line: string): void {
    const fields = line.slice(line.indexOf(':') + 1).trim().split(';');
    const pair = fields[0]; const equal = pair.indexOf('='); if (equal < 1) return;
    const entry: CookieEntry = { name: pair.slice(0, equal), value: pair.slice(equal + 1), path: this.path.slice(0, this.path.lastIndexOf('/') + 1) || '/', expires: Number.MAX_SAFE_INTEGER };
    for (const field of fields.slice(1)) {
      const split = field.indexOf('='); const key = field.slice(0, split).trim().toLowerCase(); const value = field.slice(split + 1).trim();
      if (key === 'domain' && value.replace(/^\./, '').toLowerCase() !== this.target.hostname.toLowerCase()) return;
      if (key === 'path' && value.startsWith('/')) entry.path = value;
      if (key === 'max-age') entry.expires = Date.now() + Number(value) * 1000;
      if (key === 'expires' && Number.isFinite(Date.parse(value))) entry.expires = Date.parse(value);
    }
    this.cookies.set(entry.name + entry.path, entry);
  }
  private reply(data: Uint8Array): void {
    if (this.closed) return;
    if (!this.responseReady) {
      this.responseHeader = joinBytes(this.responseHeader, data);
      const end = headerEnd(this.responseHeader);
      if (end < 0) { if (this.responseHeader.length > MAX_HEADER) this.close(); return; }
      const lines = text(this.responseHeader.slice(0, end)).trimEnd().split('\r\n');
      if (/^HTTP\/1\.[01] 1\d\d /.test(lines[0]) && !lines[0].startsWith('HTTP/1.1 101 ')) {
        const rest = this.responseHeader.slice(end); this.responseHeader = new Uint8Array(0);
        if (rest.length > 0) this.reply(rest); return;
      }
      let rewritten = lines[0] + '\r\n';
      const status = Number(lines[0].split(' ')[1]);
      if (this.method === 'HEAD' || status === 204 || status === 304) this.expectedBody = 0;
      for (const line of lines.slice(1)) {
        const key = line.slice(0, line.indexOf(':')).toLowerCase();
        const value = line.slice(line.indexOf(':') + 1).trim();
        if (key === 'content-length' && this.expectedBody !== 0) this.expectedBody = Number(value);
        if (key === 'transfer-encoding' && /chunked/i.test(value)) this.chunked = true;
        if (key === 'connection' && status !== 101) continue;
        if (key === 'set-cookie') { this.storeCookie(line); continue; }
        if (key.startsWith('access-control-')) continue;
        if (key === 'location') {
          const value = line.slice(line.indexOf(':') + 1).trim();
          const destination = new url.URL(value, this.target.origin + this.path);
          if (destination.origin === this.target.origin) { rewritten += `Location: ${this.localBase}${destination.pathname}${destination.search}\r\n`; continue; }
          if (destination.protocol === 'http:' && destination.host === this.target.host) { this.fail(); return; }
        }
        rewritten += line + '\r\n';
      }
      if (this.origin !== '') rewritten += `Access-Control-Allow-Origin: ${LOCAL_ORIGIN}\r\nAccess-Control-Allow-Credentials: true\r\nVary: Origin\r\n`;
      if (status !== 101) rewritten += 'Connection: close\r\n';
      rewritten += 'Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges, Content-Type\r\n\r\n';
      const body = this.responseHeader.slice(end);
      if (status !== 101) this.countBody(body);
      data = joinBytes(bytes(rewritten), body); this.responseHeader = new Uint8Array(0); this.responseReady = true;
    } else this.countBody(data);
    this.responsePending += data.length;
    if (this.responsePending > 32 * 1024 * 1024) { this.close(); return; }
    this.inbound = this.inbound.then(async () => { if (!this.closed) await this.local.send({ data: buffer(data) }); this.responsePending -= data.length; }).catch(() => this.close());
    if (this.bodyComplete) this.inbound.then(() => this.close()).catch(() => this.close());
  }
  private countBody(data: Uint8Array): void {
    if (this.chunked) {
      let index = 0;
      while (index < data.length && !this.bodyComplete) {
        if (this.chunkRemaining > 0) { const amount = Math.min(this.chunkRemaining, data.length - index); this.chunkRemaining -= amount; index += amount; continue; }
        const value = data[index++]; this.chunkLine += String.fromCharCode(value);
        if (this.chunkLine.length > MAX_HEADER) { this.close(); return; }
        if (value !== 10) continue;
        const line = this.chunkLine.trim(); this.chunkLine = '';
        if (this.chunkTrailers) { if (line === '') this.bodyComplete = true; continue; }
        const size = Number.parseInt(line.split(';')[0], 16);
        if (!Number.isFinite(size) || size < 0) { this.close(); return; }
        if (size === 0) this.chunkTrailers = true; else this.chunkRemaining = size + 2;
      }
    } else if (this.expectedBody >= 0) {
      this.receivedBody += data.length;
      this.bodyComplete = this.receivedBody >= this.expectedBody;
    }
  }
}

export class ServerConnection {
  private server: socket.TCPSocketServer | null = null;
  private tunnels: Set<ConnectionTunnel> = new Set<ConnectionTunnel>();
  private cookies: Map<string, CookieEntry> = new Map<string, CookieEntry>();
  private generation: number = 0;

  async configure(policy: ConnectionPolicy): Promise<ConnectionResult> {
    const target = new url.URL(policy.url);
    if (!['http:', 'https:'].includes(target.protocol) || target.username !== '' || target.password !== '' || target.search !== '' || target.hash !== '') throw new Error('服务器地址无效');
    const epoch = ++this.generation;
    for (const tunnel of this.tunnels) tunnel.close(); this.tunnels.clear(); this.cookies.clear();
    const previous = this.server; this.server = null; if (previous) await previous.close();
    if (!policy.allowUntrustedCertificate) return { url: policy.url };
    if (target.protocol !== 'https:') throw new Error('证书例外仅适用于 HTTPS');
    const server = socket.constructTCPSocketServerInstance();
    await server.listen({ address: '127.0.0.1', port: 0 });
    if (epoch !== this.generation) { await server.close(); throw new Error('服务器选择已取消'); }
    const address = await server.getLocalAddress();
    const random = cryptoFramework.createRandom().generateRandomSync(24).data;
    let token = ''; for (const value of random) token += value.toString(16).padStart(2, '0');
    const prefix = '/' + token; const localBase = `http://127.0.0.1:${address.port}${prefix}`;
    server.on('connect', (local: socket.TCPSocketConnection) => {
      if (epoch !== this.generation || this.tunnels.size >= 64) { local.close().catch(() => {}); return; }
      const tunnel = new ConnectionTunnel(local, target, localBase, prefix, this.cookies, () => { this.tunnels.delete(tunnel); });
      this.tunnels.add(tunnel);
    });
    this.server = server;
    return { url: localBase + target.pathname.replace(/\/$/, '') };
  }
  async probe(raw: string): Promise<ProbeResult> {
    const request = http.createHttp();
    try {
      const response = await request.request(raw.replace(/\/$/, '') + '/api/auth/public-settings', { method: http.RequestMethod.GET, usingCache: false, connectTimeout: 6000, readTimeout: 6000, maxRedirects: 0 });
      const result = JSON.parse(typeof response.result === 'string' ? response.result : '') as PublicResponse;
      return { ok: response.responseCode === 200 && result.success === true && !!result.settings &&
        (typeof result.settings.roomCreationMode === 'string' || typeof result.settings.registrationMode === 'string'), code: 'response', status: response.responseCode };
    } catch (error) {
      const failure = error as BusinessError;
      const detail = `${failure.code} ${failure.message}`;
      if (/hostname|2300051/i.test(detail)) return { ok: false, code: 'certificate_hostname' };
      if (/expired|not yet valid/i.test(detail)) return { ok: false, code: 'certificate_invalid' };
      if (/certificate|2300060/i.test(detail)) return { ok: false, code: 'certificate_untrusted' };
      if (/2300007/.test(detail)) return { ok: false, code: 'port_unavailable' };
      // A handshake failure alone cannot justify downgrading. Confirm that the
      // same port actually serves the credential-free ZViewer HTTP endpoint.
      if (/2300035|2300999/.test(detail) && raw.startsWith('https:')) {
        const plain = await this.probe(raw.replace(/^https:/, 'http:'));
        if (plain.ok) return { ok: false, code: 'tls_unavailable' };
      }
      return { ok: false, code: 'network' };
    } finally { request.destroy(); }
  }
}
