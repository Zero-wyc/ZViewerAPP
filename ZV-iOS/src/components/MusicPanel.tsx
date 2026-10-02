import { MediaImage as Image } from './MediaImage';
import { useAppearance } from '@/state/appearance';
import Feather from '@expo/vector-icons/Feather';
import { biliOperation } from '@/lib/nativeBridge';
/* eslint-disable react-hooks/immutability -- the VLC port exposes imperative native controls. */
import Slider from '@react-native-community/slider';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { emitAck } from '@/lib/socket';
import { NativeMediaAdapter, type Playback } from '@/lib/mediaAdapter';
import { formatTime } from '@/lib/sources';
import { messageFor } from '@/lib/server';
import { parseLyrics, roomTime, upperBound, type TimedText } from '@/lib/timeline';
import { useSession } from '@/state/session';
import { VlcVideo, useVlcVideo } from './VlcVideo';
import { RoomButton, RoomIconButton, RoomInput, ui as baseUi } from './RoomUi';
import { playbackSource, onBiliChange, biliFallback } from '@/lib/biliNative';
import { MusicLibrary, musicPages, type MusicPage } from './MusicLibrary';
import { MusicVideo } from './MusicVideo';
import { SongComments } from './SongComments';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { QueueCursor } from '@/lib/musicQueue';
import { ScopedCache } from '@/lib/scopedCache';
import { useSystemMedia } from '@/hooks/useSystemMedia';
import { neteaseImageUrl } from '@/lib/neteaseImage';
import { readPreference, writePreference } from '@/lib/preferences';
type Song = { songId: number; name: string; artist: string; album: string; cover: string; durationMs: number; vip: boolean; biliBvid?: string; biliCid?: number };
type QueueItem = Song & { id: number };
type MusicState = { trackSongId: number | null; trackKey: string | null; isPlaying: boolean; positionSec: number; playMode: 'sequence' | 'order' | 'repeat-one' | 'shuffle'; updatedAt: number; roomId?: string };
type ControlRequest = { action: 'play' | 'pause' | 'seek' | 'next' | 'prev' | 'addQueue' | 'playItem'; item?: Song; positionSec?: number; from?: string; username?: string; roomId?: string };
const empty: MusicState = { trackSongId: null, trackKey: null, isPlaying: false, positionSec: 0, playMode: 'sequence', updatedAt: 0 };
const lyricCache = new ScopedCache<TimedText[]>(20, 300_000);
const keyFor = (song: Song) => song.biliBvid ? `bili:${song.biliBvid}:${song.biliCid || 0}` : `ncm:${song.songId}`;
export function MusicPanel({ roomId, host, onExpandedLandscape }: { roomId: string; host: boolean; onExpandedLandscape: (expanded: boolean) => void }) {
  const theme = useAppearance();
  const musicStyles = theme.styles(baseMusicStyles);
  const ui = theme.styles(baseUi);

  const { session, socket, requestText } = useSession(); const video = useVlcVideo(); const { player } = video;
  const [queue, setQueue] = useState<QueueItem[]>([]); const [state, setState] = useState(empty); const [search, setSearch] = useState(''); const [songs, setSongs] = useState<Song[]>([]);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [time, setTime] = useState(0); const [duration, setDuration] = useState(0); const [lyrics, setLyrics] = useState<TimedText[]>([]); const [lyricsSong, setLyricsSong] = useState<string | null>(null);
  const [requests, setRequests] = useState<ControlRequest[]>([]); const [qr, setQr] = useState(''); const [qrKey, setQrKey] = useState(''); const [loginMessage, setLoginMessage] = useState(''); const [playlistId, setPlaylistId] = useState(''); const [retry, setRetry] = useState(0);
  const [quality, setQuality] = useState('lossless');
  const [accountRevision, setAccountRevision] = useState(0);
  const [currentItemId, setCurrentItemId] = useState<number | null>(null);
  const cursor = useRef(new QueueCursor()); const endedAt = useRef('');
  const [lyricError, setLyricError] = useState(''); const [lyricRetry, setLyricRetry] = useState(0);
  const [page, setPage] = useState<MusicPage>('mymusic'); const [queueOpen, setQueueOpen] = useState(false); const [playerOpen, setPlayerOpen] = useState(false); const [accountOpen, setAccountOpen] = useState(false); const [ncmMenu, setNcmMenu] = useState(false);
  const { width, height } = useWindowDimensions(); const insets = useSafeAreaInsets();
  const afterPlayer = useRef<{ kind: 'queue' | 'comments'; songId?: number } | null>(null);
  const [pure, setPure] = useState(false); const [commentSong, setCommentSong] = useState<number | null>(null);
  useEffect(() => { onExpandedLandscape(playerOpen && width > height); return () => onExpandedLandscape(false); }, [playerOpen, width, height, onExpandedLandscape]);
  const showSongs = (items: Song[]) => { setSongs(items); setPage('search'); };
  useEffect(() => { let active = true; void readPreference('zviewer-music-quality', { level: 'lossless' }).then(value => { if (active && ['lossless', 'exhigh', 'higher', 'standard'].includes(value.level)) setQuality(value.level); }); return () => { active = false; }; }, []);
  const adapter = useRef<NativeMediaAdapter | null>(null); const stateRef = useRef(state); const queueRef = useRef(queue); const hostRef = useRef(host); const stream = useRef<{ key: string; source: Playback } | null>(null);
  useEffect(() => { stateRef.current = state; queueRef.current = queue; hostRef.current = host; }, [state, queue, host]);
  useEffect(() => { const media = new NativeMediaAdapter(player, playbackSource); adapter.current = media; return () => { media.dispose(); adapter.current = null; }; }, [player]);
  useEffect(() => onBiliChange(() => { lyricCache.clear(); setLyricRetry(value => value + 1); stream.current = null; adapter.current?.invalidate(); setRetry(value => value + 1); }), []);
  const ncm = useCallback(async <T,>(path: string, signal?: AbortSignal): Promise<T> => {
    const result = JSON.parse(await requestText(`/api/music/ncm${path}`, { signal })); if (result.code !== 200 && ![800, 801, 802, 803].includes(result.code)) throw new Error(result.message || '网易云请求失败'); return result;
  }, [requestText]);
  const update = useCallback((next: MusicState, broadcast = false) => { stateRef.current = next; setState(next); if (broadcast) socket?.emit('music:sync-state', { roomId, ...next }); }, [socket, roomId]);
  const choose = useCallback((item: Song) => {
    const match = 'id' in item ? queueRef.current.find(value => value.id === item.id) : queueRef.current.find(value => keyFor(value) === keyFor(item));
    if (match) { cursor.current.select(queueRef.current, match.id); setCurrentItemId(match.id); }
    if (stateRef.current.trackKey === keyFor(item)) player.currentTime = 0;
    endedAt.current = '';
    update({ ...stateRef.current, trackKey: keyFor(item), trackSongId: item.biliBvid ? null : item.songId, positionSec: 0, isPlaying: true, updatedAt: Date.now() }, true);
  }, [update, player]);
  const control = useCallback(async (command: ControlRequest, approved = false) => {
    if (!socket) return;
    if (!hostRef.current && !approved) { await emitAck(socket, 'music:control-request', { roomId, ...command }); setError('已向房主发送控制申请'); return; }
    const current = stateRef.current; const items = queueRef.current;
    if (command.action === 'addQueue' || command.action === 'playItem') {
      if (!command.item) return; const existing = 'id' in command.item && items.some(value => value.id === (command.item as QueueItem).id); if (!existing || command.action === 'addQueue') await emitAck(socket, 'music:queue-upsert', { roomId, item: command.item }); if (command.action === 'playItem') choose(command.item); return;
    }
    if (command.action === 'next' || command.action === 'prev') {
      const next = cursor.current.advance(items, current.trackKey, command.action, current.playMode === 'shuffle', current.playMode !== 'order'); if (!next) return;
      choose(next as QueueItem); return;
    }
    if (command.action === 'seek' && (player.duration <= 0 || !Number.isFinite(command.positionSec))) return;
    const positionSec = command.action === 'seek' ? Math.min(player.duration, Math.max(0, command.positionSec || 0)) : player.currentTime;
    if (command.action === 'play') { player.play(); endedAt.current = ''; }
    if (command.action === 'pause') player.pause();
    if (command.action === 'seek') player.currentTime = positionSec;
    update({ ...current, isPlaying: command.action === 'play' ? true : command.action === 'pause' ? false : current.isPlaying, positionSec, updatedAt: Date.now() }, true);
  }, [socket, roomId, player, choose, update]);
  const task = async (work: () => Promise<unknown>) => { setBusy(true); setError(''); try { await work(); } catch (failure) { setError(messageFor(failure)); } finally { setBusy(false); } };
  useEffect(() => {
    if (!socket) return; let active = true;
    const queueChanged = (payload: { roomId: string; items: QueueItem[] }) => { if (payload.roomId === roomId) { queueRef.current = payload.items; setQueue(payload.items); if (!payload.items.length) { cursor.current.id = null; setCurrentItemId(null); update({ ...stateRef.current, trackKey: null, trackSongId: null, isPlaying: false, positionSec: 0 }); } } };
    const synced = (payload: MusicState) => { if (payload.roomId !== roomId || hostRef.current) return; update(payload); const target = roomTime(payload.positionSec, payload.isPlaying, payload.updatedAt); if (stream.current?.source.sourceUrl.includes(payload.trackKey?.startsWith('ncm:') ? `songId=${payload.trackSongId}` : payload.trackKey?.split(':')[1] || 'invalid') && Math.abs(player.currentTime - target) > 2) player.currentTime = target; };
    const requested = (payload: ControlRequest) => { if (payload.roomId === roomId && hostRef.current) setRequests(old => [...old.slice(-19), payload]); };
    const response = (payload: { approved: boolean; from: string }) => { if (payload.from === socket.id) setError(payload.approved ? '房主已同意申请' : '房主拒绝了申请'); };
    socket.on('music:queue-changed', queueChanged); socket.on('music:sync-state', synced); socket.on('music:host-heartbeat', synced); socket.on('music:control-request', requested); socket.on('music:control-response', response);
    const restore = () => { void emitAck<{ queue: QueueItem[]; syncState: MusicState | null }>(socket, 'music:get-state', { roomId }).then(data => { if (!active) return; queueRef.current = data.queue; setQueue(data.queue); if (data.syncState) update(data.syncState); }).catch(failure => { if (active) setError(messageFor(failure)); }); };
    socket.on('connect', restore); if (socket.connected) restore();
    return () => { active = false; socket.off('connect', restore); socket.off('music:queue-changed', queueChanged); socket.off('music:sync-state', synced); socket.off('music:host-heartbeat', synced); socket.off('music:control-request', requested); socket.off('music:control-response', response); };
  }, [socket, roomId, player, update]);
  useEffect(() => {
    if (!session || !adapter.current) return; const cancel = new AbortController(); const media = adapter.current; const current = stateRef.current;
    const scope = JSON.stringify([session.serverUrl, session.user.id, accountRevision, quality, current.trackKey]);
    void (async () => {
      if (!current.trackKey) { stream.current = null; await adapter.current?.apply(null, session.serverUrl, session.accessToken); return; }
      if (stream.current?.key !== scope) {
        let source: Playback;
        if (current.trackKey.startsWith('bili:')) { const [, bvid, cid] = current.trackKey.split(':'); source = { sourceUrl: `https://www.bilibili.com/video/${bvid}?cid=${cid}`, sourceType: 'bilibili', format: 'audio', isPlaying: false, currentTime: 0 }; }
        else { const id = Number(current.trackKey.slice(4)); if (!Number.isSafeInteger(id) || id < 1) throw new Error('无效的歌曲编号'); source = { sourceUrl: `/api/music/stream?songId=${id}&level=${quality}&roomId=${encodeURIComponent(roomId)}`, sourceType: 'url', isPlaying: false, currentTime: 0 }; }
        if (cancel.signal.aborted) return; stream.current = { key: scope, source };
      }
      const desired = { ...stream.current!.source, currentTime: roomTime(current.positionSec, current.isPlaying, current.updatedAt), isPlaying: current.isPlaying };
      await adapter.current?.apply(desired, session.serverUrl, session.accessToken, retry);
      if (!cancel.signal.aborted && !hostRef.current) socket?.emit('music:sync-ack', { roomId });
    })().catch(failure => { if (!cancel.signal.aborted) { adapter.current?.invalidate(); setError(messageFor(failure)); } });
    return () => { cancel.abort(); media.cancelPending(); };
  }, [state, session, roomId, retry, requestText, socket, quality, accountRevision]);
  useEffect(() => {
    const progress = player.addListener('timeUpdate', event => setTime(event.currentTime)); const loaded = player.addListener('sourceLoad', event => setDuration(event.duration));
    const status = player.addListener('statusChange', event => { if (event.status === 'error') { adapter.current?.invalidate(); const current = stream.current?.source; if (current?.sourceType === 'bilibili' && biliFallback(current.sourceUrl)) { stream.current = null; setRetry(value => value + 1); } else setError(event.error?.message || '音频播放失败'); } });
    return () => { progress.remove(); loaded.remove(); status.remove(); };
  }, [player]);
  useEffect(() => {
    if (!host || !socket) return;
    let last = 0;
    const heartbeat = () => { if (Date.now() - last < 1800 || !socket.connected || adapter.current?.busy || player.preparing || !stateRef.current.trackKey) return; last = Date.now(); const current = { ...stateRef.current, positionSec: player.currentTime, isPlaying: player.playing, updatedAt: Date.now() }; stateRef.current = current; socket.emit('music:host-heartbeat', { roomId, ...current });
      if (player.duration > 0 && player.currentTime >= player.duration - 0.6 && !player.playing && endedAt.current !== `${cursor.current.id}:${current.trackKey}`) { endedAt.current = `${cursor.current.id}:${current.trackKey}`; const items = queueRef.current; const index = cursor.current.locate(items, current.trackKey); if (current.playMode === 'repeat-one') void control({ action: 'seek', positionSec: 0 }).then(() => control({ action: 'play' })); else if (current.playMode !== 'order' || index < items.length - 1) void control({ action: 'next' }); }
    }; const interval = setInterval(heartbeat, 2000); const progress = player.addListener('timeUpdate', heartbeat); return () => { clearInterval(interval); progress.remove(); };
  }, [host, socket, roomId, player, control]);
  useEffect(() => {
    if (!session) return; let active = true; const key = state.trackKey;
    void Promise.resolve().then(() => { if (active) { setLyrics([]); setLyricsSong(null); setLyricError(''); } }); if (!key) return () => { active = false; };
    const scope = JSON.stringify([session.serverUrl, session.user.id, accountRevision, lyricRetry, key]);
    void lyricCache.get(scope, async () => {
      if (key.startsWith('ncm:')) { const value = await ncm<{ lrc?: { lyric?: string } }>(`/lyric?id=${Number(key.slice(4))}`); return parseLyrics(value.lrc?.lyric || ''); }
      const [, bvid, cid] = key.split(':'); const value = await biliOperation<{ data: { lines: TimedText[] } }>('catalog', JSON.stringify({ kind: 'lyrics', bvid, cid: Number(cid) }));
      return value.data.lines.filter(line => Number.isFinite(line.time) && line.time >= 0 && typeof line.content === 'string').sort((a, b) => a.time - b.time);
    }).then(value => { if (active) { setLyrics(value); setLyricsSong(key); } }).catch(() => { if (active) setLyricError('歌词获取失败，可重试'); });
    return () => { active = false; };
  }, [state.trackKey, session, ncm, accountRevision, lyricRetry]);
  useEffect(() => {
    if (!qrKey) return; const cancel = new AbortController(); let pending = false;
    const timer = setInterval(() => { if (pending) return; pending = true; void ncm<{ code: number }>(`/login/qr/check?key=${encodeURIComponent(qrKey)}&timestamp=${Date.now()}`, cancel.signal).then(data => { if (cancel.signal.aborted) return; setLoginMessage(data.code === 803 ? '网易云登录成功' : data.code === 802 ? '请在网易云确认登录' : data.code === 800 ? '二维码已过期，请重新获取' : '等待扫码'); if (data.code === 803) setAccountRevision(value => value + 1); if (data.code === 803 || data.code === 800) { setQrKey(''); setQr(''); } }).catch(() => { if (!cancel.signal.aborted) setLoginMessage('扫码查询失败，可重新获取二维码'); }).finally(() => { pending = false; }); }, 3000);
    return () => { clearInterval(timer); cancel.abort(); };
  }, [qrKey, ncm]);
  const searchMusic = () => task(async () => { const data = await ncm<{ result?: { songs?: { id: number; name: string; ar?: { name: string }[]; al?: { name: string; picUrl: string }; dt?: number; fee?: number }[] } }>(`/cloudsearch?keywords=${encodeURIComponent(search)}&type=1&limit=30`); setSongs((data.result?.songs || []).map(song => ({ songId: song.id, name: song.name, artist: (song.ar || []).map(item => item.name).join(' / '), album: song.al?.name || '', cover: song.al?.picUrl || '', durationMs: song.dt || 0, vip: song.fee === 1 }))); });
  const qrLogin = () => task(async () => { const key = await ncm<{ data: { unikey: string } }>('/login/qr/key'); const result = await ncm<{ data: { qrimg: string } }>(`/login/qr/create?key=${encodeURIComponent(key.data.unikey)}&qrimg=true`); setQr(result.data.qrimg); setQrKey(key.data.unikey); setLoginMessage('请使用网易云音乐扫码'); });
  const importPlaylist = () => task(async () => { const result = await ncm<{ songs: { id: number; name: string; ar: { name: string }[]; al: { name: string; picUrl: string }; dt: number; fee: number }[] }>(`/playlist/track/all?id=${encodeURIComponent(playlistId)}&limit=100`); setSongs(result.songs.map(item => ({ songId: item.id, name: item.name, artist: item.ar.map(value => value.name).join(' / '), album: item.al.name, cover: item.al.picUrl, durationMs: item.dt, vip: item.fee === 1 }))); });
  const currentSong = queue.find(item => item.id === currentItemId && keyFor(item) === state.trackKey) || queue.find(item => keyFor(item) === state.trackKey); const currentLyrics = lyricsSong === state.trackKey ? lyrics : []; const lyricIndex = upperBound(currentLyrics, time) - 1;
  useSystemMedia(player, state.trackKey && session ? { mediaId: `${roomId}:${state.trackKey}`, kind: 'audio', sourceIdentity: state.trackKey.startsWith('bili:') ? `https://www.bilibili.com/video/${state.trackKey.split(':')[1]}?cid=${state.trackKey.split(':')[2]}` : `${session.serverUrl}/api/music/stream?songId=${state.trackKey.slice(4)}&level=${quality}&roomId=${encodeURIComponent(roomId)}`, title: currentSong?.name || '一起听', artist: currentSong?.artist, album: currentSong?.album, cover: neteaseImageUrl(currentSong?.cover, 600, session.serverUrl), host, actions: ['play', 'pause', 'seek', 'next', 'prev'] } : null, (action, value) => { if (['play', 'pause', 'seek', 'next', 'prev'].includes(action)) void control({ action: action as ControlRequest['action'], positionSec: value }).catch(() => setError('系统控制失败')); });
  const playSong = (item: Song) => task(() => control({ action: 'playItem', item }));
  const addSong = (item: Song) => task(() => control({ action: 'addQueue', item }));
  const songRow = (item: Song, index: number) => <View key={keyFor(item)} style={musicStyles.songRow}><Text style={ui.muted}>{String(index + 1).padStart(2, '0')}</Text>{item.cover ? <Image source={{ uri: item.cover }} style={musicStyles.smallCover} /> : null}<View style={{ flex: 1 }}><Text style={ui.text} numberOfLines={1}>{item.name}{item.vip ? ' · VIP' : ''}</Text><Text style={ui.muted} numberOfLines={1}>{item.artist} · {item.album}</Text></View><RoomButton label="播放" secondary disabled={busy} onPress={() => void playSong(item)} /><RoomButton label="添加到队列" secondary disabled={busy} onPress={() => void addSong(item)} /></View>;
  const playButtons = <View style={[ui.row, { justifyContent: 'center' }]}><RoomButton label="上一首" secondary onPress={() => void task(() => control({ action: 'prev' }))} /><RoomButton label={state.isPlaying ? '暂停' : '播放'} onPress={() => void task(() => control({ action: state.isPlaying ? 'pause' : 'play' }))} /><RoomButton label="下一首" secondary onPress={() => void task(() => control({ action: 'next' }))} /></View>;
  const dismiss = (close: () => void) => <Pressable accessibilityRole="button" accessibilityLabel="收起 / 关闭" onPress={close} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#edf1ef', alignItems: 'center', justifyContent: 'center' }}><Feather name="chevron-down" size={24} color="#111417" /></Pressable>;
  return <View style={musicStyles.shell}><VlcVideo video={video} style={{ position: 'absolute', width: 1, height: 1 }} />
    <View style={musicStyles.top}><View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 26 }}><View testID="ncm-menu-anchor" style={{ position: 'relative', zIndex: 31 }}><Pressable accessibilityRole="button" accessibilityLabel="网易云音乐" onPress={() => setNcmMenu(value => !value)} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={{ color: page !== 'bilibili' ? '#edf1ef' : '#7c888b', fontSize: 19, fontWeight: '600' }}>网易云音乐 ⌄</Text><View style={{ width: 14, height: 2, backgroundColor: page !== 'bilibili' ? '#edf1ef' : 'transparent', alignSelf: 'center', marginTop: 6 }} /></Pressable>{ncmMenu ? <View testID="ncm-menu" style={{ position: 'absolute', top: '100%', marginTop: 8, left: 0, zIndex: 30, width: 240, backgroundColor: theme.color('#20272a', 'backgroundColor'), borderWidth: 1, borderColor: theme.color('#485256', 'borderColor'), padding: 12, borderRadius: 12, gap: 4 }}>{musicPages.filter(item => item.key !== 'bilibili').map(item => <Pressable key={item.key} accessibilityRole="button" onPress={() => { setPage(item.key); setNcmMenu(false); }} style={musicStyles.navItem}><Text style={{ color: page === item.key ? '#edf1ef' : '#9aa5a7', fontSize: 18 }}>{item.label}</Text></Pressable>)}<RoomButton label="音乐设置" secondary onPress={() => { setPage('settings'); setNcmMenu(false); }} /></View> : null}</View><Pressable accessibilityRole="button" accessibilityLabel="哔哩哔哩" onPress={() => { setPage('bilibili'); setNcmMenu(false); }} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={{ color: page === 'bilibili' ? '#edf1ef' : '#7c888b', fontSize: 19, fontWeight: '600' }}>哔哩哔哩</Text></Pressable></View><RoomIconButton label="搜索" icon="search" onPress={() => { setNcmMenu(false); setPage('search'); }} /><RoomIconButton label="账号" icon="user" onPress={() => { setNcmMenu(false); setAccountOpen(true); }} /></View>
    <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }} contentContainerStyle={{ gap: 18, padding: 16, paddingBottom: 135 }}>
      {page === 'search' ? <><Text style={musicStyles.pageTitle}>搜索音乐</Text><View style={ui.row}><RoomInput value={search} onChangeText={setSearch} placeholder="歌曲 / 歌手" style={{ flex: 1 }} /><RoomButton label={busy ? '处理中…' : '搜索歌曲'} disabled={busy || !search.trim()} onPress={() => void searchMusic()} /></View><View style={ui.row}><RoomInput value={playlistId} onChangeText={setPlaylistId} keyboardType="number-pad" placeholder="网易云歌单编号" style={{ flex: 1 }} /><RoomButton label="导入歌单" disabled={busy || !/^\d+$/.test(playlistId)} secondary onPress={() => void importPlaylist()} /></View>{songs.map(songRow)}</> : page === 'settings' ? <><Text style={musicStyles.pageTitle}>音乐设置</Text><Text style={ui.title}>网易云音质</Text><View style={ui.row}>{['lossless', 'exhigh', 'higher', 'standard'].map((level, index) => <RoomButton key={level} label={['无损优先', '极高', '较高', '标准'][index]} secondary disabled={quality === level} onPress={() => { setQuality(level); stream.current = null; adapter.current?.invalidate(); setRetry(value => value + 1); void writePreference('zviewer-music-quality', { level }).catch(() => {}); }} />)}</View><Text style={ui.muted}>服务器按账号权限回退音质</Text><Text style={ui.title}>播放模式</Text><View style={ui.row}>{(['sequence', 'order', 'repeat-one', 'shuffle'] as const).map((value, index) => <RoomButton key={value} label={['顺序循环', '按顺序播放', '单曲循环', '随机播放'][index]} secondary disabled={!host || state.playMode === value} onPress={() => update({ ...stateRef.current, playMode: value, updatedAt: Date.now() }, true)} />)}</View><RoomButton label="重试播放" secondary onPress={() => { stream.current = null; setRetry(value => value + 1); }} /></> : <MusicLibrary accountRevision={accountRevision} accountChanged={() => { lyricCache.clear(); setAccountRevision(value => value + 1); stream.current = null; adapter.current?.invalidate(); }} login={() => { setAccountOpen(true); void qrLogin(); }} page={page} showSongs={showSongs} add={addSong} play={playSong} />}
      {requests.map((command, index) => <View key={`${command.from}:${index}`} style={ui.card}><Text style={ui.text}>{command.username || '观众'} 申请 {command.action}</Text><View style={ui.row}>{[true, false].map(approved => <RoomButton key={String(approved)} label={approved ? '同意' : '拒绝'} disabled={busy} secondary onPress={() => void task(async () => { if (approved) await control(command, true); await emitAck(socket!, 'music:control-response', { roomId, action: command.action, from: command.from, approved }); setRequests(old => old.filter(item => item !== command)); })} />)}</View></View>)}
      {error ? <Text style={ui.error}>{error}</Text> : null}
    </ScrollView>
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 20, alignItems: 'center' }}><View style={musicStyles.widget}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Pressable accessibilityRole="button" accessibilityLabel="打开完整音乐播放器" onPress={() => setPlayerOpen(true)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>{currentSong?.cover ? <Image source={{ uri: currentSong.cover }} style={musicStyles.smallCover} /> : <View style={[musicStyles.smallCover, { backgroundColor: theme.color('#33443a', 'backgroundColor'), justifyContent: 'center', alignItems: 'center' }]}><Feather name="music" size={22} color="#7d898c" /></View>}<View style={{ flex: 1 }}><Text style={ui.text} numberOfLines={1}>{currentSong?.name || '一起听'}</Text><Text style={ui.muted} numberOfLines={1}>{currentSong?.artist || '选择喜欢的音乐'}</Text></View></Pressable><RoomIconButton label="上一首" icon="skip-back" onPress={() => void task(() => control({ action: 'prev' }))} /><RoomIconButton label={state.isPlaying ? '暂停' : '播放'} icon={state.isPlaying ? 'pause' : 'play'} onPress={() => void task(() => control({ action: state.isPlaying ? 'pause' : 'play' }))} /><RoomIconButton label="下一首" icon="skip-forward" onPress={() => void task(() => control({ action: 'next' }))} />{width >= 850 ? <View style={{ width: 100 }}><Text style={{ ...ui.muted, fontSize: 10 }}>VOLUME {Math.round(player.mediaSettings.volume)}</Text><Slider minimumValue={0} maximumValue={100} value={player.mediaSettings.volume} onValueChange={value => player.configure({ volume: value })} onSlidingComplete={value => void writePreference('zviewer-volume', { value })} minimumTrackTintColor="#edf1ef" /></View> : null}<RoomIconButton label="队列" icon="list" onPress={() => setQueueOpen(true)} /></View><Slider accessibilityLabel="音乐进度" style={{ height: 22 }} minimumValue={0} maximumValue={Math.max(1, duration)} value={time} disabled={duration <= 0} minimumTrackTintColor="#65d59b" maximumTrackTintColor="#4a5557" onSlidingComplete={value => void task(() => control({ action: 'seek', positionSec: value }))} /></View></View>
    <Modal visible={queueOpen} transparent animationType="slide" supportedOrientations={['portrait', 'landscape']} onRequestClose={() => setQueueOpen(false)}><View style={musicStyles.modal}><View style={musicStyles.sheet}><View style={ui.row}><Text style={[ui.title, { flex: 1 }]}>播放队列 · {queue.length}</Text>{dismiss(() => setQueueOpen(false))}</View><ScrollView contentContainerStyle={{ gap: 10 }}>{queue.map((item, index) => <View key={item.id} style={ui.card}><Text style={ui.text}>{item.name} · {item.artist}</Text><View style={ui.row}><RoomButton label="播放" disabled={busy} onPress={() => void playSong(item)} />{host ? <><RoomButton label="移除" secondary disabled={busy} onPress={() => void task(() => emitAck(socket!, 'music:queue-remove', { roomId, id: item.id }))} /><RoomButton label="上移" secondary disabled={busy || index === 0} onPress={() => void task(async () => { const ids = queue.map(value => value.id); [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]; await emitAck(socket!, 'music:queue-reorder', { roomId, ids }); })} /></> : null}</View></View>)}</ScrollView></View></View></Modal>
    <Modal visible={accountOpen} transparent animationType="fade" supportedOrientations={['portrait', 'landscape']} onRequestClose={() => setAccountOpen(false)}><View style={musicStyles.modal}><ScrollView style={musicStyles.sheet} contentContainerStyle={{ gap: 16 }}><View style={ui.row}><Text style={[ui.title, { flex: 1 }]}>网易云账号</Text>{dismiss(() => setAccountOpen(false))}</View><Text style={ui.muted}>登录网易云后全房间可播放账号有权限的歌曲</Text><RoomButton label="扫码登录" secondary disabled={busy} onPress={() => void qrLogin()} />{qr ? <Image source={{ uri: qr }} style={{ width: 220, height: 220, alignSelf: 'center', backgroundColor: 'white' }} /> : null}<Text style={ui.muted}>{loginMessage}</Text><RoomButton label="我的音乐" secondary onPress={() => { setPage('mymusic'); setAccountOpen(false); }} /></ScrollView></View></Modal>
    <Modal visible={playerOpen} onDismiss={() => { const next = afterPlayer.current; afterPlayer.current = null; if (next?.kind === "queue") setQueueOpen(true); if (next?.kind === "comments") setCommentSong(next.songId || null); }} animationType="slide" supportedOrientations={['portrait', 'landscape']} onRequestClose={() => { setPure(false); setPlayerOpen(false); }}><View style={{ flex: 1, padding: 24, paddingTop: Math.max(24, insets.top), paddingBottom: Math.max(24, insets.bottom), paddingLeft: Math.max(24, insets.left), paddingRight: Math.max(24, insets.right), backgroundColor: theme.color('#101719', 'backgroundColor'), gap: 20 }}><MusicVideo trackKey={state.trackKey} expanded={playerOpen} pure={pure} setPure={setPure} audio={player} control={(action, value) => void task(() => control({ action, positionSec: value }))} /><View pointerEvents={pure ? 'none' : 'auto'} style={{ flex: 1, gap: 20, opacity: pure ? 0 : 1 }}><View style={ui.row}><Text style={[ui.title, { flex: 1 }]}>一起听</Text>{dismiss(() => { setPure(false); setPlayerOpen(false); })}</View><ScrollView contentContainerStyle={{ flexGrow: 1 }}><View style={{ flex: width > height ? 1 : undefined, flexDirection: width > height ? 'row' : 'column', gap: 32 }}><View style={{ flex: width > height ? 1 : undefined, flexShrink: 0, gap: 18, justifyContent: 'center' }}>{currentSong?.cover ? <Image source={{ uri: currentSong.cover }} style={{ width: '100%', maxWidth: 360, aspectRatio: 1, alignSelf: 'center', borderRadius: 20 }} /> : <View style={{ height: 160, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: theme.color('#65d59b', 'color'), fontSize: 72 }}>♫</Text></View>}<Text style={[musicStyles.pageTitle, { textAlign: 'center' }]}>{currentSong?.name || '选择歌曲'}</Text><Text style={[ui.muted, { textAlign: 'center' }]}>{currentSong?.artist}</Text><Text style={[ui.muted, { textAlign: 'center' }]}>{formatTime(time)} / {formatTime(duration)}</Text><Slider minimumValue={0} maximumValue={Math.max(1, duration)} value={time} disabled={duration <= 0} minimumTrackTintColor="#65d59b" onSlidingComplete={value => void task(() => control({ action: 'seek', positionSec: value }))} />{playButtons}<RoomButton label="播放队列" secondary onPress={() => { afterPlayer.current = { kind: "queue" }; setPure(false); setPlayerOpen(false); }} /><RoomButton label="歌曲评论" secondary disabled={!currentSong?.songId} onPress={() => { afterPlayer.current = { kind: "comments", songId: currentSong?.songId }; setPure(false); setPlayerOpen(false); }} /></View><View style={{ flex: width > height ? 1 : undefined, flexShrink: 0, minHeight: 220, justifyContent: 'center', gap: 22 }}>{currentLyrics.length ? currentLyrics.slice(Math.max(0, lyricIndex - 3), Math.max(7, lyricIndex + 4)).map((line, index) => <Text key={`${line.time}:${index}`} style={{ color: theme.color(line === currentLyrics[lyricIndex] ? '#65d59b' : '#788588'), fontSize: line === currentLyrics[lyricIndex] ? 24 : 18, fontWeight: '600', textAlign: 'center' }}>{line.content}</Text>) : <View><Text style={[ui.muted, { textAlign: 'center' }]}>{lyricError || '暂无歌词'}</Text>{lyricError ? <RoomButton label="重试歌词" secondary onPress={() => setLyricRetry(value => value + 1)} /> : null}</View>}</View></View></ScrollView></View></View></Modal><SongComments songId={commentSong} close={() => setCommentSong(null)} />
  </View>;

}

const baseMusicStyles = StyleSheet.create({
  shell: { flex: 1, minHeight: 400, backgroundColor: '#111417', borderRadius: 0, overflow: 'hidden' }, top: { zIndex: 40, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 }, brand: { color: '#edf1ef', fontSize: 17, fontWeight: '700' }, nav: { gap: 24, paddingHorizontal: 20, paddingBottom: 8 }, navItem: { minHeight: 44, justifyContent: 'center' }, pageTitle: { color: '#edf1ef', fontSize: 26, fontWeight: '700' }, smallCover: { width: 44, height: 44, borderRadius: 8 }, songRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderColor: '#293033', paddingVertical: 10 }, widget: { width: '96%', maxWidth: 722, borderRadius: 8, backgroundColor: '#1b2326', borderWidth: 1, borderColor: '#40504a', padding: 12, gap: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }, modal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', padding: 24, justifyContent: 'center' }, sheet: { maxHeight: '85%', width: '100%', maxWidth: 720, alignSelf: 'center', borderRadius: 20, padding: 18, backgroundColor: '#1b2426', gap: 16 },
});
