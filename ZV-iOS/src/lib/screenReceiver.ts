import type { NativeMediaAdapter } from './mediaAdapter.ts';
import type { MediaStream, MediaStreamTrack, RTCPeerConnection, RTCIceCandidate, RTCSessionDescription } from '@livekit/react-native-webrtc';

type Rtc = Pick<typeof import('@livekit/react-native-webrtc'), 'RTCPeerConnection' | 'RTCIceCandidate' | 'RTCSessionDescription' | 'MediaStream'>;
type Ack = { success: boolean; message?: string };
type Signal = { from: string; data: ConstructorParameters<typeof RTCSessionDescription>[0] };
type Ice = { from: string; data: ConstructorParameters<typeof RTCIceCandidate>[0] };
type Socket = { emit: (event: string, payload: unknown, ack?: (value: Ack) => void) => unknown };
export type ScreenReceiverState = { stream: MediaStream | null; phase: string; status: string; error: string; hasVideo: boolean; hasAudio: boolean };
export const initialScreenReceiver: ScreenReceiverState = { stream: null, phase: 'waiting', status: '等待共享端', error: '', hasVideo: false, hasAudio: false };
const iceServers = [{ urls: 'stun:stun.miwifi.com:3478' }, { urls: 'stun:stun.cdnbye.com:3478' }, { urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];

/** One receive-only peer per room connection. No microphone or screen capture. */
export class ScreenReceiver {
  private peer: RTCPeerConnection | null = null;
  private stream: MediaStream | null = null;
  private owner = '';
  private pending: Ice[] = [];
  private processing = false;
  private disposed = false;
  private paused = false;
  private volume = 1;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private diagnostics: ReturnType<typeof setTimeout> | null = null;
  private diagnosticsStarted = false;
  private trackCleanup: (() => void)[] = [];
  private state: ScreenReceiverState = initialScreenReceiver;
  private rtc: Rtc;
  private socket: Socket;
  private roomId: string;
  private changed: (state: ScreenReceiverState) => void;
  constructor(rtc: Rtc, socket: Socket, roomId: string, changed: (state: ScreenReceiverState) => void) { this.rtc = rtc; this.socket = socket; this.roomId = roomId; this.changed = changed; }
  private accepts(peer: RTCPeerConnection) { return !this.disposed && this.peer === peer; }
  private publish(patch: Partial<ScreenReceiverState>) { if (!this.disposed) { this.state = { ...this.state, ...patch }; this.changed(this.state); } }
  private clearTimer() { if (this.timer) clearTimeout(this.timer); this.timer = null; }
  private retire() {
    this.clearTimer(); if (this.diagnostics) clearTimeout(this.diagnostics); this.diagnostics = null; this.diagnosticsStarted = false; this.trackCleanup.splice(0).forEach(cleanup => cleanup());
    const peer = this.peer; this.peer = null;
    if (peer) { peer.ontrack = null; peer.onicecandidate = null; peer.onconnectionstatechange = null; peer.close(); }
    const stream = this.stream; this.stream = null;
    stream?.getTracks().forEach(track => { try { track.stop(); } catch {} });
    try { stream?.release(); } catch {} this.owner = ''; this.pending = []; this.processing = false;
  }
  private mediaState() {
    const tracks = this.stream?.getTracks() || [];
    const hasVideo = tracks.some(track => track.kind === 'video' && track.readyState !== 'ended' && !track.muted);
    const hasAudio = tracks.some(track => track.kind === 'audio' && track.readyState !== 'ended' && !track.muted);
    const connected = this.peer?.connectionState === 'connected';
    if (connected && hasVideo) { this.clearTimer(); if (this.peer) this.startDiagnostics(this.peer); }
    this.publish({ stream: hasVideo || hasAudio ? this.stream : null, hasVideo, hasAudio, phase: connected && hasVideo ? 'connected' : connected ? 'waiting' : this.peer?.connectionState || 'waiting', status: connected && hasVideo ? '正在接收共享画面' : connected ? '已连接，等待共享画面' : '正在连接共享端…', ...(connected && hasVideo ? { error: '' } : {}) });
  }
  private startDiagnostics(peer: RTCPeerConnection) {
    if (typeof __DEV__ === 'undefined' || !__DEV__ || this.diagnosticsStarted) return;
    this.diagnosticsStarted = true; let samples = 0;
    const sample = async () => {
      if (!this.accepts(peer) || peer.connectionState !== 'connected') return;
      samples++;
      try {
        const reports = await peer.getStats(); if (!this.accepts(peer)) return;
        const values = { videoBytesReceived: 0, audioBytesReceived: 0, framesDecoded: 0, width: 0, height: 0 };
        reports.forEach((raw: unknown) => {
          const row = raw as Record<string, unknown>; if (row.type !== 'inbound-rtp') return;
          const kind = row.kind || row.mediaType; const number = (key: string) => typeof row[key] === 'number' && Number.isFinite(row[key]) ? Math.max(0, row[key] as number) : 0;
          if (kind === 'audio') values.audioBytesReceived += number('bytesReceived');
          if (kind === 'video') { values.videoBytesReceived += number('bytesReceived'); values.framesDecoded += number('framesDecoded'); values.width = Math.max(values.width, number('frameWidth')); values.height = Math.max(values.height, number('frameHeight')); }
        });
        console.info('[ZViewerScreenReceive]', JSON.stringify(values));
      } catch { /* Diagnostics must not alter playback or disclose native error data. */ }
      if (samples < 3 && this.accepts(peer)) this.diagnostics = setTimeout(() => { void sample(); }, 5000);
    };
    this.diagnostics = setTimeout(() => { void sample(); }, 5000);
  }
  private applyTrack(track: MediaStreamTrack) { track.enabled = !this.paused; if (track.kind === 'audio') track._setVolume(this.volume); }
  setPlayback(paused: boolean, volume: number) { this.paused = paused; this.volume = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : this.volume; this.stream?.getTracks().forEach(track => this.applyTrack(track)); }
  start() {
    if (this.disposed) return;
    this.retire(); this.stream = new this.rtc.MediaStream();
    const peer = new this.rtc.RTCPeerConnection({ iceServers }); this.peer = peer;
    this.publish({ ...initialScreenReceiver, phase: 'connecting', status: '等待共享端连接' });
    peer.ontrack = (event: unknown) => {
      if (!this.accepts(peer) || !this.stream) return;
      const incoming = event as { track?: MediaStreamTrack; streams?: MediaStream[] };
      // Screen video and system/microphone audio may have different stream ids,
      // or no stream id at all. Keep every track on our single rendering stream.
      const tracks = incoming.track ? [incoming.track] : (incoming.streams || []).flatMap(stream => stream.getTracks());
      for (const track of tracks) {
        this.applyTrack(track);
        if (this.stream.getTracks().some(existing => existing.id === track.id)) continue;
        this.stream.addTrack(track);
        const changed = () => { if (this.accepts(peer)) this.mediaState(); };
        const ended = () => { if (this.accepts(peer)) { this.stream?.removeTrack(track); try { track.release(); } catch {} this.mediaState(); } };
        track.addEventListener('ended', ended); track.addEventListener('mute', changed); track.addEventListener('unmute', changed);
        this.trackCleanup.push(() => { track.removeEventListener('ended', ended); track.removeEventListener('mute', changed); track.removeEventListener('unmute', changed); });
      }
      this.mediaState();
    };
    peer.onconnectionstatechange = () => {
      if (!this.accepts(peer)) return;
      if (peer.connectionState === 'failed' || peer.connectionState === 'closed') { this.fail('共享连接失败，请刷新重新连接'); return; }
      if (peer.connectionState === 'disconnected') { this.publish({ phase: 'disconnected', status: '共享连接中断，正在等待恢复' }); return; }
      this.mediaState();
    };
    peer.onicecandidate = (event: unknown) => {
      const candidate = (event as { candidate: RTCIceCandidate | null }).candidate;
      if (candidate && this.owner && this.accepts(peer)) this.socket.emit('signal-ice-candidate', { to: this.owner, data: candidate.toJSON() });
    };
    this.socket.emit('viewer-ready', { roomId: this.roomId }, response => {
      if (this.accepts(peer) && response?.success === false) this.publish({ phase: 'waiting', status: response.message || '等待共享端就绪', error: response.message || '暂时无法加入共享接收，请刷新重试' });
    });
  }
  // A restarted sender can announce before ICE notices the old peer has closed.
  sharerReady() { this.start(); }
  wait(message: string) { this.retire(); this.publish({ ...initialScreenReceiver, status: message }); }
  fail(message: string) { this.retire(); this.publish({ ...initialScreenReceiver, phase: 'failed', status: '共享连接不可用', error: message }); }
  async offer(payload: Signal) {
    const peer = this.peer;
    if (!peer || !payload?.from || payload.data?.type !== 'offer' || this.processing || (this.owner && this.owner !== payload.from) || peer.signalingState !== 'stable') return;
    this.processing = true; this.owner = payload.from;
    this.clearTimer(); this.timer = setTimeout(() => { if (this.accepts(peer) && this.state.phase !== 'connected') this.publish({ status: '共享媒体连接较慢', error: '尚未收到共享画面，可刷新重试；请共享端检查网络' }); }, 12_000);
    try {
      await peer.setRemoteDescription(new this.rtc.RTCSessionDescription(payload.data)); if (!this.accepts(peer)) return;
      for (const item of this.pending.splice(0)) {
        if (!this.accepts(peer)) return;
        if (item.from === this.owner) { try { await peer.addIceCandidate(new this.rtc.RTCIceCandidate(item.data)); } catch { /* Another valid candidate may still connect. */ } }
      }
      if (!this.accepts(peer)) return;
      const answer = await peer.createAnswer(); if (!this.accepts(peer)) return;
      await peer.setLocalDescription(answer); if (!this.accepts(peer)) return;
      this.socket.emit('signal-answer', { to: payload.from, data: answer }, response => { if (this.accepts(peer) && response?.success === false) this.fail(response.message || '共享应答被拒绝，请重新加入房间'); });
    } catch { if (this.accepts(peer)) this.fail('无法接收共享连接，请刷新重新连接'); }
    finally { if (this.accepts(peer)) this.processing = false; }
  }
  ice(payload: Ice) {
    const peer = this.peer;
    if (!peer || !payload?.from || !payload.data || (this.owner && this.owner !== payload.from)) return;
    if (!peer.remoteDescription) { this.pending = [...this.pending.slice(-63), payload]; return; }
    try { void peer.addIceCandidate(new this.rtc.RTCIceCandidate(payload.data)).catch(() => {}); } catch { /* Ignore malformed candidates; SDP/timeout owns connection failure. */ }
  }
  dispose() { this.disposed = true; this.retire(); }
}

export function screenFlvUrl(serverUrl: string, streamKey: string, customBase = '') {
  if (!streamKey.trim()) throw new Error('尚未收到推流密钥，等待共享端开始推流');
  const server = new URL(serverUrl); const base = new URL(customBase.trim() || serverUrl);
  if (!['http:', 'https:'].includes(base.protocol) || !base.hostname || base.username || base.password || base.search || base.hash) throw new Error('请输入有效的 HTTP-FLV 服务地址');
  if (!customBase.trim() && server.protocol === 'http:') { base.port = '3335'; base.pathname = '/'; }
  return `${base.toString().replace(/\/+$/, '')}/live/${encodeURIComponent(streamKey)}.flv`;
}

/** Live pulls always start at the new live edge, never at a prior VOD clock. */
export async function loadScreenPull(adapter: Pick<NativeMediaAdapter, 'apply'>, sourceUrl: string, serverUrl: string, accessToken: string, current: () => boolean, revision = 0) {
  await adapter.apply(null, serverUrl, accessToken);
  if (!current()) return false;
  await adapter.apply({ sourceUrl, sourceType: 'url', isPlaying: false, currentTime: 0 }, serverUrl, accessToken, revision);
  return current();
}
