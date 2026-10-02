import { useAppearance } from '@/state/appearance';
import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useSession } from '@/state/session';
import { type Movie, type SourceSelection } from '@/lib/sources';
import { messageFor } from '@/lib/server';
import { RoomButton, RoomIconButton, RoomInput, ui as baseUi } from './RoomUi';
import { BiliMovieSettings } from './BiliMovieSettings';
import { SourcePicker } from './SourcePicker';
import Feather from '@expo/vector-icons/Feather';

export function MoviePanel({ roomId, movies, host, play, reload, currentMovieId }: { currentMovieId?: number | null; roomId: string; movies: Movie[]; host: boolean; play: (movie: Movie) => Promise<void>; reload: () => Promise<void> }) {
  const theme = useAppearance();
  const ui = theme.styles(baseUi);

  const { request } = useSession(); const [adding, setAdding] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [search, setSearch] = useState(''); const [expanded, setExpanded] = useState<number | null>(null);
  const labels: Record<string, string> = { bilibili: '哔哩哔哩', mp4: '视频直链', anime: 'ani-subs 番剧源', kazumi: 'Kazumi', 'server-files': '服务器文件', webdav: 'WebDAV', ftp: 'FTP', openlist: 'OpenList', emby: 'Emby', jellyfin: 'Jellyfin' };
  const path = `/api/rooms/${encodeURIComponent(roomId)}/movies`;
  const task = async (work: () => Promise<void>) => { setBusy(true); setError(''); try { await work(); } catch (failure) { setError(messageFor(failure)); } finally { setBusy(false); } };
  const add = async (value: SourceSelection) => { const created = await request<{ movie: Movie }>(path, { method: 'POST', body: JSON.stringify(value) }); if (!created.movie?.id) throw new Error('服务器未返回新影片身份'); await reload(); };
  const move = (index: number, delta: number) => task(async () => { const orderedIds = movies.map(movie => movie.id); [orderedIds[index], orderedIds[index + delta]] = [orderedIds[index + delta], orderedIds[index]]; await request(`${path}/reorder`, { method: 'POST', body: JSON.stringify({ orderedIds }) }); await reload(); });
  return <View style={{ flex: 1, minHeight: 0, gap: 8 }}>
    <View style={ui.row}><Text style={[ui.title, { flex: 1 }]}>影片列表 · {movies.length}</Text>{host ? <RoomButton label="添加影片" disabled={busy} onPress={() => setAdding(true)} secondary /> : null}<RoomIconButton label="刷新片单" icon="refresh-cw" onPress={() => { if (!busy) void task(reload); }} /></View>
    <RoomInput value={search} onChangeText={setSearch} placeholder="搜索影片…" />
    <ScrollView contentContainerStyle={ui.content}>{!movies.filter(movie => movie.title.toLowerCase().includes(search.trim().toLowerCase())).length ? <View style={{ alignItems: 'center', padding: 28, gap: 12 }}><Feather name="film" size={28} color={theme.color('#a8b3b6')} /><Text style={ui.muted}>{search ? '未找到匹配的影片' : '暂无影片，请先添加'}</Text></View> : movies.filter(movie => movie.title.toLowerCase().includes(search.trim().toLowerCase())).map(movie => {
      const index = movies.findIndex(item => item.id === movie.id);
      return <View key={movie.id} style={[ui.card, { padding: 10, borderWidth: 1, borderColor: movie.id === currentMovieId ? theme.color('#65d59b') : 'transparent' }]}>
        <View style={ui.row}><Feather name="film" size={18} color={theme.color('#65d59b')} /><View style={{ flex: 1, minWidth: 0 }}><Text style={ui.text} numberOfLines={2}>{movie.title}</Text><Text style={ui.muted}>{labels[movie.source || movie.sourceType || 'mp4'] || movie.source}{movie.format ? ` · ${movie.format.toUpperCase()}` : ''}</Text></View>
          {host ? <RoomIconButton label="播放" icon="play" onPress={() => { if (!busy) void task(() => play(movie)); }} /> : null}<RoomIconButton label={expanded === movie.id ? '收起影片设置' : '影片设置'} icon="more-horizontal" onPress={() => setExpanded(value => value === movie.id ? null : movie.id)} />
        </View>
        {expanded === movie.id ? <>{(movie.source || movie.sourceType) === 'bilibili' ? <BiliMovieSettings movie={movie} /> : null}{host ? <View style={ui.row}><RoomButton label="上移" secondary disabled={busy || index === 0} onPress={() => void move(index, -1)} /><RoomButton label="下移" secondary disabled={busy || index === movies.length - 1} onPress={() => void move(index, 1)} /><RoomButton label="删除" secondary disabled={busy} onPress={() => Alert.alert('删除影片', `从片单移除「${movie.title}」？`, [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => void task(async () => { await request(`${path}/${movie.id}`, { method: 'DELETE' }); await reload(); }) }])} /></View> : null}</> : null}
      </View>;
    })}</ScrollView>{error ? <Text style={ui.error}>{error}</Text> : null}<SourcePicker visible={adding} onClose={() => setAdding(false)} onAdd={add} />
  </View>;
}
