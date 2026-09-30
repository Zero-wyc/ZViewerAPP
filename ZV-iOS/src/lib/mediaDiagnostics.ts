import { nativeVideoSource, type PlaybackSource } from './media.ts';

export type RangeCheck = { name: string; status: number; valid: boolean; bodyChecked: boolean };
export type MediaProbe = {
  category: 'ready' | 'auth' | 'network' | 'server' | 'format' | 'unknown';
  source: 'server' | 'external';
  status?: number;
  contentType?: string;
  size?: number;
  acceptsRanges?: boolean;
  checks?: RangeCheck[];
  signature?: 'mp4' | 'mkv' | 'hls' | 'unknown';
  redirected?: boolean;
  detail: string;
};

export function classifyPlayerError(message: string): MediaProbe['category'] {
  if (/\b(401|403)\b|unauthori[sz]ed|forbidden/i.test(message)) return 'auth';
  if (/network|timed?\s*out|offline|internet|connection|dns|ssl|tls|certificate|ats/i.test(message)) return 'network';
  if (/\b(404|416|500|502|503|504)\b/.test(message)) return 'server';
  if (/format|codec|decod|container|unsupported|不支持|分离音轨/i.test(message)) return 'format';
  return 'unknown';
}

export function safeMediaError(message: string): string {
  return message.replace(/\bBearer\s+\S+/gi, 'Bearer [已隐藏]')
    .replace(/https?:\/\/[^\s'"<>]+/gi, '[媒体地址已隐藏]')
    .replace(/\b(cookie|authorization|token|password)\s*[:=]\s*[^\s,;]+/gi, '$1=[已隐藏]')
    .slice(0, 240);
}

function identifyMedia(bytes: Uint8Array | null): MediaProbe['signature'] {
  if (!bytes) return 'unknown';
  if (bytes.length >= 8 && String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp') return 'mp4';
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'mkv';
  if (String.fromCharCode(...bytes.slice(0, 7)) === '#EXTM3U') return 'hls';
  return 'unknown';
}

// Large/open ranges check headers only, then cancel immediately. Never download
// a whole movie for diagnostics, even when an upstream ignores Range.
async function rangeCheck(uri: string, headers: Record<string, string>, name: string,
  range: string, size: number, begin: number, end: number, signal?: AbortSignal, allowShort = false) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, 10000);
  try {
    const response = await fetch(uri, { headers: { ...headers, Range: range }, signal: controller.signal });
    const invalid = begin >= size;
    const expectedRange = invalid ? `bytes */${size}` : `bytes ${begin}-${end}/${size}`;
    const rawLength = response.headers.get('content-length');
    const actual = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range') || '');
    const actualEnd = actual ? Number(actual[2]) : end;
    const shortValid = allowShort && !!actual && Number(actual[1]) === begin && actualEnd >= begin && actualEnd <= end && Number(actual[3]) === size;
    let valid = response.status === (invalid ? 416 : 206)
      && (response.headers.get('content-range') === expectedRange || (!invalid && shortValid))
      && (invalid || (rawLength !== null && Number(rawLength) === actualEnd - begin + 1));
    const bodyChecked = valid && !invalid && actualEnd - begin < 64;
    const bytes = bodyChecked ? new Uint8Array(await response.arrayBuffer()) : null;
    if (bytes) valid = bytes.length === actualEnd - begin + 1;
    return { check: { name, status: response.status, valid, bodyChecked }, bytes, actualEnd };
  } finally {
    cancel(); clearTimeout(timeout); signal?.removeEventListener('abort', cancel);
  }
}

export async function probeMedia(source: PlaybackSource, serverUrl: string, token: string,
  signal?: AbortSignal): Promise<MediaProbe> {
  const video = nativeVideoSource(source, serverUrl, token);
  const base = { source: video.serverApi ? 'server' as const : 'external' as const };
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, 10000);
  try {
    const response = await fetch(video.uri, { method: 'HEAD', headers: video.headers, signal: controller.signal });
    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim();
    const rawSize = response.headers.get('content-length');
    const size = rawSize === null ? 0 : Number(rawSize);
    if (!response.ok) return {
      ...base, category: response.status === 401 || response.status === 403 ? 'auth' : 'server',
      status: response.status, detail: `媒体服务返回 HTTP ${response.status}`,
    };
    if (contentType?.includes('html')) return { ...base, status: response.status, contentType, category: 'format', detail: '媒体返回了网页内容' };
    if (video.contentType === 'hls') return {
      ...base, category: 'ready', status: response.status, contentType, signature: 'hls',
      detail: 'HLS 清单可访问；分片、编码与播放仍需播放器验收（清单不要求 Range）',
    };
    if (!Number.isSafeInteger(size) || size <= 0) return { ...base, category: 'server', status: response.status, contentType, detail: 'HEAD 未返回有效文件长度，无法验证完整 Range' };
    clearTimeout(timeout);
    const middle = Math.floor(size / 2);
    const specs: [string, string, number, number][] = [
      ['首段', 'bytes=0-31', 0, Math.min(31, size - 1)],
      ['中段', `bytes=${middle}-${Math.min(middle + 31, size - 1)}`, middle, Math.min(middle + 31, size - 1)],
      ['尾段', 'bytes=-32', Math.max(0, size - 32), size - 1],
      ['开放范围', `bytes=${middle}-`, middle, size - 1],
      ['跨 8 MiB', `bytes=0-${Math.min(9 * 1024 * 1024 - 1, size - 1)}`, 0, Math.min(9 * 1024 * 1024 - 1, size - 1)],
      ['越界', `bytes=${size}-`, size, size],
    ];
    const checks: RangeCheck[] = [];
    let signature: MediaProbe['signature'] = 'unknown';
    for (const [name, range, begin, end] of specs) {
      const result = await rangeCheck(video.uri, video.headers, name, range, size, begin, end, controller.signal, true);
      checks.push(result.check);
      if (name === '首段') signature = identifyMedia(result.bytes);
      if (name === '跨 8 MiB' && result.check.valid && result.actualEnd < end) {
        const next = result.actualEnd + 1;
        const continuation = await rangeCheck(video.uri, video.headers, '分片续读', `bytes=${next}-${Math.min(next + 31, size - 1)}`, size, next, Math.min(next + 31, size - 1), controller.signal);
        checks.push(continuation.check);
      }
    }
    const mkv = contentType === 'video/x-matroska' || signature === 'mkv';
    const auth = checks.some(check => check.status === 401 || check.status === 403);
    const rangesOk = checks.every(check => check.valid);
    return {
      ...base, category: auth ? 'auth' : !rangesOk ? 'server' : 'ready',
      status: response.status, contentType, size, checks, signature,
      acceptsRanges: /bytes/i.test(response.headers.get('accept-ranges') || ''), redirected: response.redirected,
      detail: auth ? '分段媒体鉴权失败' : !rangesOk ? 'Range 响应无法可靠续读，请检查媒体路径及响应头' :
        `VLC 分段读取条件检查通过（允许有界 206，核对范围和续读）${mkv ? '；检测到 MKV' : ''}；仍需真机验证解码、拖动和持续播放`,
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { ...base, category: 'network', detail: error instanceof Error && error.name === 'AbortError' ? '媒体请求超时' : '媒体请求未到达服务器；检查网络或证书' };
  } finally {
    cancel(); clearTimeout(timeout); signal?.removeEventListener('abort', cancel);
  }
}
