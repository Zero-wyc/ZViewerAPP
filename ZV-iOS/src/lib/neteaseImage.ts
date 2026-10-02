export function neteaseImageUrl(source: string | null | undefined, size: number | null = 300, server?: string): string {
  if (!source) return '';
  try {
    const url = new URL(source.startsWith('//') ? `https:${source}` : source, server);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    if (url.hostname === 'music.126.net' || url.hostname.endsWith('.music.126.net')) {
      if (url.protocol === 'http:') url.protocol = 'https:';
      // Banner artwork must retain its wide composition, rather than using
      // the album-cover square crop. Keep other CDN/signed query parameters.
      if (size === null) url.searchParams.delete('param');
      else url.searchParams.set('param', `${Math.min(1200, Math.max(40, size))}y${Math.min(1200, Math.max(40, size))}`);
    }
    return url.href;
  } catch { return ''; }
}
