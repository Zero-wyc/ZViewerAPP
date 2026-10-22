import { DynamicText as Text } from '@/components/DynamicText';
import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { WatchRoomChat } from '@/components/WatchRoomChat';
import { useMediaPalette } from '@/components/MediaPanelUi';
import { roomModeName, type RoomMode } from '@/lib/roomModes';
import { viewersAfterHostTransfer, type HostTransfer } from '@/lib/roomMembers';
import { useAppearance } from '@/state/appearance';
import { SubtitleOverlay, useSubtitles } from '@/components/Subtitles';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VlcVideo, useVlcVideo } from '@/components/VlcVideo';
import type { SavePlaybackSettings } from '@/components/MoviePlaybackSettings';
import { waitForPlayerReady } from '@/lib/playerReady';
import { playbackAfterSettings } from '@/lib/playbackSettings';
import { nativeBridge } from '@/lib/nativeBridge';
import { RelayAuthRecovery } from '@/lib/sessionFreshness';
import { MoviePanel } from '@/components/MoviePanel';
import { PlaybackControls } from '@/components/PlaybackControls';
import { moviePlayback, type Movie } from '@/lib/sources';
import { RoomSettings, RoomSettingsFooter, type Viewer } from '@/components/RoomSettings';
import { DanmakuOverlay, useDanmaku } from '@/components/Danmaku';
import { MusicPanel } from '@/components/MusicPanel';
import { ScreenShare, type ShareState } from '@/components/ScreenShare';
import { playbackSource, onBiliChange, biliFallback, stopBiliPlayback, resolveSharedBili } from '@/lib/biliNative';
import { RoomIconButton } from '@/components/RoomUi';
import { resolveAggregateSource } from '@/lib/aggregatePlayback';
import { RoomPlayback, requestRoomPlayback } from '@/lib/roomPlayback';
import { WatchSync, watchStateChanged } from '@/lib/watchSync';
import { watchDiagnostic } from '@/lib/watchDiagnostics';
import { useWatchControl } from '@/hooks/useWatchControl';
import { ScreenOrientationButton } from '@/components/ScreenOrientationButton';
import { usePlayerDisplay } from '@/hooks/usePlayerDisplay';
import { useSystemMedia } from '@/hooks/useSystemMedia';
import { VideoGestures } from '@/components/VideoGestures';
import { RoomChatPanel } from '@/components/RoomChatPanel';
import { VoicePanel } from '@/components/VoicePanel';
import { roomLayout, stackedMediaHeight, landscapeColumns } from '@/lib/roomLayout';
import { NativePreviewNotice } from '@/components/NativePreviewNotice';
import { AppDialog } from '@/components/AppDialog';
import { Surface } from '@/components/Surface';

import { emitAck } from '@/lib/socket';
import { nativeVideoSource } from '@/lib/media';
import { NativeMediaAdapter, type Playback } from '@/lib/mediaAdapter';
import { classifyPlayerError, safeMediaError } from '@/lib/mediaDiagnostics';
import { sharedPlayback } from '@/lib/biliRoomProtocol';
import { retainMusicPlayback } from '@/lib/roomConnection';
import { messageFor } from '@/lib/server';
import { useSession } from '@/state/session';
import { nextMovieId } from '@/lib/mediaLibrary';
import { requestPlaylistMovie } from '@/lib/playlistPlayback';
import { useRoomPermissions } from '@/hooks/useRoomPermissions';

type Phase = 'connecting' | 'password' | 'joining' | 'waiting' | 'ready' | 'error' | 'closed';
type Comment = { id: number; username: string; content: string; createdAt: string };
type JoinData = ShareState & { roomId?: string; mode?: RoomMode; name?: string; isHost?: boolean; playback?: Playback };

