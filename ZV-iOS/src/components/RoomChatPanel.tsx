import Feather from '@expo/vector-icons/Feather';
import { ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { MediaAction, panel, useMediaPalette } from './MediaPanelUi';
import { Surface } from './Surface';

type Props = { sidebar?: boolean; comments: { id: number; username: string; content: string }[]; draft: string; setDraft: (value: string) => void; send: () => void; busy: boolean; connected: boolean; error?: string; asDanmaku: boolean; setAsDanmaku: (value: boolean) => void };
export function RoomChatPanel({ sidebar = false, comments, draft, setDraft, send, busy, connected, error, asDanmaku, setAsDanmaku }: Props) {
  const p = useMediaPalette();
  return <Surface readable testID="screen-share-chat" style={{ flex: 1, minHeight: sidebar ? 0 : 260, marginTop: sidebar ? 0 : 12, borderRadius: 22, padding: sidebar ? 12 : 16, gap: sidebar ? 8 : 14, borderWidth: 1, borderColor: p.line }}>
    <View style={[panel.row, { alignSelf: 'center' }]}><Feather name="message-circle" color={p.accent} size={20} /><Text style={{ fontSize: 17, color: p.accent }}>聊天</Text></View>
    <View style={{ height: 1, backgroundColor: p.accent, marginHorizontal: sidebar ? -12 : -16 }} />
    <ScrollView style={{ flex: 1, minHeight: sidebar ? 0 : 110 }} contentContainerStyle={{ flexGrow: 1, gap: 12, minHeight: sidebar ? 0 : 110, justifyContent: comments.length ? 'flex-start' : 'center' }}>{comments.length ? comments.map(comment => <View key={comment.id} style={{ gap: 4 }}><Text style={{ color: p.muted, fontSize: 12 }}>{comment.username}</Text><Text style={{ color: p.text, fontSize: 15 }}>{comment.content}</Text></View>) : <View style={{ alignItems: 'center', gap: sidebar ? 6 : 12, padding: sidebar ? 4 : 12 }}><Feather name="message-square" color={p.muted} size={sidebar ? 22 : 32} /><Text style={{ color: p.muted, fontSize: 14 }}>暂无评论，快来第一条吧</Text></View>}</ScrollView>
    <View style={panel.row}><TextInput accessibilityLabel="投屏聊天内容" value={draft} onChangeText={setDraft} placeholder="说点什么…" placeholderTextColor={p.muted} maxLength={1000} returnKeyType="send" onSubmitEditing={send} style={{ flex: 1, minWidth: 0, minHeight: 46, paddingHorizontal: 14, borderRadius: 24, borderWidth: 1, borderColor: p.line, color: p.text, backgroundColor: p.container }} /><View><MediaAction label="发送" icon="send" selected disabled={busy || !connected || !draft.trim()} onPress={send} /></View></View>
    <View style={panel.row}><Switch accessibilityLabel="以弹幕形式发送" value={asDanmaku} onValueChange={setAsDanmaku} trackColor={{ true: p.accent, false: p.line }} thumbColor="#fff" /><Text style={{ color: p.muted, fontSize: 14 }}>以弹幕形式发送</Text></View>
    {error ? <Text accessibilityLiveRegion="polite" style={{ color: p.error }}>{error}</Text> : null}
  </Surface>;
}
