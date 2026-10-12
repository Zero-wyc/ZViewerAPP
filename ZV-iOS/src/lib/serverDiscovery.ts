import { normalizeServerUrl } from './server.ts';
export type ServerProbe = { ok: boolean; code: string; status?: number };
export async function selectServerUrl(input: string, probe: (url: string) => Promise<ServerProbe>): Promise<string> {
  const https = normalizeServerUrl(input);
  if (/^https?:\/\//i.test(input.trim())) return https;
  const result = await probe(https);
  if (result.ok) return https;
  if (result.code === 'tls_unavailable') {
    const candidate = new URL(https); const port = candidate.port || '443'; candidate.protocol = 'http:'; candidate.port = port;
    // The authority/explicit port must remain identical; never probe a different port.
    const http = candidate.toString().replace(/\/+$/, '');
    if ((await probe(http)).ok) return http;
  }
  if (result.code.startsWith('certificate_')) throw new Error('服务器 HTTPS 证书无效，请修复证书或使用明确配置的有效地址');
  throw new Error('无法确认服务器连接方式，请检查网络或填写完整 http:// / https:// 地址');
}
