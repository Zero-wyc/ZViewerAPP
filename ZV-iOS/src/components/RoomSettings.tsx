import { DynamicText as Text } from '@/components/DynamicText';
import Feather from '@expo/vector-icons/Feather';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { roomModes, type RoomMode } from '@/lib/roomModes';
import { emitAck } from '@/lib/socket';
import { messageFor } from '@/lib/server';
import { useSession } from '@/state/session';
import { BiliAccount } from './BiliAccount';
import { useMediaPalette } from './MediaPanelUi';
import { RoomButton, RoomInput } from './RoomUi';
import { AppDialog } from './AppDialog';

export type Viewer = { socketId: string; username?: string; userId?: number; role?: string };
type Settings = { maxViewers: number; requireApproval: boolean };
type Props = { roomId: string; roomName: string; host: boolean; mode: RoomMode; close: () => void; viewers: Viewer[]; openAppearance: () => void; autoApprove: boolean; toggleAutoApprove: () => void; children?: ReactNode };
type Icon = ComponentProps<typeof Feather>['name'];

function RoomPill({ label, accessibilityLabel = label, icon, onPress, selected = false, disabled = false, expanded }: { label: string; accessibilityLabel?: string; icon: Icon; onPress: () => void; selected?: boolean; disabled?: boolean; expanded?: boolean }) {
  const p = useMediaPalette();
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ selected, disabled, ...(expanded === undefined ? {} : { expanded }) }} disabled={disabled} onAccessibilityTap={() => { if (!disabled) onPress(); }} onPress={onPress} style={{ minHeight: 44, justifyContent: 'center', opacity: disabled ? .45 : 1 }}><View style={[layout.pill, { borderColor: selected ? p.accent : p.line, backgroundColor: selected ? p.accent : p.container }]}><Feather name={icon} size={16} color={selected ? p.onAccent : p.text} /><Text style={{ color: selected ? p.onAccent : p.text, fontSize: 13, flexShrink: 1 }}>{label}</Text></View></Pressable>;
}

export function RoomSettingsFooter({ roomId, leave, viewerCount }: { roomId: string; leave: () => void; viewerCount?: number }) {
  const p = useMediaPalette();
  return <View style={[layout.footer, { borderColor: p.line }]}><Text numberOfLines={1} style={{ color: p.muted, fontSize: 12, flex: 1, minWidth: 0 }}>房间号 {roomId}{viewerCount == null ? '' : ` · ${viewerCount} 位观众`}</Text><Pressable accessibilityRole="button" accessibilityLabel="离开房间" onAccessibilityTap={leave} onPress={leave} style={layout.textAction}><Text style={{ color: p.accent, fontSize: 14 }}>离开房间</Text></Pressable></View>;
}