function Button({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  const theme = useAppearance();
  const styles = theme.styles(baseStyles);

  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onAccessibilityTap={() => { if (!disabled) onPress(); }} onPress={onPress} style={[styles.button, disabled && styles.disabled]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}

export default function RoomScreen() {
  const theme = useAppearance();
  const styles = theme.styles(baseStyles);
  const palette = useMediaPalette();

  const { roomId, name, asHost, hasPassword } = useLocalSearchParams<{ roomId: string; name?: string; asHost?: string; hasPassword?: string }>();
  const { session, socket, connected, request, ensureFresh } = useSession();
  const [share, setShare] = useState<ShareState>({});
  const [sendAsDanmaku, setSendAsDanmaku] = useState(false);
  const [phase, setPhase] = useState<Phase>(hasPassword === '1' && asHost !== '1' ? 'password' : 'connecting');
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [roomName, setRoomName] = useState(name || roomId);
  const roomInfoRevision = useRef(0);
  const [mode, setMode] = useState<RoomMode>('watch-together');
  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  const [host, setHost] = useState(asHost === '1');
  const permissions = useRoomPermissions(roomId, host);
  const movieOperation = useRef(0);
  const movieResolution = useRef<AbortController | null>(null);
  useEffect(() => () => movieResolution.current?.abort(), [roomId, session?.serverUrl, session?.user.id]);
  const relayAuth = useRef(new RelayAuthRecovery());
  const settingsInFlight = useRef<AbortController | null>(null);
  const [settingsEpoch, setSettingsEpoch] = useState(0);
  const [ownerUserId, setOwnerUserId] = useState<number | null>(null);
  const activateMovieRef = useRef<(movie: Movie) => Promise<void>>(async () => {});
  const [settingsOpen, setSettingsOpen] = useState(false); const [leaveOpen, setLeaveOpen] = useState(false);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [autoContinueSetting, setAutoContinueSetting] = useState({ scope: '', enabled: false });
  const continuation = useRef({ enabled: false, consumed: '', running: false });
  const continuationScope = `${session?.serverUrl}:${session?.user.id}:${roomId}`;
  const autoContinueScope = `${continuationScope}:${mode}:${host}`;
  const autoContinue = autoContinueSetting.scope === autoContinueScope && autoContinueSetting.enabled;
  useEffect(() => { continuation.current = { enabled: false, consumed: '', running: false }; }, [continuationScope, mode, host]);
  const changeAutoContinue = (enabled: boolean) => { setAutoContinueSetting({ scope: autoContinueScope, enabled }); continuation.current.enabled = enabled; continuation.current.consumed = ''; };
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState('');
  const [source, setSource] = useState<Playback | null>(null);
  const [playbackError, setPlaybackError] = useState('');
  const [seekNotice, setSeekNotice] = useState('');
  const [retryTick, setRetryTick] = useState(0);
  const [roomTab, setRoomTab] = useState<'chat' | 'movies'>('chat');
  const [busy, setBusy] = useState(false);
  const display = usePlayerDisplay();
  const fullScreen = display.fullscreen;
  const resetDisplay = display.reset;
  const [musicImmersive, setMusicImmersive] = useState(false);
  const [sideOpen, setSideOpen] = useState<boolean | null>(null);
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
  const [joinRequests, setJoinRequests] = useState<{ viewerSocketId: string; username: string }[]>([]);
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const knownMembers = useRef(new Map<string, Viewer>());
  useEffect(() => { knownMembers.current.clear(); }, [continuationScope]);
  const mediaColumn = useRef<ScrollView | null>(null);
  useEffect(() => { mediaColumn.current?.scrollTo({ y: 0, animated: false }); }, [mode]);
  const attempted = useRef(hasPassword !== '1' || asHost === '1');
  const hostRef = useRef(asHost === '1');
  const passwordRef = useRef('');
  const adapterRef = useRef<NativeMediaAdapter | null>(null);
  const playbackRef = useRef<Playback | null>(null);
  const sharedSource = useRef<ReturnType<typeof moviePlayback> | null>(null);
  const roomPlayback = useRef(new RoomPlayback());
  const [waitingMovie, setWaitingMovie] = useState(false);
  const [joined, setJoined] = useState(false);
  const controlsInteracting = useRef(false); const controlsPlaying = useRef(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showControls = () => { setControlsVisible(true); if (controlsTimer.current) clearTimeout(controlsTimer.current); if (!controlsInteracting.current && controlsPlaying.current) controlsTimer.current = setTimeout(() => setControlsVisible(false), 3000); };
  const setControlsInteracting = useCallback((active: boolean) => { controlsInteracting.current = active; setControlsVisible(true); if (controlsTimer.current) clearTimeout(controlsTimer.current); if (!active && controlsPlaying.current) controlsTimer.current = setTimeout(() => setControlsVisible(false), 3000); }, []);
  useEffect(() => () => { if (controlsTimer.current) clearTimeout(controlsTimer.current); }, []);
  const applyPlayback = useCallback((value: Playback | null) => { playbackRef.current = value; setSource(value); setWaitingMovie(roomPlayback.current.waiting); }, []);
  const generation = useRef(0);
  const video = useVlcVideo();
  const { player } = video;
  useEffect(() => { const subscription = player.addListener('playingChange', event => { controlsPlaying.current = event.isPlaying; setControlsVisible(true); if (controlsTimer.current) clearTimeout(controlsTimer.current); if (event.isPlaying && !controlsInteracting.current) controlsTimer.current = setTimeout(() => setControlsVisible(false), 3000); }); return () => subscription.remove(); }, [player]);

  const [decodedSize, setDecodedSize] = useState({ width: 0, height: 0 });
  const reportVideoSize = display.videoSize; const resetVideoSize = display.resetVideoSize;
  useEffect(() => { const event = player.addListener('videoSize', size => { setDecodedSize(old => old.width === size.width && old.height === size.height ? old : size); void reportVideoSize(size.width, size.height); }); return () => { event.remove(); }; }, [player, reportVideoSize]);
  useEffect(() => { resetVideoSize(); }, [source?.movieId, source?.cid, source?.currentPage, resetVideoSize]);
  const danmaku = useDanmaku(roomId, player, phase === 'ready' && mode === 'watch-together', { media: source, canManage: session?.user.role === 'root' || session?.user.id === ownerUserId });
  const subtitles = useSubtitles(roomId, player, host, phase === 'ready' && mode === 'watch-together', source?.sourceUrl);
  const readyRef = useRef(false);
  const watchSync = useRef(new WatchSync());
  useEffect(() => { readyRef.current = phase === 'ready' && mode === 'watch-together'; playbackRef.current = source; }, [phase, mode, source]);
  useEffect(() => {
    const subscription = nativeBridge?.addListener('onHlsRelayError', event => {
      if (!player.sourceUri.includes(`/${event.id}/`)) return;
      const expected = session; const epoch = generation.current; const media = movieOperation.current;
      const scope = expected && JSON.stringify([expected.serverUrl, expected.user.id, roomId, playbackRef.current?.movieId, playbackRef.current?.sourceUrl]);
      if (expected && scope && relayAuth.current.begin(scope, event)) {
        void ensureFresh({ force: true, expected }).then(next => {
          if (epoch !== generation.current || media !== movieOperation.current || !readyRef.current) return;
          if (next.accessToken === expected.accessToken) { setPlaybackError(safeMediaError(event.message)); return; }
          adapterRef.current?.invalidate(); setPlaybackError(''); setRetryTick(value => value + 1);
        }).catch(failure => { if (epoch === generation.current && media === movieOperation.current) setPlaybackError(safeMediaError(messageFor(failure))); });
        return;
      }
      setPlaybackError(safeMediaError(event.message));
    });
    return () => subscription?.remove();
  }, [player, session, ensureFresh, roomId]);
  const publishNativeState = useCallback((action?: 'play' | 'pause' | 'seek' | 'rate', value?: number) => {
    if (!hostRef.current || !readyRef.current || !socket?.connected || !playbackRef.current || !action && (adapterRef.current?.busy || player.preparing)) return;
    const state: Playback = { ...playbackRef.current, currentTime: player.currentTime, isPlaying: action === 'play' ? true : action === 'pause' ? false : player.playing, playbackRate: player.playbackRate, duration: player.duration };
    playbackRef.current = state;
    if (!settingsInFlight.current) setSource(state);
    if (settingsInFlight.current) { if (action) socket.emit('watch-together-control', { roomId, action, value, clientTs: Date.now() }); return; }
    if (action) socket.emit('watch-together-control', { roomId, action, value, clientTs: Date.now() });
    const broadcast = sharedPlayback(state, sharedSource.current);
    if (broadcast) socket.emit('watch-together-state', { roomId, state: broadcast, clientTs: Date.now() });
  }, [player, socket, roomId]);
  useEffect(() => {
    const adapter = new NativeMediaAdapter(player, playbackSource, __DEV__ ? values => watchDiagnostic('adapter', values) : undefined); adapterRef.current = adapter;
    return () => { readyRef.current = false; adapter.dispose(); if (adapterRef.current === adapter) adapterRef.current = null; };
  }, [player]);
  useEffect(() => onBiliChange(() => { adapterRef.current?.invalidate(); setRetryTick(value => value + 1); }), []);
  useEffect(() => () => { void stopBiliPlayback(); }, []);
  const windowSize = useWindowDimensions();
  const [rootSize, setRootSize] = useState({ width: 0, height: 0 });
  const [bodySize, setBodySize] = useState({ width: 0, height: 0 });
  const width = rootSize.width || windowSize.width;
  const height = rootSize.height || windowSize.height;
  const wide = !fullScreen && width > height && (width >= 600 || mode === 'screen-share');
  const portrait = height >= width;
  const castingSidebar = !fullScreen && mode === 'screen-share' && wide;
  const sideVisible = castingSidebar || !fullScreen && mode === 'watch-together' && (sideOpen ?? (wide || portrait));
  const stacked = portrait && sideVisible;
  const columns = landscapeColumns(bodySize.width || Math.max(0, width - 24));
  const [mediaSize, setMediaSize] = useState({ width: 0, height: 0 });
  const leftWidth = mediaSize.width || (wide && sideVisible ? Math.max(0, width - 380) : Math.max(0, width - 32));
  const mediaHeight = stacked ? stackedMediaHeight(bodySize.height || Math.max(0, height - 150)) : bodySize.height || Math.max(0, height - 150);
  const playerHeight = Math.min(leftWidth * (decodedSize.width > 0 ? decodedSize.height / decodedSize.width : 9 / 16), Math.max(80, mediaHeight));
  const toggleFullscreen = async () => { showControls(); await display.toggleFullscreen(); };

  const loadMovies = useCallback(async () => {
    try {
      const version = generation.current;
      const data = await request<{ movies: Movie[] }>(`/api/rooms/${encodeURIComponent(roomId)}/movies`);
      if (version !== generation.current) return;
      const values = Array.isArray(data.movies) ? data.movies : []; setMovies(values);
      const updated = roomPlayback.current.list(values); if (!settingsInFlight.current) applyPlayback(updated);
    } catch (failure) { setError(messageFor(failure)); }
  }, [request, roomId, applyPlayback]);

  const loadComments = useCallback(() => {
    if (!socket?.connected) return;
    socket.timeout(10000).emit('comment-history', { roomId }, (timeout: Error | null, result?: { success: boolean; comments?: Comment[] }) => {
      if (!timeout && result?.success && Array.isArray(result.comments)) setComments(result.comments);
    });
  }, [socket, roomId]);

  const requestPlayback = useCallback(() => {
    if (!socket) return;
    const version = generation.current;
    const operation = movieOperation.current;
    const revision = roomPlayback.current.revision;
    requestRoomPlayback(socket, roomId, () => version === generation.current && operation === movieOperation.current && revision === roomPlayback.current.revision && !hostRef.current,
      state => applyPlayback(roomPlayback.current.state(state)));
  }, [socket, roomId, applyPlayback]);

  const applyRoom = useCallback((data: JoinData = {}) => {
    const infoRevision = ++roomInfoRevision.current;
    const roomGeneration = generation.current;
    setJoined(true);
    if (data.shareMethod) setShare({ shareMethod: data.shareMethod, streamKey: data.streamKey });
    if (data.name) setRoomName(data.name);
    if (data.mode) setMode(data.mode);
    if (!data.name || !data.mode) {
      void request<{ rooms: { roomId: string; name: string; mode: RoomMode }[] }>('/api/rooms').then(result => {
        if (roomGeneration !== generation.current || infoRevision !== roomInfoRevision.current) return;
        const room = result.rooms.find(item => item.roomId === roomId);
        if (!room) return;
        if (!data.name && room.name) setRoomName(room.name);
        if (!data.mode && room.mode) setMode(room.mode);
      }).catch(() => {});
    }
    if (data.playback?.sourceUrl) { applyPlayback(roomPlayback.current.state(data.playback)); }
    setError(''); setPhase('ready');
    void loadMovies();
    loadComments();
    socket?.emit('request-current-movie', { roomId });
    if (!hostRef.current) requestPlayback();
  }, [loadMovies, loadComments, socket, roomId, applyPlayback, requestPlayback, request]);

  const join = useCallback(async (asRoomHost: boolean) => {
    if (!socket?.connected) { setPhase('connecting'); return; }
    const version = ++generation.current;
    setPhase('joining'); setError('');
    try {
      const ack = await emitAck<{ data?: JoinData }>(socket, asRoomHost ? 'register-host' : 'request-join', { roomId, ...(!asRoomHost ? { password: passwordRef.current } : {}) });
      if (version !== generation.current) return;
      if (!asRoomHost && ack.data?.isHost) {
        hostRef.current = true; setHost(true); setOwnerUserId(session?.user.id || null);
        const hostAck = await emitAck<{ data?: JoinData }>(socket, 'register-host', { roomId });
        if (version === generation.current) applyRoom(hostAck.data);
        return;
      }
      if (asRoomHost || ack.message === '已加入房间') { if (asRoomHost) setOwnerUserId(session?.user.id || null); applyRoom(ack.data); }
      else setPhase('waiting');
    } catch (failure) {
      if (version !== generation.current) return;
      const message = messageFor(failure);
      setError(message);
      setPhase(message.includes('密码') ? 'password' : 'error');
    }
  }, [socket, roomId, applyRoom, session]);

  useEffect(() => {
    if (!socket) return;
    const invalidateJoin = () => { generation.current++; };
    const onConnect = () => { if (attempted.current) void join(hostRef.current); else setPhase('password'); };
    const onDisconnect = () => { movieResolution.current?.abort(); settingsInFlight.current?.abort(); generation.current++; readyRef.current = false; roomPlayback.current.reset(); setSource(null); knownMembers.current.clear(); setViewers([]); setPhase('connecting'); };
    const onViewerJoined = (payload: { viewerSocketId: string; userId?: number; username?: string; role?: string }) => { const viewer = { ...payload, socketId: payload.viewerSocketId }; knownMembers.current.set(viewer.socketId, viewer); setViewers(previous => [...previous.filter(item => item.socketId !== payload.viewerSocketId), viewer]); };
    const onViewerLeft = (payload: { viewerSocketId: string }) => { knownMembers.current.delete(payload.viewerSocketId); setViewers(previous => previous.filter(item => item.socketId !== payload.viewerSocketId)); };
    const onApproved = (data: JoinData) => { if (data.roomId === roomId) applyRoom(data); };
    const onRejected = (data: JoinData) => { if (data.roomId === roomId) { generation.current++; setPhase('error'); setError('房主拒绝了加入申请'); } };
    const onClosed = (data: JoinData) => { if (data.roomId === roomId) { settingsInFlight.current?.abort(); generation.current++; attempted.current = false; readyRef.current = false; player.pause(); setSource(null); setPhase('closed'); setError('房间已关闭'); } };
    const onKicked = (data: { reason?: string }) => { settingsInFlight.current?.abort(); generation.current++; attempted.current = false; readyRef.current = false; player.pause(); setSource(null); setPhase('closed'); setError(data.reason || '您已被移出房间'); };
    const onMode = (data: JoinData) => { if ((!data.roomId || data.roomId === roomId) && data.mode && data.mode !== modeRef.current) { roomInfoRevision.current++; modeRef.current = data.mode; movieOperation.current++; movieResolution.current?.abort(); settingsInFlight.current?.abort(); setMode(data.mode); setRoomTab('chat'); setSideOpen(null); setControlsVisible(true); void resetDisplay(); } };
    const onHostTransferred = (data: HostTransfer & { newOwnerUserId?: number }) => {
      if (typeof data.newHostSocketId !== 'string' || !data.newHostSocketId || data.newHostSocketId === data.oldHostSocketId) return;
      if (data.oldHostSocketId === socket.id && session) knownMembers.current.set(socket.id!, { socketId: socket.id!, userId: session.user.id, username: session.user.username, role: session.user.role });
      const former = data.oldHostSocketId ? knownMembers.current.get(data.oldHostSocketId) : undefined;
      setViewers(previous => viewersAfterHostTransfer(previous, data, former));
      setOwnerUserId(data.newOwnerUserId ?? null);
      const next = data.newHostSocketId === socket.id;
      if (next === hostRef.current) return;
      generation.current++; movieOperation.current++; movieResolution.current?.abort();
      settingsInFlight.current?.abort(); adapterRef.current?.cancelPending();
      hostRef.current = next; setHost(next); if (next) void join(true);
    };
    const onName = (data: JoinData) => { if (data.roomId === roomId && data.name) { roomInfoRevision.current++; setRoomName(data.name); } };
    const onShare = (data: JoinData) => { if (data.roomId === roomId) setShare({ shareMethod: data.shareMethod, streamKey: data.streamKey }); };
    const onComment = (item: Comment) => setComments(previous => previous.some(value => value.id === item.id) ? previous : [...previous, item]);
    const onMovies = (payload: { movies?: Movie[] }) => { if (Array.isArray(payload.movies)) { const values = payload.movies.filter(movie => !movie.roomId || movie.roomId === roomId); setMovies(values); const updated = roomPlayback.current.list(values); if (!settingsInFlight.current) applyPlayback(updated); const movie = roomPlayback.current.hostMovieToActivate; if (hostRef.current && movie) void activateMovieRef.current(movie); } };
    const onCurrent = (payload: { movieId: number | null }) => {
      if (payload.movieId !== null && !Number.isSafeInteger(payload.movieId)) return;
      settingsInFlight.current?.abort(); movieOperation.current++; if (payload.movieId === null) player.pause();
      applyPlayback(roomPlayback.current.current(payload.movieId));
      if (payload.movieId === null) return;
      if (hostRef.current) { const movie = roomPlayback.current.hostMovieToActivate; if (movie) void activateMovieRef.current(movie); return; }
      requestPlayback();
    };
    const onJoinRequest = (payload: { roomId: string; viewerSocketId: string; username: string }) => {
      if (hostRef.current && payload.roomId === roomId) setJoinRequests(current => [...current.filter(item => item.viewerSocketId !== payload.viewerSocketId), payload]);
    };
    const onPlayback = (payload: { state?: Playback; diff?: Partial<Playback> }) => {
      if (hostRef.current) return;
      if (payload.state) {
        watchDiagnostic('state', { time: payload.state.currentTime, playing: payload.state.isPlaying, busy: adapterRef.current?.busy, preparing: player.preparing });
        applyPlayback(roomPlayback.current.state({ ...payload.state, ...payload.diff }));
      }
    };
    const onControl = (payload: { action?: 'play' | 'pause' | 'seek' | 'rate'; value?: number }) => {
      if (hostRef.current || !readyRef.current || !roomPlayback.current.value()) return;
      if (payload.action === 'play') player.play();
      if (payload.action === 'pause') player.pause();
      if (payload.action === 'seek' && Number.isFinite(payload.value)) player.currentTime = Math.max(0, payload.value!);
      if (payload.action === 'rate' && Number.isFinite(payload.value)) player.playbackRate = payload.value!;
    };
    const onHeartbeat = (payload: { source?: string; currentTime?: number; isPlaying?: boolean; playbackRate?: number; suppressed?: boolean; state?: Playback }) => {
      if (hostRef.current || payload.suppressed || !watchSync.current.accepts(payload.source)) return;
      const previous = roomPlayback.current.value();
      const state = payload.state ? roomPlayback.current.state(payload.state) : previous && { ...previous, currentTime: payload.currentTime ?? previous.currentTime, isPlaying: payload.isPlaying ?? previous.isPlaying, playbackRate: payload.playbackRate ?? previous.playbackRate };
      if (payload.state && watchStateChanged(previous, state)) applyPlayback(state);
      if (!readyRef.current || !state || !session) return;
      const identity = nativeVideoSource({ ...state, audioUrl: undefined, sourceType: state.sourceType === 'bilibili' ? 'url' : state.sourceType }, session!.serverUrl, session!.accessToken).identity;
      const ready = !adapterRef.current?.busy && !player.preparing && player.duration > 0 && player.sourceIdentity === identity;
      const target = watchSync.current.target(state, player.currentTime, ready, player.seeking);
      watchDiagnostic('heartbeat', { position: player.currentTime, targetTime: state.currentTime, seek: target, ready, seeking: player.seeking, busy: adapterRef.current?.busy, preparing: player.preparing, duration: player.duration, playing: player.playing });
      if (target !== null) player.currentTime = target;
      if (!ready || player.seeking) return;
      const playing = state.isPlaying;
      if (playing === true && !player.playing) player.play();
      if (playing === false && player.playing) player.pause();
      if (state.playbackRate && player.playbackRate !== state.playbackRate) player.playbackRate = state.playbackRate;
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
  }, [socket, roomId, join, applyRoom, player, applyPlayback, requestPlayback, session, resetDisplay]);

  useEffect(() => {
    if (!host || phase !== 'ready' || !socket || mode !== 'watch-together') return;
    const interval = setInterval(() => {
      if (!socket.connected || !playbackRef.current || settingsInFlight.current || adapterRef.current?.busy || player.preparing || player.seeking) return;
      socket.emit('host-heartbeat', {
        roomId,
        currentTime: player.currentTime,
        isPlaying: player.preparing ? playbackRef.current.isPlaying : player.playing,
        playbackRate: player.playbackRate,
        suppressed: Boolean(adapterRef.current?.busy || player.preparing),
        clientTs: Date.now(),
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [host, phase, socket, mode, roomId, player]);

  useEffect(() => {
    watchSync.current.reset();
    if (host || phase !== 'ready' || mode !== 'watch-together' || !socket) return;
    let active = true, pending = false;
    const interval = setInterval(() => {
      if (pending || !socket.connected || adapterRef.current?.busy || player.preparing || player.seeking || !playbackRef.current) return;
      pending = true;
      const revision = roomPlayback.current.revision, movie = movieOperation.current;
      socket.timeout(8000).emit('watch-together-check-status', { roomId, currentTime: player.currentTime, isPlaying: player.playing, playbackRate: player.playbackRate, clientTs: Date.now() }, (error: Error | null, result?: { success: boolean; data?: { needsSync: boolean; state?: Playback; serverTs?: number } }) => {
        pending = false;
        if (!active || error || !result?.success || !result.data?.needsSync || !result.data.state || revision !== roomPlayback.current.revision || movie !== movieOperation.current) return;
        const previous = roomPlayback.current.value();
        const state = roomPlayback.current.state(result.data.state);
        applyPlayback(state);
        const sameMedia = previous?.sourceUrl === state?.sourceUrl && previous?.movieId === state?.movieId && previous?.cid === state?.cid;
        if (state && sameMedia && !player.preparing && !player.seeking && !adapterRef.current?.busy) {
          const target = watchSync.current.target(state, player.currentTime, true, false);
          if (target !== null) player.currentTime = target;
        }
      });
    }, 10000);
    return () => { active = false; clearInterval(interval); };
  }, [host, phase, mode, socket, roomId, player, applyPlayback]);

  useEffect(() => {
    const playing = player.addListener('playingChange', ({ isPlaying }) => { if (!settingsInFlight.current) publishNativeState(isPlaying ? 'play' : 'pause'); });
    const rate = player.addListener('playbackRateChange', ({ playbackRate }) => { if (!settingsInFlight.current) publishNativeState('rate', playbackRate); });
    let lastHeartbeat = 0;
    let previous: { position: number; time: number; playing: boolean; rate: number } | null = null;
    const progress = player.addListener('timeUpdate', ({ currentTime }) => {
      const time = Date.now();
      if (time - lastHeartbeat >= 5000 && readyRef.current && hostRef.current && socket?.connected && playbackRef.current && !settingsInFlight.current && !adapterRef.current?.busy && !player.preparing) { lastHeartbeat = time; socket.emit('host-heartbeat', { roomId, currentTime, isPlaying: player.playing, playbackRate: player.playbackRate, suppressed: false, clientTs: Date.now() }); }
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
    if (!session || !adapterRef.current || settingsInFlight.current) return;
    let current = true;
    const state = phase === 'ready' && mode === 'watch-together' ? source : null;
    void adapterRef.current.apply(state, session.serverUrl, session.accessToken, retryTick)
      .then(() => { if (current && !adapterRef.current?.failed) setPlaybackError(''); })
      .catch(failure => { if (current) setPlaybackError(safeMediaError(messageFor(failure))); });
    const adapter = adapterRef.current;
    return () => { current = false; adapter?.cancelPending(); };
  }, [source, mode, session, player, retryTick, phase, settingsEpoch]);
  useEffect(() => {
    const identity = playbackRef.current;
    if (!host || phase !== 'ready' || mode !== 'watch-together' || identity?.sourceType !== 'bilibili' || !session || sharedPlayback(identity, sharedSource.current)) return;
    const controller = new AbortController();
    void resolveSharedBili(identity, session.serverUrl, session.accessToken, controller.signal).then(shared => {
      if (controller.signal.aborted) return;
      const current = playbackRef.current;
      const state = current && sharedPlayback(current, shared);
      if (!state) return;
      sharedSource.current = shared;
      if (socket?.connected) socket.emit('watch-together-state', { roomId, state });
    }).catch(failure => { if (!controller.signal.aborted) setPlaybackError(`观众播放地址准备失败：${safeMediaError(messageFor(failure))}`); });
    return () => controller.abort();
  }, [host, phase, mode, source?.sourceUrl, source?.movieId, source?.cid, source?.currentPage, session, socket, roomId, retryTick]);
  useEffect(() => {
    const subscription = player.addListener('statusChange', ({ status, error: videoError }) => {
      watchDiagnostic('status', { status, position: player.currentTime, preparing: player.preparing, busy: adapterRef.current?.busy });
      if (status === 'loading' || status === 'idle') setSeekNotice('');
      if (status === 'error') {
        if (videoError && 'code' in videoError && videoError.code === 'VLC_SEEK') { setSeekNotice(safeMediaError(videoError.message)); return; }
        const current = playbackRef.current;
        if (current?.sourceType === 'bilibili' && biliFallback(current.sourceUrl)) { setPlaybackError(''); setRetryTick(value => value + 1); }
        else { adapterRef.current?.nativeFailed(); setPlaybackError(safeMediaError(videoError?.message || '视频播放失败')); }
      }
    });
    const loaded = player.addListener('sourceLoad', ({ duration }) => {
      watchDiagnostic('loaded', { duration, position: player.currentTime, preparing: player.preparing });
    });
    const seekSettled = player.addListener('seekSettled', () => setSeekNotice(''));
    return () => { subscription.remove(); loaded.remove(); seekSettled.remove(); };
  }, [player]);

  const leave = () => {
    movieResolution.current?.abort();
    generation.current++;
    attempted.current = false;
    readyRef.current = false;
    player.pause();
    socket?.disconnect();
    router.replace('/');
    setTimeout(() => socket?.connect(), 100);
  };

  const sendComment = async () => {
    if (!socket?.connected || busy || !draft.trim()) return;
    setBusy(true); setError('');
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

  const [autoApproveSetting, setAutoApproveSetting] = useState({ scope: continuationScope, enabled: false });
  const autoApproveRequests = autoApproveSetting.scope === continuationScope && autoApproveSetting.enabled;
  const watch = useWatchControl(socket, roomId, host, player, publishNativeState, mode === 'watch-together' && autoApproveRequests);
  const control = watch.control;
  useSystemMedia(player, phase === 'ready' && mode === 'watch-together' && source ? { mediaId: `${roomId}:${source.movieId ?? source.sourceUrl}:${source.cid ?? 0}`, kind: 'video', sourceIdentity: source.sourceUrl.startsWith('/') && session ? `${session.serverUrl}${source.sourceUrl}` : source.sourceUrl, title: movies.find(item => item.id === source.movieId)?.title || roomName, host, actions: ['play', 'pause', 'seek'] } : null, (action, value) => { if (['play', 'pause', 'seek'].includes(action)) control(action as 'play' | 'pause' | 'seek', value); });
  useEffect(() => { if (!waitingMovie) return; const timer = setTimeout(() => setPlaybackError('当前影片资料等待超时，请刷新片单并重试播放'), 12000); return () => clearTimeout(timer); }, [waitingMovie]);

  const playMovie = async (movie: Movie, announce = true) => {
    continuation.current.consumed = '';
    if (!socket || !session) return;
    if (announce) {
      if (!permissions.canSwitch || !readyRef.current) return;
      const version = generation.current, operation = movieOperation.current, wasHost = hostRef.current;
      await requestPlaylistMovie(socket, roomId, movie.id, wasHost, () => version === generation.current && operation === movieOperation.current && readyRef.current && modeRef.current === 'watch-together' && (!wasHost || hostRef.current));
      return;
    }
    if (!hostRef.current) return;
    const version = generation.current;
    const operation = ++movieOperation.current;
    const controller = new AbortController(); movieResolution.current?.abort(); movieResolution.current = controller;
    const current = () => !controller.signal.aborted && version === generation.current && operation === movieOperation.current && readyRef.current && hostRef.current && modeRef.current === 'watch-together';
    let resolved = moviePlayback(movie);
    let broadcastSource: ReturnType<typeof moviePlayback> | null = resolved;
    try {
      if (['anime', 'kazumi', 'cms'].includes(resolved.sourceType || '')) resolved = await resolveAggregateSource(resolved, request, controller.signal);
      if (!current()) return;
      // Local playback does not wait for the server's Bili account. The effect
      // above prepares ordinary browser media independently and broadcasts only
      // a usable server stream. PGC keeps its explicit per-device CLI contract.
      if (resolved.sourceType === 'bilibili') broadcastSource = resolved.cliOnly || resolved.epId || resolved.seasonId ? { ...resolved, cliOnly: true } : null;
      else { nativeVideoSource(resolved, session.serverUrl, session.accessToken); broadcastSource = resolved; }
    }
    catch (failure) { if (current()) setPlaybackError(safeMediaError(messageFor(failure))); return; }
    if (!current()) return;
    setPlaybackError('');
    const state: Playback = { ...resolved, isPlaying: true, currentTime: 0, playbackRate: 1 };
    sharedSource.current = broadcastSource;
    roomPlayback.current.current(movie.id); applyPlayback(roomPlayback.current.state(state));
    if (broadcastSource) socket.emit('watch-together-state', { roomId, state: { ...state, ...broadcastSource } });
  };

  const savePlaybackSettings: SavePlaybackSettings = async (movie, patch, phaseChanged) => {
    if (!session || !hostRef.current || !readyRef.current || (session.user.role !== 'root' && ownerUserId !== session.user.id)) throw new Error('没有影片播放设置权限');
    if (settingsInFlight.current) throw new Error('请等待当前播放设置操作完成');
    const controller = new AbortController(); settingsInFlight.current = controller;
    const generationAtStart = generation.current; const mediaAtStart = movieOperation.current;
    let saved = false;
    const valid = () => !controller.signal.aborted && generationAtStart === generation.current && mediaAtStart === movieOperation.current && readyRef.current && hostRef.current;
    try {
      phaseChanged('saving');
      const path = `/api/rooms/${encodeURIComponent(roomId)}/movies`;
      if (Object.keys(patch).length) await request(`${path}/${movie.id}`, { method: 'PUT', body: JSON.stringify(patch), signal: controller.signal });
      saved = true;
      const data = await request<{ movies: Movie[] }>(path, { signal: controller.signal });
      if (!valid()) throw new Error('房间或当前影片已变化');
      const confirmed = data.movies.find(item => item.id === movie.id); if (!confirmed) throw new Error('影片已删除');
      setMovies(data.movies); const coordinated = roomPlayback.current.list(data.movies);
      if (roomPlayback.current.currentId !== movie.id || !coordinated) return;
      const affectsNative = !Object.keys(patch).length || patch.serverProxy !== undefined || (confirmed.serverProxy ?? false) !== (playbackRef.current?.serverProxy ?? false) || confirmed.sourceMountId !== playbackRef.current?.sourceMountId;
      if (!affectsNative) {
        const applied = playbackAfterSettings(coordinated, playbackRef.current, player);
        sharedSource.current = applied; applyPlayback(roomPlayback.current.state(applied));
        socket?.emit('watch-together-state', { roomId, state: applied, clientTs: Date.now() }); return;
      }
      phaseChanged('applying');
      const resolved = await resolveAggregateSource(moviePlayback(confirmed), request, controller.signal);
      if (!valid()) throw new Error('播放设置应用已取消');
      const intent = playbackRef.current || coordinated;
      const next: Playback = { ...resolved, isPlaying: intent.isPlaying, currentTime: player.currentTime, playbackRate: intent.playbackRate ?? player.playbackRate, duration: confirmed.duration ?? player.duration };
      playbackRef.current = next;
      if (!Object.keys(patch).length) adapterRef.current!.invalidate();
      await adapterRef.current!.apply(next, session.serverUrl, session.accessToken, retryTick);
      await waitForPlayerReady(player, controller.signal);
      if (!valid()) throw new Error('播放设置应用已取消');
      const latest = playbackRef.current || next;
      const applied = { ...next, isPlaying: latest.isPlaying, playbackRate: latest.playbackRate, currentTime: player.currentTime };
      if (applied.isPlaying) player.play(); else player.pause();
      sharedSource.current = applied; applyPlayback(roomPlayback.current.state(applied)); setPlaybackError('');
      socket?.emit('watch-together-state', { roomId, state: applied, clientTs: Date.now() });
    } catch (failure) {
      if (saved && valid()) { player.pause(); setPlaybackError('播放设置已保存，但媒体应用失败，请重试应用'); }
      throw new Error(`${saved ? '设置已保存，确认或应用失败：' : '保存失败：'}${safeMediaError(messageFor(failure))}`);
    } finally {
      if (settingsInFlight.current === controller) {
        settingsInFlight.current = null;
        // Source/mode changes can render while the transaction owns the adapter.
        // Replay the newest state after releasing that lock, including null on
        // disconnect/close, instead of leaving a skipped effect stranded.
        if (!valid()) setSettingsEpoch(value => value + 1);
      }
    }
  };
  useEffect(() => () => { settingsInFlight.current?.abort(); }, [roomId, mode, session?.serverUrl, session?.user.id]);

  const [nextBusy, setNextBusy] = useState(false); const nextLock = useRef(false);
  const nextMovie = async () => {
    if (nextLock.current || !permissions.canSwitch || !readyRef.current || !source?.movieId) return;
    nextLock.current = true; setNextBusy(true); const version = generation.current; const movieId = source.movieId;
    try { const data = await request<{ movies: Movie[] }>(`/api/rooms/${encodeURIComponent(roomId)}/movies`); if (version !== generation.current || playbackRef.current?.movieId !== movieId) return; const nextId = nextMovieId(data.movies.map(item => item.id), movieId); const movie = data.movies.find(item => item.id === nextId); if (movie) await playMovie(movie); }
    catch (failure) { if (version === generation.current) setError(messageFor(failure)); }
    finally { nextLock.current = false; setNextBusy(false); }
  };
  const playMovieRef = useRef(playMovie); useEffect(() => { playMovieRef.current = playMovie; activateMovieRef.current = movie => playMovie(movie, false); });
  useEffect(() => {
    const subscription = player.addListener('timeUpdate', ({ currentTime }) => {
      const current = playbackRef.current; const gate = continuation.current;
      if (!gate.enabled || gate.running || !hostRef.current || !readyRef.current || !socket?.connected || player.preparing || !player.playing || player.duration < 2 || currentTime < player.duration - 0.3 || !current?.movieId) return;
      const key = `${current.movieId}:${current.sourceUrl}`; if (gate.consumed === key) return;
      gate.consumed = key; gate.running = true; const version = generation.current;
      void request<{ movies: Movie[] }>(`/api/rooms/${encodeURIComponent(roomId)}/movies`).then(async data => {
        if (version !== generation.current || !gate.enabled || !hostRef.current || !readyRef.current || playbackRef.current?.movieId !== current.movieId || playbackRef.current?.sourceUrl !== current.sourceUrl) return;
        const id = nextMovieId(data.movies.map(movie => movie.id), current.movieId); const next = data.movies.find(movie => movie.id === id);
        if (next) await playMovieRef.current(next);
        else { player.pause(); publishNativeState('pause'); }
      }).catch(failure => { if (version === generation.current) setPlaybackError(messageFor(failure)); }).finally(() => { gate.running = false; });
    });
    return () => { subscription.remove(); };
  }, [player, request, roomId, socket, publishNativeState]);

  if (!session) return <SafeAreaView style={styles.root}><Text style={styles.text}>请先登录</Text><Button label="返回" onPress={() => router.replace('/')} /></SafeAreaView>;
  return <SafeAreaView onLayout={event => setRootSize(event.nativeEvent.layout)} edges={fullScreen ? [] : ['top', 'bottom', 'left', 'right']} style={[styles.root, fullScreen && styles.fullscreenRoot]}>
    <StatusBar style={theme.dark ? "light" : "dark"} hidden={fullScreen} />
    {!fullScreen && !musicImmersive ? <NativePreviewNotice /> : null}
    <Surface readable style={[styles.header, (fullScreen || musicImmersive) && { display: 'none' }]}>
      <RoomIconButton label="离开房间" icon="arrow-left" onPress={() => setLeaveOpen(true)} />
      <View style={{ flex: 1, minWidth: 0 }}><Text style={styles.title} numberOfLines={1}>{roomName}</Text><Text style={styles.muted}>{host ? '房主' : '观众'} · {roomModeName(mode)}</Text></View>
      <ScreenOrientationButton state={display.orientation} />
      <VoicePanel compact roomId={roomId} ready={phase === 'ready'} host={host} />
      <RoomIconButton label="房间设置" icon="users" onPress={() => setSettingsOpen(true)} />
      {mode === 'watch-together' && !portrait && !wide ? <RoomIconButton label={portrait ? (sideVisible ? '收起下方菜单' : '展开下方菜单') : (sideVisible ? '收起侧栏' : '展开侧栏')} icon={portrait ? (sideVisible ? 'chevron-up' : 'chevron-down') : (sideVisible ? 'sidebar' : 'menu')} onPress={() => setSideOpen(!sideVisible)} /> : null}
    </Surface>
    {display.orientation.error && !fullScreen ? <Text accessibilityLiveRegion="polite" style={styles.error}>{display.orientation.error}</Text> : null}
    {!connected && !fullScreen ? <Text style={styles.error}>连接已断开，正在重连</Text> : null}
    {phase !== 'ready' && !retainMusicPlayback(joined, mode, phase) ? <View style={styles.join}><ActivityIndicator color="#65d59b" animating={phase === 'joining' || phase === 'connecting' || phase === 'waiting'} /><Text style={styles.title}>{phase === 'password' ? '请输入房间密码' : phase === 'waiting' ? '等待房主批准' : phase === 'closed' ? '房间已关闭' : phase === 'error' ? '无法加入房间' : '正在加入房间'}</Text>{error ? <Text style={styles.error}>{error}</Text> : null}{phase === 'password' ? <><TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="房间密码" placeholderTextColor="#a8b3b6" /><Button label="进入房间" disabled={!connected} onPress={() => { passwordRef.current = password; attempted.current = true; void join(hostRef.current); }} /></> : null}{phase === 'error' ? <Button label="重试" disabled={!connected} onPress={() => void join(hostRef.current)} /> : null}<Button label="返回房间列表" onPress={leave} /></View> : <>
      <View testID="room-body" onLayout={event => setBodySize(event.nativeEvent.layout)} style={[roomLayout.body, { gap: stacked ? 0 : 12 }, wide && roomLayout.wide, fullScreen && { gap: 0 }]}>
        <View testID="room-media-frame" onLayout={event => setMediaSize(event.nativeEvent.layout)} style={[roomLayout.mediaFrame, wide && sideVisible && columns.media, stacked && roomLayout.stackedMedia, stacked && { height: playerHeight }]}>
        {mode === 'listen-together' ? <MusicPanel roomId={roomId} host={host} onExpandedLandscape={setMusicImmersive} /> : <ScrollView ref={mediaColumn} scrollEnabled={!fullScreen} style={roomLayout.mediaScroll} contentContainerStyle={[styles.mediaContent, mode === 'screen-share' && { flexGrow: 1 }, fullScreen && { flexGrow: 1, paddingBottom: 0, gap: 0 }]}>
          {mode === 'watch-together' ? <View style={[styles.playerBox, { borderRadius: 0 }, !fullScreen && !stacked && { borderRadius: 16 }, fullScreen && { flex: 1, borderRadius: 0, minHeight: 0 }]}>
            <View testID="video-container" onLayout={event => setVideoSize(event.nativeEvent.layout)} style={[styles.videoViewport, fullScreen ? { flex: 1 } : { height: playerHeight }]}>
              {source?.sourceUrl && !playbackError ? <VlcVideo video={video} style={styles.video} /> : <View style={styles.placeholder}>
                {!playbackError && !waitingMovie ? <Image source={require('../../../assets/images/zviewer-icon.png')} contentFit="contain" style={{ width: Math.min(130, playerHeight * .48), height: Math.min(130, playerHeight * .48), borderRadius: 18 }} /> : null}
                <Text style={[styles.muted, { color: '#edf1ef', textAlign: 'center' }]}>{playbackError ? `播放失败（${classifyPlayerError(playbackError)}）：${playbackError}` : waitingMovie ? '正在等待当前影片资料…' : host ? '请在下方添加并播放影片' : '等待房主选择影片'}</Text>
                {playbackError && source?.sourceUrl ? <Button label="重试播放" onPress={() => { relayAuth.current.reset(); adapterRef.current?.invalidate(); setPlaybackError(''); setRetryTick(value => value + 1); }} /> : null}
              </View>}
              <VideoGestures player={player} fullscreen={fullScreen} show={showControls} control={control} />
              <SubtitleOverlay subtitles={subtitles} player={player} />
              <DanmakuOverlay key={danmaku.mediaKey} player={player} state={danmaku} width={videoSize.width || leftWidth} height={videoSize.height || playerHeight} />
              {seekNotice ? <View pointerEvents="none" style={{ position: 'absolute', top: 8, left: 8, right: 8, borderRadius: 10, backgroundColor: '#1b2024ee', padding: 10 }}><Text accessibilityLiveRegion="polite" style={{ color: '#ffb4ab' }}>{seekNotice}</Text></View> : null}
            </View>
            <View pointerEvents={controlsVisible ? 'auto' : 'none'} accessibilityElementsHidden={!controlsVisible} style={[styles.playbackBar, styles.videoControls, !controlsVisible && { opacity: 0 }]}>
              <PlaybackControls nextEnabled={permissions.canSwitch && nextMovieId(movies.map(movie => movie.id), source?.movieId) !== null} nextBusy={nextBusy} next={() => void nextMovie()} sync={() => publishNativeState()} orientation={display.orientation} interact={setControlsInteracting} hide={() => setControlsVisible(false)} refresh={() => { relayAuth.current.reset(); adapterRef.current?.invalidate(); setPlaybackError(''); setRetryTick(value => value + 1); }} player={player} host={host} roomId={roomId} subtitles={subtitles} danmaku={danmaku} control={control} fullscreen={fullScreen} toggleFullscreen={() => void toggleFullscreen()} />
            </View>
          </View> : <><ScreenShare orientation={display.orientation} roomId={roomId} share={share} height={playerHeight} fullscreen={fullScreen} toggleFullscreen={() => void toggleFullscreen()} />{!fullScreen && !castingSidebar ? <RoomChatPanel error={error} comments={comments} draft={draft} setDraft={setDraft} send={() => void sendComment()} busy={busy} connected={connected} asDanmaku={sendAsDanmaku} setAsDanmaku={setSendAsDanmaku} /> : null}</>}

        </ScrollView>}
        </View>
        {castingSidebar ? <View testID="screen-share-chat-sidebar" style={columns.sidebar}><RoomChatPanel sidebar error={error} comments={comments} draft={draft} setDraft={setDraft} send={() => void sendComment()} busy={busy} connected={connected} asDanmaku={sendAsDanmaku} setAsDanmaku={setSendAsDanmaku} /></View> : null}
        {mode === 'watch-together' ? <Surface readable testID="room-sidebar" style={[styles.sidePanel, !sideVisible && { display: 'none' }, wide ? columns.sidebar : stacked ? roomLayout.stackedSidebar : { position: 'absolute', top: 0, right: 0, bottom: 0, width: '100%', zIndex: 20, backgroundColor: theme.color('#111417', 'backgroundColor'), padding: 12 }]}>
          <View accessibilityRole="tablist" style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: palette.line }}>
            {(['chat', 'movies'] as const).map((value, index) => <Pressable key={value} accessibilityRole="tab" accessibilityLabel={index === 0 ? '聊天' : '片单'} accessibilityState={{ selected: roomTab === value }} onAccessibilityTap={() => setRoomTab(value)} onPress={() => setRoomTab(value)} style={{ flex: 1, minHeight: 52, borderBottomWidth: 2, borderColor: roomTab === value ? palette.accent : 'transparent', flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }}><Feather name={index === 0 ? 'message-circle' : 'film'} size={21} color={roomTab === value ? palette.accent : palette.muted} /><Text style={{ color: roomTab === value ? palette.accent : palette.muted, fontSize: 17 }}>{index === 0 ? '聊天' : '片单'}</Text></Pressable>)}
          </View>
          <View accessibilityElementsHidden={roomTab !== 'chat'} style={{ flex: 1, minHeight: 0, display: roomTab === 'chat' ? 'flex' : 'none' }}><WatchRoomChat key={continuationScope} roomId={roomId} host={host} danmaku={danmaku} comments={comments} draft={draft} setDraft={setDraft} send={() => void sendComment()} busy={busy} connected={connected} error={error} asDanmaku={sendAsDanmaku} setAsDanmaku={setSendAsDanmaku} /></View>
          <View accessibilityElementsHidden={roomTab !== 'movies'} style={{ flex: 1, minHeight: 0, padding: 12, display: roomTab === 'movies' ? 'flex' : 'none' }}><MoviePanel ownerUserId={ownerUserId} savePlaybackSettings={savePlaybackSettings} key={continuationScope} currentMovieId={source?.movieId ?? source?.currentMovieId} roomId={roomId} movies={movies} host={host} canAdd={!!permissions.canAdd} canSwitch={permissions.canSwitch} play={playMovie} reload={loadMovies} autoContinue={autoContinue} setAutoContinue={changeAutoContinue} /></View>
          {watch.notice ? <Text style={styles.muted}>{watch.notice}</Text> : null}{watch.requests.map(item => <View key={`${item.action}:${item.viewerSocketId}`} style={styles.item}><Text style={styles.text}>{item.viewerUsername || '观众'} 申请 {item.action}{item.time !== undefined ? ` · ${Math.round(item.time)} 秒` : ''}</Text><View style={styles.controls}><Button label="同意" onPress={() => void watch.decide(item, true)} /><Button label="拒绝" onPress={() => void watch.decide(item, false)} /></View></View>)}{error ? <Text style={styles.error}>{error}</Text> : null}
        </Surface> : null}
      </View>
    </>}
    <AppDialog visible={settingsOpen} title="房间" presentation="room" maxWidth={580} close={() => setSettingsOpen(false)} footer={<RoomSettingsFooter roomId={roomId} viewerCount={viewers.length} leave={() => { setSettingsOpen(false); setLeaveOpen(true); }} />}>
      <RoomSettings key={continuationScope} roomId={roomId} roomName={roomName} host={host} mode={mode} close={closeRoom} viewers={viewers} openAppearance={() => { setSettingsOpen(false); theme.open(); }} autoApprove={autoApproveRequests} toggleAutoApprove={() => setAutoApproveSetting({ scope: continuationScope, enabled: !autoApproveRequests })}>
        {joinRequests.map(item => <View key={item.viewerSocketId} style={styles.item}><Text style={styles.text}>{item.username} 申请加入</Text><View style={styles.controls}><Button label="同意" onPress={() => void decideJoin(item.viewerSocketId, true)} /><Button label="拒绝" onPress={() => void decideJoin(item.viewerSocketId, false)} /></View></View>)}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </RoomSettings>
    </AppDialog>
    <AppDialog visible={leaveOpen} title="离开房间？" close={() => setLeaveOpen(false)}><Text style={styles.text}>{host ? '离开后将停止本机播放，房间按服务器的离线规则保留。' : '离开后将停止本机播放。'}</Text><View style={styles.controls}><Button label="取消" onPress={() => setLeaveOpen(false)} /><Button label="离开" onPress={leave} /></View></AppDialog>

  </SafeAreaView>;
}

const baseStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111417', padding: 0, gap: 0 }, fullscreenRoot: { padding: 0, gap: 0, backgroundColor: '#000' }, videoControls: { position: 'absolute', bottom: 0, left: 0, right: 0 }, header: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 64, paddingHorizontal: 8, borderBottomWidth: 1, borderColor: '#343d41', backgroundColor: '#1b2024' }, link: { color: '#65d59b', fontSize: 17 }, title: { color: '#edf1ef', fontSize: 19, fontWeight: '700' }, sectionTitle: { color: '#edf1ef', fontSize: 16, fontWeight: '700' }, text: { color: '#edf1ef', fontSize: 15 }, muted: { color: '#a8b3b6', fontSize: 13 }, error: { color: '#ffaaa5', padding: 8 }, join: { flex: 1, justifyContent: 'center', gap: 15 }, input: { backgroundColor: '#1b2024', borderColor: '#343d41', borderWidth: 1, color: '#edf1ef', borderRadius: 10, paddingHorizontal: 12, minHeight: 44 }, button: { backgroundColor: '#65d59b', borderRadius: 10, minHeight: 44, paddingHorizontal: 15, justifyContent: 'center', alignItems: 'center' }, buttonText: { color: '#111417', fontWeight: '700' }, disabled: { opacity: 0.45 }, mediaContent: { gap: 0, paddingBottom: 0 }, playerBox: { width: '100%', backgroundColor: '#000', borderRadius: 0, overflow: 'hidden' }, videoViewport: { width: '100%', alignItems: 'center', justifyContent: 'center' }, playbackBar: { width: '100%', borderRadius: 12, backgroundColor: 'rgba(5,8,12,.82)' }, placeholder: { alignItems: 'center', gap: 12, padding: 16 }, video: { width: '100%', height: '100%' }, controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, sidePanel: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minHeight: 0, gap: 0, backgroundColor: '#1b2024', borderRadius: 24, padding: 0 }, tabs: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#343d41', flexShrink: 0 }, activeTab: { color: '#65d59b', fontWeight: '700' }, list: { flex: 1 }, listContent: { gap: 8, paddingBottom: 18 }, item: { backgroundColor: '#1b2024', padding: 12, borderRadius: 10, gap: 4 }, composer: { flexDirection: 'row', gap: 8 },
});
