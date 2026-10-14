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
import Feather from '@expo/vector-icons/Feather';
import { RoomButton, RoomIconButton, ui as baseUi } from './RoomUi';
import { MediaAction, MediaSlider, panel, useMediaPalette } from './MediaPanelUi';
import { applyVoiceVolumes } from '@/lib/voiceVolumes';

const available = Platform.OS === 'ios' && !!NativeModules.WebRTCModule && !!NativeModules.LivekitReactNativeModule && !!nativeBridge?.voiceSessionActive;
let audioQueue: Promise<unknown> = Promise.resolve();
let rtcRegistered = false;
type Member = { identity: string; name: string; muted: boolean; adminMuted: boolean; speaking: boolean; level: number; self: boolean };
export function VoicePanel({ roomId, ready, host, compact = false }: { roomId: string; ready: boolean; host: boolean; compact?: boolean }) {
  const theme = useAppearance(); const ui = theme.styles(baseUi); const palette = useMediaPalette();
  const { session, socket, request, connected } = useSession();
  const [visible, setVisible] = useState(false); const [wanted, setWanted] = useState(false); const [joined, setJoined] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [members, setMembers] = useState<Member[]>([]); const [muted, setMuted] = useState(true); const [serverMuted, setServerMuted] = useState(false); const [error, setError] = useState(''); const [status, setStatus] = useState('未加入语音'); const [micBusy, setMicBusy] = useState(false);
  const [globalVolume, setGlobalVolume] = useState(1); const [micVolume, setMicVolume] = useState(1); const [deafened, setDeafened] = useState(false);
  const levels = useRef({ globalVolume, micVolume, deafened });
  useEffect(() => { levels.current = { globalVolume, micVolume, deafened }; if (room.current) applyVoiceVolumes(room.current, globalVolume, micVolume, deafened); }, [globalVolume, micVolume, deafened]);
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
        setMembers(values.map(participant => ({ identity: participant.identity, name: participant.name || participant.identity, muted: !participant.isMicrophoneEnabled, adminMuted: adminMuted(participant.metadata), speaking: participant.isSpeaking, level: participant.audioLevel, self: participant === call.localParticipant })));
        applyVoiceVolumes(call, levels.current.globalVolume, levels.current.micVolume, levels.current.deafened);
        const locked = adminMuted(call.localParticipant.metadata); setServerMuted(locked);
        // Administrator unlock never turns on a user's disabled microphone.
        if (locked) { selfMuted.current = true; setMuted(true); void call.localParticipant.setMicrophoneEnabled(false).catch(() => {}); }
      };
      for (const event of [RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.ParticipantMetadataChanged, RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished, RoomEvent.TrackSubscribed, RoomEvent.ActiveSpeakersChanged]) call.on(event, update);
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
  useEffect(() => {
    if (!joined || !visible) return;
    const timer = setInterval(() => { const call = room.current; if (!call) return; setMembers(values => values.map(member => { const participant = member.self ? call.localParticipant : call.remoteParticipants.get(member.identity); return { ...member, level: participant?.audioLevel || 0, speaking: participant?.isSpeaking || false }; })); }, 160);
    return () => clearInterval(timer);
  }, [joined, visible]);
  const toggleMic = async () => {
    const call = room.current; if (!call || micBusy || serverMuted) return;
    setMicBusy(true); setError('');
    try {
      const enabled = selfMuted.current;
      if (enabled && !await nativeBridge?.voicePermission()) throw new Error('请在 iOS 设置中允许麦克风访问，仍可只听');
      const published = await changeVoiceMicrophone(enabled, () => call === room.current && AppState.currentState === 'active' && !adminMuted(call.localParticipant.metadata), value => call.localParticipant.setMicrophoneEnabled(value));
      if (call !== room.current) return;
      selfMuted.current = !published; setMuted(!published); applyVoiceVolumes(call, levels.current.globalVolume, levels.current.micVolume, levels.current.deafened);
    }
    catch (failure) { setError(messageFor(failure)); } finally { setMicBusy(false); }
  };
  const manage = async (member: Member, kick = false) => {
    try { await request(`/api/voice/${kick ? 'kick' : 'mute'}`, { method: 'POST', body: JSON.stringify({ roomId, identity: member.identity, ...(!kick ? { muted: !member.adminMuted } : {}) }) }); } catch (failure) { setError(messageFor(failure)); }
  };
  const canManage = host || session?.user.role === 'root' || moderators.includes(session?.user.id ?? -1);
  return <>{compact ? <View style={{ borderRadius: 14, backgroundColor: joined ? palette.container : 'transparent', borderWidth: joined ? 1 : 0, borderColor: palette.accent }}><RoomIconButton label="房间语音" icon="headphones" onPress={() => setVisible(true)} /></View> : <RoomButton label={joined ? `语音 · ${members.length} 人 · ${muted ? '已静音' : '麦克风开启'}` : wanted ? '语音连接中…' : '房间语音'} secondary onPress={() => setVisible(true)} />}
    <AppDialog visible={visible} title="房间语音" maxWidth={460} close={() => setVisible(false)} footer={<View style={[panel.row, { paddingTop: 8 }]}>{wanted ? <><MediaAction label={muted ? '取消静音' : '静音'} icon={muted ? 'mic-off' : 'mic'} disabled={!joined || serverMuted || micBusy} onPress={() => void toggleMic()} /><MediaAction label={deafened ? '恢复收听' : '暂停收听'} icon="headphones" iconOnly selected={deafened} disabled={!joined} onPress={() => setDeafened(value => !value)} /><MediaAction label="断开" icon="phone-off" danger onPress={() => { setWanted(false); setStatus('未加入语音'); }} /></> : <MediaAction label="加入语音" icon="phone" selected disabled={!ready || !available} onPress={() => { setError(''); setWanted(true); }} />}</View>}>
      <View style={[panel.row, { paddingVertical: 6 }]}><View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: palette.container, alignItems: 'center', justifyContent: 'center' }}><Feather name="headphones" size={23} color={palette.text} /></View><View style={{ flex: 1, gap: 4 }}><Text style={{ color: palette.text, fontSize: 18, fontWeight: '600' }}>语音聊天</Text><Text style={ui.muted}>{joined ? `${members.length} 人在线 · ${muted ? '麦克风已静音' : '麦克风开启'}` : status}</Text></View></View>
      {wanted ? <><MediaSlider label="全局音量" value={globalVolume} displayValue={`${Math.round(globalVolume * 100)}%`} onChange={setGlobalVolume} disabled={!joined} /><MediaSlider label="麦克风音量" value={micVolume} displayValue={`${Math.round(micVolume * 100)}%`} onChange={setMicVolume} disabled={!joined} /></> : <Text style={ui.muted}>加入后即可与房间成员语音交流，麦克风默认静音。</Text>}
      {wanted && !joined ? <Text accessibilityLiveRegion="polite" style={ui.muted}>{status}</Text> : null}
      {serverMuted ? <Text style={ui.error}>你已被管理员语音禁言，仍可收听</Text> : null}
      {members.map(member => <View key={member.identity} style={{ backgroundColor: palette.field, borderRadius: 12, padding: 10, gap: 8 }}><View style={panel.row}><View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: palette.container, alignItems: 'center', justifyContent: 'center' }}><Feather name={member.muted || member.adminMuted ? 'mic-off' : member.self ? 'mic' : 'user'} size={16} color={member.adminMuted ? palette.error : palette.text} /></View><Text numberOfLines={1} style={[ui.text, { maxWidth: '35%' }]}>{member.self ? '我' : member.name}</Text><View accessibilityLabel={`${member.self ? '我' : member.name}的语音音量`} accessibilityValue={{ min: 0, max: 100, now: Math.round(member.level * 100) }} style={{ flex: 1, height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: palette.container }}><View style={{ width: `${Math.max(2, Math.min(100, member.level * 100))}%`, height: '100%', borderRadius: 3, backgroundColor: member.speaking ? palette.accent : palette.muted }} /></View>{member.adminMuted ? <Text style={{ color: palette.error, fontSize: 12 }}>已禁言</Text> : null}</View>{canManage && !member.self ? <View style={ui.row}><RoomButton label={member.adminMuted ? '解除禁言' : '语音禁言'} secondary onPress={() => void manage(member)} /><RoomButton label="移出语音" secondary onPress={() => void manage(member, true)} /></View> : null}</View>)}
      {!available ? <Text style={ui.muted}>当前预览包可检查语音界面；通话需要包含 LiveKit 的原生安装包。</Text> : null}
      {error ? <Text style={ui.error}>{error}</Text> : null}
    </AppDialog></>;
}
