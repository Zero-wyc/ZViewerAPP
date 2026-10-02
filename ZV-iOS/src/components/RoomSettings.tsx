import { useAppearance } from '@/state/appearance';
import { BiliAccount } from './BiliAccount';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, Switch, Text, View } from 'react-native';
import { useSession } from '@/state/session';
import { emitAck } from '@/lib/socket';
import { messageFor } from '@/lib/server';
import { RoomButton, RoomInput, ui as baseUi } from './RoomUi';
export type Viewer = { socketId: string; username?: string; userId?: number; role?: string };
export function RoomSettings({ roomId, roomName, host, close, viewers }: { roomId: string; roomName: string; host: boolean; close: () => void; viewers: Viewer[] }) {
  const theme = useAppearance();
  const ui = theme.styles(baseUi);

  const { socket, request } = useSession(); const [name, setName] = useState(roomName); const [password, setPassword] = useState('');
  const [initialMax, setInitialMax] = useState<number | null>(null);
  const [max, setMax] = useState(''); const [approval, setApproval] = useState(false); const [approvalChanged, setApprovalChanged] = useState(false); const [passwordChanged, setPasswordChanged] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void request<{ rooms: { roomId: string; maxViewers: number; requireApproval: boolean }[] }>('/api/rooms').then(data => { const room = data.rooms.find(value => value.roomId === roomId); if (active && room) { setInitialMax(room.maxViewers); setApproval(room.requireApproval); } }).catch(() => {});
    return () => { active = false; };
  }, [request, roomId]);
  useEffect(() => {
    if (!socket) return;
    const settings = (payload: { maxViewers: number; requireApproval: boolean }) => { setMax(String(payload.maxViewers)); setApproval(payload.requireApproval); };
    socket.on('room-settings-updated', settings);
    return () => { socket.off('room-settings-updated', settings); };
  }, [socket, roomId]);
  const action = async (event: string, values: object) => { if (!socket) return; setBusy(true); setError(''); try { await emitAck(socket, event, { roomId, ...values }); } catch (failure) { setError(messageFor(failure)); } finally { setBusy(false); } };
  return <ScrollView contentContainerStyle={ui.content}><Text style={ui.title}>房间设置</Text><Text selectable style={ui.muted}>房间编号：{roomId}</Text><Text style={ui.text}>{roomName} · {host ? '房主' : '观众'}</Text>{initialMax !== null ? <Text style={ui.muted}>当前人数上限 {initialMax}</Text> : null}
    {host ? <><RoomInput value={name} onChangeText={setName} placeholder="房间名称" /><RoomButton label="保存名称" disabled={busy || !name.trim()} onPress={() => void action('update-room-name', { name: name.trim() })} />
      <View style={ui.row}><Text style={ui.text}>修改房间密码</Text><Switch value={passwordChanged} onValueChange={setPasswordChanged} /></View>{passwordChanged ? <RoomInput value={password} onChangeText={setPassword} secureTextEntry placeholder="新密码（留空移除密码）" /> : null}<RoomInput value={max} onChangeText={setMax} keyboardType="number-pad" placeholder="新人数上限（1–100；留空保留）" /><View style={ui.row}><Text style={ui.text}>加入需要审批</Text><Switch value={approval} onValueChange={value => { setApproval(value); setApprovalChanged(true); }} /></View><Text style={ui.muted}>只保存你本次修改的条件</Text><RoomButton label="保存加入条件" disabled={busy || (!passwordChanged && !max && !approvalChanged) || (!!max && (!Number.isInteger(Number(max)) || Number(max) < 1 || Number(max) > 100))} onPress={() => void action('update-room-settings', { ...(passwordChanged ? { password } : {}), ...(max ? { maxViewers: Number(max) } : {}), ...(approvalChanged ? { requireApproval: approval } : {}) })} />
      <Text style={ui.title}>房间模式</Text><View style={ui.row}><RoomButton label="同步观影" secondary disabled={busy} onPress={() => void action('update-room-mode', { mode: 'watch-together' })} /><RoomButton label="一起听" secondary disabled={busy} onPress={() => void action('update-room-mode', { mode: 'listen-together' })} /><RoomButton label="屏幕共享" secondary disabled={busy} onPress={() => void action('update-room-mode', { mode: 'screen-share' })} /></View><Text style={ui.muted}>共享画面由桌面端或 OBS 发起</Text></> : null}
    <Text style={ui.title}>在线成员</Text>{viewers.length ? viewers.map(viewer => <View key={viewer.socketId} style={ui.card}><Text style={ui.text}>{viewer.username || '观众'} · {viewer.role || 'user'}</Text>{host && viewer.socketId !== socket?.id ? <View style={ui.row}><RoomButton label="移出" secondary disabled={busy} onPress={() => Alert.alert('移出成员', `移出 ${viewer.username || '此成员'}？`, [{ text: '取消' }, { text: '移出', onPress: () => void action('kick-viewer', { viewerSocketId: viewer.socketId }) }])} />{viewer.userId ? <><RoomButton label="禁言" secondary disabled={busy} onPress={() => void action('mute-viewer', { userId: viewer.userId })} /><RoomButton label="解除禁言" secondary disabled={busy} onPress={() => void action('unmute-viewer', { userId: viewer.userId })} /><RoomButton label="任命房管" secondary disabled={busy} onPress={() => void action('appoint-moderator', { userId: viewer.userId })} /><RoomButton label="撤销房管" secondary disabled={busy} onPress={() => void action('dismiss-moderator', { userId: viewer.userId })} /></> : null}<RoomButton label="转交房主" secondary disabled={busy} onPress={() => Alert.alert('转交房主', '将房主权限转交给此成员？', [{ text: '取消' }, { text: '转交', onPress: () => void action('transfer-host', { viewerSocketId: viewer.socketId }) }])} /></View> : null}</View>) : <Text style={ui.muted}>等待成员列表更新</Text>}
    <BiliAccount />{host ? <RoomButton label="关闭房间" secondary onPress={close} /> : null}{error ? <Text style={ui.error}>{error}</Text> : null}
  </ScrollView>;
}
