import { useMediaPreferences } from '@/hooks/useMediaPreferences';
import { MediaDisplayTools } from './MediaDisplayTools';
import { useMediaPalette } from './MediaPanelUi';
import { checkAbort } from '@/lib/cancellation';
import { MovieAddTransaction } from '@/lib/movieAddition';
import { useAppearance } from '@/state/appearance';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useSession } from '@/state/session';
import { type Movie, type SourceSelection } from '@/lib/sources';
import { messageFor } from '@/lib/server';
import { RoomButton, RoomIconButton, RoomInput, ui as baseUi } from './RoomUi';
import { BiliMovieSettings } from './BiliMovieSettings';
import { SourcePicker } from './SourcePicker';
import Feather from '@expo/vector-icons/Feather';
import { AppDialog } from './AppDialog';
import { MoviePlaybackSettings, type SavePlaybackSettings } from './MoviePlaybackSettings';
import { MovieSourceSettings } from './MovieSourceSettings';
import { canClearMovies } from '@/lib/mediaLibrary';

export function MoviePanel({ roomId, movies, host, canAdd, canSwitch, play, reload, currentMovieId, autoContinue, setAutoContinue, ownerUserId, savePlaybackSettings }: { ownerUserId: number | null; savePlaybackSettings: SavePlaybackSettings; currentMovieId?: number | null; roomId: string; movies: Movie[]; host: boolean; canAdd: boolean; canSwitch: boolean; play: (movie: Movie) => Promise<void>; reload: () => Promise<void>; autoContinue: boolean; setAutoContinue: (value: boolean) => void }) {
  const display = useMediaPreferences(); const p = useMediaPalette();
  const theme = useAppearance();
  const ui = theme.styles(baseUi);

  const { request, session } = useSession(); const [adding, setAdding] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [notice, setNotice] = useState(''); const addition = useRef(new MovieAddTransaction());
  const scope = `${session?.serverUrl}:${session?.user.id}:${roomId}`;
  const [confirmation, setConfirmation] = useState<'all' | Movie | null>(null); const lock = useRef(false); const operation = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    return () => { controller.abort(); operation.current?.abort(); };
  }, [scope, roomId, request, session?.user.role]);
  const canManage = canClearMovies(session?.user.role, session?.user.id, ownerUserId);
  const [search, setSearch] = useState(''); const [searching, setSearching] = useState(false); const [expanded, setExpanded] = useState<number | null>(null);
  const labels: Record<string, string> = { bilibili: '哔哩哔哩', mp4: '视频直链', anime: 'ani-subs 番剧源', kazumi: 'Kazumi', cms: 'TVBox 采集源', 'server-files': '服务器文件', webdav: 'WebDAV', ftp: 'FTP', openlist: 'OpenList', emby: 'Emby', jellyfin: 'Jellyfin' };
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
  return <View style={{ flex: 1, minHeight: 0, gap: 8 }}>
    <View style={[ui.row, { justifyContent: 'space-between', flexShrink: 0 }]}>
      {host ? <View style={[ui.row, { flexWrap: 'nowrap' }]}><Switch accessibilityLabel="自动连播" value={autoContinue} onValueChange={setAutoContinue} trackColor={{ true: p.accent, false: p.line }} thumbColor="#fff" /><Text style={ui.text}>自动连播</Text></View> : <Text style={ui.muted}>房间影片</Text>}
      {canAdd ? <Pressable accessibilityRole="button" accessibilityLabel="添加影片" accessibilityState={{ disabled: busy }} disabled={busy} onAccessibilityTap={() => { if (!busy) setAdding(true); }} onPress={() => setAdding(true)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 }}><Feather name="plus" size={22} color={p.accent} /><Text style={{ color: p.accent, fontSize: 16 }}>添加影片</Text></Pressable> : null}
    </View>
    {notice ? <Text accessibilityLiveRegion="polite" style={ui.muted}>{notice}</Text> : null}
    <View style={{ flex: 1, minHeight: 0, borderRadius: 22, borderWidth: 1, borderColor: p.line, overflow: 'hidden', backgroundColor: p.field }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', padding: 12, gap: 8, borderBottomWidth: 1, borderColor: p.line }}><View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: p.container, alignItems: 'center', justifyContent: 'center' }}><Feather name="film" size={20} color={p.text} /></View><View style={{ flex: 1, minWidth: 70 }}><Text style={ui.title}>影片列表</Text><Text style={ui.muted}>{movies.length} 部影片</Text></View>{canManage ? <RoomButton label="清空全部" secondary disabled={busy || !movies.length} onPress={() => setConfirmation('all')} /> : null}<RoomIconButton label="搜索影片" icon="search" onPress={() => { setSearching(value => !value); setSearch(''); }} /><RoomIconButton label="刷新片单" icon="refresh-cw" onPress={() => { if (!busy) void task(reload); }} /></View>
      {searching ? <View style={{ padding: 12, gap: 8 }}><RoomInput accessibilityLabel="搜索影片" value={search} onChangeText={setSearch} placeholder="搜索影片…" /><MediaDisplayTools /></View> : null}
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[ui.content, { padding: 12 }]}>{!movies.filter(movie => movie.title.toLowerCase().includes(search.trim().toLowerCase())).length ? <View style={{ alignItems: 'center', padding: 28, gap: 12 }}><Feather name="film" size={28} color={theme.color('#a8b3b6')} /><Text style={ui.muted}>{search ? '未找到匹配的影片' : '暂无影片，请先添加'}</Text></View> : movies.filter(movie => movie.title.toLowerCase().includes(search.trim().toLowerCase())).map(movie => {
      return <View key={movie.id} style={[ui.card, { padding: 10, borderWidth: 1, borderColor: movie.id === currentMovieId ? theme.color('#65d59b') : 'transparent' }]}>
        <View style={[ui.row, { flexWrap: 'nowrap' }]}><View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: p.container, alignItems: 'center', justifyContent: 'center' }}><Feather name="film" size={19} color={p.accent} /></View><View style={{ flex: 1, minWidth: 0, gap: 6 }}><Text numberOfLines={display.fullNames ? undefined : 1} style={[ui.text, { fontWeight: '600' }]}>{movie.title}</Text><View style={{ borderWidth: 1, borderColor: p.accent, borderRadius: 16, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'flex-start' }}><Text style={{ color: p.text, fontSize: 12 }}>{labels[movie.source || movie.sourceType || 'mp4'] || movie.source}{movie.format ? ` · ${movie.format.toUpperCase()}` : ''}{movie.pages?.length ? ` · ${movie.currentPage || 1}/${movie.pages.length} 集` : ''}</Text></View></View>
          {canSwitch ? <Pressable accessibilityRole="button" accessibilityLabel={`播放：${movie.title}`} accessibilityState={{ disabled: busy, selected: movie.id === currentMovieId }} disabled={busy} onAccessibilityTap={() => { if (!busy) void task(() => play(movie)); }} onPress={() => void task(() => play(movie))} style={{ minWidth: 44, minHeight: 44, borderRadius: 24, borderWidth: 1, borderColor: p.muted, alignItems: 'center', justifyContent: 'center', backgroundColor: movie.id === currentMovieId ? p.accent : p.container }}><Feather name="play" size={21} color={movie.id === currentMovieId ? p.onAccent : p.text} /></Pressable> : null}
          {canManage ? <RoomIconButton label={`删除：${movie.title}`} icon="trash-2" onPress={() => { if (!busy) setConfirmation(movie); }} /> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`播放设置：${movie.title}`} accessibilityState={{ expanded: expanded === movie.id }} onAccessibilityTap={() => setExpanded(value => value === movie.id ? null : movie.id)} onPress={() => setExpanded(value => value === movie.id ? null : movie.id)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}><Feather name="settings" size={19} color={p.muted} /><Text style={[ui.text, { flex: 1, fontWeight: '600' }]}>播放设置</Text><Feather name={expanded === movie.id ? 'chevron-up' : 'chevron-down'} size={20} color={p.muted} /></Pressable>
        {expanded === movie.id ? <><MoviePlaybackSettings movie={movie} current={movie.id === currentMovieId} canEdit={host && canManage && !busy} save={savePlaybackSettings} /><MovieSourceSettings key={`${movie.id}:${movie.path}:${movie.currentPage}`} movie={movie} roomId={roomId} canEdit={canManage && !busy} reload={reload} />{(movie.source || movie.sourceType) === 'bilibili' ? <BiliMovieSettings movie={movie} /> : null}</> : null}
      </View>;
    })}</ScrollView></View>{error ? <Text style={ui.error}>{error}</Text> : null}<SourcePicker key={scope} visible={adding} onClose={() => setAdding(false)} onAdd={add} />
    <AppDialog visible={!!confirmation} title={confirmation === 'all' ? '清空片单' : '删除影片'} close={() => { if (!busy) setConfirmation(null); }}><Text style={ui.text}>{confirmation === 'all' ? `确定移除全部 ${movies.length} 部影片？当前影片也会停止播放。` : confirmation ? `移除「${confirmation.title}」？` : ''}</Text><View style={ui.row}><RoomButton label="取消" secondary disabled={busy} onPress={() => setConfirmation(null)} /><RoomButton label={busy ? '处理中…' : '确认移除'} disabled={busy} onPress={() => void remove()} /></View>{error ? <Text style={ui.error}>{error}</Text> : null}</AppDialog>
  </View>;
}
