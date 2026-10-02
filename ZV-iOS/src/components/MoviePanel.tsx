import { useAppearance } from '@/state/appearance';
import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useSession } from '@/state/session';
import { type Movie, type SourceSelection } from '@/lib/sources';
import { messageFor } from '@/lib/server';
import { RoomButton, ui as baseUi } from './RoomUi';
import { BiliMovieSettings } from './BiliMovieSettings';
import { SourcePicker } from './SourcePicker';

export function MoviePanel({ roomId, movies, host, play, reload }: { roomId: string; movies: Movie[]; host: boolean; play: (movie: Movie) => Promise<void>; reload: () => Promise<void> }) {
  const theme = useAppearance();
  const ui = theme.styles(baseUi);

  const { request } = useSession(); const [adding, setAdding] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const path = `/api/rooms/${encodeURIComponent(roomId)}/movies`;
  const task = async (work: () => Promise<void>) => { setBusy(true); setError(''); try { await work(); } catch (failure) { setError(messageFor(failure)); } finally { setBusy(false); } };
  const add = async (value: SourceSelection) => { const created = await request<{ movie: Movie }>(path, { method: 'POST', body: JSON.stringify(value) }); if (!created.movie?.id) throw new Error('服务器未返回新影片身份'); await reload(); };
  const move = (index: number, delta: number) => task(async () => { const orderedIds = movies.map(movie => movie.id); [orderedIds[index], orderedIds[index + delta]] = [orderedIds[index + delta], orderedIds[index]]; await request(`${path}/reorder`, { method: 'POST', body: JSON.stringify({ orderedIds }) }); await reload(); });
  return <View style={{ flex: 1, gap: 8 }}><ScrollView contentContainerStyle={ui.content}>{!movies.length ? <Text style={ui.muted}>暂无影片</Text> : movies.map((movie, index) => <View key={movie.id} style={ui.card}><Text style={ui.text}>{movie.title}</Text><Text style={ui.muted}>{movie.source || '视频直链'}{movie.format ? ` · ${movie.format.toUpperCase()}` : ''}</Text>{(movie.source || movie.sourceType) === 'bilibili' ? <BiliMovieSettings movie={movie} /> : null}{host ? <View style={ui.row}><RoomButton label="播放" disabled={busy} onPress={() => void task(() => play(movie))} /><RoomButton label="上移" secondary disabled={busy || index === 0} onPress={() => void move(index, -1)} /><RoomButton label="下移" secondary disabled={busy || index === movies.length - 1} onPress={() => void move(index, 1)} /><RoomButton label="删除" secondary disabled={busy} onPress={() => Alert.alert('删除影片', `从片单移除「${movie.title}」？`, [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => void task(async () => { await request(`${path}/${movie.id}`, { method: 'DELETE' }); await reload(); }) }])} /></View> : null}</View>)}</ScrollView><View style={ui.row}>{host ? <RoomButton label="添加影片" disabled={busy} onPress={() => setAdding(true)} /> : null}<RoomButton label="刷新片单" secondary disabled={busy} onPress={() => void task(reload)} /></View>{error ? <Text style={ui.error}>{error}</Text> : null}<SourcePicker visible={adding} onClose={() => setAdding(false)} onAdd={add} /></View>;
}
