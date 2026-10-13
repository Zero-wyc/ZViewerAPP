import type { PlaybackSource } from './media.ts';
import type { ResolvedMedia } from './resolvers.ts';

export function serverBiliSource(source: PlaybackSource, media: ResolvedMedia): PlaybackSource {
  const proxy = (value: string) => {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || /^(localhost|127\.|\[::1\])/i.test(url.hostname)) throw new Error('服务器返回了无效的 B站媒体地址');
    return `/api/stream/proxy?${new URLSearchParams({ url: url.toString(), referer: 'https://www.bilibili.com/', userAgent: 'Mozilla/5.0' })}`;
  };
  return { ...source, sourceUrl: proxy(source.format === 'audio' ? media.audioUrl || media.videoUrl : media.videoUrl), format: media.format,
    audioUrl: source.format === 'audio' || source.format === 'muted-video' ? undefined : media.audioUrl ? proxy(media.audioUrl) : undefined,
    headers: undefined, biliPolicy: undefined };
}

export function sharedPlayback<T extends PlaybackSource>(local: T, shared: PlaybackSource | null): T | null {
  if (local.sourceType !== 'bilibili' || local.cliOnly) return local;
  if (!shared || shared.movieId !== local.movieId || shared.cid !== local.cid || shared.currentPage !== local.currentPage) return null;
  // A recovered shared source may have been resolved from a full state. Its
  // old clock/play intent must never overwrite a subsequent pause or seek.
  return { ...local, sourceUrl: shared.sourceUrl, audioUrl: shared.audioUrl, format: shared.format, headers: shared.headers, biliPolicy: undefined };
}
