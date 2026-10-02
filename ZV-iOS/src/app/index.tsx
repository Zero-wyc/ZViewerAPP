import { useAppearance } from '@/state/appearance';
import { router, usePathname } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { SafeAreaView } from 'react-native-safe-area-context';

import { emitAck } from '@/lib/socket';
import { messageFor, type Room } from '@/lib/server';
import { useSession } from '@/state/session';
import { homeLayout } from '@/lib/homeLayout';
import { NativePreviewNotice } from '@/components/NativePreviewNotice';
import { Surface } from '@/components/Surface';
import { AppDialog } from '@/components/AppDialog';
import { RoomIconButton } from '@/components/RoomUi';
import { BiliAccount } from '@/components/BiliAccount';

function Action({ label, onPress, disabled = false, secondary = false, inRow = false }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean; inRow?: boolean }) {
  const theme = useAppearance();
  const styles = StyleSheet.create({
    action: { ...homeLayout.action, backgroundColor: theme.color('#65d59b', 'backgroundColor'), borderRadius: theme.preferences.radius, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center' },
    secondary: { backgroundColor: theme.color('#1b2024', 'backgroundColor'), borderWidth: 1, borderColor: theme.color('#343d41') },
    disabled: { opacity: 0.45 },
    actionText: { color: theme.color('#111417'), fontWeight: '700' },
    secondaryText: { color: theme.color('#edf1ef') },
  });

  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.action, inRow && homeLayout.rowAction, secondary && styles.secondary, disabled && styles.disabled]}><Text style={[styles.actionText, secondary && styles.secondaryText]}>{label}</Text></Pressable>;
}

