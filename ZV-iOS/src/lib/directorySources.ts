import { checkAbort } from './cancellation.ts';
import type { ApiRequest } from './mediaLibrary.ts';
import type { SourceSelection } from './sources.ts';
export type DirectoryKind = 'webdav' | 'ftp' | 'openlist' | 'server-files';
export type DirectoryEntry = { name: string; path: string; type: string; size?: number };
export type DirectoryRoot = { id?: number; name: string; path: string; serverUrl?: string };
export const directoryNames: Record<DirectoryKind, string> = { webdav: 'WebDAV', ftp: 'FTP', openlist: 'OpenList', 'server-files': '服务器文件' };
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
  const data = await request<{ mounts: { id: number; name: string; path?: string; serverUrl?: string }[] }>(`/api/${kind}/mounts`, { signal }); checkAbort(signal);
  return data.mounts.map(mount => ({ id: mount.id, name: mount.name, path: mount.path || '/', serverUrl: mount.serverUrl }));
}
export function browseDirectory(request: ApiRequest, kind: DirectoryKind, root: DirectoryRoot, path: string, signal?: AbortSignal) {
  const route = kind === 'server-files' ? '/api/server-files/browse' : `/api/${kind}/mounts/${root.id}/browse`;
  return request<{ entries: DirectoryEntry[]; currentPath?: string }>(`${route}?${new URLSearchParams({ path })}`, { signal });
}
export async function addDirectoryFiles(request: ApiRequest, kind: DirectoryKind, root: DirectoryRoot, entries: DirectoryEntry[], add: (value: SourceSelection) => Promise<void>, signal?: AbortSignal) {
  const added: string[] = []; const failures: { path: string; message: string }[] = [];
  for (const entry of entries) {
    checkAbort(signal);
    try {
      if (entry.type !== 'file' || !entry.path.trim()) throw new Error('请选择文件，目录不能直接添加');
      const query = new URLSearchParams({ path: entry.path, ...(root.id ? { mountId: String(root.id) } : {}) });
      const data = await request<{ title?: string; videoUrl: string; format?: string; duration?: number }>(`/api/${kind}/resolve?${query}`, { signal }); checkAbort(signal);
      await add({ title: data.title || entry.name, url: data.videoUrl, source: kind, format: data.format, duration: data.duration, path: entry.path, ...(root.id ? { serverUrl: root.serverUrl, directLink: false } : {}) }); checkAbort(signal); added.push(entry.path);
    } catch (failure) { checkAbort(signal); failures.push({ path: entry.path, message: failure instanceof Error ? failure.message : '添加失败' }); }
  }
  return { added, failures };
}
