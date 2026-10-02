import { useAppearance } from '@/state/appearance';
import { useEffect, useState } from 'react';
import { Alert, Pressable, Switch, Text, View } from 'react-native';
import { useSession } from '@/state/session';
import { emitAck } from '@/lib/socket';
import { messageFor } from '@/lib/server';
import { RoomButton, RoomInput, ui as baseUi } from './RoomUi';
export type Viewer = { socketId: string; username?: string; userId?: number; role?: string };
export function RoomSettings({ roomId, roomName, host, close, viewers }: { roomId: string; roomName: string; host: boolean; close: () => void; viewers: Viewer[] }) {
  const theme = useAppearance();
  const ui = theme.styles(baseUi);

  const { socket, request } = useSession(); const [tab, setTab] = useState<'info' | 'viewers' | 'conditions'>('info'); const [expanded, setExpanded] = useState(''); const [name, setName] = useState(roomName); const [password, setPassword] = useState('');
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
  return <View style={{ gap: 12 }}>
    <View style={[ui.row, { borderBottomWidth: 1, borderColor: theme.color('#343d41') }]}>{(['info', 'viewers', 'conditions'] as const).filter(value => host || value !== 'conditions').map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)} style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: tab === value ? theme.color('#65d59b') : 'transparent' }}><Text style={ui.text}>{value === 'info' ? '房间信息' : value === 'viewers' ? `在线成员 ${viewers.length}` : '加入条件'}</Text></Pressable>)}</View>
    {tab === 'info' ? <>
      <Text selectable style={ui.muted}>房间编号：{roomId}</Text><Text style={ui.title}>{roomName}</Text><Text style={ui.muted}>{host ? '房主' : '观众'} · {viewers.length} 位观众</Text>
      {host ? <><RoomInput value={name} onChangeText={setName} placeholder="房间名称" /><RoomButton label="保存名称" disabled={busy || !name.trim()} onPress={() => void action('update-room-name', { name: name.trim() })} />
        <Text style={ui.title}>房间模式</Text><View style={ui.row}><RoomButton label="同步观影" secondary disabled={busy} onPress={() => void action('update-room-mode', { mode: 'watch-together' })} /><RoomButton label="一起听" secondary disabled={busy} onPress={() => void action('update-room-mode', { mode: 'listen-together' })} /><RoomButton label="投屏" secondary disabled={busy} onPress={() => void action('update-room-mode', { mode: 'screen-share' })} /></View></> : null}
    </> : null}
    {tab === 'conditions' && host ? <>
      {initialMax !== null ? <Text style={ui.muted}>当前人数上限 {initialMax}</Text> : null}
      <View style={ui.row}><Text style={[ui.text, { flex: 1 }]}>修改房间密码</Text><Switch value={passwordChanged} onValueChange={setPasswordChanged} /></View>
      {passwordChanged ? <RoomInput value={password} onChangeText={setPassword} secureTextEntry placeholder="新密码（留空移除密码）" /> : null}
      <RoomInput value={max} onChangeText={setMax} keyboardType="number-pad" placeholder="新人数上限（1–100；留空保留）" />
      <View style={ui.row}><Text style={[ui.text, { flex: 1 }]}>加入需要审批</Text><Switch value={approval} onValueChange={value => { setApproval(value); setApprovalChanged(true); }} /></View>
      <RoomButton label="保存加入条件" disabled={busy || (!passwordChanged && !max && !approvalChanged) || (!!max && (!Number.isInteger(Number(max)) || Number(max) < 1 || Number(max) > 100))} onPress={() => void action('update-room-settings', { ...(passwordChanged ? { password } : {}), ...(max ? { maxViewers: Number(max) } : {}), ...(approvalChanged ? { requireApproval: approval } : {}) })} />
    </> : null}
    {tab === 'viewers' ? <>
      {viewers.length ? viewers.map(viewer => <View key={viewer.socketId} style={ui.card}><View style={ui.row}><Text style={[ui.text, { flex: 1 }]}>{viewer.username || '观众'} · {viewer.role || 'user'}</Text>{host && viewer.socketId !== socket?.id ? <RoomButton label={expanded === viewer.socketId ? '收起管理' : '管理'} secondary onPress={() => setExpanded(old => old === viewer.socketId ? '' : viewer.socketId)} /> : null}</View>
        {expanded === viewer.socketId && host && viewer.socketId !== socket?.id ? <View style={ui.row}><RoomButton label="移出" secondary disabled={busy} onPress={() => Alert.alert('移出成员', `移出 ${viewer.username || '此成员'}？`, [{ text: '取消' }, { text: '移出', onPress: () => void action('kick-viewer', { viewerSocketId: viewer.socketId }) }])} />
          {viewer.userId ? <><RoomButton label="禁言" secondary disabled={busy} onPress={() => void action('mute-viewer', { userId: viewer.userId })} /><RoomButton label="解除禁言" secondary disabled={busy} onPress={() => void action('unmute-viewer', { userId: viewer.userId })} /><RoomButton label="任命房管" secondary disabled={busy} onPress={() => void action('appoint-moderator', { userId: viewer.userId })} /><RoomButton label="撤销房管" secondary disabled={busy} onPress={() => void action('dismiss-moderator', { userId: viewer.userId })} /></> : null}
          <RoomButton label="转交房主" secondary disabled={busy} onPress={() => Alert.alert('转交房主', '将房主权限转交给此成员？', [{ text: '取消' }, { text: '转交', onPress: () => void action('transfer-host', { viewerSocketId: viewer.socketId }) }])} /></View> : null}
      </View>) : <Text style={ui.muted}>等待成员列表更新</Text>}
    </> : null}
    {host && tab === 'info' ? <RoomButton label="关闭房间" secondary onPress={close} /> : null}{error ? <Text style={ui.error}>{error}</Text> : null}
  </View>;
}
