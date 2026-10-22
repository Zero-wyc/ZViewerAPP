import { useAppearance } from '@/state/appearance';
import { useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';
import type { DanmakuTrack } from '@/lib/timeline';
import type { DanmakuMutation } from '@/lib/danmakuSource';
import { danmakuBody } from '@/lib/danmakuImport';
import { messageFor } from '@/lib/server';
import { RoomButton, RoomInput, ui as baseUi } from './RoomUi';
import { DanmakuSearchDialog } from './DanmakuSearchDialog';
export function DanmakuManager({ roomId, host, tracks, mutate }: { roomId: string; host: boolean; tracks: DanmakuTrack[]; mutate: DanmakuMutation }) {
  const ui = useAppearance().styles(baseUi);
  const request = mutate;
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [edit, setEdit] = useState<DanmakuTrack | null>(null); const [offset, setOffset] = useState('0');
  const [searchOpen, setSearchOpen] = useState(false); const [notice, setNotice] = useState('');
  const root = `/api/rooms/${encodeURIComponent(roomId)}/danmaku-tracks`;
  const task = async (work: () => Promise<void>) => { if (busy || !host) return; setBusy(true); setError(''); try { await work(); } catch (failure) { setError(messageFor(failure)); } finally { setBusy(false); } };
  return <View style={ui.card}>
    <RoomButton label={open ? '收起弹幕轨道' : '管理弹幕轨道'} secondary onPress={() => setOpen(value => !value)} />
    {open ? <>
      {!tracks.length ? <Text style={ui.muted}>暂无弹幕轨道</Text> : null}
      {tracks.map(track => <View key={track.trackId} style={ui.card}>
        <Text style={ui.text}>{track.label} · {track.items.length} 条 · 偏移 {track.offset || 0}s</Text>
        {host ? <><View style={ui.row}><Text style={ui.text}>隐藏轨道</Text><Switch accessibilityLabel={`隐藏轨道 ${track.label}`} value={!!track.hidden} disabled={busy} onValueChange={hidden => void task(async () => { await request(root, { method: 'POST', body: danmakuBody({ ...track, hidden }) }); })} /></View>
          <View style={ui.row}><RoomButton label="调整偏移" secondary disabled={busy} onPress={() => { setEdit(track); setOffset(String(track.offset || 0)); }} /><RoomButton label="删除轨道" secondary disabled={busy} onPress={() => Alert.alert('删除弹幕轨道', track.label, [{ text: '取消' }, { text: '删除', style: 'destructive', onPress: () => void task(async () => { await request(`${root}/${encodeURIComponent(track.trackId)}`, { method: 'DELETE' }); }) }])} /></View></> : null}
      </View>)}
      {edit && host ? <><Text style={ui.text}>{edit.label} · 时间偏移</Text><RoomInput value={offset} onChangeText={setOffset} keyboardType="numbers-and-punctuation" placeholder="轨道偏移秒数" /><View style={ui.row}><RoomButton label="保存偏移" disabled={busy || !offset.trim() || !Number.isFinite(Number(offset))} onPress={() => void task(async () => { await request(`${root}/${encodeURIComponent(edit.trackId)}/offset`, { method: 'PUT', body: JSON.stringify({ offset: Number(offset) }) }); setEdit(null); })} /><RoomButton label="取消偏移调整" secondary disabled={busy} onPress={() => setEdit(null)} /></View></> : null}
      {host ? <RoomButton label="在线搜索弹幕源" disabled={busy} secondary onPress={() => { setNotice(''); setSearchOpen(true); }} /> : null}
      {notice ? <Text style={ui.muted}>{notice}</Text> : null}{error ? <Text style={ui.error}>{error}</Text> : null}
    </> : null}
    {searchOpen && host ? <DanmakuSearchDialog key={roomId} tracks={tracks} roomId={roomId} mutate={mutate} close={() => setSearchOpen(false)} imported={setNotice} /> : null}
  </View>;
}
