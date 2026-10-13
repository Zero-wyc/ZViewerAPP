import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/state/session';
import { useAppearance } from '@/state/appearance';
import { emitAck } from '@/lib/socket';
import { messageFor } from '@/lib/server';
import { readPreference, writePreference } from '@/lib/preferences';
import { AppDialog } from './AppDialog';
import { RoomButton, RoomInput, ui as baseUi } from './RoomUi';
type Comment = { id: number; username: string; content: string };
export function RoomDiscussion({ roomId, close }: { roomId: string; close: () => void }) {
  const { socket } = useSession(); const theme = useAppearance(); const ui = theme.styles(baseUi);
  const [comments, setComments] = useState<Comment[]>([]); const [draft, setDraft] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const active = useRef(true);
  useEffect(() => {
    active.current = true; let current = true;
    const receive = (item: Comment) => { if (active.current) setComments(values => values.some(value => value.id === item.id) ? values : [...values.slice(-99), item]); };
    socket?.on('new-comment', receive);
    if (socket?.connected) void emitAck<{ comments: Comment[] }>(socket, 'comment-history', { roomId }).then(data => { if (current) setComments(values => [...new Map([...data.comments, ...values].map(item => [item.id, item])).values()].slice(-100)); }).catch(failure => { if (current) setError(messageFor(failure)); });
    return () => { active.current = false; current = false; socket?.off('new-comment', receive); };
  }, [socket, roomId]);
  const send = async () => {
    if (!socket?.connected || busy || !draft.trim()) return; setBusy(true); setError('');
    try { await emitAck(socket, 'send-comment', { roomId, content: draft.trim(), isDanmaku: false }); if (active.current) setDraft(''); }
    catch (failure) { if (active.current) setError(messageFor(failure)); } finally { if (active.current) setBusy(false); }
  };
  return <AppDialog visible title="房间评论" close={close}><Text style={ui.muted}>与房间成员聊天</Text><ScrollView style={{ maxHeight: 300 }} contentContainerStyle={{ gap: 10 }}>{comments.length ? comments.map(item => <View key={item.id} style={ui.card}><Text style={ui.muted}>{item.username}</Text><Text style={ui.text}>{item.content}</Text></View>) : <Text style={ui.muted}>暂无评论，快来第一条吧</Text>}</ScrollView><View style={ui.row}><RoomInput value={draft} onChangeText={setDraft} placeholder="发送房间评论" maxLength={1000} style={{ flex: 1, minWidth: 130 }} /><RoomButton label="发送" disabled={busy || !draft.trim() || !socket?.connected} onPress={() => void send()} /></View>{error ? <Text style={ui.error}>{error}</Text> : null}</AppDialog>;
}

export function RoomCommentButton({ onPress }: { onPress: () => void }) {
  const theme = useAppearance(); const insets = useSafeAreaInsets();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [position, setPosition] = useState({ x: 1, y: .28 });
  const current = useRef(position); const interacted = useRef(false); const origin = useRef({ x: 0, y: 0 });
  const moved = useRef(false);
  const suppressPressUntil = useRef(0);
  const key = 'zviewer-room-comment-position-v1';
  useEffect(() => {
    let active = true;
    void readPreference(key, { x: 1, y: .28 }).then(value => {
      if (!active || interacted.current) return;
      const coordinate = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
      const next = { x: coordinate(value.x, 1), y: coordinate(value.y, .28) }; current.current = next; setPosition(next);
    });
    return () => { active = false; };
  }, []);
  const bounds = useMemo(() => {
    const left = Math.min(16 + insets.left, Math.max(0, size.width - 52));
    const top = Math.min(16 + insets.top, Math.max(0, size.height - 52));
    return { left, top, width: Math.max(0, size.width - 52 - 16 - insets.right - left), height: Math.max(0, size.height - 52 - 16 - insets.bottom - top) };
  }, [size, insets.left, insets.right, insets.top, insets.bottom]);
  const drag = useMemo(() => {
    const move = (dx: number, dy: number) => {
      const x = Math.max(0, Math.min(bounds.width, origin.current.x + dx - bounds.left));
      const y = Math.max(0, Math.min(bounds.height, origin.current.y + dy - bounds.top));
      const next = { x: bounds.width ? x / bounds.width : 0, y: bounds.height ? y / bounds.height : 0 };
      current.current = next; setPosition(next);
    };
    const save = () => { void writePreference(key, current.current).catch(() => {}); };
    // PanResponder registers callbacks; it does not invoke them during render.
    /* eslint-disable react-hooks/purity */
    // eslint-disable-next-line react-hooks/refs
    return PanResponder.create({
      onStartShouldSetPanResponderCapture: (_, gesture) => gesture.numberActiveTouches === 1,
      onPanResponderGrant: () => { interacted.current = true; moved.current = false; origin.current = { x: bounds.left + current.current.x * bounds.width, y: bounds.top + current.current.y * bounds.height }; },
      onPanResponderMove: (_, gesture) => { if (Math.hypot(gesture.dx, gesture.dy) > 6) moved.current = true; if (moved.current) move(gesture.dx, gesture.dy); },
      onPanResponderRelease: (_, gesture) => { suppressPressUntil.current = Date.now() + 300; if (moved.current) { move(gesture.dx, gesture.dy); save(); } else onPress(); },
      onPanResponderTerminate: () => { suppressPressUntil.current = Date.now() + 300; if (moved.current) save(); },
      onPanResponderTerminationRequest: () => false,
    });
    /* eslint-enable react-hooks/purity */
  }, [bounds, onPress]);
  return <View pointerEvents="box-none" onLayout={event => setSize(event.nativeEvent.layout)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 45 }}>
    {size.width >= 52 && size.height >= 52 ? <View testID="room-comment-floating" {...drag.panHandlers} style={{ position: 'absolute', left: bounds.left + position.x * bounds.width, top: bounds.top + position.y * bounds.height, width: 52, height: 52, borderRadius: 26, backgroundColor: theme.color('#1b2024', 'backgroundColor'), borderWidth: 1, borderColor: theme.color('#65d59b'), boxShadow: '0 4px 12px rgba(0,0,0,0.25)' }}><Pressable accessibilityRole="button" accessibilityLabel="房间评论" accessibilityHint="拖动调整位置，轻点打开评论" onPress={() => { if (Date.now() >= suppressPressUntil.current) onPress(); }} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Feather name="message-circle" size={22} color={theme.color('#a8b3b6')} /></Pressable></View> : null}
  </View>;
}
