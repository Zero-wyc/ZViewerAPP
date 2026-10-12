import { useAppearance } from '@/state/appearance';
import { useEffect, useRef, useState } from 'react';
import { AppState, NativeModules, Platform, Text, View } from 'react-native';
import type { Room, Participant } from 'livekit-client';
import { AppDialog } from './AppDialog';
import { nativeBridge } from '@/lib/nativeBridge';
import { adminMuted, voiceToken } from '@/lib/livekitProtocol';
import { changeVoiceMicrophone } from '@/lib/voiceMicrophone';
import { messageFor } from '@/lib/server';
import { useSession } from '@/state/session';
import { RoomButton, RoomIconButton, ui as baseUi } from './RoomUi';

const available = Platform.OS === 'ios' && !!NativeModules.WebRTCModule && !!NativeModules.LivekitReactNativeModule && !!nativeBridge?.voiceSessionActive;
let audioQueue: Promise<unknown> = Promise.resolve();
let rtcRegistered = false;
type Member = { identity: string; name: string; muted: boolean; adminMuted: boolean; speaking: boolean; self: boolean };
export function VoicePanel({ roomId, ready, host, compact = false }: { roomId: string; ready: boolean; host: boolean; compact?: boolean }) {
  const theme = useAppearance(); const ui = theme.styles(baseUi);
  const { session, socket, request, connected } = useSession();
  const [visible, setVisible] = useState(false); const [wanted, setWanted] = useState(false); const [joined, setJoined] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [members, setMembers] = useState<Member[]>([]); const [muted, setMuted] = useState(true); const [serverMuted, setServerMuted] = useState(false); const [error, setError] = useState(''); const [status, setStatus] = useState('未加入语音'); const [micBusy, setMicBusy] = useState(false);
  const [moderators, setModerators] = useState<number[]>([]); const room = useRef<Room | null>(null); const selfMuted = useRef(true); const scope = `${session?.serverUrl}:${session?.user.id}:${roomId}`;
  useEffect(() => { const sub = AppState.addEventListener('change', value => { setForeground(value === 'active'); if (value !== 'active') { selfMuted.current = true; setMuted(true); void room.current?.localParticipant.setMicrophoneEnabled(false).catch(() => {}); } }); return () => sub.remove(); }, []);
  useEffect(() => { if (!socket) return; const changed = (value: { roomId?: string; moderators?: number[] }) => { if ((!value.roomId || value.roomId === roomId) && Array.isArray(value.moderators)) setModerators(value.moderators); }; socket.on('moderators-changed', changed); return () => { socket.off('moderators-changed', changed); }; }, [socket, roomId]);
  useEffect(() => {
    if (!wanted || !foreground || !ready || !connected || !session || !available) return;
    let active = true; let tokenReady = false; let currentRoom: Room | null = null; let sdk: typeof import('@livekit/react-native') | null = null; const controller = new AbortController();
    selfMuted.current = true;
    const work = audioQueue.catch(() => {}).then(async () => {
      if (!active) return;
      setMuted(true); setJoined(false); setError(''); setStatus('正在获取语音凭证…');
      // Register RTC globals before loading the JS SDK; never load native RTC in Web / Expo Go.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      sdk = require('@livekit/react-native') as typeof import('@livekit/react-native'); if (!rtcRegistered) { sdk.registerGlobals(); rtcRegistered = true; }
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Room: LiveRoom, RoomEvent, DisconnectReason } = require('livekit-client') as typeof import('livekit-client');
      const credentials = voiceToken(await request('/api/voice/token', { method: 'POST', signal: controller.signal, body: JSON.stringify({ roomId, username: session.user.username }) }));
      if (!active) return; tokenReady = true;
      currentRoom = new LiveRoom({ adaptiveStream: false, dynacast: false }); const call = currentRoom; room.current = call;
      const update = () => {
        if (!active) return;
        const values: Participant[] = [call.localParticipant, ...call.remoteParticipants.values()];
        setMembers(values.map(participant => ({ identity: participant.identity, name: participant.name || participant.identity, muted: !participant.isMicrophoneEnabled, adminMuted: adminMuted(participant.metadata), speaking: participant.isSpeaking, self: participant === call.localParticipant })));
        const locked = adminMuted(call.localParticipant.metadata); setServerMuted(locked);
        // Administrator unlock never turns on a user's disabled microphone.
        if (locked) { selfMuted.current = true; setMuted(true); void call.localParticipant.setMicrophoneEnabled(false).catch(() => {}); }
      };
      for (const event of [RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.ParticipantMetadataChanged, RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished, RoomEvent.ActiveSpeakersChanged]) call.on(event, update);
      call.on(RoomEvent.Reconnecting, () => { if (active) { setJoined(false); setStatus('语音连接中断，正在重连…'); } });
      call.on(RoomEvent.Reconnected, () => { if (active) { setJoined(true); setStatus('已连接'); update(); } });
      call.on(RoomEvent.Disconnected, reason => { if (active) { setJoined(false); setWanted(false); setStatus('语音已断开'); setError(reason === DisconnectReason.PARTICIPANT_REMOVED ? '你已被移出语音频道' : reason === DisconnectReason.DUPLICATE_IDENTITY ? '此账号已在另一台设备加入语音' : '语音连接已结束，请重新加入'); } });
      await nativeBridge!.voiceSessionActive(true);
      await sdk.AudioSession.configureAudio({ ios: { defaultOutput: 'speaker' } }); await sdk.AudioSession.startAudioSession();
      if (!active) return;
      setStatus('正在连接语音服务…'); await call.connect(credentials.url, credentials.token, { autoSubscribe: true });
      if (!active) return;
      await call.localParticipant.setMicrophoneEnabled(false); setJoined(true); setStatus('已连接 · 只听模式'); update();
    }).catch(failure => { if (active) { setError(tokenReady ? '语音连接失败，请检查语音服务信令与媒体网络' : messageFor(failure)); setWanted(false); } });
    audioQueue = work;
    return () => {
      active = false; controller.abort(); selfMuted.current = true; if (room.current === currentRoom) room.current = null;
      void Promise.resolve().then(() => { setJoined(false); setMembers([]); setServerMuted(false); });
      audioQueue = work.catch(() => {}).then(async () => { currentRoom?.removeAllListeners(); try { await currentRoom?.disconnect(); } finally { await sdk?.AudioSession.stopAudioSession().catch(() => {}); await nativeBridge?.voiceSessionActive(false).catch(() => {}); } });
    };
  }, [wanted, foreground, ready, connected, scope, request, roomId, session]);
  const toggleMic = async () => {
    const call = room.current; if (!call || micBusy || serverMuted) return;
    setMicBusy(true); setError('');
    try {
      const enabled = selfMuted.current;
      if (enabled && !await nativeBridge?.voicePermission()) throw new Error('请在 iOS 设置中允许麦克风访问，仍可只听');
      const published = await changeVoiceMicrophone(enabled, () => call === room.current && AppState.currentState === 'active' && !adminMuted(call.localParticipant.metadata), value => call.localParticipant.setMicrophoneEnabled(value));
      if (call !== room.current) return;
      selfMuted.current = !published; setMuted(!published);
    }
    catch (failure) { setError(messageFor(failure)); } finally { setMicBusy(false); }
  };
  const manage = async (member: Member, kick = false) => {
    try { await request(`/api/voice/${kick ? 'kick' : 'mute'}`, { method: 'POST', body: JSON.stringify({ roomId, identity: member.identity, ...(!kick ? { muted: !member.adminMuted } : {}) }) }); } catch (failure) { setError(messageFor(failure)); }
  };
  const canManage = host || session?.user.role === 'root' || moderators.includes(session?.user.id ?? -1);
  return <>{compact ? <RoomIconButton label="房间语音" icon="headphones" onPress={() => setVisible(true)} /> : <RoomButton label={joined ? `语音 · ${members.length} 人 · ${muted ? '已静音' : '麦克风开启'}` : wanted ? '语音连接中…' : '房间语音'} secondary onPress={() => setVisible(true)} />}<AppDialog visible={visible} title="房间语音" maxWidth={460} close={() => setVisible(false)}>
    <Text style={ui.text}>{status}</Text><Text style={ui.muted}>加入时麦克风静音；收起面板保持连接。离房、切服务器或进入后台释放语音，返回后静音重入。</Text>
    {!available ? <Text style={ui.muted}>当前预览包可检查语音界面；通话需要包含 LiveKit 的新原生开发包。</Text> : null}
    {wanted ? <View style={ui.row}><RoomButton label={muted ? '开启麦克风' : '关闭麦克风'} disabled={!joined || serverMuted || micBusy} onPress={() => void toggleMic()} /><RoomButton label="退出语音" secondary onPress={() => { setWanted(false); setStatus('未加入语音'); }} /></View> : <RoomButton label="加入语音" disabled={!ready || !available} onPress={() => { setError(''); setWanted(true); }} />}
    {serverMuted ? <Text style={ui.error}>你已被管理员语音禁言，仍可收听</Text> : null}
    {members.map(member => <View key={member.identity} style={ui.card}><Text style={ui.text}>{member.name}{member.self ? ' · 我' : ''}{member.speaking ? ' · 正在发言' : member.adminMuted ? ' · 已禁言' : member.muted ? ' · 麦克风关闭' : ''}</Text>{canManage && !member.self ? <View style={ui.row}><RoomButton label={member.adminMuted ? '解除禁言' : '语音禁言'} secondary onPress={() => void manage(member)} /><RoomButton label="移出语音" secondary onPress={() => void manage(member, true)} /></View> : null}</View>)}
    {error ? <Text style={ui.error}>{error}</Text> : null}
  </AppDialog></>;
}
