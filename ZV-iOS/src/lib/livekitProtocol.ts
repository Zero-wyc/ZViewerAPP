export function voiceToken(raw: unknown): { url: string; token: string } {
  const value = raw as { success?: boolean; url?: string; token?: string };
  if (!value?.success || typeof value.url !== 'string' || typeof value.token !== 'string' || !value.token.trim()) throw new Error('服务器未返回有效语音凭证');
  let url: URL; try { url = new URL(value.url); } catch { throw new Error('服务器语音地址无效'); }
  if (!['wss:', 'ws:'].includes(url.protocol) || url.username || url.password) throw new Error('服务器语音地址无效');
  return { url: value.url, token: value.token };
}
export function adminMuted(metadata?: string) { try { return JSON.parse(metadata || '{}').adminMuted === true; } catch { return false; } }
