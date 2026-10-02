import { useAppearance } from '@/state/appearance';
import { SubtitleOverlay, SubtitlePanel, useSubtitles } from '@/components/Subtitles';
import { DanmakuManager } from '@/components/DanmakuManager';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VlcVideo, useVlcVideo } from '@/components/VlcVideo';
import * as ScreenOrientation from 'expo-screen-orientation';
import Constants from 'expo-constants';
import { MoviePanel } from '@/components/MoviePanel';
import { PlaybackControls } from '@/components/PlaybackControls';
import { moviePlayback, type Movie } from '@/lib/sources';
import { RoomSettings, type Viewer } from '@/components/RoomSettings';
import { DanmakuOverlay, DanmakuSettings, useDanmaku } from '@/components/Danmaku';
import { MusicPanel } from '@/components/MusicPanel';
import { ScreenShare, type ShareState } from '@/components/ScreenShare';
import { playbackSource, onBiliChange, biliFallback, stopBiliPlayback } from '@/lib/biliNative';
import { RoomIconButton } from '@/components/RoomUi';
import { RoomPlayback } from '@/lib/roomPlayback';
import { useWatchControl } from '@/hooks/useWatchControl';
import { useSystemMedia } from '@/hooks/useSystemMedia';
import { VideoGestures } from '@/components/VideoGestures';
import { VoicePanel } from '@/components/VoicePanel';
import { roomLayout, stackedMediaHeight, landscapeColumns } from '@/lib/roomLayout';
import { NativePreviewNotice } from '@/components/NativePreviewNotice';
import { AppDialog } from '@/components/AppDialog';
import { BiliAccount } from '@/components/BiliAccount';
import { Surface } from '@/components/Surface';
import Feather from '@expo/vector-icons/Feather';

import { emitAck } from '@/lib/socket';
import { nativeVideoSource } from '@/lib/media';
import { NativeMediaAdapter, type Playback } from '@/lib/mediaAdapter';
import { classifyPlayerError, probeMedia, safeMediaError, type MediaProbe } from '@/lib/mediaDiagnostics';
import { messageFor } from '@/lib/server';
import { useSession } from '@/state/session';

type Phase = 'connecting' | 'password' | 'joining' | 'waiting' | 'ready' | 'error' | 'closed';
type RoomMode = 'watch-together' | 'listen-together' | 'screen-share';
type Comment = { id: number; username: string; content: string; createdAt: string };
type JoinData = ShareState & { roomId?: string; mode?: RoomMode; name?: string; isHost?: boolean; playback?: Playback };

function Button({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  const theme = useAppearance();
  const styles = theme.styles(baseStyles);

  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, disabled && styles.disabled]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}

