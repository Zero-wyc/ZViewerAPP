import { checkAbort } from './cancellation.ts';
import type { MoviePage, SourceSelection } from './sources.ts';
export type LibraryKind = 'emby' | 'jellyfin';
export type LibraryEntry = { name: string; path: string; type: string; embyType?: string; imageTag?: string; indexNumber?: number; parentIndexNumber?: number; duration?: number; childCount?: number; recursiveItemCount?: number };
export type LibraryMedia = { title: string; videoUrl: string; directUrl?: string; streamUrl?: string; format: string; duration: number; audioCodec?: string; multiVersion: boolean; mediaSourceId: string; versions: { id: string; label: string }[] };
export type ApiRequest = <T>(path: string, init?: RequestInit) => Promise<T>;
export const libraryRoute = (kind: LibraryKind, mountId: number, path?: string) => `/api/${kind}/mounts/${mountId}/browse${path ? `?path=${encodeURIComponent(path)}` : ''}`;
export function selectLibraryMount<T extends { id: number; directLink?: boolean }>(mounts: T[], previousId: string) {
  return mounts.find(item => String(item.id) === previousId) || mounts[0];
}
export const libraryImage = (kind: LibraryKind, mountId: number, entry: LibraryEntry) => `/api/${kind}/mounts/${mountId}/image?${new URLSearchParams({ itemId: entry.path, maxWidth: '320', ...(entry.imageTag ? { tag: entry.imageTag } : {}) })}`;
export function resolveLibrary(request: ApiRequest, kind: LibraryKind, mountId: number, path: string, signal?: AbortSignal) {
  return request<LibraryMedia>(`/api/${kind}/resolve?${new URLSearchParams({ mountId: String(mountId), path })}`, { signal });
}
export function canAddWholeLibrary(entries: LibraryEntry[]) {
  return entries.length > 0 && entries.every(entry => entry.type === 'file' && (!entry.embyType || ['Movie', 'Episode', 'Video', 'MusicVideo', 'Trailer'].includes(entry.embyType)));
}
function libraryPages(episodes: LibraryEntry[], mountId: number): MoviePage[] {
  episodes.sort((a, b) => (a.parentIndexNumber || 0) - (b.parentIndexNumber || 0) || (a.indexNumber || 0) - (b.indexNumber || 0) || a.name.localeCompare(b.name, 'zh', { numeric: true }));
  return [...new Map(episodes.map(item => [item.path, item])).values()].map((item, i) => ({ page: i + 1, part: `${item.indexNumber ? `S${item.parentIndexNumber ?? '?'}E${item.indexNumber} · ` : ''}${item.name}`, path: item.path, mountId, duration: item.duration || 0 }));
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
  return libraryPages(episodes, mountId);
}
export function librarySelection(kind: LibraryKind, mount: { id: number; serverUrl?: string; directLink?: boolean }, entry: LibraryEntry, media: LibraryMedia, pages?: MoviePage[]): SourceSelection {
  const directLink = !!mount.directLink && !!media.directUrl;
  return { source: kind, title: entry.name, url: directLink ? media.directUrl! : media.videoUrl, format: media.format, duration: media.duration, audioCodec: media.audioCodec, sourceMountId: mount.id, serverUrl: mount.serverUrl, path: pages?.[0]?.path || entry.path, directLink, multiVersion: media.multiVersion, cover: libraryImage(kind, mount.id, entry), ...(pages ? { pages, currentPage: 1 } : {}) };
}
export async function addLibraryEntry(request: ApiRequest, kind: LibraryKind, mount: { id: number; serverUrl?: string; directLink?: boolean }, entry: LibraryEntry, wholeSeries: boolean, add: (value: SourceSelection) => Promise<void>, signal?: AbortSignal) {
  checkAbort(signal);
  let pages: MoviePage[] | undefined;
  if (wholeSeries) {
    const data = await request<{ entries: LibraryEntry[] }>(libraryRoute(kind, mount.id, entry.path), { signal }); checkAbort(signal);
    if (!canAddWholeLibrary(data.entries)) throw new Error('只有下一层非空且全部为影片的目录才能整部添加，请进入下一级目录');
    if (data.entries.length > 2000) throw new Error('分集过多，请分批添加');
    pages = libraryPages(data.entries, mount.id);
  }
  const media = await resolveLibrary(request, kind, mount.id, pages?.[0]?.path || entry.path, signal);
  checkAbort(signal); await add(librarySelection(kind, mount, entry, media, pages));
}
export function canClearMovies(role: string | undefined, userId: number | undefined, ownerId: number | null | undefined) { return role === 'root' || role !== 'guest' && userId != null && userId > 0 && ownerId === userId; }
export function nextMovieId(ids: number[], currentId?: number | null) { const index = ids.indexOf(currentId ?? -1); return index < 0 ? null : ids[index + 1] ?? null; }
