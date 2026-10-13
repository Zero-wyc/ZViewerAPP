import { checkAbort } from '@/lib/cancellation';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useSession } from '@/state/session';
import { useAppearance } from '@/state/appearance';
import type { Movie } from '@/lib/sources';
import { resolveLibrary, type LibraryMedia } from '@/lib/mediaLibrary';
import { biliSelection } from '@/lib/biliSelection';
import { resolveLocalBili } from '@/lib/biliNative';
import { messageFor } from '@/lib/server';
import { SourceDropdown } from './SourceDropdown';
import { RoomButton, ui as baseUi } from './RoomUi';

export function MovieSourceSettings({ movie, roomId, canEdit, reload }: { movie: Movie; roomId: string; canEdit: boolean; reload: () => Promise<void> }) {
  const { request } = useSession(); const theme = useAppearance(); const ui = theme.styles(baseUi);
  const kind = movie.source || movie.sourceType; const library = kind === 'emby' || kind === 'jellyfin';
  const [versions, setVersions] = useState<LibraryMedia['versions']>([]); const [versionId, setVersionId] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const operation = useRef<AbortController | null>(null); const lock = useRef(false);
  useEffect(() => { operation.current?.abort(); return () => { operation.current?.abort(); }; }, [roomId, movie.id, movie.path, movie.currentPage]);
  const task = async (work: (signal: AbortSignal) => Promise<void>) => {
    if (lock.current) return; lock.current = true; operation.current?.abort(); const controller = new AbortController(); operation.current = controller; setBusy(true); setError('');
    try { await work(controller.signal); } catch (failure) { if (!controller.signal.aborted) setError(messageFor(failure)); }
    finally { lock.current = false; if (!controller.signal.aborted) setBusy(false); }
  };
  const update = async (patch: Partial<Movie>, signal: AbortSignal) => { checkAbort(signal); await request(`/api/rooms/${encodeURIComponent(roomId)}/movies/${movie.id}`, { method: 'PUT', signal, body: JSON.stringify(patch) }); checkAbort(signal); await reload(); };
  const changePage = (value: string) => task(async signal => {
    if (!canEdit) return;
    const page = movie.pages?.find(item => String(item.page) === value); if (!page || page.page === movie.currentPage) return;
    if (library) {
      if (!page.path || !page.mountId) throw new Error('该分集缺少媒体库条目身份，请重新添加整季');
      const media = await resolveLibrary(request, kind, page.mountId, page.path, signal);
      await update({ path: page.path, url: `/api/${kind}/stream?movieId=${movie.id}&ep=${page.page}`, currentPage: page.page, format: media.format, duration: media.duration, audioCodec: media.audioCodec || '', multiVersion: media.multiVersion }, signal);
      setVersions([]); setVersionId(''); return;
    }
    if (kind === 'bilibili') {
      const parsed = new URL(biliSelection(page.epId ? `ep${page.epId}` : movie.url).url); parsed.searchParams.set('p', String(page.page)); if (page.cid) parsed.searchParams.set('cid', String(page.cid));
      const media = await resolveLocalBili(parsed.toString()); checkAbort(signal);
      await update({ url: parsed.toString(), cid: page.cid, currentPage: page.page, duration: media.duration, cliOnly: movie.cliOnly || !!page.epId }, signal);
    }
  });
  const loadVersions = () => task(async signal => {
    const data = await request<LibraryMedia>(`/api/${kind}/movie-source?movieId=${movie.id}`, { signal }); checkAbort(signal); setVersions(data.versions); setVersionId(new URL(movie.url, 'https://source.invalid').searchParams.get('ms') || data.mediaSourceId);
  });
  const changeVersion = (id: string) => task(async signal => {
    if (!canEdit || !versions.some(item => item.id === id)) return;
    const data = await request<LibraryMedia>(`/api/${kind}/movie-source?${new URLSearchParams({ movieId: String(movie.id), ms: id })}`, { signal });
    if (!data.streamUrl) throw new Error('服务器未提供可供房间观众播放的地址');
    await update({ url: data.streamUrl, format: data.format, duration: data.duration, audioCodec: data.audioCodec || '', multiVersion: data.multiVersion }, signal); setVersionId(data.mediaSourceId);
  });
  return <View style={{ gap: 8 }}>
    {movie.pages && movie.pages.length > 1 ? <SourceDropdown label={library ? '切换分集' : '分 P / 番剧选集'} testID="movie-page" value={String(movie.currentPage || 1)} options={movie.pages.map(item => ({ id: String(item.page), name: `${item.page} · ${item.part}` }))} disabled={!canEdit || busy} onChange={changePage} /> : null}
    {library && movie.multiVersion ? versions.length ? <SourceDropdown label="清晰度 / 媒体版本" testID="movie-version" value={versionId} options={versions.map(item => ({ id: item.id, name: item.label }))} disabled={!canEdit || busy} onChange={changeVersion} /> : <RoomButton label="选择清晰度 / 媒体版本" secondary disabled={busy || !canEdit} onPress={() => void loadVersions()} /> : null}
    {movie.cliOnly ? <Text style={ui.muted}>仅本机 B站解析 · 每位成员需登录自己的 B站账号</Text> : null}
    {error ? <Text style={ui.error}>{error}</Text> : null}
  </View>;
}