export function RoomSettings({ roomId, roomName, host, mode, viewers, openAppearance, autoApprove, toggleAutoApprove, children }: Props) {
  const p = useMediaPalette(); const { socket, request, session, connected } = useSession();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [editing, setEditing] = useState(false); const [name, setName] = useState(roomName);
  const [conditionsOpen, setConditionsOpen] = useState(false); const [usersOpen, setUsersOpen] = useState(false); const [settingsTab, setSettingsTab] = useState<'info' | 'viewers' | 'permissions'>('info'); const [expanded, setExpanded] = useState('');
  const [password, setPassword] = useState(''); const [passwordChanged, setPasswordChanged] = useState(false); const [max, setMax] = useState('');
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
    if (!conditionsOpen) { setMax(String(settings?.maxViewers ?? 10)); setPassword(''); setPasswordChanged(false); setSettingsTab('info'); }
    setConditionsOpen(value => !value);
  };
  const saveConditions = async () => {
    const capacityChanged = !!max && Number(max) !== settings?.maxViewers;
    const values = { ...(passwordChanged ? { password } : {}), ...(capacityChanged ? { maxViewers: Number(max) } : {}) };
    if (!Object.keys(values).length) { setConditionsOpen(false); return; }
    if (await action('update-room-settings', values)) { revision.current++; setSettings(previous => previous && { ...previous, ...(capacityChanged ? { maxViewers: Number(max) } : {}) }); setConditionsOpen(false); setNotice('房间设置已保存'); }
  };
  const disabled = busy || !connected;
  const canSave = !!max && Number.isInteger(Number(max)) && Number(max) >= 1 && Number(max) <= 100;
  const text = { color: p.text, fontSize: 14 }; const muted = { color: p.muted, fontSize: 12 };
  const modeIcons: Icon[] = ['monitor', 'cast', 'music'];
  const renderMembers = () => viewers.length ? viewers.map(viewer => <View key={viewer.socketId} style={[layout.member, { borderColor: p.line }]}>
    <View style={layout.row}><View style={[layout.avatar, { backgroundColor: p.container }]}><Feather name="user" size={17} color={p.muted} /></View><View style={{ flex: 1, gap: 3 }}><Text style={text}>{viewer.username || '观众'}</Text><Text style={muted}>{({ root: '系统管理员', admin: '管理员', user: '观众', guest: '游客' } as Record<string, string>)[viewer.role || 'user'] || '观众'}{viewer.socketId === socket?.id ? ' · 我' : ''}</Text></View>{host && viewer.socketId !== socket?.id ? <RoomPill label={expanded === viewer.socketId ? '收起' : '管理'} icon="more-horizontal" onPress={() => setExpanded(old => old === viewer.socketId ? '' : viewer.socketId)} /> : null}</View>
    {expanded === viewer.socketId && host && viewer.socketId !== socket?.id ? <View style={layout.actions}>
      <RoomPill label="移出" icon="user-x" disabled={disabled} onPress={() => Alert.alert('移出成员', '移出 ' + (viewer.username || '此成员') + '？', [{ text: '取消' }, { text: '移出', onPress: () => void action('kick-viewer', { viewerSocketId: viewer.socketId }) }])} />
      {viewer.userId ? <><RoomPill label="禁言" icon="mic-off" disabled={disabled} onPress={() => void action('mute-viewer', { userId: viewer.userId })} /><RoomPill label="解除禁言" icon="mic" disabled={disabled} onPress={() => void action('unmute-viewer', { userId: viewer.userId })} /><RoomPill label="任命房管" icon="user-check" disabled={disabled} onPress={() => void action('appoint-moderator', { userId: viewer.userId })} /><RoomPill label="撤销房管" icon="user-minus" disabled={disabled} onPress={() => void action('dismiss-moderator', { userId: viewer.userId })} /></> : null}
      <RoomPill label="转交房主" icon="award" disabled={disabled} onPress={() => Alert.alert('转交房主', `将房主权限转交给 ${viewer.username || '此成员'}？`, [{ text: '取消' }, { text: '转交', onPress: () => void action('transfer-host', { viewerSocketId: viewer.socketId }) }])} />
    </View> : null}
  </View>) : <View style={layout.empty}><Text style={{ color: p.muted, fontSize: 14 }}>暂无在线观众</Text></View>;

  return <View testID="room-settings-dashboard" style={{ gap: 16 }}>
    <View style={layout.modes}>{roomModes.map((value, index) => {
      const selected = mode === value.id; const ink = selected ? '#63c999' : p.text;
      const change = () => { if (!disabled && host && mode !== value.id) void action('update-room-mode', { mode: value.id }); };
      return <Pressable key={value.id} accessibilityRole="button" accessibilityLabel={value.name} accessibilityState={{ selected, disabled: !host || disabled }} disabled={!host || disabled} onAccessibilityTap={change} onPress={change} style={[layout.mode, { borderColor: ink, opacity: disabled ? .45 : 1 }]}><Feather name={modeIcons[index]} size={21} color={ink} /><Text style={{ color: ink, fontSize: 15, fontWeight: selected ? '500' : '400' }}>{value.name}</Text></Pressable>;
    })}</View>
    <View style={layout.shortcuts}><Pressable accessibilityRole="button" accessibilityLabel="外观设置" onAccessibilityTap={openAppearance} onPress={openAppearance} style={[layout.appearance, { borderColor: p.muted, backgroundColor: p.container }]}><FontAwesome6 name="palette" solid size={19} color={p.accent} /><Text style={{ color: p.accent, fontSize: 15 }}>外观设置</Text></Pressable><BiliAccount presentation="entry" iconOnly /></View>
    <View testID="room-status-card" style={[layout.card, { backgroundColor: p.surface, borderColor: p.line }]}>
      <View style={[layout.status, { borderColor: p.line }]}><View style={[layout.statusIcon, { backgroundColor: p.container }]}><Feather name="settings" size={19} color={p.text} /></View><View style={{ flex: 1, gap: 4 }}><Text style={{ color: p.text, fontSize: 16, fontWeight: '600' }}>房间状态</Text><View style={[layout.row, { gap: 6 }]}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: connected ? '#b48a12' : p.error }} /><Text style={muted}>{connected ? '已连接' : '未连接'}</Text></View></View>{host ? <View style={[layout.role, { backgroundColor: p.accent }]}><FontAwesome6 name="crown" solid size={12} color={p.onAccent} /><Text style={{ color: p.onAccent, fontSize: 12 }}>房主</Text></View> : null}</View>
      <View style={layout.cardBody}>
        <View style={{ gap: 2 }}><Text style={muted}>房间名称</Text>{editing && host ? <View style={layout.row}><RoomInput accessibilityLabel="房间名称" placeholder="房间名称" value={name} onChangeText={setName} maxLength={80} autoFocus editable={!busy} returnKeyType="done" onSubmitEditing={() => void saveName()} style={{ flex: 1, minWidth: 0 }} /><Pressable accessibilityRole="button" accessibilityLabel="保存名称" disabled={disabled || !name.trim()} onAccessibilityTap={() => { if (!disabled && name.trim()) void saveName(); }} onPress={() => void saveName()} style={layout.icon}><Feather name="check" size={18} color={p.accent} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="取消修改名称" disabled={busy} onAccessibilityTap={() => { if (!busy) setEditing(false); }} onPress={() => setEditing(false)} style={layout.icon}><Feather name="x" size={18} color={p.muted} /></Pressable></View> : <View style={layout.row}><Text numberOfLines={1} style={{ color: p.text, fontSize: 16, fontWeight: '500', flexShrink: 1 }}>{roomName || '未命名房间'}</Text>{host ? <Pressable accessibilityRole="button" accessibilityLabel="修改房间名称" disabled={disabled} onAccessibilityTap={() => { if (!disabled) { setName(roomName); setEditing(true); } }} onPress={() => { setName(roomName); setEditing(true); }} style={layout.icon}><Feather name="edit-2" size={16} color={p.accent} /></Pressable> : null}</View>}</View>
        <View style={{ gap: 6 }}><Text style={muted}>房间 ID</Text><Pressable accessibilityRole="button" accessibilityLabel="复制房间 ID" onAccessibilityTap={() => void copy(false)} onPress={() => void copy(false)} style={{ alignSelf: 'flex-start', maxWidth: '100%', minHeight: 44, justifyContent: 'center' }}><View style={[layout.id, { backgroundColor: p.container }]}><Text selectable numberOfLines={1} style={{ color: p.accent, fontSize: 13, flexShrink: 1 }}>{roomId}</Text><Feather name="copy" size={14} color={p.accent} /></View></Pressable></View>
        <View style={layout.actions}><RoomPill label="分享" icon="share-2" onPress={() => void copy(true)} /><RoomPill label={'在线 (' + viewers.length + ')'} accessibilityLabel={'在线成员 ' + viewers.length} icon="users" onPress={() => setUsersOpen(true)} />{host ? <><RoomPill label="设置" accessibilityLabel="房间设置" icon="settings" expanded={conditionsOpen} disabled={disabled || !settings} onPress={toggleConditions} />{mode === 'watch-together' ? <RoomPill label={'自动通过：' + (autoApprove ? '开' : '关')} accessibilityLabel="自动通过播放控制申请" icon="zap" selected={autoApprove} disabled={disabled} onPress={toggleAutoApprove} /> : null}<RoomPill label={'需要审批：' + (settings ? settings.requireApproval ? '开' : '关' : '…')} accessibilityLabel="切换入房审批" icon="shield" selected={settings?.requireApproval} disabled={disabled || !settings} onPress={() => void toggleApproval()} /></> : null}</View>
        {host ? <View testID="room-online-members" style={{ gap: 8, marginTop: 2 }}><View style={[layout.row, { gap: 6 }]}><Feather name="users" size={16} color={p.accent} /><Text style={muted}>{'在线观众（' + viewers.length + '）'}</Text></View>{renderMembers()}</View> : null}
        {notice ? <Text accessibilityLiveRegion="polite" style={{ color: p.accent, fontSize: 12 }}>{notice}</Text> : null}{error ? <Text accessibilityLiveRegion="polite" style={{ color: p.error, fontSize: 13 }}>{error}</Text> : null}
      </View>
    </View>
    <AppDialog visible={usersOpen} title={'在线观众（' + viewers.length + '）'} close={() => setUsersOpen(false)} maxWidth={560}>{renderMembers()}</AppDialog>
    {host && conditionsOpen ? <AppDialog visible title="房间设置" close={() => { if (!busy) setConditionsOpen(false); }} maxWidth={620}>
      <View accessibilityRole="tablist" style={[layout.settingsTabs, { borderColor: p.muted }]}>{([{ id: 'info', title: '房间信息' }, { id: 'viewers', title: '观众管理' }, { id: 'permissions', title: '权限说明' }] as const).map(tab => {
        const selected = settingsTab === tab.id; const choose = () => setSettingsTab(tab.id);
        return <Pressable key={tab.id} accessibilityRole="tab" accessibilityLabel={tab.title} accessibilityState={{ selected }} onAccessibilityTap={choose} onPress={choose} style={[layout.settingsTab, { backgroundColor: selected ? p.accent : 'transparent' }]}><Text style={{ color: selected ? p.onAccent : p.text, fontSize: 13, fontWeight: selected ? '500' : '400' }}>{tab.title}</Text></Pressable>;
      })}</View>
      {settingsTab === 'info' ? <View testID="room-join-settings" style={{ gap: 12 }}>
        <RoomFieldCard icon="lock" title="房间密码" subtitle="PASSWORD"><RoomInput accessibilityLabel="房间密码" value={password} onChangeText={value => { setPassword(value); setPasswordChanged(true); }} secureTextEntry editable={!disabled} placeholder="留空表示无密码" style={{ backgroundColor: p.container, borderRadius: 18, borderColor: p.muted }} /><Text style={[muted, { lineHeight: 19 }]}>设置后，观众加入需输入密码。root 账户无需密码。未修改时保留现有密码。</Text></RoomFieldCard>
        <RoomFieldCard icon="users" title="观众上限" subtitle="MAX VIEWERS" warm><RoomInput accessibilityLabel="观众上限" value={max} onChangeText={setMax} editable={!disabled} keyboardType="number-pad" placeholder="1–100" style={{ backgroundColor: p.container, borderRadius: 18, borderColor: p.muted }} /></RoomFieldCard>
        <RoomButton label={busy ? '正在保存…' : '保存设置'} disabled={disabled || !canSave} onPress={() => void saveConditions()} />
      </View> : settingsTab === 'viewers' ? <View style={{ gap: 8 }}><Text style={muted}>{'在线观众（' + viewers.length + '） · 可移出 / 禁言 / 转交房主'}</Text>{renderMembers()}</View> : <View style={{ gap: 12 }}>
        <RoomFieldCard icon="award" title="房主（分享端）" subtitle="HOST"><Text style={[muted, { lineHeight: 20 }]}>创建房间或被转交房主身份的用户。可管理观众、任命房管、转交房主、修改房间设置与名称、控制播放。</Text></RoomFieldCard>
        <RoomFieldCard icon="shield" title="房管（协管员）" subtitle="MODERATOR" warm><Text style={[muted, { lineHeight: 20 }]}>由房主任命的登录用户。可协助管理影片、观众及语音；不能转交房主或修改房间设置，具体操作以服务器权限为准。</Text></RoomFieldCard>
        <RoomFieldCard icon="user" title="观众" subtitle="VIEWER"><Text style={[muted, { lineHeight: 20 }]}>可观看影片，未被禁言时可发送评论与弹幕。影片和音乐操作遵从服务器权限设置。</Text></RoomFieldCard>
      </View>}
      {error ? <Text accessibilityLiveRegion="assertive" style={{ color: p.error, fontSize: 13 }}>{error}</Text> : null}
    </AppDialog> : null}
    {children}
  </View>;
}

