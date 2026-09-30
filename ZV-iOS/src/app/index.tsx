import { router, usePathname } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { emitAck } from '@/lib/socket';
import { messageFor, type Room } from '@/lib/server';
import { useSession } from '@/state/session';

const colors = { bg: '#111417', card: '#1b2024', line: '#343d41', text: '#edf1ef', muted: '#a8b3b6', accent: '#65d59b', error: '#ffaaa5' };

function Action({ label, onPress, disabled = false, secondary = false }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.action, secondary && styles.secondary, disabled && styles.disabled]}><Text style={[styles.actionText, secondary && styles.secondaryText]}>{label}</Text></Pressable>;
}

export default function HomeScreen() {
  const { session, savedServer, restoring, socket, connected, login, logout, request } = useSession();
  const pathname = usePathname();
  const [server, setServer] = useState('');
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
    try { await login(server || savedServer, mode, username, password); setPassword(''); }
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
        maxViewers: 10,
        requireApproval: false,
        mode: roomMode,
      }, 15000);
      if (!ack.data?.roomId) throw new Error('服务器未返回房间编号');
      setShowCreate(false); setRoomName(''); setRoomPassword('');
      router.push({ pathname: '/room/[roomId]', params: { roomId: ack.data.roomId, asHost: '1', name: roomName.trim() } });
    } catch (failure) { setError(messageFor(failure)); }
    finally { setBusy(false); }
  };

  if (restoring) return <SafeAreaView style={styles.root}><View style={styles.center}><ActivityIndicator color={colors.accent} /><Text style={styles.muted}>正在恢复会话…</Text></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}><Image source={require('../../assets/images/zviewer-icon.png')} style={styles.brand} /><View><Text style={styles.title}>ZViewer</Text><Text style={styles.muted}>iOS 客户端</Text></View></View>
        {!session ? <>
          <Text style={styles.heading}>连接服务器</Text>
          <Text style={styles.label}>服务端地址</Text>
          <TextInput style={styles.input} value={server || savedServer} onChangeText={setServer} placeholder="https://example.com" placeholderTextColor={colors.muted} autoCapitalize="none" keyboardType="url" autoCorrect={false} />
          <View style={styles.row}><Action label="账号登录" onPress={() => setMode('account')} secondary={mode !== 'account'} /><Action label="游客进入" onPress={() => setMode('guest')} secondary={mode !== 'guest'} /></View>
          {mode === 'account' && <><Text style={styles.label}>用户名</Text><TextInput style={styles.input} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} textContentType="username" placeholder="用户名" placeholderTextColor={colors.muted} /><Text style={styles.label}>密码</Text><TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry textContentType="password" placeholder="密码" placeholderTextColor={colors.muted} /></>}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Action label={busy ? '连接中…' : mode === 'guest' ? '游客登录' : '登录并选择房间'} onPress={() => void signIn()} disabled={busy} />
          <Text style={styles.hint}>推荐 HTTPS。HTTP 局域网地址需要额外的 iOS 网络权限配置。</Text>
        </> : <>
          <View style={styles.account}><View style={{ flex: 1 }}><Text style={styles.accountName}>{session.user.username}</Text><Text style={styles.muted} numberOfLines={1}>{session.serverUrl}</Text></View><Text style={connected ? styles.online : styles.offline}>{connected ? '● 在线' : '○ 重连中'}</Text></View>
          <View style={styles.toolbar}><Text style={styles.heading}>选择房间</Text><Action label={loadingRooms ? '刷新中' : '刷新'} onPress={() => void loadRooms()} disabled={loadingRooms} secondary /></View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {rooms.length === 0 && !loadingRooms ? <Text style={styles.empty}>当前没有开放房间</Text> : null}
          {rooms.map(room => <Pressable key={room.roomId} style={styles.room} onPress={() => router.push({ pathname: '/room/[roomId]', params: { roomId: room.roomId, name: room.name, hasPassword: room.hasPassword ? '1' : '0' } })}><Text style={styles.roomTitle}>{room.name || room.roomId}</Text><Text style={styles.muted}>{room.mode === 'listen-together' ? '一起听' : room.mode === 'screen-share' ? '屏幕共享' : '同步观影'} · {room.viewerCount}/{room.maxViewers} 人{room.hasPassword ? ' · 需密码' : ''}{room.requireApproval ? ' · 需审批' : ''}</Text></Pressable>)}
          {session.user.role !== 'guest' && (canUserCreate || session.user.role === 'admin' || session.user.role === 'root') ? <Action label={showCreate ? '取消创建' : '创建房间'} onPress={() => setShowCreate(value => !value)} secondary /> : null}
          {showCreate && <View style={styles.create}><Text style={styles.label}>房间名称</Text><TextInput style={styles.input} value={roomName} onChangeText={setRoomName} placeholder="可留空" placeholderTextColor={colors.muted} /><Text style={styles.label}>房间密码</Text><TextInput style={styles.input} value={roomPassword} onChangeText={setRoomPassword} placeholder="可留空" placeholderTextColor={colors.muted} secureTextEntry /><View style={styles.row}><Action label="同步观影" onPress={() => setRoomMode('watch-together')} secondary={roomMode !== 'watch-together'} /><Action label="一起听" onPress={() => setRoomMode('listen-together')} secondary={roomMode !== 'listen-together'} /></View><Action label={busy ? '创建中…' : '确认创建'} onPress={() => void createRoom()} disabled={busy || !connected} /></View>}
          <Action label="退出登录 / 更换服务器" onPress={() => void logout()} secondary />
        </>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg }, content: { width: '100%', maxWidth: 640, alignSelf: 'center', padding: 20, gap: 13, paddingBottom: 48 }, center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }, header: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 18 }, brand: { width: 44, height: 44, borderRadius: 14 }, title: { color: colors.text, fontSize: 23, fontWeight: '700' }, heading: { color: colors.text, fontSize: 27, fontWeight: '700' }, label: { color: colors.muted, marginTop: 3 }, muted: { color: colors.muted, fontSize: 13 }, input: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.card, color: colors.text, paddingHorizontal: 14, minHeight: 48 }, row: { flexDirection: 'row', gap: 8 }, action: { backgroundColor: colors.accent, borderRadius: 12, minHeight: 44, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center', flexGrow: 1 }, secondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line }, disabled: { opacity: 0.45 }, actionText: { color: colors.bg, fontWeight: '700' }, secondaryText: { color: colors.text }, error: { color: colors.error, backgroundColor: '#452a32', padding: 12, borderRadius: 10 }, hint: { color: colors.muted, fontSize: 12, lineHeight: 18 }, account: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, padding: 14, borderRadius: 14 }, accountName: { color: colors.text, fontSize: 18, fontWeight: '700' }, online: { color: '#73d9ab' }, offline: { color: colors.error }, toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, empty: { color: colors.muted, textAlign: 'center', marginVertical: 24 }, room: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 16, gap: 6 }, roomTitle: { color: colors.text, fontSize: 18, fontWeight: '700' }, create: { backgroundColor: colors.card, borderRadius: 14, padding: 14, gap: 10 },
});
