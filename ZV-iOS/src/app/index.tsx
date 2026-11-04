import { type RoomMode } from '@/lib/roomModes';
import { useAppearance } from '@/state/appearance';
import { router, usePathname } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, useWindowDimensions, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { DynamicText as Text } from '@/components/DynamicText';
import { emitAck } from '@/lib/socket';
import { messageFor, normalizeServerUrl, type Room } from '@/lib/server';
import { useSession } from '@/state/session';
import { homeLayout } from '@/lib/homeLayout';
import { NativePreviewNotice } from '@/components/NativePreviewNotice';
import { Surface } from '@/components/Surface';
import { BiliAccount } from '@/components/BiliAccount';
import { readServerPolicy } from '@/lib/serverConnection';
import { AppIcon, Checkbox, FieldLabel, GlassCard, GlassIconButton, home, HomeShortcuts, InputShell, PrimaryButton, Segmented, SelectShell, useHomeTokens } from '@/components/HomeChrome';

const roomModeOptions: { id: RoomMode; name: string; icon: 'monitor' | 'cast' | 'music' }[] = [
  { id: 'watch-together', name: '一起看', icon: 'monitor' },
  { id: 'screen-share', name: '投屏', icon: 'cast' },
  { id: 'listen-together', name: '一起听', icon: 'music' },
];
const roomMeta = (mode?: string) => mode === 'screen-share' ? '屏幕共享' : mode === 'listen-together' ? '一起听' : '同步观影';

