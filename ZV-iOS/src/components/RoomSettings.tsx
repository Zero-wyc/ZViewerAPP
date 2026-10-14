import Feather from '@expo/vector-icons/Feather';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { roomModes, type RoomMode } from '@/lib/roomModes';
import { emitAck } from '@/lib/socket';
import { messageFor } from '@/lib/server';
import { useSession } from '@/state/session';
import { BiliAccount } from './BiliAccount';
import { useMediaPalette } from './MediaPanelUi';
import { RoomButton, RoomInput } from './RoomUi';

export type Viewer = { socketId: string; username?: string; userId?: number; role?: string };
type Settings = { maxViewers: number; requireApproval: boolean };
type Props = { roomId: string; roomName: string; host: boolean; mode: RoomMode; close: () => void; viewers: Viewer[]; openAppearance: () => void; autoApprove: boolean; toggleAutoApprove: () => void; children?: ReactNode };
type Icon = ComponentProps<typeof Feather>['name'];

function RoomPill({ label, accessibilityLabel = label, icon, onPress, selected = false, disabled = false, expanded }: { label: string; accessibilityLabel?: string; icon: Icon; onPress: () => void; selected?: boolean; disabled?: boolean; expanded?: boolean }) {
  const p = useMediaPalette();
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ selected, disabled, ...(expanded === undefined ? {} : { expanded }) }} disabled={disabled} onPress={onPress} style={[layout.pill, { borderColor: selected ? p.accent : p.line, backgroundColor: selected ? p.accent : p.container, opacity: disabled ? .45 : 1 }]}><Feather name={icon} size={18} color={selected ? p.onAccent : p.text} /><Text style={{ color: selected ? p.onAccent : p.text, fontSize: 14, flexShrink: 1 }}>{label}</Text></Pressable>;
}

export function RoomSettingsFooter({ roomId, leave }: { roomId: string; leave: () => void }) {
  const p = useMediaPalette();
  return <View style={[layout.footer, { borderColor: p.line }]}><Text numberOfLines={1} style={{ color: p.muted, fontSize: 12, flex: 1 }}>房间号 {roomId}</Text><Pressable accessibilityRole="button" accessibilityLabel="离开房间" onPress={leave} style={layout.textAction}><Feather name="log-out" size={17} color={p.accent} /><Text style={{ color: p.accent, fontSize: 15 }}>离开房间</Text></Pressable></View>;
}

