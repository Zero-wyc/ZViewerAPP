/* eslint-disable react-hooks/immutability -- the VLC control port intentionally mutates native playback state. */
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VlcVideo, useVlcVideo } from '@/components/VlcVideo';

import { emitAck } from '@/lib/socket';
import { nativeVideoSource } from '@/lib/media';
import { NativeMediaAdapter, type Playback } from '@/lib/mediaAdapter';
import { classifyPlayerError, probeMedia, safeMediaError, type MediaProbe } from '@/lib/mediaDiagnostics';
import { messageFor } from '@/lib/server';
import { useSession } from '@/state/session';

type Phase = 'connecting' | 'password' | 'joining' | 'waiting' | 'ready' | 'error' | 'closed';
type RoomMode = 'watch-together' | 'listen-together' | 'screen-share';
type Movie = { id: number; title: string; url: string; source?: string; sourceType?: string; format?: string; audioUrl?: string | null; roomId?: string };
type Comment = { id: number; username: string; content: string; createdAt: string };
type JoinData = { roomId?: string; mode?: RoomMode; name?: string; isHost?: boolean; playback?: Playback };

function Button({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, disabled && styles.disabled]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}

export default function RoomScreen() {
  const { roomId, name, asHost, hasPassword } = useLocalSearchParams<{ roomId: string; name?: string; asHost?: string; hasPassword?: string }>();
  const { session, socket, connected, request } = useSession();
  const [phase, setPhase] = useState<Phase>(hasPassword === '1' && asHost !== '1' ? 'password' : 'connecting');
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [roomName, setRoomName] = useState(name || roomId);
  const [mode, setMode] = useState<RoomMode>('watch-together');
  const [host, setHost] = useState(asHost === '1');
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
  const [joinRequests, setJoinRequests] = useState<{ viewerSocketId: string; username: string }[]>([]);
  const attempted = useRef(hasPassword !== '1' || asHost === '1');
  const hostRef = useRef(asHost === '1');
  const passwordRef = useRef('');
  const adapterRef = useRef<NativeMediaAdapter | null>(null);
  const playbackRef = useRef<Playback | null>(null);
  const generation = useRef(0);
  const video = useVlcVideo();
  const { player } = video;
  const readyRef = useRef(false);
  useEffect(() => { readyRef.current = phase === 'ready' && mode === 'watch-together'; playbackRef.current = source; }, [phase, mode, source]);
  const publishNativeState = useCallback((action?: 'play' | 'pause' | 'seek' | 'rate', value?: number) => {
    if (!hostRef.current || !readyRef.current || !socket?.connected || !playbackRef.current || adapterRef.current?.busy) return;
    const state: Playback = { ...playbackRef.current, currentTime: player.currentTime, isPlaying: player.playing, playbackRate: player.playbackRate, duration: player.duration };
    playbackRef.current = state;
    setSource(state);
    if (action) socket.emit('watch-together-control', { roomId, action, value });
    socket.emit('watch-together-state', { roomId, state });
  }, [player, socket, roomId]);
  useEffect(() => {
    const adapter = new NativeMediaAdapter(player); adapterRef.current = adapter;
    return () => { readyRef.current = false; adapter.dispose(); if (adapterRef.current === adapter) adapterRef.current = null; };
  }, [player]);
  const { width, height } = useWindowDimensions();
  const wide = !fullScreen && width >= 900 && width > height;
  const leftWidth = wide ? Math.min(760, (width - 56) * 0.6) : Math.max(0, width - 32);
  const playerHeight = fullScreen ? Math.max(180, height - 230) : Math.min(leftWidth * 9 / 16, wide ? Math.max(180, height - 238) : 460);

  const loadMovies = useCallback(async () => {
    try {
      const data = await request<{ movies: Movie[] }>(`/api/rooms/${encodeURIComponent(roomId)}/movies`);
      setMovies(Array.isArray(data.movies) ? data.movies : []);
    } catch (failure) { setError(messageFor(failure)); }
  }, [request, roomId]);

  const loadComments = useCallback(() => {
    if (!socket?.connected) return;
    socket.timeout(10000).emit('comment-history', { roomId }, (timeout: Error | null, result?: { success: boolean; comments?: Comment[] }) => {
      if (!timeout && result?.success && Array.isArray(result.comments)) setComments(result.comments);
    });
  }, [socket, roomId]);

  const applyRoom = useCallback((data: JoinData = {}) => {
    if (data.name) setRoomName(data.name);
    if (data.mode) setMode(data.mode);
    if (data.playback?.sourceUrl) { playbackRef.current = data.playback; setSource(data.playback); setMediaProbe(null); }
    setError(''); setPhase('ready');
    void loadMovies();
    loadComments();
    socket?.emit('request-current-movie', { roomId });
    if (!hostRef.current) {
      socket?.timeout(10000).emit('watch-together-request-state', { roomId }, (timeout: Error | null, result?: { success: boolean; data?: { state?: Playback } }) => {
        if (!timeout && result?.success && result.data?.state) setSource(result.data.state);
      });
    }
  }, [loadMovies, loadComments, socket, roomId]);

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
    const onDisconnect = () => { generation.current++; setPhase('connecting'); };
    const onApproved = (data: JoinData) => { if (data.roomId === roomId) applyRoom(data); };
    const onRejected = (data: JoinData) => { if (data.roomId === roomId) { generation.current++; setPhase('error'); setError('房主拒绝了加入申请'); } };
    const onClosed = (data: JoinData) => { if (data.roomId === roomId) { generation.current++; attempted.current = false; readyRef.current = false; player.pause(); setSource(null); setPhase('closed'); setError('房间已关闭'); } };
    const onKicked = (data: { reason?: string }) => { generation.current++; attempted.current = false; readyRef.current = false; player.pause(); setSource(null); setPhase('closed'); setError(data.reason || '您已被移出房间'); };
    const onMode = (data: JoinData) => { if ((!data.roomId || data.roomId === roomId) && data.mode) setMode(data.mode); };
    const onComment = (item: Comment) => setComments(previous => previous.some(value => value.id === item.id) ? previous : [...previous, item]);
    const onMovies = (payload: { movies?: Movie[] }) => { if (Array.isArray(payload.movies)) setMovies(payload.movies.filter(movie => !movie.roomId || movie.roomId === roomId)); };
    const onJoinRequest = (payload: { roomId: string; viewerSocketId: string; username: string }) => {
      if (hostRef.current && payload.roomId === roomId) setJoinRequests(current => [...current.filter(item => item.viewerSocketId !== payload.viewerSocketId), payload]);
    };
    const onPlayback = (payload: { state?: Playback; diff?: Partial<Playback> }) => {
      if (hostRef.current) return;
      if (payload.state) setSource(previous => ({ ...previous, ...payload.state, ...payload.diff } as Playback));
    };
    const onControl = (payload: { action?: 'play' | 'pause' | 'seek' | 'rate'; value?: number }) => {
      if (hostRef.current) return;
      if (payload.action === 'play') player.play();
      if (payload.action === 'pause') player.pause();
      if (payload.action === 'seek' && Number.isFinite(payload.value)) player.currentTime = Math.max(0, payload.value!);
      if (payload.action === 'rate' && Number.isFinite(payload.value)) player.playbackRate = payload.value!;
    };
    const onHeartbeat = (payload: { source?: string; currentTime?: number; isPlaying?: boolean; suppressed?: boolean; state?: Playback }) => {
      if (hostRef.current) return;
      if (payload.state) setSource(payload.state);
      if (payload.suppressed) return;
      const target = payload.state?.currentTime ?? payload.currentTime;
      if (Number.isFinite(target) && Math.abs(player.currentTime - target!) > 3) player.currentTime = target!;
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
    socket.on('new-comment', onComment);
    socket.on('movie-list', onMovies);
    socket.on('join-request', onJoinRequest);
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
      socket.off('new-comment', onComment); socket.off('movie-list', onMovies);
      socket.off('join-request', onJoinRequest);
      socket.off('watch-together-state', onPlayback); socket.off('watch-together-control', onControl);
      socket.off('sync-heartbeat', onHeartbeat);
    };
  }, [socket, roomId, join, applyRoom, player]);

  useEffect(() => {
    if (!host || phase !== 'ready' || !socket || mode !== 'watch-together') return;
    const interval = setInterval(() => {
      if (!socket.connected || !playbackRef.current) return;
      socket.emit('host-heartbeat', {
        roomId,
        currentTime: player.currentTime,
        isPlaying: player.playing,
        playbackRate: player.playbackRate,
        suppressed: Boolean(adapterRef.current?.busy),
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [host, phase, socket, mode, roomId, player]);

  useEffect(() => {
    const playing = player.addListener('playingChange', ({ isPlaying }) => publishNativeState(isPlaying ? 'play' : 'pause'));
    const rate = player.addListener('playbackRateChange', ({ playbackRate }) => publishNativeState('rate', playbackRate));
    let previous: { position: number; time: number; playing: boolean; rate: number } | null = null;
    const progress = player.addListener('timeUpdate', ({ currentTime }) => {
      const time = Date.now();
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
  }, [player, publishNativeState]);

  useEffect(() => {
    if (!session || !adapterRef.current) return;
    let current = true;
    const state = phase === 'ready' && mode === 'watch-together' ? source : null;
    void adapterRef.current.apply(state, session.serverUrl, session.accessToken, retryTick)
      .then(() => { if (current) setPlaybackError(''); })
      .catch(failure => { if (current) setPlaybackError(safeMediaError(messageFor(failure))); });
    return () => { current = false; };
  }, [source, mode, session, player, retryTick, phase]);
  useEffect(() => {
    const subscription = player.addListener('statusChange', ({ status, error: videoError }) => {
      setMediaStatus(status);
      if (status === 'error') { adapterRef.current?.invalidate(); setPlaybackError(safeMediaError(videoError?.message || '视频播放失败')); }
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
    try { await emitAck(socket, 'send-comment', { roomId, content: draft.trim(), isDanmaku: false }); setDraft(''); }
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

  const control = (action: 'play' | 'pause' | 'seek', value?: number) => {
    if (!host || !socket || !source) return;
    if (action === 'play') player.play();
    if (action === 'pause') player.pause();
    if (action === 'seek' && Number.isFinite(value)) player.currentTime = Math.max(0, value!);
    const next = { ...source, isPlaying: action === 'play' ? true : action === 'pause' ? false : source.isPlaying, currentTime: player.currentTime };
    playbackRef.current = next;
    setSource(next);
    socket.emit('watch-together-control', { roomId, action, value });
    socket.emit('watch-together-state', { roomId, state: next });
  };

  const playMovie = async (movie: Movie) => {
    if (!host || !socket || !session) return;
    try { nativeVideoSource({ sourceUrl: movie.url, sourceType: movie.source || movie.sourceType, format: movie.format, audioUrl: movie.audioUrl }, session.serverUrl, session.accessToken); }
    catch (failure) { setPlaybackError(safeMediaError(messageFor(failure))); return; }
    setPlaybackError('');
    try { await emitAck(socket, 'play-movie', { roomId, movieId: movie.id }); }
    catch (failure) { setPlaybackError(safeMediaError(messageFor(failure))); return; }
    const state: Playback = { sourceUrl: movie.url, sourceType: movie.source || movie.sourceType || 'mp4', format: movie.format, audioUrl: movie.audioUrl, isPlaying: true, currentTime: 0, playbackRate: 1 };
    playbackRef.current = state;
    setSource(state);
    socket.emit('watch-together-state', { roomId, state });
  };

  if (!session) return <SafeAreaView style={styles.root}><Text style={styles.text}>请先登录</Text><Button label="返回" onPress={() => router.replace('/')} /></SafeAreaView>;
  return <SafeAreaView style={styles.root}>
    <View style={styles.header}><Pressable onPress={leave}><Text style={styles.link}>‹ 返回</Text></Pressable><View style={{ flex: 1 }}><Text style={styles.title} numberOfLines={1}>{roomName}</Text><Text style={styles.muted}>{host ? '房主' : '观众'} · {connected ? '已连接' : '重连中'}</Text></View><Pressable onPress={() => setTab('room')}><Text style={styles.link}>房间设置</Text></Pressable></View>
    {phase !== 'ready' ? <View style={styles.join}><ActivityIndicator color="#65d59b" animating={phase === 'joining' || phase === 'connecting' || phase === 'waiting'} /><Text style={styles.title}>{phase === 'password' ? '请输入房间密码' : phase === 'waiting' ? '等待房主批准' : phase === 'closed' ? '房间已关闭' : phase === 'error' ? '无法加入房间' : '正在加入房间'}</Text>{error ? <Text style={styles.error}>{error}</Text> : null}{phase === 'password' ? <><TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="房间密码" placeholderTextColor="#a8b3b6" /><Button label="进入房间" disabled={!connected} onPress={() => { passwordRef.current = password; attempted.current = true; void join(hostRef.current); }} /></> : null}{phase === 'error' ? <Button label="重试" disabled={!connected} onPress={() => void join(hostRef.current)} /> : null}<Button label="返回房间列表" onPress={leave} /></View> : <>
      <View style={[styles.roomBody, wide && styles.roomBodyWide]}>
        <ScrollView style={[styles.mediaColumn, fullScreen && { flex: 1, maxHeight: '100%' }, wide && { width: leftWidth, flex: 0, maxHeight: '100%' }]} contentContainerStyle={styles.mediaContent}>
          {mode === 'watch-together' ? <View style={[styles.playerBox, { height: playerHeight }]}>{source?.sourceUrl && !source.audioUrl && !playbackError ? <VlcVideo video={video} style={styles.video} /> : <View style={styles.placeholder}><Text style={styles.muted}>{source?.audioUrl ? '此影片需要分离音视频适配器' : playbackError ? `播放失败（${classifyPlayerError(playbackError)}）：${playbackError}` : '等待房主选择影片'}</Text>{playbackError && source?.sourceUrl ? <Button label="重试播放" onPress={() => { adapterRef.current?.invalidate(); setPlaybackError(''); setRetryTick(value => value + 1); }} /> : null}</View>}</View> : <View style={[styles.playerBox, { height: playerHeight }]}><Text style={styles.muted}>{mode === 'listen-together' ? '一起听播放器尚未接入' : '屏幕共享观看尚未接入'}</Text></View>}
          {mode === 'watch-together' && source?.sourceUrl ? <View style={styles.controlPanel}>
            <Text style={styles.sectionTitle}>播放控制</Text>
            {host ? <View style={styles.controls}><Button label="−15 秒" onPress={() => control('seek', player.currentTime - 15)} /><Button label={source.isPlaying ? '暂停' : '播放'} onPress={() => control(source.isPlaying ? 'pause' : 'play')} /><Button label="+15 秒" onPress={() => control('seek', player.currentTime + 15)} /></View> : <Text style={styles.muted}>由房主控制播放与跳转</Text>}
            <Text style={styles.muted}>播放器：{mediaStatus}{trackSummary ? ` · ${trackSummary}` : ''}</Text>
            <View style={styles.controls}><Button label={fullScreen ? "退出全屏" : "全屏"} onPress={() => { setFullScreen(value => !value); }} disabled={Boolean(playbackError || source.audioUrl)} /><Button label={diagnosing ? '检测中…' : '播放诊断'} onPress={() => void runProbe()} disabled={diagnosing} /></View>
            {mediaProbe ? <Text style={mediaProbe.category === 'ready' ? styles.muted : styles.error}>网络探测：{mediaProbe.detail} · 来源 {mediaProbe.source}{mediaProbe.status ? ` · HEAD ${mediaProbe.status}` : ''}{mediaProbe.contentType ? ` · ${mediaProbe.contentType}` : ''}{mediaProbe.checks?.map(check => ` · ${check.name} ${check.status}${check.valid ? '✓' : '✗'}`).join('')}{mediaProbe.signature ? ` · 文件头 ${mediaProbe.signature}` : ''}{mediaProbe.redirected ? ' · 已跳转' : ''}</Text> : null}
          </View> : null}
        </ScrollView>
        <View style={[styles.sidePanel, fullScreen && { display: 'none' }]}>
          <View style={styles.tabs}><Pressable onPress={() => setTab('chat')}><Text style={tab === 'chat' ? styles.activeTab : styles.muted}>聊天</Text></Pressable><Pressable onPress={() => setTab('movies')}><Text style={tab === 'movies' ? styles.activeTab : styles.muted}>片单</Text></Pressable><Pressable onPress={() => setTab('room')}><Text style={tab === 'room' ? styles.activeTab : styles.muted}>房间</Text></Pressable></View>
          {tab === 'chat' ? <><ScrollView style={styles.list} contentContainerStyle={styles.listContent}>{comments.map(comment => <View key={comment.id} style={styles.item}><Text style={styles.muted}>{comment.username}</Text><Text style={styles.text}>{comment.content}</Text></View>)}</ScrollView><View style={styles.composer}><TextInput style={[styles.input, { flex: 1 }]} value={draft} onChangeText={setDraft} placeholder="发送消息" placeholderTextColor="#a8b3b6" /><Button label="发送" disabled={busy || !connected} onPress={() => void sendComment()} /></View></> : null}
          {tab === 'movies' ? <><ScrollView style={styles.list} contentContainerStyle={styles.listContent}>{movies.length === 0 ? <Text style={styles.muted}>暂无影片</Text> : movies.map(movie => <Pressable key={movie.id} style={styles.item} onPress={() => void playMovie(movie)}><Text style={styles.text}>{movie.title}</Text><Text style={styles.muted}>{host ? '点击播放可直连的影片' : '由房主控制播放'}</Text></Pressable>)}</ScrollView><Button label="刷新片单" onPress={() => void loadMovies()} /></> : null}
          {tab === 'room' ? <ScrollView style={styles.list} contentContainerStyle={styles.listContent}><Text style={styles.text}>房间：{roomName}</Text><Text style={styles.muted}>模式：{mode} · {host ? '房主' : '观众'}</Text>{joinRequests.map(item => <View key={item.viewerSocketId} style={styles.item}><Text style={styles.text}>{item.username} 申请加入</Text><View style={styles.controls}><Button label="同意" onPress={() => void decideJoin(item.viewerSocketId, true)} /><Button label="拒绝" onPress={() => void decideJoin(item.viewerSocketId, false)} /></View></View>)}{host ? <Button label="关闭房间" onPress={closeRoom} /> : null}</ScrollView> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </View>
    </>}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111417', padding: 16, gap: 12 }, header: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 44 }, link: { color: '#65d59b', fontSize: 17 }, title: { color: '#edf1ef', fontSize: 19, fontWeight: '700' }, sectionTitle: { color: '#edf1ef', fontSize: 16, fontWeight: '700' }, text: { color: '#edf1ef', fontSize: 15 }, muted: { color: '#a8b3b6', fontSize: 13 }, error: { color: '#ffaaa5', padding: 8 }, join: { flex: 1, justifyContent: 'center', gap: 15 }, input: { backgroundColor: '#1b2024', borderColor: '#343d41', borderWidth: 1, color: '#edf1ef', borderRadius: 10, paddingHorizontal: 12, minHeight: 44 }, button: { backgroundColor: '#65d59b', borderRadius: 10, minHeight: 44, paddingHorizontal: 15, justifyContent: 'center', alignItems: 'center' }, buttonText: { color: '#111417', fontWeight: '700' }, disabled: { opacity: 0.45 }, roomBody: { flex: 1, gap: 12 }, roomBodyWide: { flexDirection: 'row' }, mediaColumn: { flexGrow: 0, maxHeight: '56%' }, mediaContent: { gap: 10, paddingBottom: 8 }, playerBox: { width: '100%', backgroundColor: '#05080c', alignItems: 'center', justifyContent: 'center', borderRadius: 12, overflow: 'hidden' }, placeholder: { alignItems: 'center', gap: 12, padding: 16 }, video: { width: '100%', height: '100%' }, controlPanel: { gap: 8 }, controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, sidePanel: { flex: 1, minHeight: 170, gap: 8 }, tabs: { flexDirection: 'row', gap: 28, paddingVertical: 8 }, activeTab: { color: '#65d59b', fontWeight: '700' }, list: { flex: 1 }, listContent: { gap: 8, paddingBottom: 18 }, item: { backgroundColor: '#1b2024', padding: 12, borderRadius: 10, gap: 4 }, composer: { flexDirection: 'row', gap: 8 },
});
