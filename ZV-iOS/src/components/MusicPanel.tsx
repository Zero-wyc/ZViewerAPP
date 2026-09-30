import { biliOperation } from '@/lib/nativeBridge';
/* eslint-disable react-hooks/immutability -- the VLC port exposes imperative native controls. */
import Slider from '@react-native-community/slider';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { emitAck } from '@/lib/socket';
import { NativeMediaAdapter, type Playback } from '@/lib/mediaAdapter';
import { formatTime } from '@/lib/sources';
import { messageFor } from '@/lib/server';
import { parseLyrics, roomTime, upperBound, type TimedText } from '@/lib/timeline';
import { useSession } from '@/state/session';
import { VlcVideo, useVlcVideo } from './VlcVideo';
import { RoomButton, RoomInput, ui } from './RoomUi';
import { playbackSource, onBiliChange, biliFallback } from '@/lib/biliNative';
import { MusicLibrary } from './MusicLibrary';
import { readPreference, writePreference } from '@/lib/preferences';
type Song = { songId: number; name: string; artist: string; album: string; cover: string; durationMs: number; vip: boolean; biliBvid?: string; biliCid?: number };
type QueueItem = Song & { id: number };
type MusicState = { trackSongId: number | null; trackKey: string | null; isPlaying: boolean; positionSec: number; playMode: 'sequence' | 'order' | 'repeat-one' | 'shuffle'; updatedAt: number; roomId?: string };
type ControlRequest = { action: 'play' | 'pause' | 'seek' | 'next' | 'prev' | 'addQueue' | 'playItem'; item?: Song; positionSec?: number; from?: string; username?: string; roomId?: string };
const empty: MusicState = { trackSongId: null, trackKey: null, isPlaying: false, positionSec: 0, playMode: 'sequence', updatedAt: 0 };
const keyFor = (song: Song) => song.biliBvid ? `bili:${song.biliBvid}:${song.biliCid || 0}` : `ncm:${song.songId}`;
export function MusicPanel({ roomId, host }: { roomId: string; host: boolean }) {
  const { session, socket, requestText } = useSession(); const video = useVlcVideo(); const { player } = video;
  const [queue, setQueue] = useState<QueueItem[]>([]); const [state, setState] = useState(empty); const [search, setSearch] = useState(''); const [songs, setSongs] = useState<Song[]>([]);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [time, setTime] = useState(0); const [duration, setDuration] = useState(0); const [lyrics, setLyrics] = useState<TimedText[]>([]); const [lyricsSong, setLyricsSong] = useState<string | null>(null);
  const [requests, setRequests] = useState<ControlRequest[]>([]); const [qr, setQr] = useState(''); const [qrKey, setQrKey] = useState(''); const [loginMessage, setLoginMessage] = useState(''); const [playlistId, setPlaylistId] = useState(''); const [retry, setRetry] = useState(0);
  const [quality, setQuality] = useState('lossless');
  useEffect(() => { let active = true; void readPreference('zviewer-music-quality', { level: 'lossless' }).then(value => { if (active && ['lossless', 'exhigh', 'higher', 'standard'].includes(value.level)) setQuality(value.level); }); return () => { active = false; }; }, []);
  const adapter = useRef<NativeMediaAdapter | null>(null); const stateRef = useRef(state); const queueRef = useRef(queue); const hostRef = useRef(host); const stream = useRef<{ key: string; source: Playback } | null>(null);
  useEffect(() => { stateRef.current = state; queueRef.current = queue; hostRef.current = host; }, [state, queue, host]);
  useEffect(() => { const media = new NativeMediaAdapter(player, playbackSource); adapter.current = media; return () => { media.dispose(); adapter.current = null; }; }, [player]);
  useEffect(() => onBiliChange(() => { stream.current = null; adapter.current?.invalidate(); setRetry(value => value + 1); }), []);
  const ncm = useCallback(async <T,>(path: string, signal?: AbortSignal): Promise<T> => {
    const result = JSON.parse(await requestText(`/api/music/ncm${path}`, { signal })); if (result.code !== 200 && ![800, 801, 802, 803].includes(result.code)) throw new Error(result.message || '网易云请求失败'); return result;
  }, [requestText]);
  const update = useCallback((next: MusicState, broadcast = false) => { stateRef.current = next; setState(next); if (broadcast) socket?.emit('music:sync-state', { roomId, ...next }); }, [socket, roomId]);
  const choose = useCallback((item: Song) => update({ ...stateRef.current, trackKey: keyFor(item), trackSongId: item.biliBvid ? null : item.songId, positionSec: 0, isPlaying: true, updatedAt: Date.now() }, true), [update]);
  const control = useCallback(async (command: ControlRequest, approved = false) => {
    if (!socket) return;
    if (!hostRef.current && !approved) { await emitAck(socket, 'music:control-request', { roomId, ...command }); setError('已向房主发送控制申请'); return; }
    const current = stateRef.current; const items = queueRef.current;
    if (command.action === 'addQueue' || command.action === 'playItem') {
      if (!command.item) return; await emitAck(socket, 'music:queue-upsert', { roomId, item: command.item }); if (command.action === 'playItem') choose(command.item); return;
    }
    if (command.action === 'next' || command.action === 'prev') {
      const index = items.findIndex(item => keyFor(item) === current.trackKey); if (!items.length) return;
      const next = command.action === 'prev' ? (index - 1 + items.length) % items.length : current.playMode === 'shuffle' ? Math.floor(Math.random() * items.length) : (index + 1) % items.length;
      choose(items[next]); return;
    }
    const positionSec = command.action === 'seek' ? Math.max(0, command.positionSec || 0) : player.currentTime;
    if (command.action === 'seek') player.currentTime = positionSec;
    update({ ...current, isPlaying: command.action === 'play' ? true : command.action === 'pause' ? false : current.isPlaying, positionSec, updatedAt: Date.now() }, true);
  }, [socket, roomId, player, choose, update]);
  const task = async (work: () => Promise<unknown>) => { setBusy(true); setError(''); try { await work(); } catch (failure) { setError(messageFor(failure)); } finally { setBusy(false); } };
  useEffect(() => {
    if (!socket) return; let active = true;
    const queueChanged = (payload: { roomId: string; items: QueueItem[] }) => { if (payload.roomId === roomId) { queueRef.current = payload.items; setQueue(payload.items); } };
    const synced = (payload: MusicState) => { if (payload.roomId !== roomId || hostRef.current) return; update(payload); const target = roomTime(payload.positionSec, payload.isPlaying, payload.updatedAt); if (keyForCurrent(stream.current) === payload.trackKey && Math.abs(player.currentTime - target) > 2) player.currentTime = target; };
    const requested = (payload: ControlRequest) => { if (payload.roomId === roomId && hostRef.current) setRequests(old => [...old.slice(-19), payload]); };
    const response = (payload: { approved: boolean; from: string }) => { if (payload.from === socket.id) setError(payload.approved ? '房主已同意申请' : '房主拒绝了申请'); };
    socket.on('music:queue-changed', queueChanged); socket.on('music:sync-state', synced); socket.on('music:host-heartbeat', synced); socket.on('music:control-request', requested); socket.on('music:control-response', response);
    void emitAck<{ queue: QueueItem[]; syncState: MusicState | null }>(socket, 'music:get-state', { roomId }).then(data => { if (!active) return; queueRef.current = data.queue; setQueue(data.queue); if (data.syncState) update(data.syncState); }).catch(failure => { if (active) setError(messageFor(failure)); });
    return () => { active = false; socket.off('music:queue-changed', queueChanged); socket.off('music:sync-state', synced); socket.off('music:host-heartbeat', synced); socket.off('music:control-request', requested); socket.off('music:control-response', response); };
  }, [socket, roomId, player, update]);
  useEffect(() => {
    if (!session || !adapter.current) return; const cancel = new AbortController(); const current = stateRef.current;
    void (async () => {
      if (!current.trackKey) { stream.current = null; await adapter.current?.apply(null, session.serverUrl, session.accessToken); return; }
      if (stream.current?.key !== current.trackKey) {
        let source: Playback;
        if (current.trackKey.startsWith('bili:')) { const [, bvid, cid] = current.trackKey.split(':'); source = { sourceUrl: `https://www.bilibili.com/video/${bvid}?cid=${cid}`, sourceType: 'bilibili', format: 'audio', isPlaying: false, currentTime: 0 }; }
        else { const id = Number(current.trackKey.slice(4)); if (!Number.isSafeInteger(id) || id < 1) throw new Error('无效的歌曲编号'); source = { sourceUrl: `/api/music/stream?songId=${id}&level=${quality}&roomId=${encodeURIComponent(roomId)}`, sourceType: 'url', isPlaying: false, currentTime: 0 }; }
        if (cancel.signal.aborted) return; stream.current = { key: current.trackKey, source };
      }
      const desired = { ...stream.current!.source, currentTime: roomTime(current.positionSec, current.isPlaying, current.updatedAt), isPlaying: current.isPlaying };
      await adapter.current?.apply(desired, session.serverUrl, session.accessToken, retry);
      if (!cancel.signal.aborted && !hostRef.current) socket?.emit('music:sync-ack', { roomId });
    })().catch(failure => { if (!cancel.signal.aborted) { adapter.current?.invalidate(); setError(messageFor(failure)); } });
    return () => cancel.abort();
  }, [state, session, roomId, retry, requestText, socket, quality]);
  useEffect(() => {
    const progress = player.addListener('timeUpdate', event => setTime(event.currentTime)); const loaded = player.addListener('sourceLoad', event => setDuration(event.duration));
    const status = player.addListener('statusChange', event => { if (event.status === 'error') { adapter.current?.invalidate(); const current = stream.current?.source; if (current?.sourceType === 'bilibili' && biliFallback(current.sourceUrl)) { stream.current = null; setRetry(value => value + 1); } else setError(event.error?.message || '音频播放失败'); } });
    return () => { progress.remove(); loaded.remove(); status.remove(); };
  }, [player]);
  useEffect(() => {
    if (!host || !socket) return;
    const interval = setInterval(() => { if (!socket.connected || adapter.current?.busy || !stateRef.current.trackKey) return; const current = { ...stateRef.current, positionSec: player.currentTime, isPlaying: player.playing, updatedAt: Date.now() }; stateRef.current = current; socket.emit('music:host-heartbeat', { roomId, ...current });
      if (player.duration > 0 && player.currentTime >= player.duration - 0.6 && !player.playing) { const items = queueRef.current; const index = items.findIndex(item => keyFor(item) === current.trackKey); if (current.playMode === 'repeat-one') void control({ action: 'seek', positionSec: 0 }).then(() => control({ action: 'play' })); else if (current.playMode === 'order' || index < items.length - 1 || current.playMode === 'shuffle') void control({ action: 'next' }); }
    }, 2000); return () => clearInterval(interval);
  }, [host, socket, roomId, player, control]);
  useEffect(() => {
    const cancel = new AbortController();
    if (state.trackSongId) void ncm<{ lrc?: { lyric?: string } }>(`/lyric?id=${state.trackSongId}`, cancel.signal).then(data => { if (!cancel.signal.aborted) { setLyrics(parseLyrics(data.lrc?.lyric || '')); setLyricsSong(state.trackKey); } }).catch(() => {});
    if (state.trackKey?.startsWith('bili:')) { const [, bvid, cid] = state.trackKey.split(':'); void biliOperation<{ data: { lines: TimedText[] } }>('catalog', JSON.stringify({ kind: 'lyrics', bvid, cid: Number(cid) })).then(value => { if (!cancel.signal.aborted) { setLyrics(value.data.lines.filter(line => Number.isFinite(line.time) && line.time >= 0 && typeof line.content === 'string').sort((a, b) => a.time - b.time)); setLyricsSong(state.trackKey); } }).catch(() => {}); }
    return () => cancel.abort();
  }, [state.trackSongId, state.trackKey, ncm]);
  useEffect(() => {
    if (!qrKey) return; const cancel = new AbortController(); let pending = false;
    const timer = setInterval(() => { if (pending) return; pending = true; void ncm<{ code: number }>(`/login/qr/check?key=${encodeURIComponent(qrKey)}&timestamp=${Date.now()}`, cancel.signal).then(data => { if (cancel.signal.aborted) return; setLoginMessage(data.code === 803 ? '网易云登录成功' : data.code === 802 ? '请在网易云确认登录' : data.code === 800 ? '二维码已过期，请重新获取' : '等待扫码'); if (data.code === 803 || data.code === 800) { setQrKey(''); setQr(''); } }).catch(() => { if (!cancel.signal.aborted) setLoginMessage('扫码查询失败，可重新获取二维码'); }).finally(() => { pending = false; }); }, 3000);
    return () => { clearInterval(timer); cancel.abort(); };
  }, [qrKey, ncm]);
  const searchMusic = () => task(async () => { const data = await ncm<{ result?: { songs?: { id: number; name: string; ar?: { name: string }[]; al?: { name: string; picUrl: string }; dt?: number; fee?: number }[] } }>(`/cloudsearch?keywords=${encodeURIComponent(search)}&type=1&limit=30`); setSongs((data.result?.songs || []).map(song => ({ songId: song.id, name: song.name, artist: (song.ar || []).map(item => item.name).join(' / '), album: song.al?.name || '', cover: song.al?.picUrl || '', durationMs: song.dt || 0, vip: song.fee === 1 }))); });
  const qrLogin = () => task(async () => { const key = await ncm<{ data: { unikey: string } }>('/login/qr/key'); const result = await ncm<{ data: { qrimg: string } }>(`/login/qr/create?key=${encodeURIComponent(key.data.unikey)}&qrimg=true`); setQr(result.data.qrimg); setQrKey(key.data.unikey); setLoginMessage('请使用网易云音乐扫码'); });
  const importPlaylist = () => task(async () => { const result = await ncm<{ songs: { id: number; name: string; ar: { name: string }[]; al: { name: string; picUrl: string }; dt: number; fee: number }[] }>(`/playlist/track/all?id=${encodeURIComponent(playlistId)}&limit=100`); setSongs(result.songs.map(item => ({ songId: item.id, name: item.name, artist: item.ar.map(value => value.name).join(' / '), album: item.al.name, cover: item.al.picUrl, durationMs: item.dt, vip: item.fee === 1 }))); });
  const currentSong = queue.find(item => keyFor(item) === state.trackKey); const currentLyrics = lyricsSong === state.trackKey ? lyrics : []; const lyricIndex = upperBound(currentLyrics, time) - 1;
  return <ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled"><VlcVideo video={video} style={{ width: 1, height: 1 }} /><Text style={ui.title}>一起听</Text><Text style={ui.text}>{currentSong ? `${currentSong.name} · ${currentSong.artist}` : state.trackKey ? '正在加载歌曲' : '从队列选择歌曲'}</Text><Text style={ui.muted}>{formatTime(time)} / {formatTime(duration)}</Text><Slider minimumValue={0} maximumValue={Math.max(1, duration)} value={time} disabled={duration <= 0} onSlidingComplete={value => void task(() => control({ action: 'seek', positionSec: value }))} /><View style={ui.row}><RoomButton label="上一首" secondary onPress={() => void task(() => control({ action: 'prev' }))} /><RoomButton label={state.isPlaying ? '暂停' : '播放'} onPress={() => void task(() => control({ action: state.isPlaying ? 'pause' : 'play' }))} /><RoomButton label="下一首" secondary onPress={() => void task(() => control({ action: 'next' }))} /><RoomButton label="重试" secondary onPress={() => { stream.current = null; setRetry(value => value + 1); }} /></View>
    <Text style={ui.title}>歌词</Text>{currentLyrics.length ? currentLyrics.slice(Math.max(0, lyricIndex - 1), Math.max(3, lyricIndex + 3)).map((line, index) => <Text key={`${line.time}:${index}`} style={line === currentLyrics[lyricIndex] ? { ...ui.text, color: '#65d59b' } : ui.muted}>{line.content}</Text>) : <Text style={ui.muted}>暂无歌词</Text>}
    {host ? <View style={ui.row}>{(['sequence', 'order', 'repeat-one', 'shuffle'] as const).map((value, index) => <RoomButton key={value} label={['顺序播放', '列表循环', '单曲循环', '随机播放'][index]} secondary onPress={() => update({ ...stateRef.current, playMode: value, updatedAt: Date.now() }, true)} />)}</View> : <Text style={ui.muted}>播放操作将向房主申请</Text>}
    <Text style={ui.title}>播放队列 · {queue.length}</Text>{queue.map((item, index) => <View key={item.id} style={ui.card}><Text style={ui.text}>{item.name} · {item.artist}</Text><View style={ui.row}><RoomButton label="播放" disabled={busy} onPress={() => void task(() => control({ action: 'playItem', item }))} />{host ? <><RoomButton label="移除" secondary disabled={busy} onPress={() => void task(() => emitAck(socket!, 'music:queue-remove', { roomId, id: item.id }))} /><RoomButton label="上移" secondary disabled={busy || index === 0} onPress={() => void task(async () => { const ids = queue.map(value => value.id); [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]; await emitAck(socket!, 'music:queue-reorder', { roomId, ids }); })} /></> : null}</View></View>)}
    {requests.map((command, index) => <View key={`${command.from}:${index}`} style={ui.card}><Text style={ui.text}>{command.username || '观众'} 申请 {command.action}</Text><View style={ui.row}>{[true, false].map(approved => <RoomButton key={String(approved)} label={approved ? '同意' : '拒绝'} disabled={busy} secondary onPress={() => void task(async () => { if (approved) await control(command, true); await emitAck(socket!, 'music:control-response', { roomId, action: command.action, from: command.from, approved }); setRequests(old => old.filter(item => item !== command)); })} />)}</View></View>)}
    <Text style={ui.title}>网易云音质</Text><View style={ui.row}>{['lossless', 'exhigh', 'higher', 'standard'].map((level, index) => <RoomButton key={level} label={['无损优先', '极高', '较高', '标准'][index]} secondary disabled={quality === level} onPress={() => { setQuality(level); stream.current = null; adapter.current?.invalidate(); setRetry(value => value + 1); void writePreference('zviewer-music-quality', { level }).catch(() => {}); }} />)}</View><Text style={ui.muted}>服务器按账号权限回退音质</Text><MusicLibrary showSongs={setSongs} add={item => task(() => control({ action: 'addQueue', item }))} />
    <Text style={ui.title}>搜索歌曲</Text><RoomInput value={search} onChangeText={setSearch} placeholder="歌曲 / 歌手" /><RoomButton label={busy ? '处理中…' : '搜索'} disabled={busy || !search.trim()} onPress={() => void searchMusic()} /><RoomInput value={playlistId} onChangeText={setPlaylistId} keyboardType="number-pad" placeholder="网易云歌单编号" /><RoomButton label="导入歌单" disabled={busy || !/^\d+$/.test(playlistId)} secondary onPress={() => void importPlaylist()} />{songs.map(item => <View key={item.songId} style={ui.card}><Text style={ui.text}>{item.name} · {item.artist}{item.vip ? ' · VIP' : ''}</Text><RoomButton label="添加到队列" disabled={busy} secondary onPress={() => void task(() => control({ action: 'addQueue', item }))} /></View>)}
    <Text style={ui.title}>网易云账号</Text><RoomButton label="扫码登录" secondary disabled={busy} onPress={() => void qrLogin()} />{qr ? <Image source={{ uri: qr }} style={{ width: 220, height: 220, backgroundColor: 'white' }} /> : null}<Text style={ui.muted}>{loginMessage}</Text>{error ? <Text style={ui.error}>{error}</Text> : null}
  </ScrollView>;
}
function keyForCurrent(value: { key: string } | null) { return value?.key; }