export default function HomeScreen() {
  const compactHeader = useWindowDimensions().width < 440;
  const theme = useAppearance();
  const styles = StyleSheet.create({
    root: { ...homeLayout.root, backgroundColor: theme.color('#111417', 'backgroundColor') },
    content: { width: '100%', maxWidth: 640, alignSelf: 'center', padding: 20, gap: 13, paddingBottom: 48 },
    header: { flexDirection: compactHeader ? 'column' : 'row', alignItems: compactHeader ? 'stretch' : 'center', gap: 13, padding: 14, borderWidth: 1, borderColor: theme.color('#343d41'), borderRadius: theme.preferences.radius, backgroundColor: theme.color('#1b2024', 'backgroundColor') },
    brand: { width: 44, height: 44, borderRadius: theme.preferences.radius, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color('#65d59b', 'backgroundColor') },
    title: { color: theme.color('#edf1ef'), fontSize: 23, fontWeight: '700' },
    heading: { color: theme.color('#edf1ef'), fontSize: 27, fontWeight: '700' },
    label: { color: theme.color('#a8b3b6'), marginTop: 3 },
    muted: { color: theme.color('#a8b3b6'), fontSize: 13 },
    input: { borderWidth: 1, borderColor: theme.color('#343d41'), borderRadius: theme.preferences.radius, backgroundColor: theme.color('#1b2024', 'backgroundColor'), color: theme.color('#edf1ef'), paddingHorizontal: 14, minHeight: 48 },
    row: { flexDirection: 'row', gap: 8 },
    error: { color: theme.color('#ffaaa5'), backgroundColor: theme.color('#452a32', 'backgroundColor'), padding: 12, borderRadius: 10 },
    hint: { color: theme.color('#a8b3b6'), fontSize: 12, lineHeight: 18 },
    account: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.color('#1b2024', 'backgroundColor'), padding: 14, borderRadius: theme.preferences.radius, borderWidth: 1, borderColor: theme.color('#343d41') },
    accountName: { color: theme.color('#edf1ef'), fontSize: 18, fontWeight: '700' },
    online: { color: theme.color('#65d59b') },
    offline: { color: theme.color('#ffaaa5') },
    toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderWidth: 1, borderColor: theme.color('#343d41'), borderRadius: theme.preferences.radius, padding: 16, backgroundColor: theme.color('#1b2024', 'backgroundColor') },
    empty: { color: theme.color('#a8b3b6'), textAlign: 'center', marginVertical: 24 },
    room: { backgroundColor: theme.color('#1b2024', 'backgroundColor'), borderWidth: 1, borderColor: theme.color('#343d41'), borderRadius: theme.preferences.radius, padding: 16, gap: 6, flexDirection: 'row', alignItems: 'center' },
    roomTitle: { color: theme.color('#edf1ef'), fontSize: 18, fontWeight: '700' },
    create: { backgroundColor: theme.color('#1b2024', 'backgroundColor'), borderRadius: 14, padding: 14, gap: 10 },
    restoringBanner: { flexDirection: 'row', flexShrink: 0, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.color('#1b2024', 'backgroundColor'), padding: 12, marginHorizontal: 20, marginBottom: 12, borderRadius: 10 },
    restoringText: { color: theme.color('#a8b3b6'), fontSize: 13 },
  });

  const { session, savedServer, restoring, socket, connected, login, logout, request } = useSession();
  const pathname = usePathname();
  const [server, setServer] = useState<string | null>(null);
  const [mode, setMode] = useState<'account' | 'guest'>('account');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [canUserCreate, setCanUserCreate] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [roomPassword, setRoomPassword] = useState('');
  const [maxViewers, setMaxViewers] = useState('10'); const [requireApproval, setRequireApproval] = useState(false);
  const [showPassword, setShowPassword] = useState(false); const [biliAccount, setBiliAccount] = useState(false);
  const [roomMode, setRoomMode] = useState<'watch-together' | 'listen-together'>('watch-together');

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
    void Promise.resolve().then(loadRooms);
    void request<{ settings: { roomCreationMode?: string } }>('/api/auth/public-settings')
      .then(data => setCanUserCreate(data.settings?.roomCreationMode === 'all-users'))
      .catch(() => {});
  }, [session, pathname, loadRooms, request]);

  const signIn = async () => {
    setBusy(true); setError('');
    try { await login(server ?? savedServer, mode, username, password); setPassword(''); }
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
      setShowCreate(false); setRoomName(''); setRoomPassword('');
      router.push({ pathname: '/room/[roomId]', params: { roomId: ack.data.roomId, asHost: '1', name: roomName.trim() } });
    } catch (failure) { setError(messageFor(failure)); }
    finally { setBusy(false); }
  };

  const isDisabled = restoring || busy;

  return (
    <SafeAreaView style={styles.root}>
      <View style={{ position: 'absolute', top: 16, right: 16, zIndex: 50, borderRadius: 24, backgroundColor: theme.color('#1b2024', 'backgroundColor') }}><RoomIconButton label="全局外观" icon="sliders" onPress={theme.open} /></View>
      {restoring && <View style={styles.restoringBanner}><ActivityIndicator color={theme.color('#65d59b')} size="small" /><Text style={styles.restoringText}>正在读取本机登录信息…</Text></View>}
      <ScrollView style={homeLayout.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        <Surface readable style={styles.header}>
          <View style={{ flex: compactHeader ? undefined : 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 13, paddingRight: compactHeader ? 40 : 0 }}>
            <View style={styles.brand}><Text style={{ fontSize: 26, fontWeight: '700', color: theme.color('#111417') }}>Z</Text></View>
            <View style={{ flex: 1, minWidth: 0 }}><Text style={styles.title} numberOfLines={1}>ZViewer</Text><Text style={styles.muted}>移动端</Text></View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
            <Pressable accessibilityRole="button" accessibilityLabel="B站账号" onPress={() => setBiliAccount(true)} style={{ minHeight: 44, paddingHorizontal: 6, justifyContent: 'center' }}><Text style={{ color: theme.color('#65d59b'), fontSize: 14, fontWeight: '600' }}>B站账号</Text></Pressable>
            <Text style={connected ? styles.online : styles.muted}>{connected ? '● 在线' : restoring ? '连接中' : '未连接'}</Text>
          </View>
        </Surface>
        <NativePreviewNotice />
        {!session ? <>
          <Surface readable testID="connection-heading" style={{ borderRadius: theme.preferences.radius, padding: 12 }}><Text style={styles.heading}>连接服务器</Text></Surface>
          <Surface testID="login-card" style={[styles.create, { padding: 22, borderWidth: 1, borderColor: theme.color('#343d41') }]}>
          <Text style={styles.label}>服务端地址</Text>
          <TextInput style={styles.input} value={server ?? savedServer} onChangeText={setServer} placeholder="https://example.com" placeholderTextColor={theme.color('#a8b3b6')} autoCapitalize="none" keyboardType="url" autoCorrect={false} editable={!isDisabled} />
          <View style={styles.row}><Action inRow label="账号登录" onPress={() => setMode('account')} secondary={mode !== 'account'} disabled={isDisabled} /><Action inRow label="游客进入" onPress={() => setMode('guest')} secondary={mode !== 'guest'} disabled={isDisabled} /></View>
          {mode === 'account' ? <><Text style={styles.label}>用户名</Text><TextInput style={styles.input} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} textContentType="username" placeholder="用户名" placeholderTextColor={theme.color('#a8b3b6')} editable={!isDisabled} /><Text style={styles.label}>密码</Text><View style={[styles.input, { flexDirection: 'row', alignItems: 'center' }]}><TextInput style={{ flex: 1, minHeight: 48, color: theme.color('#edf1ef') }} value={password} onChangeText={setPassword} secureTextEntry={!showPassword} textContentType="password" placeholder="密码" placeholderTextColor={theme.color('#a8b3b6')} editable={!isDisabled} /><RoomIconButton label={showPassword ? '隐藏密码' : '显示密码'} icon={showPassword ? 'eye-off' : 'eye'} onPress={() => setShowPassword(value => !value)} /></View></> : <View style={styles.account}><Feather name="shield" size={22} color={theme.color('#65d59b')} /><View style={{ flex: 1 }}><Text style={styles.accountName}>以 guest 身份进入</Text><Text style={styles.muted}>可以浏览和加入房间，部分管理功能不可用。</Text></View></View>}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Action label={busy ? '连接中…' : mode === 'guest' ? '游客登录' : '登录并选择房间'} onPress={() => void signIn()} disabled={isDisabled} />
          </Surface><Surface readable testID="connection-help" style={{ borderRadius: theme.preferences.radius, padding: 12 }}><Text style={[styles.hint, { fontSize: 14, lineHeight: 20 }]}>推荐使用 HTTPS 服务地址；局域网测试可使用 HTTP。</Text></Surface>
        </> : <>
          <Surface style={styles.account}><RoomIconButton label="退出登录 / 更换服务器" icon="arrow-left" onPress={() => void logout().catch(failure => setError(messageFor(failure)))} /><View style={{ flex: 1 }}><Text style={styles.accountName}>{session.user.username}</Text><Text style={styles.muted} numberOfLines={1}>{session.serverUrl}</Text></View><RoomIconButton label="刷新房间" icon="refresh-cw" onPress={() => { if (!loadingRooms) void loadRooms(); }} /></Surface>
          <Surface style={styles.toolbar}><View style={{ flex: 1 }}><Text style={[styles.muted, { color: theme.color('#65d59b') }]}>在线放映室</Text><Text style={styles.heading}>选择房间</Text></View>{session.user.role !== 'guest' && (canUserCreate || session.user.role === 'admin' || session.user.role === 'root') ? <Action label="创建房间" onPress={() => setShowCreate(true)} secondary /> : null}<Text style={styles.accountName}>{rooms.length}</Text></Surface>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {rooms.length === 0 && !loadingRooms ? <Text style={styles.empty}>当前没有开放房间</Text> : null}
          {rooms.map(room => <Pressable accessibilityRole="button" key={room.roomId} style={styles.room} onPress={() => router.push({ pathname: '/room/[roomId]', params: { roomId: room.roomId, name: room.name, hasPassword: room.hasPassword ? '1' : '0' } })}><Feather name="users" size={24} color={theme.color('#65d59b')} /><View style={{ flex: 1 }}><Text style={styles.roomTitle}>{room.name || room.roomId}</Text><Text style={styles.muted}>{room.mode === 'listen-together' ? '一起听' : room.mode === 'screen-share' ? '屏幕共享' : '同步观影'} · {room.viewerCount}/{room.maxViewers} 人{room.hasPassword ? ' · 需密码' : ''}{room.requireApproval ? ' · 需审批' : ''}</Text></View><Feather name="arrow-right" size={20} color={theme.color('#a8b3b6')} /></Pressable>)}
          <AppDialog visible={showCreate} title="创建房间" close={() => { if (!busy) setShowCreate(false); }}><Text style={styles.label}>房间名称</Text><TextInput style={styles.input} value={roomName} onChangeText={setRoomName} placeholder="可留空" placeholderTextColor={theme.color('#a8b3b6')} maxLength={80} /><Text style={styles.label}>房间密码</Text><TextInput style={styles.input} value={roomPassword} onChangeText={setRoomPassword} placeholder="可留空" placeholderTextColor={theme.color('#a8b3b6')} secureTextEntry /><View style={styles.row}><Action inRow label="同步观影" onPress={() => setRoomMode('watch-together')} secondary={roomMode !== 'watch-together'} /><Action inRow label="一起听" onPress={() => setRoomMode('listen-together')} secondary={roomMode !== 'listen-together'} /></View><Text style={styles.label}>人数上限</Text><TextInput style={styles.input} accessibilityLabel="人数上限" value={maxViewers} onChangeText={setMaxViewers} keyboardType="number-pad" /><View style={styles.toolbar}><View style={{ flex: 1 }}><Text style={styles.label}>入房需要批准</Text><Text style={styles.muted}>观众加入前由房主确认</Text></View><Switch value={requireApproval} onValueChange={setRequireApproval} /></View><Action label={busy ? '创建中…' : '确认创建'} onPress={() => void createRoom()} disabled={busy || !connected || !Number.isInteger(Number(maxViewers)) || Number(maxViewers) < 1 || Number(maxViewers) > 100} /></AppDialog>
        </>}
      </ScrollView>
      <AppDialog visible={biliAccount} title="B站账号" close={() => setBiliAccount(false)}><BiliAccount /></AppDialog>
    </SafeAreaView>
  );
}
