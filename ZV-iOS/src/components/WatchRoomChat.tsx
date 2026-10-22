import Feather from '@expo/vector-icons/Feather';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { DanmakuManager } from './DanmakuManager';
import { MediaAction, panel, useMediaPalette } from './MediaPanelUi';
import { formatTime } from '@/lib/sources';
import type { useDanmaku } from './Danmaku';

type Props = { roomId: string; host: boolean; danmaku: ReturnType<typeof useDanmaku>; comments: { id: number; username: string; content: string }[]; draft: string; setDraft(value: string): void; send(): void; busy: boolean; connected: boolean; error: string; asDanmaku: boolean; setAsDanmaku(value: boolean): void };
export function WatchRoomChat({ roomId, danmaku, comments, draft, setDraft, send, busy, connected, error, asDanmaku, setAsDanmaku }: Props) {
  const p = useMediaPalette(); const [section, setSection] = useState<'comments' | 'tracks' | 'realtime'>('comments');
  const items = section === 'realtime' ? danmaku.realtime : comments;
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, minHeight: 0, padding: 12 }}>
    <View style={{ flex: 1, minHeight: 0, borderRadius: 22, padding: 14, gap: 14, borderWidth: 1, borderColor: p.line, backgroundColor: p.field }}>
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', borderRadius: 28, padding: 4, borderWidth: 1, borderColor: p.accent, backgroundColor: p.container }}>
        {(['comments', 'tracks', 'realtime'] as const).map((value, i) => <Pressable key={value} accessibilityRole="tab" accessibilityLabel={['评论区', '弹幕轨道', '实时弹幕'][i]} accessibilityState={{ selected: section === value }} onAccessibilityTap={() => setSection(value)} onPress={() => setSection(value)} style={{ flex: 1, minWidth: 0, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: section === value ? p.accent : 'transparent', paddingHorizontal: 4 }}><Text style={{ color: section === value ? p.onAccent : p.muted, fontSize: 14, textAlign: 'center' }}>{['评论区', '弹幕轨道', '实时弹幕'][i]}</Text></Pressable>)}
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1, minHeight: 50 }} contentContainerStyle={{ flexGrow: 1, gap: 12 }}>
        {section === 'tracks' ? <DanmakuManager key={danmaku.mediaKey} roomId={roomId} host={danmaku.canManage} tracks={danmaku.tracks} mutate={danmaku.mutate} /> : items.length ? items.map(item => <View key={item.id} style={{ gap: 4 }}><Text style={{ color: p.muted, fontSize: 12 }}>{'username' in item ? item.username : `${item.sender || '实时弹幕'}${typeof item.time === 'number' ? ` · ${formatTime(item.time)}` : ''}`}</Text><Text style={{ color: p.text, fontSize: 15 }}>{item.content}</Text></View>) : <View style={{ flex: 1, minHeight: 100, alignItems: 'center', justifyContent: 'center', gap: 12 }}><Feather name="message-square" size={34} color={p.muted} /><Text style={{ color: p.muted, textAlign: 'center' }}>{section === 'realtime' ? '暂无实时弹幕' : '暂无评论，快来第一条吧'}</Text></View>}
      </ScrollView>
      {section !== 'tracks' ? <><View style={panel.row}><TextInput accessibilityLabel="房间聊天内容" value={draft} onChangeText={setDraft} placeholder="说点什么…" placeholderTextColor={p.muted} maxLength={1000} returnKeyType="send" onSubmitEditing={send} style={{ flex: 1, minWidth: 0, minHeight: 44, paddingHorizontal: 14, borderRadius: 24, borderWidth: 1, borderColor: p.muted, color: p.text, backgroundColor: p.container }} /><View><MediaAction label="发送" icon="send" selected disabled={busy || !connected || !draft.trim()} onPress={send} /></View></View><View style={panel.row}><Switch accessibilityLabel="以弹幕形式发送" value={asDanmaku} onValueChange={setAsDanmaku} trackColor={{ true: p.accent, false: p.line }} thumbColor="#fff" /><Text style={{ color: p.muted, fontSize: 14, flexShrink: 1 }}>以弹幕形式发送</Text></View></> : null}
      {danmaku.error && section !== 'comments' ? <Text accessibilityLiveRegion="polite" style={{ color: p.error }}>{danmaku.error}</Text> : null}
      {error ? <Text accessibilityLiveRegion="polite" style={{ color: p.error }}>{error}</Text> : null}
    </View>
  </KeyboardAvoidingView>;
}
