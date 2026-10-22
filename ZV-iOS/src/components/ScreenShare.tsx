import { useAppearance } from '@/state/appearance';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import Feather from '@expo/vector-icons/Feather';
import Slider from '@react-native-community/slider';
import { isDevice } from 'expo-device';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActivityIndicator, NativeModules, Platform, Pressable, Text, View } from 'react-native';
import { useSession } from '@/state/session';
import { NativeMediaAdapter } from '@/lib/mediaAdapter';
import { initialScreenReceiver, ScreenReceiver, screenFlvUrl, loadScreenPull } from '@/lib/screenReceiver';
import { ScreenOrientationButton } from './ScreenOrientationButton';
import type { ScreenOrientationControl } from '@/hooks/usePlayerDisplay';
import { AppDialog } from './AppDialog';
import { VlcVideo, useVlcVideo } from './VlcVideo';
import { RoomButton, RoomInput, ui as baseUi } from './RoomUi';
// Web/Expo Go can open rooms without loading a missing native module.
const rtc: typeof import('@livekit/react-native-webrtc') | null = Platform.OS === 'ios' && NativeModules.WebRTCModule
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- capability detection precedes native import.
  ? require('@livekit/react-native-webrtc') : null;
function ReceiveControl({ accessibilityLabel, icon, onPress, disabled = false }: { accessibilityLabel: string; icon: ComponentProps<typeof Feather>['name']; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} onAccessibilityTap={() => { if (!disabled) onPress(); }} style={{ flex: 1, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', opacity: disabled ? .4 : 1 }}><Feather name={icon} color="#f3f7fa" size={21} /></Pressable>;
}
export type ShareState = { shareMethod?: 'webrtc' | 'stream-push'; streamKey?: string | null };
export function ScreenShare({ roomId, share, height, fullscreen, toggleFullscreen, orientation }: { roomId: string; share: ShareState; height: number; fullscreen: boolean; toggleFullscreen: () => void; orientation: ScreenOrientationControl }) {
  const theme = useAppearance(); const ui = theme.styles(baseUi); const insets = useSafeAreaInsets();
  const { session, socket, connected } = useSession(); const video = useVlcVideo(true);
  const serverUrl = session?.serverUrl; const accessToken = session?.accessToken; const userId = session?.user.id;
  const [paused, setPaused] = useState(false); const [volume, setVolume] = useState(100); const [muted, setMuted] = useState(false);
  const [edit, setEdit] = useState(false); const [draftBase, setDraftBase] = useState(''); const [flvBase, setFlvBase] = useState('');
  const [receiver, setReceiver] = useState(initialScreenReceiver); const receiverRef = useRef<ScreenReceiver | null>(null);
  const [flv, setFlv] = useState({ phase: 'waiting', status: '等待 OBS 推流', error: '' }); const [flvLive, setFlvLive] = useState<boolean | null>(null);
  const [actionError, setActionError] = useState(''); const [retry, setRetry] = useState(0); const [controlsVisible, setControlsVisible] = useState(true);
  const adapterRef = useRef<NativeMediaAdapter | null>(null); const pausedRef = useRef(false); const gainRef = useRef(100);
  const touch = useRef<{ x: number; y: number; time: number } | null>(null);
  const previousTap = useRef<{ x: number; y: number; time: number } | null>(null); const singleTap = useRef<ReturnType<typeof setTimeout> | null>(null);
  const push = share.shareMethod === 'stream-push'; const state = push ? flv : receiver;
  const stream = connected && !push && receiver.hasVideo ? receiver.stream : null;
  const receiving = connected && state.phase === 'connected' && (push ? flvLive !== false : receiver.hasVideo);
  const error = actionError || (push && flvLive === false ? '' : state.error);
  const showControls = !fullscreen || controlsVisible || paused || !!error || edit || !receiving;
  const togglePause = () => { const next = !pausedRef.current; pausedRef.current = next; setPaused(next); receiverRef.current?.setPlayback(next, gainRef.current / 100); if (push) { if (next) video.player.pause(); else video.player.play(); } setControlsVisible(true); };
  useEffect(() => {
    if (push || !socket || !rtc || !connected || !serverUrl) return;
    const current = new ScreenReceiver(rtc, socket, roomId, setReceiver); receiverRef.current = current;
    current.setPlayback(pausedRef.current, gainRef.current / 100);
    const offer = (payload: Parameters<ScreenReceiver['offer']>[0]) => current.offer(payload);
    const ice = (payload: Parameters<ScreenReceiver['ice']>[0]) => current.ice(payload);
    const ready = (payload: { roomId: string }) => { if (payload.roomId === roomId) current.sharerReady(); };
    const failed = (payload: { roomId: string; message?: string }) => { if (payload.roomId === roomId) current.fail(payload.message || '共享端启动失败，等待共享端重试'); };
    const offline = (payload: { roomId: string }) => { if (payload.roomId === roomId) current.wait('共享端已断开，等待重新连接'); };
    socket.on('signal-offer', offer); socket.on('signal-ice-candidate', ice); socket.on('sharer-ready', ready); socket.on('sharer-error', failed); socket.on('host-disconnected', offline); current.start();
    return () => { socket.off('signal-offer', offer); socket.off('signal-ice-candidate', ice); socket.off('sharer-ready', ready); socket.off('sharer-error', failed); socket.off('host-disconnected', offline); current.dispose(); if (receiverRef.current === current) receiverRef.current = null; };
  }, [push, socket, connected, roomId, retry, serverUrl, userId]);
  useEffect(() => {
    const adapter = new NativeMediaAdapter(video.player); adapterRef.current = adapter;
    return () => { if (adapterRef.current === adapter) adapterRef.current = null; adapter.dispose(); void video.player.replaceAsync(null).catch(() => {}); };
  }, [video.player]);
  useEffect(() => {
    if (!push) return;
    const status = video.player.addListener('statusChange', event => { if (event.status === 'loading') setFlv({ phase: 'connecting', status: '正在接收推流…', error: '' }); if (event.status === 'error') setFlv({ phase: 'failed', status: '推流不可用', error: '无法播放推流，请检查拉流地址与 OBS 状态' }); });
    const playing = video.player.addListener('playingChange', event => { if (event.isPlaying) setFlv({ phase: 'connected', status: '正在接收共享画面', error: '' }); else if (!pausedRef.current) setFlv(old => ({ ...old, phase: 'waiting', status: '推流已中断，等待恢复或刷新' })); });
    const live = (payload: { roomId: string; status: string }) => { if (payload.roomId === roomId) setFlvLive(payload.status === 'live'); };
    socket?.on('stream-status', live);
    return () => { status.remove(); playing.remove(); socket?.off('stream-status', live); };
  }, [push, video.player, socket, roomId]);
  useEffect(() => {
    let active = true; void Promise.resolve().then(() => { if (active) setFlvLive(null); });
    return () => { active = false; };
  }, [connected, roomId, share.streamKey, serverUrl, userId, push, socket?.id]);
  useEffect(() => {
    let active = true; const adapter = adapterRef.current; if (!adapter) return;
    if (!push || !serverUrl || !accessToken || !connected || flvLive === false) { void adapter.apply(null, '', '').catch(() => {}); return; }
    void Promise.resolve().then(async () => {
      if (!active) return;
      setFlv({ phase: 'connecting', status: '正在接收推流…', error: '' });
      try {
        const path = screenFlvUrl(serverUrl, share.streamKey || '', flvBase);
        // Load paused, then apply the latest local intent after asynchronous native replacement.
        const current = await loadScreenPull(adapter, path, serverUrl, accessToken, () => active, retry);
        if (current) { if (pausedRef.current) video.player.pause(); else video.player.play(); }
      } catch (failure) { if (active) setFlv({ phase: 'failed', status: '推流不可用', error: failure instanceof Error ? failure.message : '无法播放推流，请检查拉流地址与 OBS 状态' }); }
    });
    return () => { active = false; adapter.cancelPending(); };
  }, [roomId, push, share.streamKey, serverUrl, accessToken, video.player, flvBase, flvLive, connected, retry]);
  useEffect(() => {
    pausedRef.current = paused; gainRef.current = muted ? 0 : volume;
    receiverRef.current?.setPlayback(paused, gainRef.current / 100); video.player.configure({ volume: gainRef.current });
    if (push) { if (paused) video.player.pause(); else video.player.play(); }
  }, [paused, volume, muted, push, video.player]);
  useEffect(() => { if (!fullscreen || !controlsVisible || !receiving || paused || edit || error) return; const timer = setTimeout(() => setControlsVisible(false), 3500); return () => clearTimeout(timer); }, [fullscreen, controlsVisible, receiving, paused, edit, error]);
  useEffect(() => () => { if (singleTap.current) clearTimeout(singleTap.current); previousTap.current = null; }, [fullscreen, push, roomId]);
  const refresh = () => { setActionError(''); pausedRef.current = false; setPaused(false); setControlsVisible(true); setFlvLive(null); setRetry(value => value + 1); };

  const displayStatus = !connected ? '连接已断开，正在等待重新加入房间' : push && flvLive === false ? '共享端尚未推流，等待 OBS 开始' : state.status;
  return <View testID="screen-share-panel" style={fullscreen ? { flex: 1, minHeight: 0 } : { gap: 10 }}>
    <View testID="screen-share-viewport" style={[{ backgroundColor: '#000', overflow: 'hidden', borderRadius: fullscreen ? 0 : 16 }, fullscreen ? { flex: 1 } : { height: Math.max(240, height) }]}>
      {push ? <VlcVideo video={video} style={{ flex: 1 }} /> : stream && rtc ? <rtc.RTCView streamURL={stream.toURL()} objectFit="contain" style={{ flex: 1 }} /> : null}
      {!receiving || paused ? <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 20, right: 20, bottom: fullscreen ? 0 : 80, alignItems: 'center', justifyContent: 'center', gap: 12 }}><View style={{ alignItems: 'center', gap: 12, maxWidth: '100%', paddingHorizontal: 20, paddingVertical: 16, borderRadius: 14, backgroundColor: paused || !!error ? 'rgba(15,23,32,.88)' : 'transparent' }}>{!paused && !error && connected && (rtc || push) ? <ActivityIndicator color="#9cdbff" /> : <Feather name={paused ? 'pause-circle' : 'monitor'} color="#a8b3c2" size={30} />}<Text accessibilityLiveRegion="polite" style={{ color: '#eef3fa', fontSize: 14, lineHeight: 21, textAlign: 'center' }}>{paused ? '已暂停本机接收' : error || (rtc || push ? displayStatus : '共享观看需要原生安装包')}</Text></View></View> : null}
      <View testID="screen-share-gestures" accessible accessibilityRole="button" accessibilityLabel="共享画面：单击显示控件，双击暂停或继续接收" accessibilityActions={[{ name: 'activate', label: '显示控件' }, { name: 'toggle', label: '暂停或继续接收' }]} onAccessibilityTap={() => setControlsVisible(true)} onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'toggle') togglePause(); else setControlsVisible(true); }} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} onStartShouldSetResponder={event => { if (event.nativeEvent.touches.length === 1) return true; previousTap.current = null; if (singleTap.current) clearTimeout(singleTap.current); return false; }} onResponderGrant={event => { if (singleTap.current) clearTimeout(singleTap.current); touch.current = { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY, time: Date.now() }; }} onResponderMove={event => { const start = touch.current; if (event.nativeEvent.touches.length !== 1 || start && Math.hypot(event.nativeEvent.locationX - start.x, event.nativeEvent.locationY - start.y) > 12) { touch.current = null; previousTap.current = null; if (singleTap.current) clearTimeout(singleTap.current); } }} onResponderTerminate={() => { touch.current = null; previousTap.current = null; if (singleTap.current) clearTimeout(singleTap.current); }} onResponderRelease={event => {
        const start = touch.current; touch.current = null; const now = Date.now();
        if (!start || now - start.time > 250 || Math.hypot(event.nativeEvent.locationX - start.x, event.nativeEvent.locationY - start.y) > 12) { previousTap.current = null; if (singleTap.current) clearTimeout(singleTap.current); return; }
        const prior = previousTap.current;
        if (prior && now - prior.time <= 320 && Math.hypot(start.x - prior.x, start.y - prior.y) <= 40) { if (singleTap.current) clearTimeout(singleTap.current); previousTap.current = null; togglePause(); }
        else { previousTap.current = { ...start, time: now }; if (singleTap.current) clearTimeout(singleTap.current); singleTap.current = setTimeout(() => { previousTap.current = null; if (fullscreen) setControlsVisible(value => !value); else setControlsVisible(true); }, 320); }
      }} />
      {showControls ? <View testID="screen-share-controls" style={{ position: 'absolute', bottom: fullscreen ? Math.max(8, insets.bottom) : 8, left: fullscreen ? Math.max(8, insets.left) : 8, right: fullscreen ? Math.max(8, insets.right) : 8, padding: 6, gap: 6, borderRadius: 14, borderWidth: .5, borderColor: '#ffffff18', backgroundColor: 'rgba(15,23,32,.96)' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <ReceiveControl accessibilityLabel={paused ? '继续接收' : '暂停接收'} icon={paused ? 'play' : 'pause'} onPress={togglePause} />
          <ReceiveControl accessibilityLabel={muted ? '取消静音' : '静音'} icon={muted ? 'volume-x' : 'volume-2'} onPress={() => setMuted(value => !value)} />
          {fullscreen && orientation.available ? <View style={{ flex: 1, alignItems: 'center' }}><ScreenOrientationButton state={orientation} color="#f3f7fa" /></View> : null}
          <ReceiveControl accessibilityLabel={fullscreen ? '退出全屏' : '全屏'} icon={fullscreen ? 'minimize' : 'maximize'} onPress={() => { setControlsVisible(true); toggleFullscreen(); }} />
          <ReceiveControl accessibilityLabel="投屏设置" icon="sliders" onPress={() => { setDraftBase(flvBase); setEdit(true); }} />
          <ReceiveControl accessibilityLabel="刷新投屏" icon="refresh-cw" onPress={refresh} disabled={!connected} />
        </View>
        {orientation.error || error && receiving ? <Text accessibilityLiveRegion="polite" style={{ color: '#ffb4ab', fontSize: 12, paddingHorizontal: 8 }}>{orientation.error || error}</Text> : null}
        {!fullscreen ? <Text accessibilityLiveRegion="polite" style={{ color: '#b8c5cd', fontSize: 11, lineHeight: 17, paddingHorizontal: 10, paddingBottom: 3 }}>{paused ? '已暂停本机接收' : displayStatus}{muted ? ' · 已静音' : ''}</Text> : null}
      </View> : null}
    </View>
    <AppDialog visible={edit} title="投屏设置" maxWidth={460} close={() => setEdit(false)}><Text style={ui.text}>接收音量</Text><Slider accessibilityLabel="投屏接收音量" minimumValue={0} maximumValue={100} value={volume} onValueChange={value => { setVolume(value); if (value > 0) setMuted(false); }} minimumTrackTintColor={theme.color('#1463b6')} maximumTrackTintColor={theme.color('#43566b')} /><Text style={ui.muted}>{Math.round(muted ? 0 : volume)}%</Text>{push ? <><Text style={ui.title}>HTTP-FLV 地址</Text><RoomInput value={draftBase} onChangeText={setDraftBase} placeholder="服务地址（可选，含协议与端口）" autoCapitalize="none" keyboardType="url" /><RoomButton label="应用并刷新" onPress={() => { try { screenFlvUrl(session?.serverUrl || '', share.streamKey || '', draftBase); setFlvBase(draftBase); setEdit(false); refresh(); } catch (failure) { setActionError(failure instanceof Error ? failure.message : '拉流地址无效'); } }} />{isDevice ? <RoomButton label="画中画" secondary disabled={!receiving} onPress={() => { void video.player.startPictureInPicture().then(() => setEdit(false)).catch(() => setActionError('设备当前无法进入画中画')); }} /> : null}</> : <Text style={ui.muted}>由共享端提供画面。暂停与音量只影响本机，连接异常时刷新重新接入。</Text>}{error ? <Text style={ui.error}>{error}</Text> : null}</AppDialog>
  </View>;
}
