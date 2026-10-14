import { useAppearance } from '@/state/appearance';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActivityIndicator, NativeModules, Platform, Pressable, Text, View } from 'react-native';
import type { RTCPeerConnection, MediaStream, RTCIceCandidate, RTCSessionDescription } from '@livekit/react-native-webrtc';
import { useSession } from '@/state/session';
import { NativeMediaAdapter } from '@/lib/mediaAdapter';
import { ScreenOrientationButton } from './ScreenOrientationButton';
import type { ScreenOrientationControl } from '@/hooks/usePlayerDisplay';
import { AppDialog } from './AppDialog';
import { VlcVideo, useVlcVideo } from './VlcVideo';
import { RoomButton, RoomInput, ui as baseUi } from './RoomUi';
// Web/Expo Go can open rooms without loading a missing native module.
const rtc: typeof import('@livekit/react-native-webrtc') | null = Platform.OS === 'ios' && NativeModules.WebRTCModule
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- capability detection precedes native import.
  ? require('@livekit/react-native-webrtc') : null;
export type ShareState = { shareMethod?: 'webrtc' | 'stream-push'; streamKey?: string | null };
export function ScreenShare({ roomId, share, height, fullscreen, toggleFullscreen, orientation }: { roomId: string; share: ShareState; height: number; fullscreen: boolean; toggleFullscreen: () => void; orientation: ScreenOrientationControl }) {
  const theme = useAppearance();
  const ui = theme.styles(baseUi);

  const insets = useSafeAreaInsets();
  const [paused, setPaused] = useState(false); const [edit, setEdit] = useState(false); const [draftBase, setDraftBase] = useState('');
  const [mediaStatus, setMediaStatus] = useState('waiting');
  const { session, socket, connected } = useSession(); const video = useVlcVideo(); const [stream, setStream] = useState<MediaStream | null>(null); const [error, setError] = useState(''); const [status, setStatus] = useState('等待共享端'); const [retry, setRetry] = useState(0);
  const [flvBase, setFlvBase] = useState('');
  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => {
    if (share.shareMethod === 'stream-push' || !socket || !rtc || !connected) return;
    let active = true, peer: RTCPeerConnection | null = null, owner = '', processing = false; let pending: { from: string; data: ConstructorParameters<typeof RTCIceCandidate>[0] }[] = [];
    const create = () => {
      peer?.close(); setError(''); setStream(null); setMediaStatus('connecting'); setStatus('等待共享端连接'); owner = ''; pending = []; processing = false;
      const current = new rtc.RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.qq.com:3478' }] }); peer = current;
      current.ontrack = (event: unknown) => { const track = event as { streams: MediaStream[] }; if (active && peer === current && track.streams[0]) { track.streams[0].getTracks().forEach(item => { item.enabled = !pausedRef.current; }); setStream(track.streams[0]); setStatus('正在接收共享画面'); setMediaStatus('connected'); } };
      current.onconnectionstatechange = () => { if (active && peer === current) { setMediaStatus(current.connectionState); setStatus(current.connectionState === 'connected' ? '正在接收共享画面' : current.connectionState === 'failed' ? '连接失败' : current.connectionState === 'disconnected' ? '连接中断' : '正在连接共享端…'); if (current.connectionState === 'failed') setError('共享连接失败，可重新连接'); } };
      current.onicecandidate = (event: unknown) => { const ice = event as { candidate: RTCIceCandidate | null }; if (active && ice.candidate && owner && peer === current) socket.emit('signal-ice-candidate', { to: owner, data: ice.candidate.toJSON() }); };
      socket.emit('viewer-ready', { roomId });
    };
    const offer = async (payload: { from: string; data: ConstructorParameters<typeof RTCSessionDescription>[0] }) => {
      if (!peer || processing || (owner && owner !== payload.from) || peer.signalingState !== 'stable') return;
      const current = peer; processing = true; owner = payload.from;
      try {
        await current.setRemoteDescription(new rtc.RTCSessionDescription(payload.data)); if (!active || peer !== current) return;
        for (const item of pending.splice(0)) if (item.from === owner) await current.addIceCandidate(new rtc.RTCIceCandidate(item.data));
        const answer = await current.createAnswer(); await current.setLocalDescription(answer);
        if (active && peer === current) socket.emit('signal-answer', { to: owner, data: answer });
      } catch { if (active && peer === current) setError('无法接收共享连接，请重新连接'); } finally { if (peer === current) processing = false; }
    };
    const ice = (payload: { from: string; data: ConstructorParameters<typeof RTCIceCandidate>[0] }) => { if (!peer || (owner && owner !== payload.from)) return; if (!peer.remoteDescription) { pending = [...pending.slice(-63), payload]; return; } const current = peer; void current.addIceCandidate(new rtc.RTCIceCandidate(payload.data)).catch(() => { if (active && peer === current) setError('共享网络候选无效，可重新连接'); }); };
    const ready = (payload: { roomId: string }) => { if (payload.roomId === roomId) create(); };
    socket.on('signal-offer', offer); socket.on('signal-ice-candidate', ice); socket.on('sharer-ready', ready); create();
    return () => { active = false; socket.off('signal-offer', offer); socket.off('signal-ice-candidate', ice); socket.off('sharer-ready', ready); peer?.close(); peer = null; };
  }, [share.shareMethod, socket, connected, roomId, retry]);
  useEffect(() => {
    let active = true;
    const adapter = new NativeMediaAdapter(video.player);
    if (share.shareMethod === 'stream-push' && share.streamKey && session) {
      try {
        const server = new URL(session.serverUrl); const base = flvBase.trim() || (server.protocol === 'https:' ? session.serverUrl : `${server.protocol}//${server.hostname}:3335`);
        const path = `${base.replace(/\/+$/, '')}/live/${encodeURIComponent(share.streamKey)}.flv`;
        void adapter.apply({ sourceUrl: path, sourceType: 'url', isPlaying: !pausedRef.current, currentTime: 0 }, session.serverUrl, session.accessToken).catch(() => { if (active) setError('无法播放推流，请检查拉流地址与 OBS 状态'); });
      } catch { void Promise.resolve().then(() => { if (active) setError('拉流地址无效'); }); }
    }
    return () => { active = false; adapter.dispose(); };
  }, [share.shareMethod, share.streamKey, session, video.player, flvBase, retry]);
  useEffect(() => {
    if (share.shareMethod !== 'stream-push') return;
    const sub = video.player.addListener('statusChange', event => { setMediaStatus(event.status === 'readyToPlay' ? 'connected' : event.status); if (event.status === 'loading') setStatus('正在接收画面…'); if (event.status === 'error') setError('无法播放推流，请检查拉流地址与 OBS 状态'); });
    const playing = video.player.addListener('playingChange', event => { if (event.isPlaying) setMediaStatus('connected'); });
    return () => { sub.remove(); playing.remove(); };
  }, [share.shareMethod, video.player]);
  useEffect(() => {
    if (share.shareMethod === 'stream-push') { if (paused) video.player.pause(); else video.player.play(); }
    else stream?.getTracks().forEach(track => { track.enabled = !paused; });
  }, [paused, stream, share.shareMethod, video.player]);
  const refresh = () => { setError(''); setPaused(false); setStream(null); setMediaStatus('connecting'); setStatus('正在重新连接…'); setRetry(value => value + 1); };
  const icon = (label: string, name: ComponentProps<typeof Feather>['name'], onPress: () => void, disabled = false) => <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, opacity: disabled ? .4 : 1 }}><Feather name={name} color="#f3f7fa" size={23} /></Pressable>;
  const badge = (label: string, active: boolean) => <View style={{ borderWidth: 1, borderColor: active ? '#9cdbff' : '#43566b', backgroundColor: active ? '#dce7f5' : 'transparent', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 }}><Text style={{ color: active ? '#1c293a' : '#bbc6d1', fontSize: 11 }}>{label}</Text></View>;
  const receiving = mediaStatus === 'connected' && (share.shareMethod === 'stream-push' || !!stream);
  return <View testID="screen-share-panel" style={fullscreen ? { flex: 1, minHeight: 0 } : { gap: 10 }}>
    <View testID="screen-share-viewport" style={[{ backgroundColor: '#000', overflow: 'hidden', borderRadius: fullscreen ? 0 : 16 }, fullscreen ? { flex: 1 } : { height: Math.max(240, height) }]}>
      {share.shareMethod === 'stream-push' ? <VlcVideo video={video} style={{ flex: 1 }} /> : stream && rtc ? <rtc.RTCView streamURL={stream.toURL()} objectFit="contain" style={{ flex: 1 }} /> : null}
      {!receiving || paused ? <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 90, alignItems: 'center', justifyContent: 'center', gap: 12 }}>{!paused && !error && (rtc || share.shareMethod === 'stream-push') ? <ActivityIndicator size="large" color="#1463b6" /> : <Feather name={paused ? 'pause-circle' : 'monitor'} color="#a8b3c2" size={32} />}<Text style={{ color: '#c1ccd7', fontSize: 14 }}>{paused ? '已暂停接收' : error || (rtc || share.shareMethod === 'stream-push' ? status : '共享观看需要原生安装包')}</Text></View> : null}
      <View testID="screen-share-controls" style={{ position: 'absolute', bottom: fullscreen ? Math.max(8, insets.bottom) : 8, left: fullscreen ? Math.max(8, insets.left) : 8, right: fullscreen ? Math.max(8, insets.right) : 8, padding: 8, gap: 8, borderRadius: 14, borderWidth: 1, borderColor: '#ffffff18', backgroundColor: 'rgba(15,23,32,.94)' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>{icon(paused ? '继续接收' : '暂停接收', paused ? 'play' : 'pause', () => setPaused(value => !value))}<View style={{ flex: 1 }} />{fullscreen ? <ScreenOrientationButton state={orientation} color="#f3f7fa" /> : null}{icon(fullscreen ? '退出全屏' : '全屏', fullscreen ? 'minimize' : 'maximize', toggleFullscreen)}{share.shareMethod === 'stream-push' ? icon('画中画', 'copy', () => { void video.player.startPictureInPicture().catch(() => setError('设备当前无法进入画中画')); }) : null}{icon('投屏设置', 'edit-2', () => { setDraftBase(flvBase); setEdit(true); })}{icon('刷新投屏', 'refresh-cw', refresh)}</View>
        {orientation.error ? <Text accessibilityLiveRegion="polite" style={{ color: '#ffb4ab', fontSize: 13 }}>{orientation.error}</Text> : null}
        {error && receiving ? <Text accessibilityLiveRegion="polite" style={{ color: '#ffb4ab', fontSize: 13 }}>{error}</Text> : null}
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>{badge(connected ? '已连接' : '连接断开', connected)}{badge('已加入', true)}{badge(paused ? '已暂停' : receiving ? '正在接收' : '等待连接', receiving)}</View>
      </View>
    </View>
    <AppDialog visible={edit} title="投屏设置" maxWidth={460} close={() => setEdit(false)}><Text style={ui.text}>{share.shareMethod === 'stream-push' ? 'OBS 推流' : '屏幕共享'}</Text>{share.shareMethod === 'stream-push' ? <><RoomInput value={draftBase} onChangeText={setDraftBase} placeholder="HTTP-FLV 服务地址（可选，含协议与端口）" autoCapitalize="none" keyboardType="url" /><RoomButton label="应用并刷新" onPress={() => { setFlvBase(draftBase); setEdit(false); refresh(); }} /></> : <Text style={ui.muted}>由共享端提供画面。连接异常时点击刷新重新接入。</Text>}{error ? <Text style={ui.error}>{error}</Text> : null}</AppDialog>
  </View>;
}
