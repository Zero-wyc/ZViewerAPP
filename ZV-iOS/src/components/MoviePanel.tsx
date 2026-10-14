import { checkAbort } from '@/lib/cancellation';
import { MovieAddTransaction } from '@/lib/movieAddition';
import { useAppearance } from '@/state/appearance';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';
import { useSession } from '@/state/session';
import { type Movie, type SourceSelection } from '@/lib/sources';
import { messageFor } from '@/lib/server';
import { RoomButton, RoomIconButton, RoomInput, ui as baseUi } from './RoomUi';
import { BiliMovieSettings } from './BiliMovieSettings';
import { SourcePicker } from './SourcePicker';
import Feather from '@expo/vector-icons/Feather';
import { AppDialog } from './AppDialog';
import { MovieSourceSettings } from './MovieSourceSettings';
import { canClearMovies } from '@/lib/mediaLibrary';

export function MoviePanel({ roomId, movies, host, canSwitch, play, reload, currentMovieId, autoContinue, setAutoContinue }: { currentMovieId?: number | null; roomId: string; movies: Movie[]; host: boolean; canSwitch: boolean; play: (movie: Movie) => Promise<void>; reload: () => Promise<void>; autoContinue: boolean; setAutoContinue: (value: boolean) => void }) {
  const theme = useAppearance();
  const ui = theme.styles(baseUi);

  const { request, session } = useSession(); const [adding, setAdding] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [notice, setNotice] = useState(''); const addition = useRef(new MovieAddTransaction());
  const [owner, setOwner] = useState<{ scope: string; id: number | null } | null>(null);
  const scope = `${session?.serverUrl}:${session?.user.id}:${roomId}`;
  const [confirmation, setConfirmation] = useState<'all' | Movie | null>(null); const lock = useRef(false); const operation = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    if (session?.user.role === 'admin') void request<{ rooms: { roomId: string; ownerUserId: number | null }[] }>('/api/admin/rooms', { signal: controller.signal }).then(data => { if (!controller.signal.aborted) setOwner({ scope, id: data.rooms.find(item => item.roomId === roomId)?.ownerUserId ?? null }); }).catch(() => {});
    return () => { controller.abort(); operation.current?.abort(); };
  }, [scope, roomId, request, session?.user.role]);
  const canManage = canClearMovies(session?.user.role, session?.user.id, owner?.scope === scope ? owner.id : null);
  const [search, setSearch] = useState(''); const [expanded, setExpanded] = useState<number | null>(null);
  const labels: Record<string, string> = { bilibili: '哔哩哔哩', mp4: '视频直链', anime: 'ani-subs 番剧源', kazumi: 'Kazumi', 'server-files': '服务器文件', webdav: 'WebDAV', ftp: 'FTP', openlist: 'OpenList', emby: 'Emby', jellyfin: 'Jellyfin' };
  const path = `/api/rooms/${encodeURIComponent(roomId)}/movies`;
  const task = async (work: () => Promise<void>) => { setBusy(true); setError(''); try { await work(); } catch (failure) { setError(messageFor(failure)); } finally { setBusy(false); } };
  const remove = async () => {
    if (!canManage || !confirmation || lock.current) return;
    lock.current = true; const controller = new AbortController(); operation.current = controller; setBusy(true); setError('');
    try { await request(confirmation === 'all' ? path : `${path}/${confirmation.id}`, { method: 'DELETE', signal: controller.signal }); addition.current.reset(); checkAbort(controller.signal); await reload(); if (!controller.signal.aborted) setConfirmation(null); }
    catch (failure) { if (!controller.signal.aborted) setError(messageFor(failure)); }
    finally { lock.current = false; if (!controller.signal.aborted) setBusy(false); }
  };
  const add = async (value: SourceSelection, playAfterAdd = false) => {
    try { await addition.current.run(scope, value, playAfterAdd, { create: async item => (await request<{ movie: Movie }>(path, { method: 'POST', body: JSON.stringify(item) })).movie, patchLocalOnly: async id => { await request(`${path}/${id}`, { method: 'PUT', body: JSON.stringify({ cliOnly: true }) }); }, refresh: reload, play, status: setNotice }); }
    catch (failure) { setNotice(''); throw failure; }
  };
  const move = (index: number, delta: number) => task(async () => { const orderedIds = movies.map(movie => movie.id); [orderedIds[index], orderedIds[index + delta]] = [orderedIds[index + delta], orderedIds[index]]; await request(`${path}/reorder`, { method: 'POST', body: JSON.stringify({ orderedIds }) }); await reload(); });
  return <View style={{ flex: 1, minHeight: 0, gap: 8 }}>
    <View style={ui.row}><Text style={[ui.title, { flex: 1 }]}>影片列表 · {movies.length}</Text>{host ? <RoomButton label="添加影片" disabled={busy} onPress={() => setAdding(true)} secondary /> : null}{canManage ? <RoomButton label="清空片单" secondary disabled={busy || !movies.length} onPress={() => setConfirmation('all')} /> : null}<RoomIconButton label="刷新片单" icon="refresh-cw" onPress={() => { if (!busy) void task(reload); }} /></View>
    {notice ? <Text accessibilityLiveRegion="polite" style={ui.muted}>{notice}</Text> : null}
    <View style={[ui.row, { flexWrap: 'nowrap' }]}>
      <RoomInput value={search} onChangeText={setSearch} placeholder="搜索影片…" style={{ flex: 1, minWidth: 0 }} />
      <View style={[ui.row, { flexWrap: 'nowrap', flexShrink: 0 }]}>
        <Text style={ui.muted}>自动续播</Text>
        <Switch accessibilityLabel="自动续播" value={autoContinue} onValueChange={setAutoContinue} disabled={!host} />
      </View>
    </View>
    <ScrollView contentContainerStyle={ui.content}>{!movies.filter(movie => movie.title.toLowerCase().includes(search.trim().toLowerCase())).length ? <View style={{ alignItems: 'center', padding: 28, gap: 12 }}><Feather name="film" size={28} color={theme.color('#a8b3b6')} /><Text style={ui.muted}>{search ? '未找到匹配的影片' : '暂无影片，请先添加'}</Text></View> : movies.filter(movie => movie.title.toLowerCase().includes(search.trim().toLowerCase())).map(movie => {
      const index = movies.findIndex(item => item.id === movie.id);
      return <View key={movie.id} style={[ui.card, { padding: 10, borderWidth: 1, borderColor: movie.id === currentMovieId ? theme.color('#65d59b') : 'transparent' }]}>
        <View style={ui.row}><Feather name="film" size={18} color={theme.color('#65d59b')} /><View style={{ flex: 1, minWidth: 0 }}><Text style={ui.text}>{movie.title}</Text><Text style={ui.muted}>{labels[movie.source || movie.sourceType || 'mp4'] || movie.source}{movie.format ? ` · ${movie.format.toUpperCase()}` : ''}{movie.pages?.length ? ` · ${movie.currentPage || 1}/${movie.pages.length} 集` : ''}</Text></View>
          {canSwitch ? <RoomIconButton label="播放" icon="play" onPress={() => { if (!busy) void task(() => play(movie)); }} /> : null}<RoomIconButton label={expanded === movie.id ? '收起影片设置' : '影片设置'} icon="more-horizontal" onPress={() => setExpanded(value => value === movie.id ? null : movie.id)} />
        </View>
        {expanded === movie.id ? <><MovieSourceSettings key={`${movie.id}:${movie.path}:${movie.currentPage}`} movie={movie} roomId={roomId} canEdit={canManage && !busy} reload={reload} />{(movie.source || movie.sourceType) === 'bilibili' ? <BiliMovieSettings movie={movie} /> : null}{canManage ? <View style={ui.row}><RoomButton label="上移" secondary disabled={busy || index === 0} onPress={() => void move(index, -1)} /><RoomButton label="下移" secondary disabled={busy || index === movies.length - 1} onPress={() => void move(index, 1)} /><RoomButton label="删除" secondary disabled={busy} onPress={() => setConfirmation(movie)} /></View> : null}</> : null}
      </View>;
    })}</ScrollView>{error ? <Text style={ui.error}>{error}</Text> : null}<SourcePicker key={scope} visible={adding} onClose={() => setAdding(false)} onAdd={add} />
    <AppDialog visible={!!confirmation} title={confirmation === 'all' ? '清空片单' : '删除影片'} close={() => { if (!busy) setConfirmation(null); }}><Text style={ui.text}>{confirmation === 'all' ? `确定移除全部 ${movies.length} 部影片？当前影片也会停止播放。` : confirmation ? `移除「${confirmation.title}」？` : ''}</Text><View style={ui.row}><RoomButton label="取消" secondary disabled={busy} onPress={() => setConfirmation(null)} /><RoomButton label={busy ? '处理中…' : '确认移除'} disabled={busy} onPress={() => void remove()} /></View>{error ? <Text style={ui.error}>{error}</Text> : null}</AppDialog>
  </View>;
}
