import { useAppearance } from '@/state/appearance';
import { useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';
import { useSession } from '@/state/session';
import type { DanmakuTrack } from '@/lib/timeline';
import { importDanmaku } from '@/lib/danmakuImport';
import { pickTextFile } from '@/lib/imports';
import { messageFor } from '@/lib/server';
import { RoomButton, RoomInput, ui as baseUi } from './RoomUi';
import { DanmakuSearchDialog } from './DanmakuSearchDialog';
export function DanmakuManager({ roomId, host, tracks }: { roomId: string; host: boolean; tracks: DanmakuTrack[] }) {
  const theme = useAppearance();
  const ui = theme.styles(baseUi);

  const { request } = useSession(); const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [edit, setEdit] = useState<DanmakuTrack | null>(null); const [text, setText] = useState(''); const [offset, setOffset] = useState('0');
  const [searchOpen, setSearchOpen] = useState(false); const [notice, setNotice] = useState('');
  const root = `/api/rooms/${encodeURIComponent(roomId)}/danmaku-tracks`;
  const task = async (work: () => Promise<void>) => { setBusy(true); setError(''); try { await work(); } catch (failure) { setError(messageFor(failure)); } finally { setBusy(false); } };
  const save = (track: DanmakuTrack) => request(root, { method: 'POST', body: JSON.stringify({ ...track, source: 'ios-import' }) });
  return <View style={ui.card}><RoomButton label={open ? '收起弹幕轨道' : '弹幕轨道与导入'} secondary onPress={() => setOpen(value => !value)} />{open ? <>{tracks.map(track => <View key={track.trackId} style={ui.card}><Text style={ui.text}>{track.label} · {track.items.length} 条 · 偏移 {track.offset || 0}s</Text>{host ? <><View style={ui.row}><Text style={ui.text}>隐藏轨道</Text><Switch value={!!track.hidden} disabled={busy} onValueChange={hidden => void task(async () => { await save({ ...track, hidden }); })} /></View><View style={ui.row}><RoomButton label="编辑内容 / 偏移" secondary disabled={busy} onPress={() => { setEdit(track); setText(JSON.stringify(track.items, null, 2)); setOffset(String(track.offset || 0)); }} /><RoomButton label="删除轨道" secondary disabled={busy} onPress={() => Alert.alert('删除弹幕轨道', track.label, [{ text: '取消' }, { text: '删除', style: 'destructive', onPress: () => void task(async () => { await request(`${root}/${encodeURIComponent(track.trackId)}`, { method: 'DELETE' }); }) }])} /></View></> : null}</View>)}{edit && host ? <><RoomInput value={text} onChangeText={setText} multiline style={{ minHeight: 120 }} placeholder="JSON 弹幕数组" /><RoomInput value={offset} onChangeText={setOffset} keyboardType="numbers-and-punctuation" placeholder="轨道偏移秒数" /><RoomButton label="保存轨道编辑" disabled={busy || !Number.isFinite(Number(offset))} onPress={() => void task(async () => { await save({ ...edit, items: importDanmaku(text), offset: Number(offset) }); setEdit(null); setText(''); })} /></> : null}{host ? <><RoomButton label="导入弹幕文件（XML / JSON）" disabled={busy} secondary onPress={() => void task(async () => { const file = await pickTextFile(); if (!file) return; await save({ trackId: `ios-${Date.now()}`, label: file.name, items: importDanmaku(file.text), offset: 0, hidden: false }); })} /><RoomButton label="在线搜索弹幕源" disabled={busy} secondary onPress={() => { setNotice(''); setSearchOpen(true); }} /></> : null}{notice ? <Text style={ui.muted}>{notice}</Text> : null}{error ? <Text style={ui.error}>{error}</Text> : null}</> : null}{searchOpen && host ? <DanmakuSearchDialog roomId={roomId} close={() => setSearchOpen(false)} imported={setNotice} /> : null}</View>;
}
