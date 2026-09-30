import { useEffect, useRef, useState } from 'react';
import { AppState, Modal, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { io, type Socket } from 'socket.io-client';
import { fromByteArray, toByteArray } from 'base64-js';
import { nativeBridge } from '@/lib/nativeBridge';
import { emitAck } from '@/lib/socket';
import { opusHeader, usableVoiceFrame, voiceBytes } from '@/lib/voiceProtocol';
import { messageFor } from '@/lib/server';
import { useSession } from '@/state/session';
import { RoomButton, RoomIconButton, ui } from './RoomUi';
type Member = { socketId: string; userId?: number; username: string; muted?: boolean };
type Packet = { from: string; data: unknown; encoded?: boolean; sampleRate?: number; timestamp: number; mediaTs?: number };
export function VoicePanel({ roomId, ready, host, compact = false }: { roomId: string; ready: boolean; host: boolean; compact?: boolean }) {
  const { session, socket, connected } = useSession(); const [visible, setVisible] = useState(false); const [wanted, setWanted] = useState(false); const [joined, setJoined] = useState(false);
  const [members, setMembers] = useState<Member[]>([]); const [muted, setMuted] = useState(true); const [serverMuted, setServerMuted] = useState(false); const [error, setError] = useState('');
  const media = useRef<Socket | null>(null); const selfMuted = useRef(true); const locked = useRef(false); const memberIds = useRef(new Set<string>());
  useEffect(() => { selfMuted.current = muted; if (nativeBridge) void nativeBridge.voiceMute(muted || locked.current || AppState.currentState !== 'active').catch(() => {}); }, [muted]);
  useEffect(() => {
    if (!wanted || !ready || !socket?.connected || !connected || !session || !nativeBridge) return;
    let current = true; let channel: Socket | null = null; let prepared = false;
    const update = (values: Member[]) => { memberIds.current = new Set(values.map(item => item.socketId)); setMembers(values); };
    const frame = nativeBridge.addListener('onVoiceFrame', data => {
      if (!current || !prepared || selfMuted.current || locked.current || !channel?.connected) return;
      // Drop during transport congestion rather than queueing delayed speech.
      const engine = channel.io.engine;
      if (!engine.transport.writable || engine.writeBuffer.length > 6) return;
      const bytes = toByteArray(data.data);
      channel.emit('voice-media-data', { data: bytes.buffer, sampleRate: 48000, timestamp: Date.now(), mediaTs: data.mediaTs, encoded: true });
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
      const reply = await emitAck<{ members: Member[]; selfMuted?: boolean; mediaToken: string }>(socket, 'voice-join', { roomId, username: session.user.username });
      if (!current) { socket.emit('voice-leave', { roomId }); return; }
      update(reply.members); locked.current = !!reply.selfMuted; setServerMuted(locked.current); setMuted(true);
      channel = io(session.serverUrl, { forceNew: true, transports: ['websocket'], auth: { token: session.accessToken }, reconnection: true }); media.current = channel;
      channel.on('connect', () => { if (!current || !channel) return; prepared = false; void emitAck(channel, 'voice-media-init', { roomId, token: reply.mediaToken }).then(() => { if (current) { prepared = true; setError(''); socket.emit('voice-codec-config', { roomId, description: opusHeader().buffer }); } }).catch(failure => { if (current) setError(messageFor(failure)); }); });
      channel.on('connect_error', () => { if (current) setError('语音媒体连接失败，正在重试'); });
      channel.on('disconnect', () => { prepared = false; if (current) setError('语音媒体连接中断，正在重连'); });
      channel.on('voice-media-data', (packet: Packet) => {
        const bytes = voiceBytes(packet.data);
        if (!current || !prepared || !memberIds.current.has(packet.from) || !bytes || !usableVoiceFrame(packet, bytes)) return;
        void nativeBridge?.voicePlay(packet.from, !!packet.encoded, packet.sampleRate || 48000, packet.mediaTs ?? packet.timestamp * 1000, fromByteArray(bytes)).catch(() => {});
      });
      await nativeBridge!.voiceStart(); if (!current) return; setJoined(true);
    })().catch(failure => { if (current) { setError(messageFor(failure)); setWanted(false); } });
    return () => { current = false; prepared = false; frame.remove(); status.remove(); socket.off('voice-user-joined', added).off('voice-user-left', removed).off('voice-muted-changed', muteChanged).off('voice-kicked', kicked).off('voice-codec-config', codecChanged); channel?.removeAllListeners(); channel?.disconnect(); media.current = null; memberIds.current.clear(); socket.emit('voice-leave', { roomId }); void nativeBridge?.voiceStop(); setJoined(false); setMembers([]); };
  }, [wanted, ready, socket, connected, session, roomId]);
  return <>{compact ? <RoomIconButton label="房间语音" icon="headphones" onPress={() => setVisible(true)} /> : <RoomButton label={joined ? `语音 · ${members.length + 1} 人 · ${muted ? '已静音' : '麦克风开启'}` : wanted ? '语音连接中…' : '房间语音'} secondary onPress={() => setVisible(true)} />}<Modal visible={visible} supportedOrientations={['portrait', 'landscape']} animationType="slide" onRequestClose={() => setVisible(false)}><SafeAreaView style={{ flex: 1, padding: 16, backgroundColor: '#111417' }}><ScrollView contentContainerStyle={ui.content}><View style={ui.row}><Text style={[ui.title, { flex: 1 }]}>房间语音</Text><RoomButton label="收起" secondary onPress={() => setVisible(false)} /></View><Text style={ui.muted}>收起面板保持连接；离房自动释放。加入时麦克风静音，后台暂停采集。请佩戴耳机以减少回声。</Text>{wanted ? <View style={ui.row}><RoomButton label={muted ? '开启麦克风' : '关闭麦克风'} disabled={!joined || serverMuted} onPress={() => setMuted(value => !value)} /><RoomButton label="退出语音" secondary onPress={() => setWanted(false)} /></View> : <RoomButton label="加入语音" disabled={!ready} onPress={() => { if (!nativeBridge) { setError('请安装包含原生语音模块的 iOS 包'); return; } setError(''); setWanted(true); }} />}{serverMuted ? <Text style={ui.error}>你已被房间管理员语音禁言，仍可收听</Text> : null}{members.map(member => <View key={member.socketId} style={ui.card}><Text style={ui.text}>{member.username}{member.muted ? ' · 已禁言' : ''}</Text>{host ? <View style={ui.row}><RoomButton label={member.muted ? '解除语音禁言' : '语音禁言'} secondary onPress={() => void emitAck(socket!, 'voice-mute', { roomId, socketId: member.socketId, muted: !member.muted }).catch(failure => setError(messageFor(failure)))} /><RoomButton label="移出语音" secondary onPress={() => void emitAck(socket!, 'voice-kick', { roomId, socketId: member.socketId }).catch(failure => setError(messageFor(failure)))} /></View> : null}</View>)}{error ? <Text style={ui.error}>{error}</Text> : null}</ScrollView></SafeAreaView></Modal></>;
}
