import { checkAbort } from '@/lib/cancellation';
import { RoomDiscussion, RoomCommentButton } from './RoomDiscussion';
import * as Clipboard from 'expo-clipboard';
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
import { messageFor } from '@/lib/server';
import { parseLyrics, roomTime, upperBound, type TimedText } from '@/lib/timeline';
import { useSession } from '@/state/session';
import { VlcVideo, useVlcVideo } from './VlcVideo';
import { RoomButton, RoomIconButton, RoomInput, ui as baseUi } from './RoomUi';
import { playbackSource, onBiliChange, biliFallback } from '@/lib/biliNative';
import { MusicSyncReceipt, musicSourceMatches } from '@/lib/musicSyncReceipt';
import { MusicLibrary, musicPages, type MusicPage } from './MusicLibrary';
import { ExpandedMusicPlayer } from './ExpandedMusicPlayer';
import { SongComments } from './SongComments';
import { QueueCursor } from '@/lib/musicQueue';
import { ScopedCache } from '@/lib/scopedCache';
import { useSystemMedia } from '@/hooks/useSystemMedia';
import { neteaseImageUrl } from '@/lib/neteaseImage';
import { readPreference, writePreference } from '@/lib/preferences';
import { AppDialog } from './AppDialog';
import { Surface } from './Surface';
import { applyCollection, completeCollection, dailySongs, localDate, openNcmPlaylist, playlistPage, PLAYLIST_PAGE_SIZE, type MusicCollection } from '@/lib/musicCollection';
import { usePersonalFm } from '@/hooks/usePersonalFm';
import { queueFmSong, type PersonalFm } from '@/lib/personalFm';
import { PersonalFmPanel } from './PersonalFmPanel';
import { SourceDropdown } from './SourceDropdown';
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

  const { session, socket, requestText, request } = useSession(); const video = useVlcVideo(); const { player } = video;
  const [queue, setQueue] = useState<QueueItem[]>([]); const [state, setState] = useState(empty); const [search, setSearch] = useState(''); const [songs, setSongs] = useState<Song[]>([]);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [time, setTime] = useState(0); const [duration, setDuration] = useState(0); const [lyrics, setLyrics] = useState<TimedText[]>([]); const [lyricsSong, setLyricsSong] = useState<string | null>(null);
  const [requests, setRequests] = useState<ControlRequest[]>([]); const [qr, setQr] = useState(''); const [qrKey, setQrKey] = useState(''); const [loginMessage, setLoginMessage] = useState(''); const [playlistId, setPlaylistId] = useState(''); const [retry, setRetry] = useState(0);
  const [cookie, setCookie] = useState(''); const [discussionOpen, setDiscussionOpen] = useState(false); const [autoRecommend, setAutoRecommend] = useState(false);
  const recommendation = useRef({ enabled: false, pending: false }); const recommendationAbort = useRef<AbortController | null>(null);
  const [quality, setQuality] = useState('lossless');
  const [accountRevision, setAccountRevision] = useState(0);
  const [currentItemId, setCurrentItemId] = useState<number | null>(null);
  const cursor = useRef(new QueueCursor()); const endedAt = useRef(''); const endedRetryAt = useRef(0);
  const syncReceipt = useRef(new MusicSyncReceipt());
  const [lyricError, setLyricError] = useState(''); const [lyricRetry, setLyricRetry] = useState(0);
  const [page, setPage] = useState<MusicPage>('mymusic');
  const [defaultPage, setDefaultPage] = useState<MusicPage>('mymusic');
  const musicScope = `${session?.serverUrl}:${session?.user.id}`;
  useEffect(() => { let active = true; void readPreference<{ entries: Record<string, MusicPage> }>('music-default-page', { entries: {} }).then(value => { const saved = value.entries[musicScope]; if (active && musicPages.some(item => item.key === saved)) { setDefaultPage(saved); setPage(saved); } }); return () => { active = false; }; }, [musicScope]);
  useEffect(() => { let active = true; void readPreference<{ entries: Record<string, boolean> }>('music-auto-recommend', { entries: {} }).then(value => { if (active) { const enabled = value.entries[musicScope] === true; recommendation.current.enabled = enabled; setAutoRecommend(enabled); } }); return () => { active = false; recommendationAbort.current?.abort(); }; }, [musicScope, roomId]);
  const changeAutoRecommend = (enabled: boolean) => { setAutoRecommend(enabled); recommendation.current.enabled = enabled; if (!enabled) recommendationAbort.current?.abort(); void readPreference<{ entries: Record<string, boolean> }>('music-auto-recommend', { entries: {} }).then(value => writePreference('music-auto-recommend', { entries: { ...value.entries, [musicScope]: enabled } })); };
  const saveDefaultPage = (value: string) => { const next = value as MusicPage; setDefaultPage(next); void readPreference<{ entries: Record<string, MusicPage> }>('music-default-page', { entries: {} }).then(saved => writePreference('music-default-page', { entries: { ...saved.entries, [musicScope]: next } })); };  const [queueOpen, setQueueOpen] = useState(false); const [playerOpen, setPlayerOpen] = useState(false); const [accountOpen, setAccountOpen] = useState(false); const [ncmMenu, setNcmMenu] = useState(false);
  const { width, height } = useWindowDimensions(); const compactLandscape = width > height && height < 500;
  const [accountMenu, setAccountMenu] = useState(false);
  const closeAccount = () => { setCookie(''); setQrKey(''); setQr(''); setAccountOpen(false); };
  const [pure, setPure] = useState(false); const [commentSong, setCommentSong] = useState<number | null>(null);
  useEffect(() => { onExpandedLandscape(playerOpen && width > height); return () => onExpandedLandscape(false); }, [playerOpen, width, height, onExpandedLandscape]);
  const [collection, setCollection] = useState<MusicCollection | null>(null); const [collectionMessage, setCollectionMessage] = useState('');
  const batch = useRef<AbortController | null>(null); const completeSongs = useRef<Song[] | null>(null); const fmPort = useRef<PersonalFm | null>(null);
  useEffect(() => () => { batch.current?.abort(); }, [session?.serverUrl, session?.user.id, roomId, accountRevision]);
  const collectionParent = useRef<MusicPage>('mymusic');
  const showSongs = (items: Song[], context?: MusicCollection) => { if (page !== 'search') collectionParent.current = page; completeSongs.current = null; setSongs(items); setCollection(context || null); setCollectionMessage(''); setPage('search'); };
  useEffect(() => { let active = true; void readPreference('zviewer-music-quality', { level: 'lossless' }).then(value => { if (active && ['lossless', 'exhigh', 'higher', 'standard'].includes(value.level)) setQuality(value.level); }); return () => { active = false; }; }, []);
  const adapter = useRef<NativeMediaAdapter | null>(null); const stateRef = useRef(state); const queueRef = useRef(queue); const hostRef = useRef(host); const stream = useRef<{ key: string; trackKey: string; source: Playback } | null>(null);
  useEffect(() => { stateRef.current = state; queueRef.current = queue; hostRef.current = host; }, [state, queue, host]);
  useEffect(() => { const media = new NativeMediaAdapter(player, playbackSource); adapter.current = media; return () => { media.dispose(); adapter.current = null; }; }, [player]);
  useEffect(() => onBiliChange(() => { lyricCache.clear(); setLyricRetry(value => value + 1); stream.current = null; adapter.current?.invalidate(); setRetry(value => value + 1); }), []);
  const ncm = useCallback(async <T,>(path: string, signal?: AbortSignal): Promise<T> => {
    const result = JSON.parse(await requestText(`/api/music/ncm${path}`, { signal })); if (result.code !== 200 && ![800, 801, 802, 803].includes(result.code)) throw new Error(result.message || '网易云请求失败'); return result;
  }, [requestText]);
  const update = useCallback((next: MusicState, broadcast = false) => { stateRef.current = next; setState(next); if (broadcast) socket?.emit('music:sync-state', { roomId, ...next }); }, [socket, roomId]);
  const choose = useCallback((item: Song) => {
    const match = 'id' in item ? queueRef.current.find(value => value.id === item.id) : queueRef.current.find(value => keyFor(value) === keyFor(item));
    recommendationAbort.current?.abort();
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
      if (command.action === 'playItem') { fmPort.current?.stop(); recommendationAbort.current?.abort(); }
      if (!command.item) return; const existing = 'id' in command.item && items.some(value => value.id === (command.item as QueueItem).id); if (!existing || command.action === 'addQueue') await emitAck(socket, 'music:queue-upsert', { roomId, item: command.item }); if (command.action === 'playItem') choose(command.item); return;
    }
    if (command.action === 'next' || command.action === 'prev') {
      if (fmPort.current?.isActive(current.trackKey)) { await fmPort.current[command.action](); return; }
      const next = cursor.current.advance(items, current.trackKey, command.action, current.playMode === 'shuffle', current.playMode !== 'order');
      if (!next && command.action === 'next' && current.playMode === 'order' && current.trackKey?.startsWith('bili:') && recommendation.current.enabled && hostRef.current) {
        if (recommendation.current.pending) return;
        recommendation.current.pending = true; const controller = new AbortController(); recommendationAbort.current = controller;
        const isCurrent = () => !controller.signal.aborted && hostRef.current && socket.connected && stateRef.current.trackKey === current.trackKey && stateRef.current.playMode === 'order' && recommendation.current.enabled;
        const check = () => { checkAbort(controller.signal); if (!isCurrent()) throw new Error('推荐续播已取消'); };
        try {
          const data = await request<{ items: { bvid: string; cid: number; title: string; upName?: string; pic?: string; duration?: number }[] }>(`/api/stream/bilibili/related?bvid=${encodeURIComponent(current.trackKey.split(':')[1])}`, { signal: controller.signal }); check();
          const existing = new Set(queueRef.current.map(keyFor)); const fresh = data.items.filter(item => /^BV[0-9A-Za-z]+$/.test(item.bvid) && Number.isSafeInteger(item.cid) && item.cid > 0 && !existing.has(`bili:${item.bvid}:${item.cid}`)).slice(0, 3);
          for (const item of [...fresh].reverse()) { check(); await emitAck(socket, 'music:queue-upsert', { roomId, afterCurrent: true, item: { songId: 0, biliBvid: item.bvid, biliCid: item.cid, name: item.title, artist: item.upName || '哔哩哔哩', album: '', cover: item.pic || '', durationMs: (item.duration || 0) * 1000, vip: false, recommended: true } }); }
          check(); const result = await emitAck<{ queue: QueueItem[] }>(socket, 'music:get-state', { roomId }); check(); queueRef.current = result.queue; setQueue(result.queue);
          const first = fresh[0]; const added = first && result.queue.find(item => item.biliBvid === first.bvid && item.biliCid === first.cid);
          if (added) choose(added); else update({ ...current, isPlaying: false, updatedAt: Date.now() }, true);
        } catch (failure) { if (isCurrent()) { setError(messageFor(failure)); update({ ...stateRef.current, isPlaying: false, updatedAt: Date.now() }, true); } }
        finally { if (recommendationAbort.current === controller) { recommendation.current.pending = false; recommendationAbort.current = null; } }
        return;
      }
      if (!next) return;
      choose(next as QueueItem); return;
    }
    if (command.action === 'seek' && (player.duration <= 0 || !Number.isFinite(command.positionSec))) return;
    recommendationAbort.current?.abort();
    fmPort.current?.invalidate();
    const positionSec = command.action === 'seek' ? Math.min(Math.max(0, player.duration - 0.25), Math.max(0, command.positionSec || 0)) : player.currentTime;
    if (command.action === 'play') { player.play(); endedAt.current = ''; }
    if (command.action === 'pause') player.pause();
    if (command.action === 'seek') { endedAt.current = ''; player.currentTime = positionSec; if (current.isPlaying) player.play(); }
    update({ ...current, isPlaying: command.action === 'play' ? true : command.action === 'pause' ? false : current.isPlaying, positionSec, updatedAt: Date.now() }, true);
  }, [socket, roomId, player, choose, update, request]);
  const playFm = useCallback(async (item: Song, signal: AbortSignal) => {
    const { queue: restored, added } = await queueFmSong(item, signal, { isHost: () => hostRef.current && !!socket?.connected, upsert: song => emitAck(socket!, 'music:queue-upsert', { roomId, item: song }), restore: async () => (await emitAck<{ queue: QueueItem[] }>(socket!, 'music:get-state', { roomId })).queue });
    checkAbort(signal);
    if (!hostRef.current || !socket?.connected) return;
    queueRef.current = restored; setQueue(restored); choose(added);
  }, [socket, roomId, choose]);
  const roaming = usePersonalFm({ ncm, requestText, play: playFm, visible: page === 'fm', host, scope: JSON.stringify([session?.serverUrl, session?.user.id, roomId]), accountRevision });
  useEffect(() => { fmPort.current = roaming.fm; }, [roaming.fm]);
  const task = async (work: () => Promise<unknown>) => { setBusy(true); setError(''); try { await work(); } catch (failure) { setError(messageFor(failure)); } finally { setBusy(false); } };
  useEffect(() => {
    if (!socket) return; let active = true;
    const queueChanged = (payload: { roomId: string; items: QueueItem[] }) => { if (payload.roomId === roomId) { queueRef.current = payload.items; setQueue(payload.items); if (!payload.items.length) { cursor.current.id = null; setCurrentItemId(null); update({ ...stateRef.current, trackKey: null, trackSongId: null, isPlaying: false, positionSec: 0 }); } } };
    const synced = (payload: MusicState) => {
      if (payload.roomId !== roomId || hostRef.current) return;
      update(payload);
      const target = roomTime(payload.positionSec, payload.isPlaying, payload.updatedAt);
      // A different song (including another part of the same BV) must load first.
      // Substring URL matching can seek song 420 while a sync requests song 42.
      if (payload.trackKey && stream.current?.trackKey === payload.trackKey && session && !adapter.current?.busy && !player.preparing && musicSourceMatches(player.sourceIdentity, stream.current.source, session.serverUrl) && Math.abs(player.currentTime - target) > 2) player.currentTime = target;
    };
    const requested = (payload: ControlRequest) => { if (payload.roomId === roomId && hostRef.current) setRequests(old => [...old.slice(-19), payload]); };
    const response = (payload: { approved: boolean; from: string }) => { if (payload.from === socket.id) setError(payload.approved ? '房主已同意申请' : '房主拒绝了申请'); };
    socket.on('music:queue-changed', queueChanged); socket.on('music:sync-state', synced); socket.on('music:host-heartbeat', synced); socket.on('music:control-request', requested); socket.on('music:control-response', response);
    const restore = () => { void emitAck<{ queue: QueueItem[]; syncState: MusicState | null }>(socket, 'music:get-state', { roomId }).then(data => { if (!active) return; queueRef.current = data.queue; setQueue(data.queue); if (data.syncState) { const retained = hostRef.current && data.syncState.trackKey === stateRef.current.trackKey && player.duration > 0 && !player.preparing; update(retained ? { ...data.syncState, positionSec: player.currentTime, isPlaying: player.playing || player.seeking && stateRef.current.isPlaying, updatedAt: Date.now() } : data.syncState, retained); } }).catch(failure => { if (active) setError(messageFor(failure)); }); };
    const disconnect = () => { fmPort.current?.stop(); recommendationAbort.current?.abort(); };
    socket.on('connect', restore); socket.on('disconnect', disconnect); if (socket.connected) restore();
    return () => { active = false; socket.off('connect', restore); socket.off('disconnect', disconnect); socket.off('music:queue-changed', queueChanged); socket.off('music:sync-state', synced); socket.off('music:host-heartbeat', synced); socket.off('music:control-request', requested); socket.off('music:control-response', response); };
  }, [socket, roomId, player, update, session]);
  useEffect(() => {
    if (!session || !adapter.current) return; const cancel = new AbortController(); const media = adapter.current; const current = stateRef.current;
    const scope = JSON.stringify([session.serverUrl, session.user.id, roomId, accountRevision, quality, current.trackKey]);
    void (async () => {
      if (!current.trackKey) { stream.current = null; await adapter.current?.apply(null, session.serverUrl, session.accessToken); return; }
      if (stream.current?.key !== scope) {
        let source: Playback;
        if (current.trackKey.startsWith('bili:')) { const [, bvid, cid] = current.trackKey.split(':'); source = { sourceUrl: `https://www.bilibili.com/video/${bvid}?cid=${cid}`, sourceType: 'bilibili', format: 'audio', isPlaying: false, currentTime: 0 }; }
        else { const id = Number(current.trackKey.slice(4)); if (!Number.isSafeInteger(id) || id < 1) throw new Error('无效的歌曲编号'); source = { sourceUrl: `/api/music/stream?songId=${id}&level=${quality}&roomId=${encodeURIComponent(roomId)}`, sourceType: 'url', isPlaying: false, currentTime: 0 }; }
        if (cancel.signal.aborted) return; stream.current = { key: scope, trackKey: current.trackKey, source };
      }
      const desired = { ...stream.current!.source, currentTime: roomTime(current.positionSec, current.isPlaying, current.updatedAt), isPlaying: current.isPlaying };
      await adapter.current?.apply(desired, session.serverUrl, session.accessToken, retry);
    })().catch(failure => { if (!cancel.signal.aborted) { adapter.current?.invalidate(); setError(messageFor(failure)); } });
    return () => { cancel.abort(); media.cancelPending(); };
  }, [state, session, roomId, retry, requestText, socket, quality, accountRevision]);
  useEffect(() => {
    const identity = () => session && socket?.connected && !hostRef.current && stateRef.current.trackKey
      ? JSON.stringify([session.serverUrl, session.user.id, roomId, socket.id, stateRef.current.trackKey]) : '';
    const acknowledge = () => {
      const key = identity(); syncReceipt.current.observe(key);
      const expectedScope = session ? JSON.stringify([session.serverUrl, session.user.id, roomId, accountRevision, quality, stateRef.current.trackKey]) : '';
      const ready = !!session && stream.current?.key === expectedScope && musicSourceMatches(player.sourceIdentity, stream.current.source, session.serverUrl) && !adapter.current?.busy && !player.preparing && player.duration > 0;
      if (syncReceipt.current.take(key, ready)) socket?.emit('music:sync-ack', { roomId });
    };
    const disconnect = () => syncReceipt.current.observe('');
    const loaded = player.addListener('statusChange', acknowledge);
    const progress = player.addListener('timeUpdate', acknowledge);
    socket?.on('disconnect', disconnect);
    acknowledge();
    return () => { loaded.remove(); progress.remove(); socket?.off('disconnect', disconnect); };
  }, [player, socket, session, roomId, state.trackKey, host, accountRevision, quality]);
  useEffect(() => {
    const progress = player.addListener('timeUpdate', event => setTime(event.currentTime)); const loaded = player.addListener('sourceLoad', event => setDuration(event.duration));
    const status = player.addListener('statusChange', event => { if (event.status === 'error') { adapter.current?.invalidate(); const current = stream.current?.source; if (current?.sourceType === 'bilibili' && biliFallback(current.sourceUrl)) { stream.current = null; setRetry(value => value + 1); } else setError(event.error?.message || '音频播放失败'); } });
    return () => { progress.remove(); loaded.remove(); status.remove(); };
  }, [player]);
  useEffect(() => {
    if (!host || !socket) return;
    let last = 0;
    const heartbeat = () => { if (Date.now() - last < 1800 || !socket.connected || adapter.current?.busy || player.preparing || !stateRef.current.trackKey || stream.current?.trackKey !== stateRef.current.trackKey || !session || !musicSourceMatches(player.sourceIdentity, stream.current.source, session.serverUrl)) return; last = Date.now(); const current = { ...stateRef.current, positionSec: player.currentTime, isPlaying: player.ended ? false : stateRef.current.isPlaying, updatedAt: Date.now() }; if (player.ended && stateRef.current.isPlaying) update(current); else stateRef.current = current; socket.emit('music:host-heartbeat', { roomId, ...current });
      if (!batch.current && player.duration > 0 && player.ended && !player.seeking && Date.now() >= endedRetryAt.current && endedAt.current !== `${cursor.current.id}:${current.trackKey}`) { endedAt.current = `${cursor.current.id}:${current.trackKey}`; const items = queueRef.current; const index = cursor.current.locate(items, current.trackKey); if (current.playMode === 'repeat-one') void control({ action: 'seek', positionSec: 0 }).then(() => control({ action: 'play' })).catch(failure => setError(messageFor(failure))); else if (fmPort.current?.isActive(current.trackKey) || current.playMode !== 'order' || index < items.length - 1 || recommendation.current.enabled && current.trackKey?.startsWith('bili:')) void control({ action: 'next' }).catch(failure => { setError(messageFor(failure)); if (fmPort.current?.isActive(current.trackKey)) { endedAt.current = ''; endedRetryAt.current = Date.now() + 10000; } }); }
    }; const interval = setInterval(heartbeat, 2000); const progress = player.addListener('timeUpdate', heartbeat); return () => { clearInterval(interval); progress.remove(); };
  }, [host, socket, roomId, player, control, session, update]);
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
  const searchMusic = () => task(async () => { completeSongs.current = null; setCollection(null); setCollectionMessage(''); const data = await ncm<{ result?: { songs?: { id: number; name: string; ar?: { name: string }[]; al?: { name: string; picUrl: string }; dt?: number; fee?: number }[] } }>(`/cloudsearch?keywords=${encodeURIComponent(search)}&type=1&limit=30`); setSongs((data.result?.songs || []).map(song => ({ songId: song.id, name: song.name, artist: (song.ar || []).map(item => item.name).join(' / '), album: song.al?.name || '', cover: song.al?.picUrl || '', durationMs: song.dt || 0, vip: song.fee === 1 }))); });
  const qrLogin = () => task(async () => { const key = await ncm<{ data: { unikey: string } }>('/login/qr/key'); const result = await ncm<{ data: { qrimg: string } }>(`/login/qr/create?key=${encodeURIComponent(key.data.unikey)}&qrimg=true`); setQr(result.data.qrimg); setQrKey(key.data.unikey); setLoginMessage('请使用网易云音乐扫码'); });
  const importPlaylist = () => task(async () => { const result = await openNcmPlaylist(ncm, Number(playlistId)); showSongs(result.songs, result.collection); });
  const batchCollection = async (replace: boolean) => {
    if (!host || !socket || !collection || busy || batch.current) return;
    const controller = new AbortController(); batch.current = controller; setBusy(true); setError(''); setCollectionMessage('正在加载完整歌单…');
    const check = () => { if (controller.signal.aborted) throw new Error('已取消后续操作'); if (!hostRef.current || !socket.connected) throw new Error('权限或连接已变化'); };
    try {
      const all = completeSongs.current || await completeCollection(ncm, collection, songs, controller.signal, count => setCollectionMessage(`正在加载歌单 · ${count} 首`));
      check(); completeSongs.current = all; setCollection({ ...collection, total: all.length });
      if (replace) roaming.fm.stop();
      const done = await applyCollection(all, replace, { check, clear: () => emitAck(socket, 'music:queue-clear', { roomId }), add: item => emitAck(socket, 'music:queue-upsert', { roomId, item }), progress: (done, total) => setCollectionMessage(`正在${replace ? '替换' : '加入'}播放列表 · ${done}/${total}`), playFirst: async (first) => { const result = await emitAck<{ queue: QueueItem[] }>(socket, 'music:get-state', { roomId }); check(); queueRef.current = result.queue; setQueue(result.queue); if (!result.queue[0] || keyFor(result.queue[0]) !== keyFor(first)) throw new Error('播放列表已变化，请重新选择歌曲'); choose(result.queue[0]); } });
      setCollectionMessage(replace ? `已替换播放列表 · ${done} 首，从首曲开始播放` : `已全部加入播放列表 · ${done} 首`);
    } catch (failure) { setCollectionMessage(messageFor(failure)); }
    finally { if (batch.current === controller) batch.current = null; setBusy(false); }
  };
  const changeDailyDate = (date: string) => task(async () => { if (!collection?.daily) return; const items = await dailySongs(ncm, date); showSongs(items, { ...collection, total: items.length, daily: { ...collection.daily, date } }); });
  const loadMoreCollection = () => task(async () => { if (!collection?.playlistId) return; const more = completeSongs.current ? completeSongs.current.slice(songs.length, songs.length + PLAYLIST_PAGE_SIZE) : await playlistPage(ncm, collection.playlistId, songs.length); setSongs(old => [...old, ...more]); if (more.length < PLAYLIST_PAGE_SIZE) setCollection({ ...collection, total: songs.length + more.length }); });
  const currentSong = queue.find(item => item.id === currentItemId && keyFor(item) === state.trackKey) || queue.find(item => keyFor(item) === state.trackKey); const currentLyrics = lyricsSong === state.trackKey ? lyrics : []; const lyricIndex = upperBound(currentLyrics, time) - 1;
  useSystemMedia(player, state.trackKey && session ? { mediaId: `${roomId}:${state.trackKey}`, kind: 'audio', sourceIdentity: state.trackKey.startsWith('bili:') ? `https://www.bilibili.com/video/${state.trackKey.split(':')[1]}?cid=${state.trackKey.split(':')[2]}` : `${session.serverUrl}/api/music/stream?songId=${state.trackKey.slice(4)}&level=${quality}&roomId=${encodeURIComponent(roomId)}`, title: currentSong?.name || '一起听', artist: currentSong?.artist, album: currentSong?.album, cover: neteaseImageUrl(currentSong?.cover, 600, session.serverUrl), host, actions: ['play', 'pause', 'seek', 'next', 'prev'] } : null, (action, value) => { if (['play', 'pause', 'seek', 'next', 'prev'].includes(action)) void control({ action: action as ControlRequest['action'], positionSec: value }).catch(() => setError('系统控制失败')); });
  const playSong = (item: Song) => task(async () => { roaming.fm.stop(); await control({ action: 'playItem', item }); });
  const addSong = (item: Song) => task(() => control({ action: 'addQueue', item }));
  const songRow = (item: Song, index: number) => <View key={`${keyFor(item)}:${index}`} style={musicStyles.songRow}><Text style={ui.muted}>{String(index + 1).padStart(2, '0')}</Text>{item.cover ? <Image source={{ uri: item.cover }} style={musicStyles.smallCover} /> : null}<View style={{ flex: 1 }}><Text style={ui.text} numberOfLines={1}>{item.name}{item.vip ? ' · VIP' : ''}</Text><Text style={ui.muted} numberOfLines={1}>{item.artist} · {item.album}</Text></View><RoomButton label="播放" secondary disabled={busy} onPress={() => void playSong(item)} /><RoomButton label="添加到队列" secondary disabled={busy} onPress={() => void addSong(item)} /></View>;
  const queueDialog = <AppDialog visible={queueOpen} title={`播放队列 · ${queue.length}`} closeLabel="收起 / 关闭" close={() => setQueueOpen(false)}>{queue.map((item, index) => <View key={item.id} style={ui.card}><Text style={ui.text}>{item.name} · {item.artist}</Text><View style={ui.row}><RoomButton label="播放" disabled={busy} onPress={() => void playSong(item)} />{host ? <><RoomButton label="移除" secondary disabled={busy} onPress={() => void task(() => emitAck(socket!, 'music:queue-remove', { roomId, id: item.id }))} /><RoomButton label="上移" secondary disabled={busy || index === 0} onPress={() => void task(async () => { const ids = queue.map(value => value.id); [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]; await emitAck(socket!, 'music:queue-reorder', { roomId, ids }); })} /></> : null}</View></View>)}</AppDialog>;
  return <Surface readable testID="music-surface" style={musicStyles.shell}><VlcVideo video={video} style={{ position: 'absolute', width: 1, height: 1 }} />
    <View style={[musicStyles.top, compactLandscape && { padding: 6 }]}><RoomIconButton label="搜索" icon="search" onPress={() => { setNcmMenu(false); setPage('search'); }} /><View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', gap: width < 500 ? 12 : 26 }}><View testID="ncm-menu-anchor" style={{ position: 'relative', zIndex: 31 }}><Pressable accessibilityRole="button" accessibilityLabel="网易云音乐" onPress={() => setNcmMenu(value => !value)} style={{ minHeight: compactLandscape ? 36 : 48, justifyContent: 'center' }}><View testID="ncm-brand-row" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Text testID="ncm-brand-label" style={{ color: theme.color(page !== 'bilibili' ? '#edf1ef' : '#7c888b'), fontSize: width < 500 ? 16 : 20, fontWeight: '600' }}>网易云音乐</Text><Feather testID="ncm-brand-chevron" name="chevron-down" size={width < 500 ? 16 : 20} color={theme.color(page !== 'bilibili' ? '#edf1ef' : '#7c888b')} /></View><View style={{ width: 14, height: 2, backgroundColor: theme.color(page !== 'bilibili' ? '#edf1ef' : 'transparent', 'backgroundColor'), alignSelf: 'center', marginTop: 6 }} /></Pressable>{ncmMenu ? <View testID="ncm-menu" style={{ position: 'absolute', top: '100%', marginTop: 8, left: 0, zIndex: 30, width: 240, backgroundColor: theme.color('#20272a', 'backgroundColor'), borderWidth: 1, borderColor: theme.color('#485256', 'borderColor'), padding: 12, borderRadius: 12, gap: 4 }}>{musicPages.filter(item => item.key !== 'bilibili').map(item => <Pressable key={item.key} accessibilityRole="button" onPress={() => { setPage(item.key); setNcmMenu(false); }} style={musicStyles.navItem}><Text style={{ color: theme.color(page === item.key ? '#edf1ef' : '#9aa5a7'), fontSize: 18 }}>{item.label}</Text></Pressable>)}<RoomButton label="音乐设置" secondary onPress={() => { setPage('settings'); setNcmMenu(false); }} /></View> : null}</View><Pressable accessibilityRole="button" accessibilityLabel="哔哩哔哩" onPress={() => { setPage('bilibili'); setNcmMenu(false); }} style={{ minHeight: compactLandscape ? 36 : 48, justifyContent: 'center' }}><Text style={{ color: theme.color(page === 'bilibili' ? '#edf1ef' : '#7c888b'), fontSize: width < 500 ? 16 : 20, fontWeight: '600' }}>哔哩哔哩</Text></Pressable></View><View style={{ position: 'relative', zIndex: 45 }}><RoomIconButton label="账号" icon="user" onPress={() => { setNcmMenu(false); setAccountMenu(value => !value); }} />{accountMenu ? <View testID="music-account-menu" style={[ui.card, { position: 'absolute', right: 0, top: '100%', width: 250, borderWidth: 1, borderColor: theme.color('#343d41') }]}><Text style={ui.title}>网易云账号</Text><RoomButton label="账号登录" secondary onPress={() => { setAccountMenu(false); setAccountOpen(true); }} /><RoomButton label="音乐设置" secondary onPress={() => { setPage('settings'); setAccountMenu(false); }} /></View> : null}</View></View>
    <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }} contentContainerStyle={{ gap: 18, padding: 16, paddingBottom: 135 }}>
      {page === 'search' ? <><View style={ui.row}>{collection ? <RoomIconButton label="返回上一级" icon="arrow-left" onPress={() => { batch.current?.abort(); completeSongs.current = null; setCollection(null); setSongs([]); setCollectionMessage(''); setPage(collectionParent.current); }} /> : null}<Text style={[musicStyles.pageTitle, { flex: 1 }]}>{collection?.daily ? '每日推荐歌曲' : '搜索音乐'}</Text></View>{collection?.daily ? <><Text style={ui.muted}>根据你的音乐口味生成，每天 6:00 更新</Text><View style={{ maxWidth: 340 }}><SourceDropdown testID="daily-date" label="每日推荐日期" value={collection.daily.date} options={collection.daily.dates.map(date => ({ id: date, name: date === localDate() ? `今天 (${date})` : date }))} disabled={busy} onChange={date => void changeDailyDate(date)} /></View>{collection.daily.historyNote ? <Text style={ui.muted}>{collection.daily.historyNote}</Text> : null}</> : <><View style={ui.row}><RoomInput value={search} onChangeText={setSearch} placeholder="歌曲 / 歌手" style={{ flex: 1 }} /><RoomButton label={busy ? '处理中…' : '搜索歌曲'} disabled={busy || !search.trim()} onPress={() => void searchMusic()} /></View><View style={ui.row}><RoomInput value={playlistId} onChangeText={setPlaylistId} keyboardType="number-pad" placeholder="网易云歌单编号" style={{ flex: 1 }} /><RoomButton label="导入歌单" disabled={busy || !/^\d+$/.test(playlistId)} secondary onPress={() => void importPlaylist()} /></View></>}{collection ? <View testID="music-collection-actions" style={ui.card}><Text style={ui.title}>{collection.title}</Text><Text style={ui.muted}>{collection.total === undefined ? `已加载 ${songs.length} 首` : `共 ${collection.total} 首 · 已加载 ${songs.length} 首`}</Text><View style={ui.row}><RoomButton label="全部播放" disabled={busy || !host || !songs.length} onPress={() => void batchCollection(true)} /><RoomButton label="全部加入播放列表" secondary disabled={busy || !host || !songs.length} onPress={() => void batchCollection(false)} />{busy && collectionMessage.startsWith('正在') ? <RoomButton label="取消后续操作" secondary onPress={() => batch.current?.abort()} /> : null}</View><Text style={ui.muted}>{host ? '全部播放将替换当前播放列表，从首曲开始；全部加入保留正在播放的歌曲。' : '歌单批量操作由房主执行'}</Text>{collectionMessage ? <Text accessibilityLiveRegion="polite" style={ui.text}>{collectionMessage}</Text> : null}</View> : null}{songs.map(songRow)}{collection?.playlistId && (collection.total === undefined || songs.length < collection.total) ? <RoomButton label="加载更多歌曲" secondary disabled={busy} onPress={() => void loadMoreCollection()} /> : null}</> : page === 'settings' ? <><Text style={musicStyles.pageTitle}>音乐设置</Text><SourceDropdown label="默认音乐来源页" value={defaultPage} options={musicPages.map(item => ({ id: item.key, name: item.label }))} onChange={saveDefaultPage} /><Text style={ui.title}>网易云音质</Text><View style={ui.row}>{['lossless', 'exhigh', 'higher', 'standard'].map((level, index) => <RoomButton key={level} label={['无损优先', '极高', '较高', '标准'][index]} secondary disabled={quality === level} onPress={() => { setQuality(level); stream.current = null; adapter.current?.invalidate(); setRetry(value => value + 1); void writePreference('zviewer-music-quality', { level }).catch(() => {}); }} />)}</View><Text style={ui.muted}>服务器按账号权限回退音质</Text><RoomButton label={autoRecommend ? "✓ B站末尾推荐续播" : "B站末尾推荐续播"} secondary disabled={!host} onPress={() => changeAutoRecommend(!autoRecommend)} /><Text style={ui.muted}>按顺序播放到 B站队列末尾时，房主添加相关推荐并续播。</Text><Text style={ui.title}>播放模式</Text><View style={ui.row}>{(['sequence', 'order', 'repeat-one', 'shuffle'] as const).map((value, index) => <RoomButton key={value} label={['顺序循环', '按顺序播放', '单曲循环', '随机播放'][index]} secondary disabled={!host || state.playMode === value} onPress={() => update({ ...stateRef.current, playMode: value, updatedAt: Date.now() }, true)} />)}</View><RoomButton label="重试播放" secondary onPress={() => { stream.current = null; setRetry(value => value + 1); }} /></> : page === 'fm' ? <PersonalFmPanel fm={roaming.fm} state={roaming.state} ncm={ncm} loggedIn={roaming.loggedIn} checking={roaming.checking} host={host} trackKey={state.trackKey} playing={state.isPlaying} togglePlay={() => task(() => control({ action: state.isPlaying ? 'pause' : 'play' }))} login={() => { setAccountOpen(true); void qrLogin(); }} trash={async id => { const value = JSON.parse(await requestText(`/api/music/ncm/fm_trash?songId=${id}`, { method: 'POST', body: '{}' })); if (value.code !== 200) throw new Error(value.message || '不喜欢操作失败'); }} /> : <MusicLibrary accountRevision={accountRevision} accountChanged={() => { lyricCache.clear(); setAccountRevision(value => value + 1); stream.current = null; adapter.current?.invalidate(); }} login={() => { setAccountOpen(true); void qrLogin(); }} page={page} showSongs={showSongs} add={addSong} play={playSong} />}
      {requests.map((command, index) => <View key={`${command.from}:${index}`} style={ui.card}><Text style={ui.text}>{command.username || '观众'} 申请 {command.action}</Text><View style={ui.row}>{[true, false].map(approved => <RoomButton key={String(approved)} label={approved ? '同意' : '拒绝'} disabled={busy} secondary onPress={() => void task(async () => { if (approved) await control(command, true); await emitAck(socket!, 'music:control-response', { roomId, action: command.action, from: command.from, approved }); setRequests(old => old.filter(item => item !== command)); })} />)}</View></View>)}
      {error ? <Text style={ui.error}>{error}</Text> : null}
    </ScrollView>
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: compactLandscape ? 10 : 20, alignItems: 'center' }}><View style={[musicStyles.widget, compactLandscape && { padding: 6 }]}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Pressable accessibilityRole="button" accessibilityLabel="打开完整音乐播放器" onPress={() => setPlayerOpen(true)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>{currentSong?.cover ? <Image source={{ uri: currentSong.cover }} style={musicStyles.smallCover} /> : <View style={[musicStyles.smallCover, { backgroundColor: theme.color('#33443a', 'backgroundColor'), justifyContent: 'center', alignItems: 'center' }]}><Feather name="music" size={22} color={theme.color('#7d898c')} /></View>}<View style={{ flex: 1 }}><Text style={ui.text} numberOfLines={1}>{currentSong?.name || '一起听'}</Text><Text style={ui.muted} numberOfLines={1}>{currentSong?.artist || '选择喜欢的音乐'}</Text></View></Pressable><RoomIconButton label="上一首" icon="skip-back" onPress={() => void task(() => control({ action: 'prev' }))} /><RoomIconButton label={state.isPlaying ? '暂停' : '播放'} icon={state.isPlaying ? 'pause' : 'play'} onPress={() => void task(() => control({ action: state.isPlaying ? 'pause' : 'play' }))} /><RoomIconButton label="下一首" icon="skip-forward" onPress={() => void task(() => control({ action: 'next' }))} />{width >= 850 ? <View style={{ width: 100 }}><Text style={{ ...ui.muted, fontSize: 10 }}>VOLUME {Math.round(player.mediaSettings.volume)}</Text><Slider minimumValue={0} maximumValue={100} value={player.mediaSettings.volume} onValueChange={value => player.configure({ volume: value })} onSlidingComplete={value => void writePreference('zviewer-volume', { value })} minimumTrackTintColor={theme.color('#edf1ef')} /></View> : null}<RoomIconButton label="队列" icon="list" onPress={() => setQueueOpen(true)} /></View><Slider accessibilityLabel="音乐进度" style={{ height: 22 }} minimumValue={0} maximumValue={Math.max(1, duration)} value={time} disabled={duration <= 0} minimumTrackTintColor={theme.color('#65d59b')} maximumTrackTintColor={theme.color('#4a5557')} onSlidingComplete={value => void task(() => control({ action: 'seek', positionSec: value }))} /></View></View>
    {!playerOpen ? queueDialog : null}
    {!playerOpen ? <RoomCommentButton onPress={() => { setDiscussionOpen(true); setAccountMenu(false); }} /> : null}
    {discussionOpen && !playerOpen ? <RoomDiscussion key={roomId} roomId={roomId} close={() => setDiscussionOpen(false)} /> : null}<AppDialog visible={accountOpen} title="网易云账号" close={() => closeAccount()}><Text style={ui.muted}>登录网易云后全房间可播放账号有权限的歌曲</Text><RoomButton label="扫码登录" secondary disabled={busy || session?.user.role === 'guest'} onPress={() => void qrLogin()} /><RoomInput value={cookie} onChangeText={setCookie} multiline secureTextEntry autoCapitalize="none" placeholder="粘贴网易云 Cookie" /><RoomButton label="Cookie 登录" secondary disabled={busy || session?.user.role === 'guest' || !cookie.trim()} onPress={() => void task(async () => { try { await request('/api/music/ncm-cookie-login', { method: 'POST', body: JSON.stringify({ cookie: cookie.trim() }) }); setCookie(''); setQrKey(''); setQr(''); setLoginMessage('网易云登录成功'); lyricCache.clear(); setAccountRevision(value => value + 1); } catch { throw new Error('Cookie 登录失败，请检查 Cookie 是否完整有效'); } })} /><RoomButton label="复制已登录 Cookie" secondary disabled={busy || session?.user.role === 'guest'} onPress={() => void task(async () => { try { const data = await request<{ cookie: string }>('/api/music/ncm-cookie'); if (!data.cookie) throw new Error(); await Clipboard.setStringAsync(data.cookie); setLoginMessage('已复制到剪贴板'); } catch { throw new Error('复制失败，请先登录网易云账号'); } })} />{qr ? <Image source={{ uri: qr }} style={{ width: 220, height: 220, alignSelf: 'center', backgroundColor: 'white' }} /> : null}<Text style={ui.muted}>{loginMessage}</Text><RoomButton label="我的音乐" secondary onPress={() => { setPage('mymusic'); closeAccount(); }} /></AppDialog>
    <Modal visible={playerOpen} animationType="slide" supportedOrientations={['portrait', 'landscape']} onRequestClose={() => { setPure(false); setPlayerOpen(false); }}>
      <ExpandedMusicPlayer song={currentSong} trackKey={state.trackKey} expanded={playerOpen} pure={pure} setPure={setPure} audio={player} playing={state.isPlaying} time={time} duration={duration} lyrics={currentLyrics} lyricIndex={lyricIndex} lyricError={lyricError} retryLyrics={() => setLyricRetry(value => value + 1)} host={host} mode={state.playMode} setMode={playMode => update({ ...stateRef.current, playMode, updatedAt: Date.now() }, true)} quality={quality} setQuality={level => { setQuality(level); stream.current = null; adapter.current?.invalidate(); setRetry(value => value + 1); void writePreference('zviewer-music-quality', { level }).catch(() => {}); }} control={(action, value) => void task(() => control({ action, positionSec: value }))} close={() => { setPure(false); setPlayerOpen(false); }} openQueue={() => setQueueOpen(true)} openComments={() => setCommentSong(currentSong?.songId || null)} />
      {playerOpen && !pure ? <RoomCommentButton onPress={() => setDiscussionOpen(true)} /> : null}
      {playerOpen && discussionOpen ? <RoomDiscussion key={roomId} roomId={roomId} close={() => setDiscussionOpen(false)} /> : null}
      {playerOpen ? queueDialog : null}
      {playerOpen ? <SongComments songId={commentSong} close={() => setCommentSong(null)} /> : null}
    </Modal>{!playerOpen ? <SongComments songId={commentSong} close={() => setCommentSong(null)} /> : null}
  </Surface>;

}

const baseMusicStyles = StyleSheet.create({
  shell: { flex: 1, minHeight: 0, minWidth: 0, backgroundColor: '#111417', borderRadius: 0, overflow: 'hidden' }, top: { zIndex: 40, flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 }, brand: { color: '#edf1ef', fontSize: 17, fontWeight: '700' }, nav: { gap: 24, paddingHorizontal: 20, paddingBottom: 8 }, navItem: { minHeight: 44, justifyContent: 'center' }, pageTitle: { color: '#edf1ef', fontSize: 26, fontWeight: '700' }, smallCover: { width: 44, height: 44, borderRadius: 8 }, songRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderColor: '#293033', paddingVertical: 10 }, widget: { width: '96%', maxWidth: 722, borderRadius: 8, backgroundColor: '#1b2326', borderWidth: 1, borderColor: '#40504a', padding: 12, gap: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }, modal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', padding: 24, justifyContent: 'center' }, sheet: { maxHeight: '85%', width: '100%', maxWidth: 720, alignSelf: 'center', borderRadius: 20, padding: 18, backgroundColor: '#1b2426', gap: 16 },
});
