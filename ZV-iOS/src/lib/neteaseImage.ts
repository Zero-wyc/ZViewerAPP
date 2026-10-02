export function neteaseImageUrl(source: string | null | undefined, size = 300, server?: string): string {
  if (!source) return '';
  try {
    const url = new URL(source.startsWith('//') ? `https:${source}` : source, server);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    if (url.hostname === 'music.126.net' || url.hostname.endsWith('.music.126.net')) { if (url.protocol === 'http:') url.protocol = 'https:'; url.searchParams.set('param', `${Math.min(1200, Math.max(40, size))}y${Math.min(1200, Math.max(40, size))}`); }
    return url.href;
  } catch { return ''; }
}
