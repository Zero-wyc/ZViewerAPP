import { useState } from 'react';
import Feather from '@expo/vector-icons/Feather';
import { Pressable, Text, View } from 'react-native';
import type { Song } from '@/lib/musicCollection';
import { musicKey, sourceQueue, type MusicSource } from '@/lib/musicQueue';
import { messageFor } from '@/lib/server';
import { useAppearance } from '@/state/appearance';
import { AppDialog } from './AppDialog';
import { MusicButton, MusicIcon, MusicListItem, useMusicColors } from './MusicUi';
import { ui as baseUi } from './RoomUi';

type QueueItem = Song & { id: number };
export function MusicQueueDialog({ visible, queue, source, setSource, trackKey, canManage, busy, close, play, remove, clear }: {
  visible: boolean; queue: QueueItem[]; source: MusicSource; setSource: (source: MusicSource) => void;
  trackKey: string | null; canManage: boolean; busy: boolean; close: () => void;
  play: (item: QueueItem) => void; remove: (id: number) => void; clear: () => Promise<void>;
}) {
  const theme = useAppearance(); const ui = theme.styles(baseUi); const colors = useMusicColors();
  const [confirm, setConfirm] = useState(false); const [error, setError] = useState('');
  const [clearing, setClearing] = useState(false);
  const items = sourceQueue(queue, source); const blocked = busy || clearing;
  const clearAll = async () => {
    if (blocked) return;
    setClearing(true); setError('');
    try { await clear(); setConfirm(false); }
    catch (failure) { setError(messageFor(failure)); }
    finally { setClearing(false); }
  };
  return <AppDialog visible={visible} title={`播放列表 · ${items.length}`} closeLabel="收起 / 关闭" close={close}
    footer={canManage ? <View style={{ gap: 10, paddingTop: 12 }}>
      {confirm ? <><Text style={ui.text}>清空网易云和哔哩哔哩全部 {queue.length} 首歌曲？此操作会影响房间内所有人。</Text><View style={ui.row}><MusicButton label="取消清空" secondary disabled={blocked} onPress={() => { setConfirm(false); setError(''); }} /><MusicButton label={clearing ? '正在清空…' : '确认清空全部'} disabled={blocked || !queue.length} onPress={() => void clearAll()} /></View></> : <Pressable accessibilityRole="button" accessibilityLabel="清空全部播放列表" accessibilityState={{ disabled: blocked || !queue.length }} disabled={blocked || !queue.length} onPress={() => setConfirm(true)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: blocked || !queue.length ? .35 : 1 }}><Feather name="trash-2" size={20} color={colors.text} /><Text style={{ color: colors.text, fontSize: 14 }}>清空全部播放列表</Text></Pressable>}
      {error ? <Text accessibilityLiveRegion="assertive" style={ui.error}>{error}</Text> : null}
    </View> : undefined}>
    <View style={ui.row}>
      {(['ncm', 'bili'] as const).map(value => <MusicButton key={value} label={`${value === 'ncm' ? '网易云' : '哔哩哔哩'} · ${sourceQueue(queue, value).length}`} secondary selected={source === value} disabled={blocked} onPress={() => { setSource(value); setConfirm(false); setError(''); }} />)}
    </View>
    {!items.length ? <Text style={ui.muted}>{source === 'ncm' ? '网易云' : '哔哩哔哩'}播放列表为空</Text> : null}
    <View style={{ gap: 0 }}>{items.map((item, index) => <MusicListItem key={item.id} number={index + 1} title={item.name} subtitle={item.artist} cover={item.cover} active={trackKey === musicKey(item)} onPress={() => { if (!blocked) play(item); }}>
      {canManage ? <MusicIcon label={`移除 ${item.name}`} icon="x" disabled={blocked} onPress={() => remove(item.id)} /> : null}
    </MusicListItem>)}</View>
  </AppDialog>;
}