export function RoomSettings({ roomId, roomName, host, mode, close, viewers, openAppearance, autoApprove, toggleAutoApprove, children }: Props) {
  const p = useMediaPalette(); const { socket, request, session, connected } = useSession();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [editing, setEditing] = useState(false); const [name, setName] = useState(roomName);
  const [conditionsOpen, setConditionsOpen] = useState(false); const [membersOpen, setMembersOpen] = useState(true); const [expanded, setExpanded] = useState('');
  const [password, setPassword] = useState(''); const [passwordChanged, setPasswordChanged] = useState(false); const [max, setMax] = useState('');
  const [draftApproval, setDraftApproval] = useState(false); const [approvalChanged, setApprovalChanged] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const revision = useRef(0); const active = useRef(true); const working = useRef(false);
  useEffect(() => {
    active.current = true; let current = true; const initialRevision = revision.current;
    void request<{ rooms: ({ roomId: string } & Settings)[] }>('/api/rooms').then(data => {
      const room = data.rooms.find(value => value.roomId === roomId);
      if (current && revision.current === initialRevision && room) setSettings({ maxViewers: room.maxViewers, requireApproval: room.requireApproval });
    }).catch(() => { if (current) setError('暂时无法读取房间设置，请重新打开重试'); });
    const updated = (payload: Partial<Settings> & { roomId?: string }) => {
      if (payload.roomId && payload.roomId !== roomId) return;
      revision.current++;
      setSettings(previous => ({ maxViewers: Number.isInteger(payload.maxViewers) ? payload.maxViewers! : previous?.maxViewers ?? 10, requireApproval: typeof payload.requireApproval === 'boolean' ? payload.requireApproval : previous?.requireApproval ?? false }));
    };
    socket?.on('room-settings-updated', updated);
    return () => { current = false; active.current = false; socket?.off('room-settings-updated', updated); };
  }, [request, socket, roomId]);
  const action = async (event: string, values: object) => {
    if (!host || !socket?.connected || working.current) return false;
    working.current = true; setBusy(true); setError(''); setNotice('');
    try { await emitAck(socket, event, { roomId, ...values }); return active.current; }
    catch (failure) { if (active.current) setError(messageFor(failure)); return false; }
    finally { working.current = false; if (active.current) setBusy(false); }
  };
  const copy = async (link: boolean) => {
    try { const copied = await Clipboard.setStringAsync(link ? `${session!.serverUrl}/room/${encodeURIComponent(roomId)}` : roomId); if (copied === false) throw new Error('copy failed'); if (active.current) { setNotice(link ? '分享链接已复制' : '房间 ID 已复制'); setError(''); } }
    catch { if (active.current) setError('复制失败，请重试'); }
  };
  const saveName = async () => { const trimmed = name.trim(); if (!trimmed) return; if (trimmed === roomName || await action('update-room-name', { name: trimmed })) { setEditing(false); setNotice('房间名称已保存'); } };
  const toggleApproval = async () => {
    if (!settings) return; const requireApproval = !settings.requireApproval;
    if (await action('update-room-settings', { requireApproval })) { revision.current++; setSettings(previous => previous && { ...previous, requireApproval }); }
  };
  const toggleConditions = () => {
    if (!conditionsOpen) { setMax(''); setPassword(''); setPasswordChanged(false); setApprovalChanged(false); setDraftApproval(settings?.requireApproval ?? false); }
    setConditionsOpen(value => !value);
  };
  const saveConditions = async () => {
    const values = { ...(passwordChanged ? { password } : {}), ...(max ? { maxViewers: Number(max) } : {}), ...(approvalChanged ? { requireApproval: draftApproval } : {}) };
    if (await action('update-room-settings', values)) { revision.current++; setSettings(previous => previous && { ...previous, ...(max ? { maxViewers: Number(max) } : {}), ...(approvalChanged ? { requireApproval: draftApproval } : {}) }); setConditionsOpen(false); setNotice('房间设置已保存'); }
  };
  const disabled = busy || !connected; const canSave = (passwordChanged || !!max || approvalChanged) && (!max || Number.isInteger(Number(max)) && Number(max) >= 1 && Number(max) <= 100);
  const text = { color: p.text, fontSize: 15 }; const muted = { color: p.muted, fontSize: 12 };
  const modeIcons: Icon[] = ['monitor', 'airplay', 'music'];
  return <View testID="room-settings-dashboard" style={{ gap: 16 }}>
    <View style={layout.modes}>{roomModes.map((value, index) => <Pressable key={value.id} accessibilityRole="button" accessibilityLabel={value.name} accessibilityState={{ selected: mode === value.id, disabled: !host || disabled }} disabled={!host || disabled} onPress={() => { if (mode !== value.id) void action('update-room-mode', { mode: value.id }); }} style={[layout.mode, { borderColor: mode === value.id ? p.accent : p.line, opacity: disabled ? .45 : 1 }]}><Feather name={modeIcons[index]} size={20} color={mode === value.id ? p.accent : p.muted} /><Text style={{ color: mode === value.id ? p.accent : p.muted, fontSize: 15, fontWeight: mode === value.id ? '600' : '400' }}>{value.name}</Text></Pressable>)}</View>
    <View style={{ gap: 0 }}><Pressable accessibilityRole="button" accessibilityLabel="外观设置" onPress={openAppearance} style={[layout.textAction, { alignSelf: 'center' }]}><Feather name="sliders" size={20} color={p.accent} /><Text style={{ color: p.accent, fontSize: 16 }}>外观设置</Text></Pressable><BiliAccount presentation="entry" /></View>
    <View testID="room-status-card" style={[layout.card, { backgroundColor: p.surface, borderColor: p.line }]}>
      <View style={[layout.status, { borderColor: p.line }]}><View style={[layout.statusIcon, { backgroundColor: p.container }]}><Feather name="settings" size={22} color={p.text} /></View><View style={{ flex: 1, gap: 5 }}><Text style={{ color: p.text, fontSize: 18, fontWeight: '600' }}>房间状态</Text><View style={layout.row}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: connected ? '#dfa645' : p.error }} /><Text style={muted}>{connected ? '已连接' : '连接已断开'}</Text></View></View><View style={[layout.role, { backgroundColor: host ? p.accent : p.container }]}><Feather name={host ? 'award' : 'user'} size={15} color={host ? p.onAccent : p.muted} /><Text style={{ color: host ? p.onAccent : p.muted, fontSize: 13 }}>{host ? '房主' : '观众'}</Text></View></View>
      <View style={layout.cardBody}>
        <View style={{ gap: 4 }}><Text style={muted}>房间名称</Text>{editing && host ? <View style={layout.row}><RoomInput accessibilityLabel="房间名称" placeholder="房间名称" value={name} onChangeText={setName} maxLength={80} autoFocus editable={!busy} returnKeyType="done" onSubmitEditing={() => void saveName()} style={{ flex: 1, minWidth: 0 }} /><Pressable accessibilityRole="button" accessibilityLabel="保存名称" disabled={disabled || !name.trim()} onPress={() => void saveName()} style={layout.icon}><Feather name="check" size={20} color={p.accent} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="取消修改名称" disabled={busy} onPress={() => setEditing(false)} style={layout.icon}><Feather name="x" size={20} color={p.muted} /></Pressable></View> : <View style={layout.row}><Text numberOfLines={2} style={{ color: p.text, fontSize: 18, fontWeight: '500', flexShrink: 1 }}>{roomName || '未命名房间'}</Text>{host ? <Pressable accessibilityRole="button" accessibilityLabel="修改房间名称" disabled={disabled} onPress={() => { setName(roomName); setEditing(true); }} style={layout.icon}><Feather name="edit-2" size={18} color={p.accent} /></Pressable> : null}</View>}</View>
        <View style={{ gap: 8 }}><Text style={muted}>房间 ID</Text><Pressable accessibilityRole="button" accessibilityLabel="复制房间 ID" onPress={() => void copy(false)} style={[layout.id, { backgroundColor: p.container }]}><Text selectable numberOfLines={1} style={{ color: p.accent, fontSize: 14, flexShrink: 1 }}>{roomId}</Text><Feather name="copy" size={16} color={p.accent} /></Pressable></View>
        <View style={layout.actions}><RoomPill label="分享" icon="share-2" onPress={() => void copy(true)} /><RoomPill label={`在线 (${viewers.length})`} accessibilityLabel={`在线成员 ${viewers.length}`} icon="users" expanded={membersOpen} onPress={() => setMembersOpen(value => !value)} />{host ? <RoomPill label="设置" accessibilityLabel="加入条件" icon="settings" expanded={conditionsOpen} disabled={disabled || !settings} onPress={toggleConditions} /> : null}</View>
        {host ? <View style={layout.actions}>{mode === 'watch-together' ? <RoomPill label={`自动通过：${autoApprove ? '开' : '关'}`} accessibilityLabel="自动通过播放控制申请" icon="zap" selected={autoApprove} disabled={disabled} onPress={toggleAutoApprove} /> : null}<RoomPill label={`需要审批：${settings ? settings.requireApproval ? '开' : '关' : '…'}`} accessibilityLabel="切换入房审批" icon="shield" selected={settings?.requireApproval} disabled={disabled || !settings} onPress={() => void toggleApproval()} /></View> : null}
        {conditionsOpen && host ? <View testID="room-join-settings" style={[layout.subpanel, { borderColor: p.line, backgroundColor: p.field }]}><Text style={{ ...text, fontWeight: '600' }}>加入条件</Text><Text style={muted}>当前人数上限 {settings?.maxViewers}</Text><View style={[layout.row, { justifyContent: 'space-between' }]}><Text style={text}>修改房间密码</Text><Switch accessibilityLabel="修改房间密码" value={passwordChanged} onValueChange={setPasswordChanged} trackColor={{ true: p.accent, false: p.line }} thumbColor="#fff" /></View>{passwordChanged ? <RoomInput value={password} onChangeText={setPassword} secureTextEntry placeholder="新密码（留空移除密码）" /> : null}<RoomInput value={max} onChangeText={setMax} keyboardType="number-pad" placeholder="新人数上限（1–100；留空保留）" /><View style={[layout.row, { justifyContent: 'space-between' }]}><Text style={text}>加入需要审批</Text><Switch accessibilityLabel="加入需要审批" value={draftApproval} onValueChange={value => { setDraftApproval(value); setApprovalChanged(true); }} trackColor={{ true: p.accent, false: p.line }} thumbColor="#fff" /></View><RoomButton label="保存加入条件" disabled={disabled || !canSave} onPress={() => void saveConditions()} /><RoomPill label="关闭房间" icon="power" disabled={busy} onPress={close} /></View> : null}
        {membersOpen ? <View testID="room-online-members" style={{ gap: 10 }}><View style={layout.row}><Feather name="users" size={18} color={p.accent} /><Text style={muted}>在线观众（{viewers.length}）</Text></View>{viewers.length ? viewers.map(viewer => <View key={viewer.socketId} style={[layout.member, { backgroundColor: p.field }]}><View style={layout.row}><View style={{ flex: 1, gap: 4 }}><Text style={text}>{viewer.username || '观众'}</Text><Text style={muted}>{viewer.role || 'user'}{viewer.socketId === socket?.id ? ' · 我' : ''}</Text></View>{host && viewer.socketId !== socket?.id ? <RoomPill label={expanded === viewer.socketId ? '收起管理' : '管理'} icon="more-horizontal" onPress={() => setExpanded(old => old === viewer.socketId ? '' : viewer.socketId)} /> : null}</View>{expanded === viewer.socketId && host && viewer.socketId !== socket?.id ? <View style={layout.actions}><RoomPill label="移出" icon="user-x" disabled={disabled} onPress={() => Alert.alert('移出成员', `移出 ${viewer.username || '此成员'}？`, [{ text: '取消' }, { text: '移出', onPress: () => void action('kick-viewer', { viewerSocketId: viewer.socketId }) }])} />{viewer.userId ? <><RoomPill label="禁言" icon="mic-off" disabled={disabled} onPress={() => void action('mute-viewer', { userId: viewer.userId })} /><RoomPill label="解除禁言" icon="mic" disabled={disabled} onPress={() => void action('unmute-viewer', { userId: viewer.userId })} /><RoomPill label="任命房管" icon="user-check" disabled={disabled} onPress={() => void action('appoint-moderator', { userId: viewer.userId })} /><RoomPill label="撤销房管" icon="user-minus" disabled={disabled} onPress={() => void action('dismiss-moderator', { userId: viewer.userId })} /></> : null}<RoomPill label="转交房主" icon="award" disabled={disabled} onPress={() => Alert.alert('转交房主', '将房主权限转交给此成员？', [{ text: '取消' }, { text: '转交', onPress: () => void action('transfer-host', { viewerSocketId: viewer.socketId }) }])} /></View> : null}</View>) : <View style={[layout.empty, { backgroundColor: p.field }]}><Text style={{ color: p.muted, fontSize: 14 }}>暂无在线观众</Text></View>}</View> : null}
        {notice ? <Text accessibilityLiveRegion="polite" style={{ color: p.accent, fontSize: 13 }}>{notice}</Text> : null}{error ? <Text accessibilityLiveRegion="polite" style={{ color: p.error, fontSize: 13 }}>{error}</Text> : null}
      </View>
    </View>
    {children}
  </View>;
}
const layout = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modes: { flexDirection: 'row', gap: 8 }, mode: { flex: 1, minHeight: 54, borderBottomWidth: 2, gap: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  textAction: { minHeight: 44, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  card: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1 }, statusIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  role: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 18 },
  cardBody: { padding: 16, gap: 16 }, icon: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  id: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 20, minHeight: 36, paddingHorizontal: 12, alignSelf: 'flex-start', maxWidth: '100%' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }, pill: { minHeight: 40, borderRadius: 22, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  subpanel: { padding: 12, borderRadius: 14, borderWidth: 1, gap: 12 }, member: { padding: 10, borderRadius: 12, gap: 10 }, empty: { minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', padding: 10 },
  footer: { borderTopWidth: 1, paddingTop: 8, marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 12 },
});
