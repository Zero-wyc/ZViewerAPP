import { useMediaPreferences } from '@/hooks/useMediaPreferences';
import { MediaDisplayTools } from './MediaDisplayTools';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useAppearance } from '@/state/appearance';
import { messageFor } from '@/lib/server';
import { RoomButton, ui as baseUi } from './RoomUi';
import { useMediaPalette } from './MediaPanelUi';

// Match the Android/Harmony AnimeEpisodePicker: bounded grid, single add,
// optional bulk selection and failed items retained for retry.
export function EpisodePicker({ episodes, disabled, onAdd, onCancel, singleOnly = false, showNames = true }: {
  episodes: { id: string; title: string }[]; disabled?: boolean; singleOnly?: boolean;
  onAdd: (ids: string[]) => Promise<string[] | { added: string[]; cancelled?: boolean }>; onCancel?: () => void; showNames?: boolean;
}) {
  const display = useMediaPreferences();
  const theme = useAppearance(); const ui = theme.styles(baseUi); const p = useMediaPalette(); const { height } = useWindowDimensions();
  const [width, setWidth] = useState(0); const [multi, setMulti] = useState(false);
  const [selected, setSelected] = useState<string[]>([]); const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState(''); const [error, setError] = useState('');
  const submitting = useRef(false);
  const cancelled = useRef(false);
  const busy = disabled || adding;
  const submit = async (ids: string[]) => {
    if (submitting.current || busy || !ids.length) return; submitting.current = true;
    cancelled.current = false; setAdding(true); setError(''); setNotice('');
    try {
      const result = await onAdd(ids); const added = Array.isArray(result) ? result : result.added; const stopped = cancelled.current || !Array.isArray(result) && result.cancelled; const failed = ids.filter(id => !added.includes(id));
      setSelected(failed); setNotice(stopped ? `已停止添加，已添加 ${added.length} 集，其余保留选择` : `已添加 ${added.length} 集`);
      if (failed.length && !stopped) setError(`${failed.length} 集添加失败，保留选择，可重试`);
    } catch (failure) { setError(messageFor(failure)); }
    finally { submitting.current = false; setAdding(false); }
  };
  const choose = (id: string) => { if (!busy) setSelected(old => old.includes(id) ? old.filter(value => value !== id) : multi ? [...old, id] : [id]); };
  const columns = Math.max(1, Math.floor((width - 26 + 8) / 128)); const itemWidth = Math.max(1, Math.floor((width - 26 - (columns - 1) * 8) / columns));
  return <View testID="episode-picker" style={{ gap: 8 }} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <MediaDisplayTools episodes names={showNames} />
    <View style={ui.row}><Text style={[ui.muted, { flex: 1 }]}>共 {episodes.length} 集</Text>
      {!singleOnly ? <RoomButton label={multi ? '退出多选' : '多选'} secondary={!multi} disabled={busy} onPress={() => { setMulti(value => !value); setSelected([]); }} /> : null}
      {multi ? <><RoomButton label="全选" secondary disabled={busy} onPress={() => setSelected(episodes.map(item => item.id))} />
        <RoomButton label="清空" secondary disabled={busy || !selected.length} onPress={() => setSelected([])} /></> : null}
    </View>
    <View style={{ borderWidth: 1, borderColor: p.line, borderRadius: 18, overflow: 'hidden' }}><Text style={[ui.text, { fontWeight: '600', padding: 14, borderBottomWidth: 1, borderColor: p.line }]}>集数（{episodes.length}）</Text><ScrollView testID="episode-grid" nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: Math.max(180, Math.min(420, height * .44)), flexGrow: 0 }} contentContainerStyle={{ padding: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {episodes.map(item => <Pressable key={item.id} accessibilityRole={multi ? 'checkbox' : 'button'} accessibilityLabel={`选择集数 ${item.title}`}
        aria-checked={multi ? selected.includes(item.id) : undefined} accessibilityState={{ checked: multi ? selected.includes(item.id) : undefined, selected: selected.includes(item.id), disabled: busy }} disabled={busy}
        onAccessibilityTap={() => choose(item.id)} onPress={() => choose(item.id)}
        style={{ width: display.episodeMode === 'grid' ? itemWidth : '100%', minHeight: 58, padding: 10, borderRadius: 12, opacity: busy ? 0.45 : 1, flexDirection: display.episodeMode === 'grid' ? 'column' : 'row', alignItems: display.episodeMode === 'grid' ? 'flex-start' : 'center', gap: 10, backgroundColor: selected.includes(item.id) ? p.container : 'transparent' }}>
        <Feather name={selected.includes(item.id) ? 'check-square' : 'film'} size={22} color={selected.includes(item.id) ? p.accent : p.muted} /><Text numberOfLines={display.fullNames ? undefined : 1} style={[ui.text, { flexShrink: 1, minWidth: 0 }]}>{item.title}</Text>
      </Pressable>)}
    </ScrollView></View>
    <View style={[ui.row, { justifyContent: 'flex-end' }]}><Text style={[ui.muted, { flex: 1, minWidth: 80 }]}>{selected.length ? `已选 ${selected.length} 集` : '选择集数后添加'}</Text>{!adding || onCancel ? <RoomButton label={adding ? '停止添加' : '取消选择'} secondary disabled={!adding && (busy || !selected.length)} onPress={() => { if (adding) { cancelled.current = true; onCancel?.(); } else setSelected([]); }} /> : null}<RoomButton label={adding ? '正在添加…' : multi ? `添加所选 (${selected.length})` : '添加当前条目'} disabled={busy || !selected.length} onPress={() => void submit(selected)} /></View>
    {notice ? <Text accessibilityLiveRegion="polite" style={ui.muted}>{notice}</Text> : null}{error ? <Text style={ui.error}>{error}</Text> : null}
  </View>;
}