function RoomFieldCard({ icon, title, subtitle, children, warm = false }: { icon: Icon; title: string; subtitle: string; children: ReactNode; warm?: boolean }) {
  const p = useMediaPalette();
  return <View style={[layout.fieldCard, { borderColor: p.line }]}><View style={[layout.row, { gap: 12, marginBottom: 4 }]}><View style={[layout.statusIcon, { backgroundColor: warm ? '#fff0c8' : p.container }]}>{icon === 'award' ? <FontAwesome6 name="crown" solid size={18} color={warm ? '#5c4b18' : p.text} /> : <Feather name={icon} size={20} color={warm ? '#5c4b18' : p.text} />}</View><View style={{ gap: 3 }}><Text style={{ color: p.text, fontSize: 15, fontWeight: '500' }}>{title}</Text><Text style={{ color: p.muted, fontSize: 11 }}>{subtitle}</Text></View></View>{children}</View>;
}

const layout = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modes: { flexDirection: 'row', gap: 8, marginBottom: 1 }, mode: { flex: 1, minHeight: 48, borderBottomWidth: 2, gap: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  shortcuts: { flexDirection: 'row', gap: 10, alignItems: 'stretch' }, appearance: { flex: 1, minHeight: 46, borderWidth: 1, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  textAction: { minHeight: 44, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  card: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1 }, statusIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  role: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 18 },
  cardBody: { padding: 14, gap: 8 }, icon: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  id: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 18, minHeight: 28, paddingHorizontal: 10, maxWidth: '100%' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }, pill: { minHeight: 32, borderRadius: 18, borderWidth: 1, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  fieldCard: { padding: 14, borderRadius: 18, borderWidth: 1, gap: 10 }, settingsTabs: { flexDirection: 'row', borderRadius: 22, borderWidth: 1, padding: 3, marginBottom: 4 }, settingsTab: { flex: 1, minHeight: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  member: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, gap: 6 }, avatar: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, empty: { minHeight: 62, alignItems: 'center', justifyContent: 'center' },
  footer: { borderTopWidth: 1, paddingTop: 10, marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 10 },
});