export default function RoomScreen() {
  const theme = useAppearance();
  const styles = theme.styles(baseStyles);

  const { roomId, name, asHost, hasPassword } = useLocalSearchParams<{ roomId: string; name?: string; asHost?: string; hasPassword?: string }>();
  const { session, socket, connected, request } = useSession();
  const [share, setShare] = useState<ShareState>({});
  const [sendAsDanmaku, setSendAsDanmaku] = useState(false);
  const [phase, setPhase] = useState<Phase>(hasPassword === '1' && asHost !== '1' ? 'password' : 'connecting');
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [roomName, setRoomName] = useState(name || roomId);
  const [mode, setMode] = useState<RoomMode>('watch-together');
  const [host, setHost] = useState(asHost === '1');
  const [settingsOpen, setSettingsOpen] = useState(false); const [leaveOpen, setLeaveOpen] = useState(false);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState('');
  const [source, setSource] = useState<Playback | null>(null);
  const [playbackError, setPlaybackError] = useState('');
  const [retryTick, setRetryTick] = useState(0);
  const [tab, setTab] = useState<'chat' | 'movies' | 'room'>('chat');
  const [mediaProbe, setMediaProbe] = useState<MediaProbe | null>(null);
  const [mediaStatus, setMediaStatus] = useState('idle');
  const [trackSummary, setTrackSummary] = useState('');
  const [diagnosing, setDiagnosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [musicImmersive, setMusicImmersive] = useState(false);
  const [chatSection, setChatSection] = useState<'comments' | 'tracks' | 'realtime'>('comments');
  const [sideOpen, setSideOpen] = useState<boolean | null>(null);
  const [playerOptions, setPlayerOptions] = useState<'danmaku' | 'subtitles' | 'diagnostics' | null>(null);
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
  const priorOrientationLock = useRef<ScreenOrientation.OrientationLock | null>(null);
  const orientationOperation = useRef(0);
  const [joinRequests, setJoinRequests] = useState<{ viewerSocketId: string; username: string }[]>([]);
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const mediaColumn = useRef<ScrollView | null>(null);
  useEffect(() => { mediaColumn.current?.scrollTo({ y: 0, animated: false }); }, [mode]);
  const attempted = useRef(hasPassword !== '1' || asHost === '1');
  const hostRef = useRef(asHost === '1');
  const passwordRef = useRef('');
  const adapterRef = useRef<NativeMediaAdapter | null>(null);
  const playbackRef = useRef<Playback | null>(null);
  const roomPlayback = useRef(new RoomPlayback());
  const [waitingMovie, setWaitingMovie] = useState(false);
  const [manualLock, setManualLock] = useState(false);
  const [orientationAvailable, setOrientationAvailable] = useState(false);
  const [orientationOpen, setOrientationOpen] = useState(false);
  const [orientationError, setOrientationError] = useState('');
  const [orientationBusy, setOrientationBusy] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showControls = () => { setControlsVisible(true); if (controlsTimer.current) clearTimeout(controlsTimer.current); controlsTimer.current = setTimeout(() => setControlsVisible(false), 3000); };
  useEffect(() => () => { if (controlsTimer.current) clearTimeout(controlsTimer.current); }, []);
  const applyPlayback = useCallback((value: Playback | null) => { playbackRef.current = value; setSource(value); setWaitingMovie(roomPlayback.current.waiting); }, []);
  const generation = useRef(0);
  const video = useVlcVideo();
  const { player } = video;
  const danmaku = useDanmaku(roomId, player, phase === 'ready' && mode === 'watch-together');
  const subtitles = useSubtitles(roomId, player, host, phase === 'ready' && mode === 'watch-together', source?.sourceUrl);
  const readyRef = useRef(false);
  useEffect(() => { readyRef.current = phase === 'ready' && mode === 'watch-together'; playbackRef.current = source; }, [phase, mode, source]);
  const publishNativeState = useCallback((action?: 'play' | 'pause' | 'seek' | 'rate', value?: number) => {
    if (!hostRef.current || !readyRef.current || !socket?.connected || !playbackRef.current || !action && (adapterRef.current?.busy || player.preparing)) return;
    const state: Playback = { ...playbackRef.current, currentTime: player.currentTime, isPlaying: action === 'play' ? true : action === 'pause' ? false : player.playing, playbackRate: player.playbackRate, duration: player.duration };
    playbackRef.current = state;
    setSource(state);
    if (action) socket.emit('watch-together-control', { roomId, action, value });
    socket.emit('watch-together-state', { roomId, state });
  }, [player, socket, roomId]);
  useEffect(() => {
    const adapter = new NativeMediaAdapter(player, playbackSource); adapterRef.current = adapter;
    return () => { readyRef.current = false; adapter.dispose(); if (adapterRef.current === adapter) adapterRef.current = null; };
  }, [player]);
  useEffect(() => onBiliChange(() => { adapterRef.current?.invalidate(); setRetryTick(value => value + 1); }), []);
  useEffect(() => () => { void stopBiliPlayback(); }, []);
  const windowSize = useWindowDimensions();
  const [rootSize, setRootSize] = useState({ width: 0, height: 0 });
  const [bodySize, setBodySize] = useState({ width: 0, height: 0 });
  const width = rootSize.width || windowSize.width;
  const height = rootSize.height || windowSize.height;
  const wide = !fullScreen && width >= 600 && width > height;
  const portrait = height >= width;
  const sideVisible = !fullScreen && mode !== 'listen-together' && (sideOpen ?? (wide || portrait));
  const stacked = portrait && sideVisible;
  const columns = landscapeColumns(bodySize.width || Math.max(0, width - 24));
  const [mediaSize, setMediaSize] = useState({ width: 0, height: 0 });
  const leftWidth = mediaSize.width || (wide && sideVisible ? Math.max(0, width - 380) : Math.max(0, width - 32));
  const playerHeight = Math.min(leftWidth * 9 / 16, stacked && mediaSize.height ? Math.max(80, mediaSize.height - (source?.sourceUrl ? 68 : 0)) : wide ? Math.max(180, height - 238) : 460);
  useEffect(() => () => { void ScreenOrientation.unlockAsync().catch(() => {}); }, []);
  useEffect(() => {
    if (Constants.expoVersion) return;
    let active = true;
    void Promise.all([ScreenOrientation.supportsOrientationLockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP), ScreenOrientation.supportsOrientationLockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)]).then(values => { if (active) setOrientationAvailable(values.every(Boolean)); }).catch(() => {});
    return () => { active = false; };
  }, []);
  const rotateScreen = async (action: 'rotate' | 'lock' | 'auto') => {
    if (fullScreen || orientationBusy || !orientationAvailable) return;
    setOrientationBusy(true); setOrientationError('');
    try {
      if (action === 'auto') { await ScreenOrientation.unlockAsync(); setManualLock(false); }
      else { const landscape = action === 'rotate' ? portrait : !portrait; await ScreenOrientation.lockAsync(landscape ? ScreenOrientation.OrientationLock.LANDSCAPE : ScreenOrientation.OrientationLock.PORTRAIT_UP); setManualLock(true); }
      setOrientationOpen(false);
    } catch { setOrientationError('当前设备无法更改方向，请检查系统方向锁或手动旋转屏幕'); }
    finally { setOrientationBusy(false); }
  };
  const toggleFullscreen = async () => {
    const operation = ++orientationOperation.current;
    if (!fullScreen) {
      setFullScreen(true);
      try {
        const previous = await ScreenOrientation.getOrientationLockAsync();
        if (operation === orientationOperation.current) { priorOrientationLock.current = previous; await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE); }
      } catch { /* Fullscreen layout remains usable when the system refuses rotation. */ }
    } else {
      setFullScreen(false);
      const previous = priorOrientationLock.current; priorOrientationLock.current = null;
      try { if (previous !== null) await ScreenOrientation.lockAsync(previous); else await ScreenOrientation.unlockAsync(); } catch {}
    }
  };

  const loadMovies = useCallback(async () => {
    try {
      const version = generation.current;
      const data = await request<{ movies: Movie[] }>(`/api/rooms/${encodeURIComponent(roomId)}/movies`);
      if (version !== generation.current) return;
      const values = Array.isArray(data.movies) ? data.movies : []; setMovies(values); applyPlayback(roomPlayback.current.list(values));
    } catch (failure) { setError(messageFor(failure)); }
  }, [request, roomId, applyPlayback]);

  const loadComments = useCallback(() => {
    if (!socket?.connected) return;
    socket.timeout(10000).emit('comment-history', { roomId }, (timeout: Error | null, result?: { success: boolean; comments?: Comment[] }) => {
      if (!timeout && result?.success && Array.isArray(result.comments)) setComments(result.comments);
    });
  }, [socket, roomId]);

  const applyRoom = useCallback((data: JoinData = {}) => {
    if (data.shareMethod) setShare({ shareMethod: data.shareMethod, streamKey: data.streamKey });
    if (data.name) setRoomName(data.name);
    if (data.mode) setMode(data.mode);
    if (data.playback?.sourceUrl) { applyPlayback(roomPlayback.current.state(data.playback)); setMediaProbe(null); }
    setError(''); setPhase('ready');
    void loadMovies();
    loadComments();
    socket?.emit('request-current-movie', { roomId });
    if (!hostRef.current) {
      socket?.timeout(10000).emit('watch-together-request-state', { roomId }, (timeout: Error | null, result?: { success: boolean; data?: { state?: Playback } }) => {
        if (!timeout && result?.success && result.data?.state) applyPlayback(roomPlayback.current.state(result.data.state));
      });
    }
  }, [loadMovies, loadComments, socket, roomId, applyPlayback]);

  const join = useCallback(async (asRoomHost: boolean) => {
    if (!socket?.connected) { setPhase('connecting'); return; }
    const version = ++generation.current;
    setPhase('joining'); setError('');
    try {
      const ack = await emitAck<{ data?: JoinData }>(socket, asRoomHost ? 'register-host' : 'request-join', { roomId, ...(!asRoomHost ? { password: passwordRef.current } : {}) });
      if (version !== generation.current) return;
      if (!asRoomHost && ack.data?.isHost) {
        hostRef.current = true; setHost(true);
        const hostAck = await emitAck<{ data?: JoinData }>(socket, 'register-host', { roomId });
        if (version === generation.current) applyRoom(hostAck.data);
        return;
      }
      if (asRoomHost || ack.message === '已加入房间') applyRoom(ack.data);
      else setPhase('waiting');
    } catch (failure) {
      if (version !== generation.current) return;
      const message = messageFor(failure);
      setError(message);
      setPhase(message.includes('密码') ? 'password' : 'error');
    }
  }, [socket, roomId, applyRoom]);

  useEffect(() => {
    if (!socket) return;
    const invalidateJoin = () => { generation.current++; };
    const onConnect = () => { if (attempted.current) void join(hostRef.current); else setPhase('password'); };
    const onDisconnect = () => { generation.current++; readyRef.current = false; roomPlayback.current.reset(); setSource(null); setViewers([]); setPhase('connecting'); };
    const onViewerJoined = (payload: { viewerSocketId: string; userId?: number; username?: string; role?: string }) => { setViewers(previous => [...previous.filter(item => item.socketId !== payload.viewerSocketId), { ...payload, socketId: payload.viewerSocketId }]); };
    const onViewerLeft = (payload: { viewerSocketId: string }) => setViewers(previous => previous.filter(item => item.socketId !== payload.viewerSocketId));
    const onApproved = (data: JoinData) => { if (data.roomId === roomId) applyRoom(data); };
    const onRejected = (data: JoinData) => { if (data.roomId === roomId) { generation.current++; setPhase('error'); setError('房主拒绝了加入申请'); } };
    const onClosed = (data: JoinData) => { if (data.roomId === roomId) { generation.current++; attempted.current = false; readyRef.current = false; player.pause(); setSource(null); setPhase('closed'); setError('房间已关闭'); } };
    const onKicked = (data: { reason?: string }) => { generation.current++; attempted.current = false; readyRef.current = false; player.pause(); setSource(null); setPhase('closed'); setError(data.reason || '您已被移出房间'); };
    const onMode = (data: JoinData) => { if ((!data.roomId || data.roomId === roomId) && data.mode) { setMode(data.mode); setSideOpen(null); setPlayerOptions(null); setFullScreen(false); setManualLock(false); orientationOperation.current++; void ScreenOrientation.unlockAsync().catch(() => {}); } };
    const onHostTransferred = (data: { newHostSocketId: string }) => { const next = data.newHostSocketId === socket.id; hostRef.current = next; setHost(next); if (next) void join(true); };
    const onName = (data: JoinData) => { if (data.roomId === roomId && data.name) setRoomName(data.name); };
    const onShare = (data: JoinData) => { if (data.roomId === roomId) setShare({ shareMethod: data.shareMethod, streamKey: data.streamKey }); };
    const onComment = (item: Comment) => setComments(previous => previous.some(value => value.id === item.id) ? previous : [...previous, item]);
    const onMovies = (payload: { movies?: Movie[] }) => { if (Array.isArray(payload.movies)) { const values = payload.movies.filter(movie => !movie.roomId || movie.roomId === roomId); setMovies(values); applyPlayback(roomPlayback.current.list(values)); } };
    const onCurrent = (payload: { movieId: number | null }) => { if (payload.movieId !== null && !Number.isSafeInteger(payload.movieId)) return; applyPlayback(roomPlayback.current.current(payload.movieId)); const version = generation.current; socket.timeout(10000).emit('watch-together-request-state', { roomId }, (timeout: Error | null, result?: { success: boolean; data?: { state?: Playback } }) => { if (!timeout && result?.data?.state && version === generation.current) applyPlayback(roomPlayback.current.state(result.data.state)); }); };
    const onJoinRequest = (payload: { roomId: string; viewerSocketId: string; username: string }) => {
      if (hostRef.current && payload.roomId === roomId) setJoinRequests(current => [...current.filter(item => item.viewerSocketId !== payload.viewerSocketId), payload]);
    };
    const onPlayback = (payload: { state?: Playback; diff?: Partial<Playback> }) => {
      if (hostRef.current) return;
      if (payload.state) applyPlayback(roomPlayback.current.state({ ...payload.state, ...payload.diff }));
    };
    const onControl = (payload: { action?: 'play' | 'pause' | 'seek' | 'rate'; value?: number }) => {
      if (hostRef.current || !readyRef.current || !roomPlayback.current.value()) return;
      if (payload.action === 'play') player.play();
      if (payload.action === 'pause') player.pause();
      if (payload.action === 'seek' && Number.isFinite(payload.value)) player.currentTime = Math.max(0, payload.value!);
      if (payload.action === 'rate' && Number.isFinite(payload.value)) player.playbackRate = payload.value!;
    };
    const onHeartbeat = (payload: { source?: string; currentTime?: number; isPlaying?: boolean; suppressed?: boolean; state?: Playback }) => {
      if (hostRef.current) return;
      if (payload.state) applyPlayback(roomPlayback.current.state(payload.state));
      if (!readyRef.current || !roomPlayback.current.value()) return;
      if (payload.suppressed) return;
      const target = payload.state?.currentTime ?? payload.currentTime;
      if (Number.isFinite(target) && Math.abs(player.currentTime - target!) > 2) player.currentTime = target!;
      const playing = payload.state?.isPlaying ?? payload.isPlaying;
      if (playing === true && !player.playing) player.play();
      if (playing === false && player.playing) player.pause();
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('join-approved', onApproved);
    socket.on('join-rejected', onRejected);
    socket.on('room-closed', onClosed);
    socket.on('viewer-kicked', onKicked);
    socket.on('room-mode-changed', onMode);
    socket.on('host-transferred', onHostTransferred); socket.on('room-name-updated', onName);
    socket.on('share-method-changed', onShare);
    socket.on('new-comment', onComment);
    socket.on('movie-list', onMovies); socket.on('current-movie', onCurrent);
    socket.on('join-request', onJoinRequest);
    socket.on('viewer-joined', onViewerJoined); socket.on('viewer-left', onViewerLeft);
    socket.on('watch-together-state', onPlayback);
    socket.on('watch-together-control', onControl);
    socket.on('sync-heartbeat', onHeartbeat);
    if (socket.connected) onConnect();
    return () => {
      socket.off('connect', onConnect); socket.off('disconnect', onDisconnect);
      invalidateJoin();
      socket.off('join-approved', onApproved); socket.off('join-rejected', onRejected);
      socket.off('viewer-kicked', onKicked);
      socket.off('room-closed', onClosed); socket.off('room-mode-changed', onMode);
      socket.off('host-transferred', onHostTransferred); socket.off('room-name-updated', onName);
      socket.off('share-method-changed', onShare);
      socket.off('new-comment', onComment); socket.off('movie-list', onMovies); socket.off('current-movie', onCurrent);
      socket.off('join-request', onJoinRequest);
      socket.off('viewer-joined', onViewerJoined); socket.off('viewer-left', onViewerLeft);
      socket.off('watch-together-state', onPlayback); socket.off('watch-together-control', onControl);
      socket.off('sync-heartbeat', onHeartbeat);
    };
  }, [socket, roomId, join, applyRoom, player, applyPlayback]);

  useEffect(() => {
    if (!host || phase !== 'ready' || !socket || mode !== 'watch-together') return;
    const interval = setInterval(() => {
      if (!socket.connected || !playbackRef.current) return;
      socket.emit('host-heartbeat', {
        roomId,
        currentTime: player.currentTime,
        isPlaying: player.preparing ? playbackRef.current.isPlaying : player.playing,
        playbackRate: player.playbackRate,
        suppressed: Boolean(adapterRef.current?.busy || player.preparing),
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [host, phase, socket, mode, roomId, player]);

  useEffect(() => {
    const playing = player.addListener('playingChange', ({ isPlaying }) => publishNativeState(isPlaying ? 'play' : 'pause'));
    const rate = player.addListener('playbackRateChange', ({ playbackRate }) => publishNativeState('rate', playbackRate));
    let lastHeartbeat = 0;
    let previous: { position: number; time: number; playing: boolean; rate: number } | null = null;
    const progress = player.addListener('timeUpdate', ({ currentTime }) => {
      const time = Date.now();
      if (time - lastHeartbeat >= 5000 && readyRef.current && hostRef.current && socket?.connected && playbackRef.current && !adapterRef.current?.busy && !player.preparing) { lastHeartbeat = time; socket.emit('host-heartbeat', { roomId, currentTime, isPlaying: player.playing, playbackRate: player.playbackRate, suppressed: false }); }
      // Detect native seek discontinuities
      // without broadcasting ordinary progress on every half-second tick.
      if (previous && !adapterRef.current?.busy) {
        const expected = previous.position + (previous.playing ? (time - previous.time) / 1000 * previous.rate : 0);
        if (Math.abs(currentTime - expected) > 1.5) publishNativeState('seek', currentTime);
      }
      previous = { position: currentTime, time, playing: player.playing, rate: player.playbackRate };
    });
    const loaded = player.addListener('sourceLoad', () => { previous = null; });
    return () => { playing.remove(); rate.remove(); progress.remove(); loaded.remove(); };
  }, [player, publishNativeState, socket, roomId]);

  useEffect(() => {
    if (!session || !adapterRef.current) return;
    let current = true;
    const state = phase === 'ready' && mode === 'watch-together' ? source : null;
    void adapterRef.current.apply(state, session.serverUrl, session.accessToken, retryTick)
      .then(() => { if (current) setPlaybackError(''); })
      .catch(failure => { if (current) setPlaybackError(safeMediaError(messageFor(failure))); });
    const adapter = adapterRef.current;
    return () => { current = false; adapter?.cancelPending(); };
  }, [source, mode, session, player, retryTick, phase]);
  useEffect(() => {
    const subscription = player.addListener('statusChange', ({ status, error: videoError }) => {
      setMediaStatus(status);
      if (status === 'error') {
        adapterRef.current?.invalidate();
        const current = playbackRef.current;
        if (current?.sourceType === 'bilibili' && biliFallback(current.sourceUrl)) { setPlaybackError(''); setRetryTick(value => value + 1); }
        else setPlaybackError(safeMediaError(videoError?.message || '视频播放失败'));
      }
    });
    const loaded = player.addListener('sourceLoad', ({ duration, availableAudioTracks, availableVideoTracks, availableSubtitleTracks }) => {
      setTrackSummary(`时长 ${Math.round(duration)} 秒 · 视频 ${availableVideoTracks.length} 轨 · 音频 ${availableAudioTracks.length} 轨 · 字幕 ${availableSubtitleTracks.length} 轨`);
    });
    return () => { subscription.remove(); loaded.remove(); };
  }, [player]);

  const probeController = useRef<AbortController | null>(null);
  useEffect(() => {
    probeController.current?.abort();
    let current = true;
    void Promise.resolve().then(() => { if (current) { setMediaProbe(null); setDiagnosing(false); } });
    return () => { current = false; };
  }, [source?.sourceUrl]);
  useEffect(() => () => { probeController.current?.abort(); }, []);

  const runProbe = async () => {
    if (!source || !session) return;
    probeController.current?.abort();
    const controller = new AbortController();
    probeController.current = controller;
    setDiagnosing(true);
    try { const result = await probeMedia(source, session.serverUrl, session.accessToken, controller.signal); if (!controller.signal.aborted) setMediaProbe(result); }
    catch (failure) { if (!controller.signal.aborted) setMediaProbe({ category: classifyPlayerError(messageFor(failure)), source: 'external', detail: safeMediaError(messageFor(failure)) }); }
    finally { if (probeController.current === controller && !controller.signal.aborted) setDiagnosing(false); }
  };

  const leave = () => {
    generation.current++;
    attempted.current = false;
    readyRef.current = false;
    probeController.current?.abort();
    player.pause();
    socket?.disconnect();
    router.replace('/');
    setTimeout(() => socket?.connect(), 100);
  };

  const sendComment = async () => {
    if (!socket || !draft.trim()) return;
    setBusy(true);
    try { await emitAck(socket, sendAsDanmaku ? 'send-danmaku' : 'send-comment', { roomId, content: draft.trim(), ...(sendAsDanmaku ? { videoTime: player.currentTime } : { isDanmaku: false }) }); setDraft(''); }
    catch (failure) { setError(messageFor(failure)); }
    finally { setBusy(false); }
  };

  const decideJoin = async (viewerSocketId: string, accept: boolean) => {
    if (!socket) return;
    try {
      await emitAck(socket, accept ? 'approve-join' : 'reject-join', { roomId, viewerSocketId });
      setJoinRequests(current => current.filter(item => item.viewerSocketId !== viewerSocketId));
    } catch (failure) { setError(messageFor(failure)); }
  };

  const closeRoom = () => {
    if (!socket?.connected) return;
    Alert.alert('关闭房间', '关闭后所有成员都会离开此房间。', [
      { text: '取消', style: 'cancel' },
      { text: '关闭房间', style: 'destructive', onPress: () => {
        socket.timeout(8000).emit('close-room', (timeout: Error | null, ack?: { success: boolean; message?: string }) => {
          if (timeout || !ack?.success) setError(ack?.message || '关闭房间失败');
          else leave();
        });
      } },
    ]);
  };

  const watch = useWatchControl(socket, roomId, host, player, publishNativeState);
  const control = watch.control;
  useSystemMedia(player, phase === 'ready' && mode === 'watch-together' && source ? { mediaId: `${roomId}:${source.movieId ?? source.sourceUrl}:${source.cid ?? 0}`, kind: 'video', sourceIdentity: source.sourceUrl.startsWith('/') && session ? `${session.serverUrl}${source.sourceUrl}` : source.sourceUrl, title: movies.find(item => item.id === source.movieId)?.title || roomName, host, actions: ['play', 'pause', 'seek'] } : null, (action, value) => { if (['play', 'pause', 'seek'].includes(action)) control(action as 'play' | 'pause' | 'seek', value); });
  useEffect(() => { if (!waitingMovie) return; const timer = setTimeout(() => setPlaybackError('当前影片资料等待超时，请刷新片单并重试播放'), 12000); return () => clearTimeout(timer); }, [waitingMovie]);

  const playMovie = async (movie: Movie) => {
    if (!host || !socket || !session) return;
    const version = generation.current;
    let resolved = moviePlayback(movie);
    try {
      if (movie.source === 'anime' && movie.sourceMeta) {
        const media = await request<{ url: string; headers?: Record<string, string>; format?: string }>('/api/stream/anisubs/resolve', { method: 'POST', body: JSON.stringify({ source: movie.sourceMeta.sourceId, episode: movie.sourceMeta.episode }) });
        const query = new URLSearchParams({ url: media.url }); for (const [key, value] of Object.entries(media.headers || {})) { const name = ({ referer: 'referer', 'user-agent': 'userAgent', origin: 'origin', cookie: 'cookie' } as Record<string, string>)[key.toLowerCase()]; if (name) query.set(name, value); }
        resolved = { sourceUrl: `/api/stream/anisubs/proxy?${query}`, sourceType: 'anime', format: media.format };
      }
      if (version !== generation.current || !readyRef.current) return;
      nativeVideoSource(resolved, session.serverUrl, session.accessToken);
    }
    catch (failure) { setPlaybackError(safeMediaError(messageFor(failure))); return; }
    setPlaybackError('');
    try { await emitAck(socket, 'play-movie', { roomId, movieId: movie.id }); }
    catch (failure) { setPlaybackError(safeMediaError(messageFor(failure))); return; }
    if (version !== generation.current || !readyRef.current) return;
    const state: Playback = { ...resolved, isPlaying: true, currentTime: 0, playbackRate: 1 };
    roomPlayback.current.current(movie.id); applyPlayback(roomPlayback.current.state(state));
    socket.emit('watch-together-state', { roomId, state });
  };

  if (!session) return <SafeAreaView style={styles.root}><Text style={styles.text}>请先登录</Text><Button label="返回" onPress={() => router.replace('/')} /></SafeAreaView>;
  return <SafeAreaView onLayout={event => setRootSize(event.nativeEvent.layout)} edges={fullScreen ? [] : ['top', 'bottom', 'left', 'right']} style={[styles.root, fullScreen && styles.fullscreenRoot]}>
    <StatusBar style={theme.dark ? "light" : "dark"} hidden={fullScreen} />
    {!fullScreen && !musicImmersive ? <NativePreviewNotice /> : null}
    <Surface readable style={[styles.header, (fullScreen || musicImmersive) && { display: 'none' }]}>
      <RoomIconButton label="离开房间" icon="arrow-left" onPress={() => setLeaveOpen(true)} />
      <View style={{ flex: 1, minWidth: 0 }}><Text style={styles.title} numberOfLines={1}>{roomName}</Text><Text style={styles.muted}>{host ? '房主' : '观众'} · {mode === 'listen-together' ? '一起听' : mode === 'screen-share' ? '屏幕共享' : '同步观影'}</Text></View>
      {orientationAvailable ? <RoomIconButton label={manualLock ? '方向已锁定' : '屏幕方向'} icon={manualLock ? 'lock' : 'smartphone'} onPress={() => setOrientationOpen(true)} /> : null}
      <VoicePanel compact roomId={roomId} ready={phase === 'ready'} host={host} />
      <RoomIconButton label="房间设置" icon="users" onPress={() => setSettingsOpen(true)} />
      {mode !== 'listen-together' ? <RoomIconButton label={portrait ? (sideVisible ? '收起下方菜单' : '展开下方菜单') : (sideVisible ? '收起侧栏' : '展开侧栏')} icon={portrait ? (sideVisible ? 'chevron-up' : 'chevron-down') : (sideVisible ? 'sidebar' : 'menu')} onPress={() => setSideOpen(!sideVisible)} /> : null}
    </Surface>
    {!connected && !fullScreen ? <Text style={styles.error}>连接已断开，正在重连</Text> : null}
    {phase !== 'ready' ? <View style={styles.join}><ActivityIndicator color="#65d59b" animating={phase === 'joining' || phase === 'connecting' || phase === 'waiting'} /><Text style={styles.title}>{phase === 'password' ? '请输入房间密码' : phase === 'waiting' ? '等待房主批准' : phase === 'closed' ? '房间已关闭' : phase === 'error' ? '无法加入房间' : '正在加入房间'}</Text>{error ? <Text style={styles.error}>{error}</Text> : null}{phase === 'password' ? <><TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="房间密码" placeholderTextColor="#a8b3b6" /><Button label="进入房间" disabled={!connected} onPress={() => { passwordRef.current = password; attempted.current = true; void join(hostRef.current); }} /></> : null}{phase === 'error' ? <Button label="重试" disabled={!connected} onPress={() => void join(hostRef.current)} /> : null}<Button label="返回房间列表" onPress={leave} /></View> : <>
      <View testID="room-body" onLayout={event => setBodySize(event.nativeEvent.layout)} style={[roomLayout.body, wide && roomLayout.wide, fullScreen && { gap: 0 }]}>
        <View testID="room-media-frame" onLayout={event => setMediaSize(event.nativeEvent.layout)} style={[roomLayout.mediaFrame, wide && sideVisible && columns.media, stacked && roomLayout.stackedMedia, stacked && { height: stackedMediaHeight(bodySize.height || Math.max(0, height - 150)) }]}>
        {mode === 'listen-together' ? <MusicPanel roomId={roomId} host={host} onExpandedLandscape={setMusicImmersive} switchMode={value => { if (host && socket) void emitAck(socket, 'update-room-mode', { roomId, mode: value }).catch(failure => setError(messageFor(failure))); }} /> : <ScrollView ref={mediaColumn} scrollEnabled={!fullScreen} style={roomLayout.mediaScroll} contentContainerStyle={[styles.mediaContent, fullScreen && { flexGrow: 1, paddingBottom: 0, gap: 0 }]}>
          {mode === 'watch-together' ? <View testID="video-container" onLayout={event => setVideoSize(event.nativeEvent.layout)} style={[styles.playerBox, fullScreen ? { flex: 1, borderRadius: 0, minHeight: 0 } : { height: playerHeight }]}>{source?.sourceUrl && !playbackError ? <VlcVideo video={video} style={styles.video} /> : <View style={styles.placeholder}><Text style={[styles.muted, { color: "#a8b3b6" }]}>{playbackError ? `播放失败（${classifyPlayerError(playbackError)}）：${playbackError}` : waitingMovie ? '正在等待当前影片资料…' : '等待房主选择影片'}</Text>{playbackError && source?.sourceUrl ? <Button label="重试播放" onPress={() => { adapterRef.current?.invalidate(); setPlaybackError(''); setRetryTick(value => value + 1); }} /> : null}</View>}<VideoGestures player={player} fullscreen={fullScreen} show={showControls} control={control} /><SubtitleOverlay subtitles={subtitles} player={player} /><DanmakuOverlay player={player} state={danmaku} width={videoSize.width || leftWidth} height={videoSize.height || playerHeight} /><View pointerEvents={controlsVisible || !fullScreen ? "auto" : "none"} style={[styles.videoControls, fullScreen && !controlsVisible && { opacity: 0 }]}><PlaybackControls player={player} host={host} control={control} fullscreen={fullScreen} toggleFullscreen={() => void toggleFullscreen()} /></View></View> : <ScreenShare roomId={roomId} share={share} height={playerHeight} />}
          {mode === 'watch-together' && source?.sourceUrl && !fullScreen ? <View style={styles.controlPanel}>
            <View style={styles.controls}><Button label="弹幕设置" onPress={() => setPlayerOptions('danmaku')} /><Button label="字幕管理" onPress={() => setPlayerOptions('subtitles')} /><Button label="播放诊断" onPress={() => setPlayerOptions('diagnostics')} /></View>

          </View> : null}
        </ScrollView>}
        </View>
        <Surface readable testID="room-sidebar" style={[styles.sidePanel, !sideVisible && { display: 'none' }, wide ? columns.sidebar : stacked ? roomLayout.stackedSidebar : { position: 'absolute', top: 0, right: 0, bottom: 0, width: '100%', zIndex: 20, backgroundColor: theme.color('#111417', 'backgroundColor'), padding: 12 }]}>
          <View style={styles.tabs}>{(['chat', 'movies', 'room'] as const).filter(value => value !== 'movies' || mode === 'watch-together').map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)} style={{ flex: 1, minHeight: 48, flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', borderBottomWidth: 2, borderBottomColor: tab === value ? theme.color('#65d59b') : 'transparent' }}><Feather name={value === 'chat' ? 'message-circle' : value === 'movies' ? 'film' : 'settings'} size={18} color={theme.color(tab === value ? '#65d59b' : '#a8b3b6')} /><Text style={tab === value ? styles.activeTab : styles.muted}>{value === 'chat' ? '聊天' : value === 'movies' ? '片单' : '房间'}</Text></Pressable>)}</View>
          {tab === 'chat' ? <View style={{ flex: 1, gap: 12, backgroundColor: theme.color('#1b2024', 'backgroundColor'), borderWidth: 1, borderColor: theme.color('#343d41', 'borderColor'), borderRadius: 12, padding: 12 }}><View style={{ flexDirection: 'row', gap: 4, backgroundColor: theme.color('#141a1d', 'backgroundColor'), borderRadius: 22, padding: 4 }}>{(['comments', 'tracks', 'realtime'] as const).map((value, index) => <Pressable key={value} accessibilityRole="button" onPress={() => setChatSection(value)} style={{ flex: 1, minHeight: 40, justifyContent: 'center', alignItems: 'center', borderRadius: 20, backgroundColor: chatSection === value ? theme.color('#65d59b', 'backgroundColor') : 'transparent' }}><Text style={{ color: theme.color(chatSection === value ? '#111417' : '#a8b3b6'), fontSize: 13 }}>{['评论区', '弹幕轨道', '实时弹幕'][index]}</Text></Pressable>)}</View>{chatSection === 'tracks' ? <ScrollView><DanmakuManager roomId={roomId} host={host} tracks={danmaku.tracks} /></ScrollView> : <><ScrollView style={styles.list} contentContainerStyle={styles.listContent}>{chatSection === 'realtime' ? danmaku.live.map(comment => <Text key={comment.id} style={styles.text}>{comment.content}</Text>) : comments.length ? comments.map(comment => <View key={comment.id} style={styles.item}><Text style={styles.muted}>{comment.username}</Text><Text style={styles.text}>{comment.content}</Text></View>) : <View style={{ padding: 32, alignItems: 'center' }}><Text style={styles.muted}>暂无评论，快来第一条吧</Text></View>}</ScrollView><View style={styles.composer}><TextInput style={[styles.input, { flex: 1 }]} value={draft} onChangeText={setDraft} placeholder={sendAsDanmaku ? "发送弹幕" : "说点什么…"} placeholderTextColor={theme.color('#a8b3b6')} /><Button label="发送" disabled={busy || !connected} onPress={() => void sendComment()} /></View><View style={styles.controls}><Switch value={sendAsDanmaku} onValueChange={setSendAsDanmaku} trackColor={{ true: '#65d59b' }} /><Text style={styles.muted}>以弹幕形式发送</Text></View></>}</View> : null}
          {tab === 'movies' ? <MoviePanel currentMovieId={source?.movieId ?? source?.currentMovieId} roomId={roomId} movies={movies} host={host} play={playMovie} reload={loadMovies} /> : null}
          {tab === 'room' ? <ScrollView contentContainerStyle={{ gap: 12 }}><RoomSettings roomId={roomId} roomName={roomName} host={host} close={closeRoom} viewers={viewers} />{joinRequests.map(item => <View key={item.viewerSocketId} style={styles.item}><Text style={styles.text}>{item.username} 申请加入</Text><View style={styles.controls}><Button label="同意" onPress={() => void decideJoin(item.viewerSocketId, true)} /><Button label="拒绝" onPress={() => void decideJoin(item.viewerSocketId, false)} /></View></View>)}</ScrollView> : null}
          {watch.notice ? <Text style={styles.muted}>{watch.notice}</Text> : null}{watch.requests.map(item => <View key={`${item.action}:${item.viewerSocketId}`} style={styles.item}><Text style={styles.text}>{item.viewerUsername || '观众'} 申请 {item.action}{item.time !== undefined ? ` · ${Math.round(item.time)} 秒` : ''}</Text><View style={styles.controls}><Button label="同意" onPress={() => void watch.decide(item, true)} /><Button label="拒绝" onPress={() => void watch.decide(item, false)} /></View></View>)}{error ? <Text style={styles.error}>{error}</Text> : null}
        </Surface>
      </View>
    </>}
    <AppDialog visible={orientationOpen} title="屏幕方向" close={() => { if (!orientationBusy) setOrientationOpen(false); }}>
      <Text style={styles.text}>{manualLock ? '方向已锁定' : '跟随设备自动旋转'}</Text>
      <Button label="手动旋转并锁定" disabled={orientationBusy} onPress={() => void rotateScreen('rotate')} />
      <Button label="锁定当前方向" disabled={orientationBusy} onPress={() => void rotateScreen('lock')} />
      <Button label="恢复自动旋转" disabled={orientationBusy} onPress={() => void rotateScreen('auto')} />
      {orientationError ? <Text style={styles.error}>{orientationError}</Text> : null}
    </AppDialog>
    <AppDialog visible={settingsOpen} title="房间" close={() => setSettingsOpen(false)}>
      <Button label="全局外观" onPress={() => { setSettingsOpen(false); theme.open(); }} />
      <BiliAccount /><RoomSettings roomId={roomId} roomName={roomName} host={host} close={closeRoom} viewers={viewers} />
    </AppDialog>
    <AppDialog visible={leaveOpen} title="离开房间？" close={() => setLeaveOpen(false)}><Text style={styles.text}>{host ? '离开后将停止本机播放，房间按服务器的离线规则保留。' : '离开后将停止本机播放。'}</Text><View style={styles.controls}><Button label="取消" onPress={() => setLeaveOpen(false)} /><Button label="离开" onPress={leave} /></View></AppDialog>
    <Modal visible={playerOptions !== null} transparent animationType="fade" supportedOrientations={['portrait', 'landscape']} onRequestClose={() => setPlayerOptions(null)}><View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 }}><ScrollView style={{ maxHeight: '90%', width: '100%', maxWidth: 650, alignSelf: 'center', borderRadius: 16, backgroundColor: theme.color('#1b2024', 'backgroundColor') }} contentContainerStyle={{ padding: 16, gap: 14 }}><View style={styles.controls}><Text style={[styles.title, { flex: 1 }]}>{playerOptions === 'danmaku' ? '弹幕设置' : playerOptions === 'subtitles' ? '字幕管理' : '播放诊断'}</Text><Button label="关闭面板" onPress={() => setPlayerOptions(null)} /></View>{playerOptions === 'danmaku' ? <><DanmakuSettings state={danmaku} /><DanmakuManager roomId={roomId} host={host} tracks={danmaku.tracks} /></> : playerOptions === 'subtitles' ? <SubtitlePanel subtitles={subtitles} /> : <>
            <Text style={styles.muted}>播放器：{mediaStatus}{trackSummary ? ` · ${trackSummary}` : ''}</Text>
            <View style={styles.controls}><Button label={diagnosing ? '检测中…' : '播放诊断'} onPress={() => void runProbe()} disabled={diagnosing} /></View>
            {mediaProbe ? <Text style={mediaProbe.category === 'ready' ? styles.muted : styles.error}>网络探测：{mediaProbe.detail} · 来源 {mediaProbe.source}{mediaProbe.status ? ` · HEAD ${mediaProbe.status}` : ''}{mediaProbe.contentType ? ` · ${mediaProbe.contentType}` : ''}{mediaProbe.checks?.map(check => ` · ${check.name} ${check.status}${check.valid ? '✓' : '✗'}`).join('')}{mediaProbe.signature ? ` · 文件头 ${mediaProbe.signature}` : ''}{mediaProbe.redirected ? ' · 已跳转' : ''}</Text> : null}</>}</ScrollView></View></Modal>
  </SafeAreaView>;
}

const baseStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111417', padding: 12, gap: 12 }, fullscreenRoot: { padding: 0, gap: 0, backgroundColor: '#000' }, videoControls: { position: 'absolute', bottom: 0, left: 0, right: 0 }, header: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 64, borderBottomWidth: 1, borderColor: '#343d41', backgroundColor: '#1b2024' }, link: { color: '#65d59b', fontSize: 17 }, title: { color: '#edf1ef', fontSize: 19, fontWeight: '700' }, sectionTitle: { color: '#edf1ef', fontSize: 16, fontWeight: '700' }, text: { color: '#edf1ef', fontSize: 15 }, muted: { color: '#a8b3b6', fontSize: 13 }, error: { color: '#ffaaa5', padding: 8 }, join: { flex: 1, justifyContent: 'center', gap: 15 }, input: { backgroundColor: '#1b2024', borderColor: '#343d41', borderWidth: 1, color: '#edf1ef', borderRadius: 10, paddingHorizontal: 12, minHeight: 44 }, button: { backgroundColor: '#65d59b', borderRadius: 10, minHeight: 44, paddingHorizontal: 15, justifyContent: 'center', alignItems: 'center' }, buttonText: { color: '#111417', fontWeight: '700' }, disabled: { opacity: 0.45 }, mediaContent: { gap: 10, paddingBottom: 8 }, playerBox: { width: '100%', backgroundColor: '#05080c', alignItems: 'center', justifyContent: 'center', borderRadius: 12, overflow: 'hidden' }, placeholder: { alignItems: 'center', gap: 12, padding: 16 }, video: { width: '100%', height: '100%' }, controlPanel: { gap: 8 }, controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, sidePanel: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minHeight: 0, gap: 8, backgroundColor: '#1b2024', borderRadius: 16, padding: 8 }, tabs: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#343d41', flexShrink: 0 }, activeTab: { color: '#65d59b', fontWeight: '700' }, list: { flex: 1 }, listContent: { gap: 8, paddingBottom: 18 }, item: { backgroundColor: '#1b2024', padding: 12, borderRadius: 10, gap: 4 }, composer: { flexDirection: 'row', gap: 8 },
});
