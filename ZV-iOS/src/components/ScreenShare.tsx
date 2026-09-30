import { useEffect, useState } from 'react';
import { NativeModules, Platform, Text, View } from 'react-native';
import type { RTCPeerConnection, MediaStream, RTCIceCandidate, RTCSessionDescription } from 'react-native-webrtc';
import { useSession } from '@/state/session';
import { NativeMediaAdapter } from '@/lib/mediaAdapter';
import { emitAck } from '@/lib/socket';
import { VlcVideo, useVlcVideo } from './VlcVideo';
import { RoomButton, RoomInput, ui } from './RoomUi';
// Web/Expo Go can open rooms without loading a missing native module.
const rtc: typeof import('react-native-webrtc') | null = Platform.OS === 'ios' && NativeModules.WebRTCModule
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- capability detection precedes native import.
  ? require('react-native-webrtc') : null;
export type ShareState = { shareMethod?: 'webrtc' | 'stream-push'; streamKey?: string | null };
export function ScreenShare({ roomId, share, height }: { roomId: string; share: ShareState; height: number }) {
  const { session, socket } = useSession(); const video = useVlcVideo(); const [stream, setStream] = useState<MediaStream | null>(null); const [error, setError] = useState(''); const [status, setStatus] = useState('等待共享端'); const [retry, setRetry] = useState(0);
  const [flvBase, setFlvBase] = useState('');
  useEffect(() => {
    if (share.shareMethod === 'stream-push' || !socket || !rtc) return;
    let active = true, peer: RTCPeerConnection | null = null, owner = '', processing = false; let pending: { from: string; data: ConstructorParameters<typeof RTCIceCandidate>[0] }[] = [];
    const create = () => {
      peer?.close(); owner = ''; pending = []; processing = false;
      const current = new rtc.RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.qq.com:3478' }] }); peer = current;
      current.ontrack = (event: unknown) => { const track = event as { streams: MediaStream[] }; if (active && peer === current && track.streams[0]) { setStream(track.streams[0]); setStatus('正在接收共享画面'); } };
      current.onconnectionstatechange = () => { if (active && peer === current) { setStatus(current.connectionState); if (current.connectionState === 'failed') setError('共享连接失败，可重新连接'); } };
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
    const ice = (payload: { from: string; data: ConstructorParameters<typeof RTCIceCandidate>[0] }) => { if (!peer || (owner && owner !== payload.from)) return; if (!peer.remoteDescription) { pending = [...pending.slice(-63), payload]; return; } void peer.addIceCandidate(new rtc.RTCIceCandidate(payload.data)).catch(() => { if (active) setError('共享网络候选无效，可重新连接'); }); };
    const ready = (payload: { roomId: string }) => { if (payload.roomId === roomId) create(); };
    socket.on('signal-offer', offer); socket.on('signal-ice-candidate', ice); socket.on('sharer-ready', ready); create();
    return () => { active = false; socket.off('signal-offer', offer); socket.off('signal-ice-candidate', ice); socket.off('sharer-ready', ready); peer?.close(); peer = null; };
  }, [share.shareMethod, socket, roomId, retry]);
  useEffect(() => {
    const adapter = new NativeMediaAdapter(video.player);
    if (share.shareMethod === 'stream-push' && share.streamKey && session) {
      try {
        const server = new URL(session.serverUrl); const base = flvBase.trim() || (server.protocol === 'https:' ? session.serverUrl : `${server.protocol}//${server.hostname}:3335`);
        const path = `${base.replace(/\/+$/, '')}/live/${encodeURIComponent(share.streamKey)}.flv`;
        void adapter.apply({ sourceUrl: path, sourceType: 'url', isPlaying: true, currentTime: 0 }, session.serverUrl, session.accessToken).catch(() => setError('无法播放推流，请检查拉流地址与 OBS 状态'));
      } catch { void Promise.resolve().then(() => setError('拉流地址无效')); }
    }
    return () => adapter.dispose();
  }, [share.shareMethod, share.streamKey, session, video.player, flvBase, retry]);
  return <View style={ui.content}><View style={{ height, backgroundColor: '#05080c', overflow: 'hidden', borderRadius: 12 }}>{share.shareMethod === 'stream-push' ? <VlcVideo video={video} style={{ flex: 1 }} /> : stream && rtc ? <rtc.RTCView streamURL={stream.toURL()} objectFit="contain" style={{ flex: 1 }} /> : <Text style={ui.muted}>{rtc ? status : '共享观看需要原生安装包'}</Text>}</View>
    <Text style={ui.muted}>{share.shareMethod === 'stream-push' ? 'OBS 推流 · VLC' : `屏幕共享 · ${status}`}</Text><RoomButton label="重新连接" secondary onPress={() => { setError(''); setStream(null); setRetry(value => value + 1); void emitAck(socket!, 'viewer-ready', { roomId }).catch(() => {}); }} />{share.shareMethod === 'stream-push' ? <RoomInput value={flvBase} onChangeText={setFlvBase} placeholder="HTTP-FLV 服务地址（可选，含协议与端口）" autoCapitalize="none" keyboardType="url" /> : null}{error ? <Text style={ui.error}>{error}</Text> : null}
  </View>;
}
