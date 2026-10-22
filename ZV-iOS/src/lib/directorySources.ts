import { checkAbort } from './cancellation.ts';
import type { ApiRequest } from './mediaLibrary.ts';
import type { SourceSelection } from './sources.ts';
import { addSourceBatch } from './sourceBatch.ts';
export type DirectoryKind = 'webdav' | 'ftp' | 'openlist' | 'server-files';
export type DirectoryEntry = { name: string; path: string; type: string; size?: number };
export type DirectoryRoot = { id?: number; name: string; path: string; serverUrl?: string; directLink?: boolean };
export const directoryNames: Record<DirectoryKind, string> = { webdav: 'WebDAV', ftp: 'FTP', openlist: 'OpenList', 'server-files': '服务器文件' };
export function directoryBreadcrumbs(path: string, root: string) {
  const base = root.replace(/\/+$/, ''); const current = (path || root).replace(/\/+$/, '');
  if (current !== base && !current.startsWith(base + '/')) return [{ label: path || root || '/', path: path || root }];
  const segments = current.slice(base.length).split('/').filter(Boolean);
  return [{ label: root || '/', path: root }, ...segments.map((label, index) => ({ label, path: base + '/' + segments.slice(0, index + 1).join('/') }))];
}
export function directoryManualPath(value: string, kind: DirectoryKind, root: DirectoryRoot): string {
  const path = value.trim();
  if (kind !== 'server-files' || /^(uploads|custom:\d+):/.test(path)) return path;
  return root.path.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
}
export function directoryParent(path: string, root: string): string | null {
  const base = root.replace(/\/+$/, ''); const value = path.replace(/\/+$/, '');
  if (value === base || !value || base && !value.startsWith(base + '/')) return null;
  const index = value.lastIndexOf('/'); return index <= base.length ? root : value.slice(0, index);
}
export async function listDirectoryRoots(request: ApiRequest, kind: DirectoryKind, signal?: AbortSignal): Promise<DirectoryRoot[]> {
  checkAbort(signal);
  if (kind === 'server-files') { const data = await request<{ roots: { key: string; name: string; exists?: boolean }[] }>('/api/server-files/roots', { signal }); checkAbort(signal); return data.roots.filter(root => root.exists !== false).map(root => ({ name: root.name, path: `${root.key}:/` })); }
  const data = await request<{ mounts: { id: number; name: string; path?: string; serverUrl?: string; directLink?: boolean }[] }>(`/api/${kind}/mounts`, { signal }); checkAbort(signal);
  return data.mounts.map(mount => ({ id: mount.id, name: mount.name, path: mount.path || '/', serverUrl: mount.serverUrl, directLink: ['webdav', 'openlist'].includes(kind) && mount.directLink === true }));
}
export function browseDirectory(request: ApiRequest, kind: DirectoryKind, root: DirectoryRoot, path: string, signal?: AbortSignal) {
  const route = kind === 'server-files' ? '/api/server-files/browse' : `/api/${kind}/mounts/${root.id}/browse`;
  return request<{ entries: DirectoryEntry[]; currentPath?: string }>(`${route}?${new URLSearchParams({ path })}`, { signal });
}
export async function addDirectoryFiles(request: ApiRequest, kind: DirectoryKind, root: DirectoryRoot, entries: DirectoryEntry[], add: (value: SourceSelection) => Promise<void>, signal?: AbortSignal) {
  const result = await addSourceBatch(entries, entry => entry.path, async entry => {
      if (entry.type !== 'file' || !entry.path.trim()) throw new Error('请选择文件，目录不能直接添加');
      const query = new URLSearchParams({ path: entry.path, ...(root.id ? { mountId: String(root.id) } : {}) });
      const data = await request<{ title?: string; videoUrl: string; format?: string; duration?: number }>(`/api/${kind}/resolve?${query}`, { signal }); checkAbort(signal);
      const directLink = ['webdav', 'openlist'].includes(kind) && root.directLink === true;
      let url = data.videoUrl;
      if (directLink) { const direct = await request<{ directUrl: string }>(`/api/${kind}/direct-url?${query}`, { signal }); checkAbort(signal); if (!direct.directUrl) throw new Error('挂载未返回可用直链，请重试或检查服务器挂载设置'); url = direct.directUrl; }
      await add({ title: data.title || entry.name, url, source: kind, format: data.format, duration: data.duration, path: entry.path, ...(root.id ? { sourceMountId: root.id, serverUrl: root.serverUrl, directLink } : {}) });
  }, signal);
  return { ...result, failures: result.failures.map(item => ({ path: item.id, message: item.message })) };
}
