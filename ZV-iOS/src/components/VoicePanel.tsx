import { useAppearance } from '@/state/appearance';
import { useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { AppDialog } from './AppDialog';
import { io, type Socket } from 'socket.io-client';
import { fromByteArray, toByteArray } from 'base64-js';
import { VoiceBinding } from '@/lib/voiceBinding';
import { nativeBridge } from '@/lib/nativeBridge';
import { emitAck } from '@/lib/socket';
import { opusHeader, usableVoiceFrame, voiceBytes } from '@/lib/voiceProtocol';
import { messageFor } from '@/lib/server';
import { useSession } from '@/state/session';
import { RoomButton, RoomIconButton, ui as baseUi } from './RoomUi';
const voiceInstance = `ios-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
type Member = { socketId: string; userId?: number; username: string; muted?: boolean };
type Packet = { from: string; data: unknown; encoded?: boolean; sampleRate?: number; timestamp: number; mediaTs?: number };
export function VoicePanel({ roomId, ready, host, compact = false }: { roomId: string; ready: boolean; host: boolean; compact?: boolean }) {
  const theme = useAppearance();
  const ui = theme.styles(baseUi);

  const { session, socket, connected } = useSession(); const [visible, setVisible] = useState(false); const [wanted, setWanted] = useState(false); const [joined, setJoined] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [members, setMembers] = useState<Member[]>([]); const [muted, setMuted] = useState(true); const [serverMuted, setServerMuted] = useState(false); const [error, setError] = useState('');
  useEffect(() => { const subscription = AppState.addEventListener('change', value => { setForeground(value === 'active'); if (value !== 'active') { setMuted(true); setJoined(false); } }); return () => subscription.remove(); }, []);
  const media = useRef<Socket | null>(null); const selfMuted = useRef(true); const locked = useRef(false); const memberIds = useRef(new Set<string>());
  useEffect(() => { selfMuted.current = muted; if (nativeBridge) void nativeBridge.voiceMute(muted || locked.current || AppState.currentState !== 'active').catch(() => {}); }, [muted]);
  useEffect(() => {
    if (!wanted || !foreground || !ready || !socket?.connected || !connected || !session || !nativeBridge) return;
    let current = true; let channel: Socket | null = null; let prepared = false; let binding = 0; const gate = new VoiceBinding();
    const update = (values: Member[]) => { memberIds.current = new Set(values.map(item => item.socketId)); setMembers(values); };
    const frame = nativeBridge.addListener('onVoiceFrame', data => {
      if (!current || !prepared || selfMuted.current || locked.current || !channel?.connected) return;
      // Drop during transport congestion rather than queueing delayed speech.
      const engine = channel.io.engine;
      if (!engine.transport.writable || engine.writeBuffer.length > 6) return;
      const bytes = toByteArray(data.data);
      channel.volatile.emit('voice-media-data', { data: bytes.buffer, sampleRate: 48000, timestamp: Date.now(), mediaTs: data.mediaTs, encoded: true });
    });
    const status = nativeBridge.addListener('onVoiceStatus', value => { if (current) { setMuted(true); setError(value.message); } });
    const added = (member: Member) => { memberIds.current.add(member.socketId); void nativeBridge?.voiceDrop(member.socketId); setMembers(old => [...old.filter(item => item.socketId !== member.socketId), member]); socket.emit('voice-codec-config', { roomId, description: opusHeader().buffer }); };
    const removed = (member: Member) => { memberIds.current.delete(member.socketId); setMembers(old => old.filter(item => item.socketId !== member.socketId)); void nativeBridge?.voiceDrop(member.socketId); };
    const muteChanged = (member: Member) => {
      if (member.socketId === socket.id || member.userId && member.userId === session.user.id) { locked.current = !!member.muted; setServerMuted(!!member.muted); if (member.muted) setMuted(true); void nativeBridge?.voiceMute(!!member.muted || selfMuted.current); }
      setMembers(old => old.map(item => item.socketId === member.socketId || member.userId && item.userId === member.userId ? { ...item, muted: member.muted } : item));
    };
    const kicked = () => { setWanted(false); setError('你已被移出语音频道'); };
    const codecChanged = (value: { from: string }) => { if (memberIds.current.has(value.from)) void nativeBridge?.voiceDrop(value.from); };
    socket.on('voice-user-joined', added).on('voice-user-left', removed).on('voice-muted-changed', muteChanged).on('voice-kicked', kicked).on('voice-codec-config', codecChanged);
    void (async () => {
      const reply = await emitAck<{ members: Member[]; selfMuted?: boolean; mediaToken: string }>(socket, 'voice-join', { roomId, username: session.user.username, instanceId: voiceInstance });
      if (!current) return;
      update(reply.members); locked.current = !!reply.selfMuted; setServerMuted(locked.current); setMuted(true);
      await nativeBridge!.voiceStart(); if (!current) return;
      channel = io(session.serverUrl, { forceNew: true, transports: ['websocket'], auth: { token: session.accessToken }, reconnection: true }); media.current = channel;
      let first = true;
      channel.on('connect', () => {
        if (!current || !channel || !socket.connected) return;
        const attempt = ++binding; const mainId = socket.id; const mediaId = channel.id; const ticket = gate.begin(mainId, mediaId);
        prepared = false; setJoined(false); setError('正在绑定语音媒体连接…');
        const token = first ? Promise.resolve(reply) : emitAck<{ members: Member[]; selfMuted?: boolean; mediaToken: string }>(socket, 'voice-join', { roomId, username: session.user.username, instanceId: voiceInstance }); first = false;
        void token.then(async next => {
          if (!current || attempt !== binding || !gate.accepts(ticket, socket.id, channel?.id)) return;
          update(next.members); locked.current = !!next.selfMuted; setServerMuted(locked.current);
          await emitAck(channel!, 'voice-media-init', { roomId, token: next.mediaToken });
          if (!current || attempt !== binding || !channel?.connected || !gate.accepts(ticket, socket.id, channel.id)) return;
          prepared = true; setJoined(true); setError(''); socket.emit('voice-codec-config', { roomId, description: opusHeader().buffer });
        }).catch(failure => { if (current && attempt === binding) { prepared = false; setJoined(false); setError(messageFor(failure)); } });
      });
      channel.on('connect_error', () => { if (current) setError('语音媒体连接失败，正在重试'); });
      channel.on('disconnect', () => { binding++; gate.invalidate(); prepared = false; setJoined(false); if (current) setError('语音媒体连接中断，正在重连'); });
      channel.on('voice-media-data', (packet: Packet) => {
        const bytes = voiceBytes(packet.data);
        if (!current || !prepared || !memberIds.current.has(packet.from) || !bytes || !usableVoiceFrame(packet, bytes)) return;
        void nativeBridge?.voicePlay(packet.from, !!packet.encoded, packet.sampleRate || 48000, packet.mediaTs ?? packet.timestamp * 1000, fromByteArray(bytes)).catch(() => {});
      });

    })().catch(failure => { if (current) { setError(messageFor(failure)); setWanted(false); } });
    return () => { current = false; binding++; gate.invalidate(); prepared = false; frame.remove(); status.remove(); socket.off('voice-user-joined', added).off('voice-user-left', removed).off('voice-muted-changed', muteChanged).off('voice-kicked', kicked).off('voice-codec-config', codecChanged); channel?.removeAllListeners(); channel?.disconnect(); media.current = null; memberIds.current.clear(); socket.emit('voice-leave', { roomId }); void nativeBridge?.voiceStop(); setJoined(false); setMembers([]); };
  }, [wanted, foreground, ready, socket, connected, session, roomId]);
  return <>{compact ? <RoomIconButton label="房间语音" icon="headphones" onPress={() => setVisible(true)} /> : <RoomButton label={joined ? `语音 · ${members.length + 1} 人 · ${muted ? '已静音' : '麦克风开启'}` : wanted ? '语音连接中…' : '房间语音'} secondary onPress={() => setVisible(true)} />}<AppDialog visible={visible} title="房间语音" maxWidth={420} close={() => setVisible(false)}><Text style={ui.text}>{joined ? '媒体已绑定 · 可通话' : wanted ? '正在连接 / 恢复媒体绑定' : '未加入语音'}</Text><Text style={ui.muted}>收起面板保持连接；离房自动释放。加入时麦克风静音，后台暂停采集。请佩戴耳机以减少回声。</Text>{wanted ? <View style={ui.row}><RoomButton label={muted ? '开启麦克风' : '关闭麦克风'} disabled={!joined || serverMuted} onPress={() => setMuted(value => !value)} /><RoomButton label="退出语音" secondary onPress={() => setWanted(false)} /></View> : <RoomButton label="加入语音" disabled={!ready} onPress={() => { if (!nativeBridge) { setError('请安装包含原生语音模块的 iOS 包'); return; } setError(''); setWanted(true); }} />}{serverMuted ? <Text style={ui.error}>你已被房间管理员语音禁言，仍可收听</Text> : null}{members.map(member => <View key={member.socketId} style={ui.card}><Text style={ui.text}>{member.username}{member.muted ? ' · 已禁言' : ''}</Text>{host ? <View style={ui.row}><RoomButton label={member.muted ? '解除语音禁言' : '语音禁言'} secondary onPress={() => void emitAck(socket!, 'voice-mute', { roomId, socketId: member.socketId, muted: !member.muted }).catch(failure => setError(messageFor(failure)))} /><RoomButton label="移出语音" secondary onPress={() => void emitAck(socket!, 'voice-kick', { roomId, socketId: member.socketId }).catch(failure => setError(messageFor(failure)))} /></View> : null}</View>)}{error ? <Text style={ui.error}>{error}</Text> : null}</AppDialog></>;
}
