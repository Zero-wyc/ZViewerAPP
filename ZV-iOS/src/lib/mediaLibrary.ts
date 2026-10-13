import { checkAbort } from './cancellation.ts';
import type { MoviePage, SourceSelection } from './sources.ts';
export type LibraryKind = 'emby' | 'jellyfin';
export type LibraryEntry = { name: string; path: string; type: string; embyType?: string; imageTag?: string; indexNumber?: number; parentIndexNumber?: number; duration?: number };
export type LibraryMedia = { title: string; videoUrl: string; streamUrl?: string; format: string; duration: number; audioCodec?: string; multiVersion: boolean; mediaSourceId: string; versions: { id: string; label: string }[] };
export type ApiRequest = <T>(path: string, init?: RequestInit) => Promise<T>;
export const libraryRoute = (kind: LibraryKind, mountId: number, path?: string) => `/api/${kind}/mounts/${mountId}/browse${path ? `?path=${encodeURIComponent(path)}` : ''}`;
export const libraryImage = (kind: LibraryKind, mountId: number, entry: LibraryEntry) => `/api/${kind}/mounts/${mountId}/image?${new URLSearchParams({ itemId: entry.path, maxWidth: '320', ...(entry.imageTag ? { tag: entry.imageTag } : {}) })}`;
export function resolveLibrary(request: ApiRequest, kind: LibraryKind, mountId: number, path: string, signal?: AbortSignal) {
  return request<LibraryMedia>(`/api/${kind}/resolve?${new URLSearchParams({ mountId: String(mountId), path })}`, { signal });
}
export async function enumerateLibrary(request: ApiRequest, kind: LibraryKind, mountId: number, entry: LibraryEntry, signal?: AbortSignal): Promise<MoviePage[]> {
  const visited = new Set<string>(); const episodes: LibraryEntry[] = [];
  const visit = async (path: string, depth: number) => {
    checkAbort(signal);
    if (depth > 8 || visited.size > 500) throw new Error('媒体库目录过多，请按季添加');
    if (visited.has(path)) return; visited.add(path);
    const data = await request<{ entries: LibraryEntry[] }>(libraryRoute(kind, mountId, path), { signal });
    for (const child of data.entries) {
      if (child.type === 'directory') await visit(child.path, depth + 1);
      else if (child.embyType === 'Episode' || !child.embyType) episodes.push(child);
      if (episodes.length > 2000) throw new Error('分集过多，请按季添加');
    }
  };
  await visit(entry.path, 0); checkAbort(signal);
  episodes.sort((a, b) => (a.parentIndexNumber || 0) - (b.parentIndexNumber || 0) || (a.indexNumber || 0) - (b.indexNumber || 0) || a.name.localeCompare(b.name, 'zh', { numeric: true }));
  return [...new Map(episodes.map(item => [item.path, item])).values()].map((item, i) => ({ page: i + 1, part: `${item.indexNumber ? `S${item.parentIndexNumber ?? '?'}E${item.indexNumber} · ` : ''}${item.name}`, path: item.path, mountId, duration: item.duration || 0 }));
}
export function librarySelection(kind: LibraryKind, mount: { id: number; serverUrl?: string }, entry: LibraryEntry, media: LibraryMedia, pages?: MoviePage[]): SourceSelection {
  return { source: kind, title: entry.name, url: media.videoUrl, format: media.format, duration: media.duration, audioCodec: media.audioCodec, serverUrl: mount.serverUrl, path: pages?.[0]?.path || entry.path, directLink: false, multiVersion: media.multiVersion, cover: libraryImage(kind, mount.id, entry), ...(pages ? { pages, currentPage: 1 } : {}) };
}
export async function addLibraryEntry(request: ApiRequest, kind: LibraryKind, mount: { id: number; serverUrl?: string }, entry: LibraryEntry, wholeSeries: boolean, add: (value: SourceSelection) => Promise<void>, signal?: AbortSignal) {
  checkAbort(signal);
  const pages = wholeSeries ? await enumerateLibrary(request, kind, mount.id, entry, signal) : undefined;
  if (pages && !pages.length) throw new Error('该目录没有可播放的分集');
  const media = await resolveLibrary(request, kind, mount.id, pages?.[0]?.path || entry.path, signal);
  checkAbort(signal); await add(librarySelection(kind, mount, entry, media, pages)); checkAbort(signal);
}
export function canClearMovies(role: string | undefined, userId: number | undefined, ownerId: number | null | undefined) { return role === 'root' || role === 'admin' && userId != null && ownerId === userId; }
export function nextMovieId(ids: number[], currentId?: number | null) { const index = ids.indexOf(currentId ?? -1); return index < 0 ? null : ids[index + 1] ?? null; }
