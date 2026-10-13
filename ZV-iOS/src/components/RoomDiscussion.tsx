import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSession } from '@/state/session';
import { useAppearance } from '@/state/appearance';
import { emitAck } from '@/lib/socket';
import { messageFor } from '@/lib/server';
import { AppDialog } from './AppDialog';
import { RoomButton, RoomIconButton, RoomInput, ui as baseUi } from './RoomUi';
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
  const theme = useAppearance();
  return <View testID="room-comment-floating" style={{ position: 'absolute', right: 16, top: '50%', zIndex: 45, width: 52, height: 52, borderRadius: 26, backgroundColor: theme.color('#1b2024', 'backgroundColor'), borderWidth: 1, borderColor: theme.color('#65d59b'), boxShadow: '0 4px 12px rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' }}><RoomIconButton label="房间评论" icon="message-circle" onPress={onPress} /></View>;
}
