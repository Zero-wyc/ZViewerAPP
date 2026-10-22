import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSession } from '@/state/session';
import { emitAck } from '@/lib/socket';
import { messageFor } from '@/lib/server';
import { RoomInput } from './RoomUi';
import { MusicButton } from './MusicUi';
import { useMediaPalette } from './MediaPanelUi';
import { RoomSideDrawer } from './RoomSideDrawer';
export { RoomCommentButton } from './RoomSideDrawer';

type Comment = { id: number; roomId: string; username: string; content: string };
const belongsTo = (item: Comment, roomId: string) => item && item.roomId === roomId && Number.isFinite(item.id) && typeof item.username === 'string' && typeof item.content === 'string';
const merge = (history: Comment[], live: Comment[]) => [...new Map([...history, ...live].map(item => [item.id, item])).values()].sort((a, b) => a.id - b.id).slice(-100);

/** Remains mounted while the dock is closed, so opening it does not lose live comments. */
export function RoomDiscussion({ roomId, visible, close }: { roomId: string; visible: boolean; close: () => void }) {
  const { socket } = useSession(); const p = useMediaPalette();
  const [comments, setComments] = useState<Comment[]>([]); const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [historyError, setHistoryError] = useState(''); const [connected, setConnected] = useState(!!socket?.connected);
  const scope = useRef(0); const operation = useRef(0); const sending = useRef(false); const list = useRef<ScrollView | null>(null);
  useEffect(() => {
    const epoch = ++scope.current; let request = 0; let retries = 0; let timer: ReturnType<typeof setTimeout> | undefined;
    const current = () => scope.current === epoch;
    const cancelSend = () => { operation.current++; sending.current = false; setBusy(false); };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Retire all room/socket-owned UI before subscribing to the next scope.
    setComments([]); setDraft(''); setError(''); setHistoryError(''); setConnected(!!socket?.connected); cancelSend();
    const receive = (item: Comment) => { if (current() && belongsTo(item, roomId)) setComments(values => merge([], [...values, item])); };
    const history = () => {
      if (!socket?.connected || !current()) return;
      const revision = ++request;
      void emitAck<{ comments: Comment[] }>(socket, 'comment-history', { roomId }).then(data => {
        if (!current() || revision !== request) return;
        setComments(values => merge((data.comments || []).filter(item => belongsTo(item, roomId)), values)); setHistoryError('');
      }).catch(failure => {
        if (!current() || revision !== request) return;
        // A room may finish joining just after the socket connects.
        if (retries++ < 5) timer = setTimeout(history, 800);
        else setHistoryError(messageFor(failure));
      });
    };
    const connect = () => { if (!current()) return; clearTimeout(timer); retries = 0; cancelSend(); setConnected(true); history(); };
    const disconnect = () => { if (!current()) return; ++request; clearTimeout(timer); cancelSend(); setConnected(false); };
    socket?.on('new-comment', receive); socket?.on('connect', connect); socket?.on('disconnect', disconnect);
    if (socket?.connected) history();
    const retire = () => { if (current()) { ++scope.current; ++operation.current; sending.current = false; } };
    return () => { retire(); clearTimeout(timer); socket?.off('new-comment', receive); socket?.off('connect', connect); socket?.off('disconnect', disconnect); };
  }, [socket, roomId]);
  const send = async () => {
    const content = draft.trim();
    if (!socket?.connected || sending.current || !content) return;
    const epoch = scope.current; const revision = ++operation.current; const sentDraft = draft;
    const current = () => scope.current === epoch && operation.current === revision;
    sending.current = true; setBusy(true); setError('');
    try { await emitAck(socket, 'send-comment', { roomId, content, isDanmaku: false }); if (current()) setDraft(value => value === sentDraft ? '' : value); }
    catch (failure) { if (current()) setError(messageFor(failure)); }
    finally { if (current()) { sending.current = false; setBusy(false); } }
  };
  return <RoomSideDrawer visible={visible} close={close} title="房间评论">
    <ScrollView ref={list} testID="room-discussion-list" style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ padding: 16, gap: 16, flexGrow: comments.length ? 0 : 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" onContentSizeChange={() => { if (visible) list.current?.scrollToEnd({ animated: true }); }}>
      {comments.length ? comments.map(item => <View key={item.id} style={{ gap: 4 }}><Text style={{ color: p.muted, fontSize: 12, fontWeight: '600' }}>{item.username}</Text><Text selectable style={{ color: p.text, fontSize: 15, lineHeight: 22 }}>{item.content}</Text></View>) : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 24 }}><Text style={{ color: p.muted, fontSize: 14 }}>暂无评论，聊聊正在听的歌吧</Text></View>}
    </ScrollView>
    <View style={{ borderTopWidth: .5, borderColor: p.line, padding: 12, gap: 8 }}>
      {error || historyError ? <Text accessibilityLiveRegion="polite" style={{ color: p.error, fontSize: 13 }}>{error || historyError}</Text> : !connected ? <Text style={{ color: p.muted, fontSize: 13 }}>正在连接房间…</Text> : null}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><RoomInput accessibilityLabel="房间评论内容" value={draft} onChangeText={setDraft} placeholder="发送房间评论" maxLength={1000} returnKeyType="send" submitBehavior="submit" onSubmitEditing={() => void send()} style={{ flex: 1, minWidth: 0, backgroundColor: p.field, borderColor: p.line, color: p.text, fontSize: 14 }} /><MusicButton label="发送" disabled={busy || !draft.trim() || !connected} onPress={() => void send()} /></View>
    </View>
  </RoomSideDrawer>;
}