export default function HomeScreen() {
  const theme = useAppearance();
  const t = useHomeTokens(); const p = t.p;
  const { height } = useWindowDimensions(); const insets = useSafeAreaInsets();
  const { session, savedServer, restoring, socket, connected, certificateException, connectionError, login, detectServer, logout, revokeCertificateException, request } = useSession();
  const pathname = usePathname();
  const [server, setServer] = useState<string | null>(null);
  const [connectionMode, setConnectionMode] = useState<'auto' | 'custom'>('auto');
  const [serverPolicy, setServerPolicy] = useState({ address: '', allow: false });
  const [selectedAddress, setSelectedAddress] = useState('');
  const [mode, setMode] = useState<'account' | 'guest'>('account');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [canUserCreate, setCanUserCreate] = useState(false);
  const [openingRoom, setOpeningRoom] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [roomPassword, setRoomPassword] = useState('');
  const [maxViewers, setMaxViewers] = useState('10'); const [requireApproval, setRequireApproval] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [roomMode, setRoomMode] = useState<RoomMode>('watch-together');
  const address = server ?? savedServer;
  const policyLoading = serverPolicy.address !== address;
  const allowUntrusted = !policyLoading && serverPolicy.allow;
  const setAllowUntrusted = (allow: boolean) => { setServerPolicy({ address, allow }); setSelectedAddress(''); };
  let httpsAddress = false;
  try { httpsAddress = normalizeServerUrl(selectedAddress || address).startsWith('https:'); } catch {}
  useEffect(() => {
    let active = true;
    void readServerPolicy(address).then(allow => { if (active) setServerPolicy({ address, allow }); });
    return () => { active = false; };
  }, [address]);

  const loadRooms = useCallback(async () => {
    if (!session) return;
    setLoadingRooms(true);
    setError('');
    try {
      const data = await request<{ rooms: Room[] }>('/api/rooms');
      setRooms(Array.isArray(data.rooms) ? data.rooms : []);
    } catch (failure) { setError(messageFor(failure)); }
    finally { setLoadingRooms(false); }
  }, [request, session]);

  useEffect(() => {
    if (!session || pathname !== '/') return;
    void Promise.resolve().then(() => { setOpeningRoom(null); return loadRooms(); });
    void request<{ settings: { roomCreationMode?: string } }>('/api/auth/public-settings')
      .then(data => setCanUserCreate(data.settings?.roomCreationMode === 'all-users'))
      .catch(() => {});
  }, [session, pathname, loadRooms, request]);

  // Same two steps as Android / HarmonyOS: resolve the address, then sign in.
  const submit = async () => {
    setBusy(true); setError('');
    try {
      if (connectionMode === 'custom' && !/^https?:\/\//i.test(address.trim())) throw new Error('自定义连接请填写包含 http:// 或 https:// 的完整地址');
      if (!selectedAddress) {
        const resolved = await detectServer(address, allowUntrusted);
        setSelectedAddress(resolved);
        return;
      }
      await login(selectedAddress, mode, username, password, allowUntrusted && selectedAddress.startsWith('https:'));
      setPassword(''); setShowPassword(false);
    }
    catch (failure) { setError(messageFor(failure)); }
    finally { setBusy(false); }
  };

  const disconnect = async (revoke = false) => {
    setBusy(true); setError('');
    try { if (revoke) { await revokeCertificateException(); setAllowUntrusted(false); } else await logout(); setRooms([]); setSelectedAddress(''); setShowPassword(false); }
    catch (failure) { setError(messageFor(failure)); }
    finally { setBusy(false); }
  };

  const createRoom = async () => {
    if (!socket) return;
    setBusy(true); setError('');
    try {
      const ack = await emitAck<{ data?: { roomId: string } }>(socket, 'create-room', {
        name: roomName.trim() || undefined,
        password: roomPassword.trim() || undefined,
        maxViewers: Number(maxViewers),
        requireApproval,
        mode: roomMode,
      }, 15000);
      if (!ack.data?.roomId) throw new Error('服务器未返回房间编号');
      setShowCreate(false); setRoomName(''); setRoomPassword(''); setRequireApproval(false);
      router.push({ pathname: '/room/[roomId]', params: { roomId: ack.data.roomId, asHost: '1', name: roomName.trim() } });
    } catch (failure) { setError(/timeout|超时/i.test(messageFor(failure)) ? '创建房间超时，请刷新列表确认结果' : messageFor(failure)); }
    finally { setBusy(false); }
  };

  const isDisabled = restoring || busy;
  const canCreateRoom = !!session && (canUserCreate || session.user.role === 'admin' || session.user.role === 'root');
  const viewersValid = Number.isInteger(Number(maxViewers)) && Number(maxViewers) >= 1 && Number(maxViewers) <= 100;
  const submitLabel = busy ? '正在连接' : !selectedAddress ? '检测服务器地址' : mode === 'guest' ? '游客登录' : '登录并选择房间';
  const errorBanner = (text: string) => <View accessibilityLiveRegion="polite" style={[styles.error, { borderColor: p.error, borderRadius: Math.min(t.radius, 12), backgroundColor: t.field }]}><Text style={{ color: p.error, fontSize: 13, lineHeight: 19 }}>{text}</Text></View>;

  return (
    <SafeAreaView style={homeLayout.root} edges={['top', 'left', 'right']}>
      {restoring && <View style={[styles.restoring, { backgroundColor: t.glass }]}><ActivityIndicator color={p.accent} size="small" /><Text style={{ color: p.muted, fontSize: 13 }}>正在读取本机登录信息…</Text></View>}
      <ScrollView style={homeLayout.scroll} contentContainerStyle={[styles.content, { paddingBottom: 128 + insets.bottom }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        <GlassCard testID="brand-bar" style={styles.brandBar}>
          <BiliAccount presentation="entry" iconOnly iconWidth={48} />
          <View style={styles.identity}><AppIcon /><View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ color: p.text, fontSize: 16, fontWeight: '800' }}>ZViewer</Text><Text style={{ color: p.muted, fontSize: 11, marginTop: 3 }}>移动端</Text></View></View>
          <View accessible accessibilityRole="text" accessibilityLabel={restoring ? '正在连接服务器' : connected ? '服务器已连接' : '服务器未连接'} style={[styles.pill, { borderColor: p.line, borderRadius: t.radius, backgroundColor: t.glass }]}>
            {restoring ? <ActivityIndicator size="small" color={p.text} /> : <Feather name={connected ? 'wifi' : 'wifi-off'} size={20} color={p.text} />}
          </View>
        </GlassCard>
        <NativePreviewNotice />
        {!session ? <View style={{ paddingTop: Math.min(86, Math.max(46, height * 0.1)) }}>
          <Text accessibilityRole="header" style={[styles.h1, { color: p.text, marginBottom: 30 }]}>连接服务器</Text>
          <GlassCard testID="login-card" style={{ padding: 22 }}>
            <FieldLabel>服务端地址</FieldLabel>
            <InputShell icon="server" value={address} onChangeText={value => { setServer(value); setSelectedAddress(''); }} placeholder="例如 192.168.1.10:3333" autoCapitalize="none" keyboardType="url" editable={!isDisabled} accessibilityLabel="服务端地址" />
            <FieldLabel style={{ marginTop: 16 }}>连接模式</FieldLabel>
            <SelectShell label="连接模式" icon="globe" value={connectionMode} disabled={isDisabled} options={[{ id: 'auto', name: '自动（优先 HTTPS）' }, { id: 'custom', name: '自定义完整地址' }]} onChange={value => { setConnectionMode(value); setSelectedAddress(''); }} />
            <View style={{ marginTop: 6, marginBottom: 6 }}><Checkbox label="允许此服务器使用不受信任的证书" value={allowUntrusted} disabled={isDisabled || policyLoading} onChange={setAllowUntrusted} /></View>
            {allowUntrusted ? <Text style={[styles.note, { color: p.text }]}>仅为当前服务器启用证书例外；独立语音服务器仍验证证书。{!httpsAddress && selectedAddress ? '当前地址为 HTTP，证书例外不适用。' : ''}</Text> : null}
            {selectedAddress ? <Text style={[styles.note, { color: p.text }]}>连接地址：{selectedAddress}</Text> : null}
            <Segmented label="登录方式" value={mode} disabled={isDisabled} onChange={setMode} options={[{ id: 'account', name: '账号登录', icon: 'user' }, { id: 'guest', name: '游客进入', icon: 'globe' }]} />
            {mode === 'account' ? <View style={{ marginTop: 18 }}>
              <FieldLabel>用户名</FieldLabel>
              <InputShell icon="user" value={username} onChangeText={setUsername} autoCapitalize="none" textContentType="username" autoComplete="username" placeholder="用户名" editable={!isDisabled} accessibilityLabel="用户名" />
              <FieldLabel style={{ marginTop: 16 }}>密码</FieldLabel>
              <InputShell icon="lock" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} textContentType="password" autoComplete="current-password" placeholder="密码" editable={!isDisabled} accessibilityLabel="密码"
                trailing={<Pressable accessibilityRole="button" accessibilityLabel={showPassword ? '隐藏密码' : '显示密码'} onPress={() => setShowPassword(value => !value)} style={styles.eye}><Feather name={showPassword ? 'eye-off' : 'eye'} size={19} color={p.muted} /></Pressable>} />
            </View> : <View style={[styles.guest, { borderColor: p.accent, borderRadius: t.radius, backgroundColor: t.glass }]}>
              <Feather name="shield" size={22} color={p.accent} />
              <View style={{ flex: 1, gap: 4 }}><Text style={{ color: p.text, fontSize: 14, fontWeight: '700' }}>以 guest 身份进入</Text><Text style={{ color: p.muted, fontSize: 12, lineHeight: 18 }}>可以浏览和加入房间，部分管理功能不可用。</Text></View>
            </View>}
            {error || connectionError ? errorBanner(error || connectionError) : null}
            <PrimaryButton label={submitLabel} icon="log-in" busy={busy} disabled={isDisabled || policyLoading} onPress={() => void submit()} />
          </GlassCard>
          <View style={[styles.security, { borderColor: p.line, borderRadius: t.radius, backgroundColor: p.surface }]}>
            <Feather name="shield" size={16} color={p.text} style={{ marginTop: 2 }} /><Text style={{ flex: 1, color: p.text, fontSize: 12, lineHeight: 19 }}>推荐使用 HTTPS 服务地址；局域网测试可使用 HTTP。</Text>
          </View>
        </View> : <>
          <GlassCard style={[styles.toolbar, { marginTop: 25 }]}>
            <GlassIconButton label="更换服务器" icon="arrow-left" disabled={busy} onPress={() => void disconnect()} />
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Text numberOfLines={1} style={{ color: p.text, fontSize: 16, fontWeight: '800' }}>{session.user.username}</Text>
              <Text numberOfLines={1} style={{ color: p.muted, fontSize: 13 }}>{session.serverUrl}</Text>
              {certificateException ? <Pressable accessibilityRole="button" accessibilityLabel="撤销服务器证书例外并断开" disabled={busy} onPress={() => void disconnect(true)} style={{ minHeight: 32, justifyContent: 'center' }}><Text style={{ color: p.accent, fontSize: 12 }}>证书例外已启用 · 撤销并断开</Text></Pressable> : null}
            </View>
            <GlassIconButton label="刷新房间" disabled={loadingRooms} onPress={() => void loadRooms()}>{loadingRooms ? <ActivityIndicator size="small" color={p.text} /> : <Feather name="refresh-cw" size={20} color={p.text} />}</GlassIconButton>
          </GlassCard>
          <GlassCard style={styles.heading}>
            <View style={{ flex: 1, minWidth: 0 }}><Text style={[home.eyebrow(p.accent), { marginBottom: 10 }]}>在线放映室</Text><Text accessibilityRole="header" style={[styles.h1, { color: p.text }]}>选择房间</Text></View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              {session.user.role !== 'guest' ? <Pressable accessibilityRole="button" accessibilityLabel={canCreateRoom ? '创建房间' : '创建房间，服务器当前仅允许管理员创建房间'} accessibilityState={{ disabled: !canCreateRoom }} disabled={!canCreateRoom} onPress={() => setShowCreate(true)}
                style={[styles.create, { borderRadius: t.radius, backgroundColor: canCreateRoom ? p.accent : p.container, borderColor: canCreateRoom ? 'transparent' : p.line }]}>
                <Feather name="plus" size={18} color={canCreateRoom ? p.onAccent : p.muted} /><Text style={{ color: canCreateRoom ? p.onAccent : p.muted, fontSize: 14, fontWeight: '800' }}>创建</Text>
              </Pressable> : null}
              <View accessible accessibilityLabel={`${rooms.length} 个房间`} style={[styles.count, { borderColor: p.line, borderRadius: t.radius, backgroundColor: t.glass }]}><Text style={{ color: p.text, fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{rooms.length}</Text></View>
            </View>
          </GlassCard>
          {session.user.role !== 'guest' && !canCreateRoom ? <View style={[styles.permission, { borderLeftColor: p.muted, backgroundColor: t.glass }]}><Text style={{ color: p.text, fontSize: 12, lineHeight: 18 }}>服务器当前仅允许管理员创建房间，请在后台开启“所有用户”权限。</Text></View> : null}
          {error ? errorBanner(error) : null}
          <View style={{ gap: 10 }}>
            {loadingRooms && rooms.length === 0 ? <GlassCard style={styles.empty}><ActivityIndicator color={p.muted} /><Text style={{ color: p.muted, fontSize: 13 }}>正在获取房间</Text></GlassCard>
              : rooms.length === 0 ? <GlassCard style={styles.empty}><Feather name="users" size={30} color={p.muted} /><Text style={{ color: p.text, fontSize: 15, fontWeight: '700' }}>当前没有开放房间</Text><Text style={{ color: p.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', maxWidth: 240 }}>稍后刷新，或由管理员创建房间。</Text></GlassCard>
              : rooms.map(room => <Pressable key={room.roomId} accessibilityRole="button" accessibilityLabel={`${room.name || `房间 ${room.roomId}`}，${roomMeta(room.mode)}，${room.viewerCount}/${room.maxViewers} 人${room.hasPassword ? '，需密码' : ''}${room.requireApproval ? '，需批准' : ''}${room.sharerOnline ? '，房主在线' : ''}`} disabled={openingRoom !== null}
                onPress={() => { setOpeningRoom(room.roomId); router.push({ pathname: '/room/[roomId]', params: { roomId: room.roomId, name: room.name, hasPassword: room.hasPassword ? '1' : '0' } }); }}>
                {({ pressed }) => <GlassCard style={[styles.room, pressed && { borderColor: p.accent }, openingRoom !== null && openingRoom !== room.roomId && { opacity: .68 }]}>
                  <View style={[styles.status, { borderRadius: t.radius, backgroundColor: room.sharerOnline ? p.container : '#252d32' }]}><Feather name={room.sharerOnline ? 'check-circle' : 'users'} size={20} color={room.sharerOnline ? p.accent : '#85939a'} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, minWidth: 0 }}><Text numberOfLines={1} style={{ flexShrink: 1, color: p.text, fontSize: 17, fontWeight: '700' }}>{room.name || `房间 ${room.roomId}`}</Text>{room.hasPassword ? <Feather name="lock" size={14} color={p.text} /> : null}</View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 5, marginTop: 7 }}><Text style={styles.meta(p.muted)}>{roomMeta(room.mode)}</Text><Text style={styles.meta(p.muted)}>{room.viewerCount}/{room.maxViewers} 人</Text>{room.requireApproval ? <Text style={styles.meta(p.muted)}>需批准</Text> : null}</View>
                  </View>
                  {openingRoom === room.roomId ? <ActivityIndicator size="small" color={p.text} /> : <Feather name="arrow-right" size={20} color={p.text} />}
                </GlassCard>}
              </Pressable>)}
          </View>
        </>}
      </ScrollView>
      <HomeShortcuts openAppearance={theme.open} />
      <Modal visible={showCreate} transparent animationType={theme.preferences.reduceMotion ? 'none' : 'slide'} supportedOrientations={['portrait', 'portrait-upside-down', 'landscape']} onRequestClose={() => { if (!busy) setShowCreate(false); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingTop: Math.max(24, insets.top), backgroundColor: 'rgba(8,15,25,0.58)' }}>
          <Pressable accessible={false} onPress={() => { if (!busy) setShowCreate(false); }} style={StyleSheet.absoluteFill} />
          <Surface readable accessibilityViewIsModal testID="create-room-sheet" style={{ width: '100%', maxWidth: 560, maxHeight: '100%', borderWidth: 1, borderBottomWidth: 0, borderColor: p.line, borderTopLeftRadius: t.radius, borderTopRightRadius: t.radius }}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 22, paddingHorizontal: 20, paddingBottom: Math.max(22, insets.bottom) }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 22 }}>
                <View style={{ flex: 1 }}><Text style={[home.eyebrow(p.accent), { marginBottom: 6 }]}>新的放映室</Text><Text accessibilityRole="header" style={{ color: p.text, fontSize: 25, fontWeight: '500' }}>创建房间</Text></View>
                <Pressable accessibilityRole="button" accessibilityLabel="关闭" disabled={busy} onPress={() => setShowCreate(false)} style={styles.eye}><Feather name="x" size={21} color={p.text} /></Pressable>
              </View>
              <FieldLabel>房间名称</FieldLabel>
              <InputShell compact icon="users" value={roomName} onChangeText={setRoomName} placeholder="留空将自动生成" maxLength={80} accessibilityLabel="房间名称" />
              <FieldLabel style={{ marginTop: 19 }}>房间模式</FieldLabel>
              <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 7 }}>
                {roomModeOptions.map(option => { const active = roomMode === option.id; return <Pressable key={option.id} accessibilityRole="radio" accessibilityLabel={option.name} accessibilityState={{ checked: active }} onPress={() => setRoomMode(option.id)}
                  style={{ flex: 1, minWidth: 0, minHeight: 74, alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 8, paddingHorizontal: 4, borderWidth: 1, borderColor: active ? p.accent : p.line, borderRadius: t.radius, backgroundColor: active ? p.accent : t.field }}>
                  <Feather name={option.icon} size={20} color={active ? p.onAccent : p.muted} /><Text style={{ color: active ? p.onAccent : p.muted, fontSize: 14 }}>{option.name}</Text>
                </Pressable>; })}
              </View>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 19 }}>
                <View style={{ flex: 1.4, minWidth: 0 }}><FieldLabel>房间密码</FieldLabel><InputShell compact icon="lock" value={roomPassword} onChangeText={setRoomPassword} placeholder="可选" secureTextEntry accessibilityLabel="房间密码" /></View>
                <View style={{ flex: .6, minWidth: 110 }}><FieldLabel>人数上限</FieldLabel><InputShell compact icon="users" value={maxViewers} onChangeText={setMaxViewers} keyboardType="number-pad" accessibilityLabel="人数上限" /></View>
              </View>
              <View style={[styles.approval, { borderColor: p.line, borderRadius: t.radius, backgroundColor: t.field }]}>
                <View style={{ flex: 1, gap: 4 }}><Text style={{ color: p.text, fontSize: 14, fontWeight: '700' }}>入房需要批准</Text><Text style={{ color: p.muted, fontSize: 12 }}>观众加入前由房主确认</Text></View>
                <Switch accessibilityLabel="入房需要批准" value={requireApproval} onValueChange={setRequireApproval} trackColor={{ false: p.line, true: p.accent }} />
              </View>
              {!viewersValid ? <Text style={{ color: p.error, fontSize: 12, marginTop: 8 }}>人数上限需为 1–100 的整数</Text> : null}
              {error && showCreate ? errorBanner(error) : null}
              <PrimaryButton label={busy ? '正在创建' : '创建并进入房间'} icon="plus" busy={busy} disabled={busy || !connected || !viewersValid} onPress={() => void createRoom()} />
            </ScrollView>
          </Surface>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = {
  ...StyleSheet.create({
    content: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 18 },
    restoring: { flexDirection: 'row', flexShrink: 0, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, marginHorizontal: 20, marginBottom: 8, borderRadius: 10 },
    brandBar: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14 },
    identity: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
    pill: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, flexShrink: 0 },
    h1: { fontSize: 26, lineHeight: 34, fontWeight: '500' },
    note: { fontSize: 12, lineHeight: 19, marginBottom: 12 },
    eye: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
    guest: { flexDirection: 'row', gap: 12, marginTop: 18, padding: 14, borderWidth: 1 },
    error: { marginTop: 16, paddingVertical: 11, paddingHorizontal: 13, borderWidth: 1 },
    security: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 16, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1 },
    toolbar: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14 },
    heading: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 14, marginBottom: 10, paddingVertical: 18, paddingHorizontal: 14 },
    create: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, borderWidth: 1 },
    count: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    permission: { marginBottom: 12, paddingVertical: 10, paddingHorizontal: 12, borderLeftWidth: 3 },
    empty: { minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 9, padding: 16, borderStyle: 'dashed' },
    room: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 82, padding: 14 },
    status: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
    approval: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 19, paddingVertical: 13, paddingHorizontal: 14, borderWidth: 1 },
  }),
  meta: (color: string) => ({ color, fontSize: 13 }),
};
