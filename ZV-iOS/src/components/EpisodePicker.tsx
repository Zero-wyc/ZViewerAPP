import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useAppearance } from '@/state/appearance';
import { messageFor } from '@/lib/server';
import { RoomButton, ui as baseUi } from './RoomUi';

// Match the Android/Harmony AnimeEpisodePicker: bounded grid, single add,
// optional bulk selection and failed items retained for retry.
export function EpisodePicker({ episodes, disabled, onAdd, singleOnly = false }: {
  episodes: { id: string; title: string }[]; disabled?: boolean; singleOnly?: boolean;
  onAdd: (ids: string[]) => Promise<string[]>;
}) {
  const theme = useAppearance(); const ui = theme.styles(baseUi);
  const [width, setWidth] = useState(0); const [multi, setMulti] = useState(false);
  const [selected, setSelected] = useState<string[]>([]); const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState(''); const [error, setError] = useState('');
  const busy = disabled || adding;
  const submit = async (ids: string[]) => {
    setAdding(true); setError(''); setNotice('');
    try {
      const added = await onAdd(ids); const failed = ids.filter(id => !added.includes(id));
      setSelected(failed); setNotice(`已添加 ${added.length} 集`);
      if (failed.length) setError(`${failed.length} 集添加失败，保留选择，可重试`);
    } catch (failure) { setError(messageFor(failure)); }
    finally { setAdding(false); }
  };
  return <View testID="episode-picker" style={{ gap: 8 }} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <View style={ui.row}><Text style={[ui.muted, { flex: 1 }]}>共 {episodes.length} 集</Text>
      {!singleOnly ? <RoomButton label={multi ? '退出多选' : '多选'} secondary={!multi} disabled={busy} onPress={() => { setMulti(value => !value); setSelected([]); }} /> : null}
      {multi ? <><RoomButton label="全选" secondary disabled={busy} onPress={() => setSelected(episodes.map(item => item.id))} />
        <RoomButton label="清空" secondary disabled={busy || !selected.length} onPress={() => setSelected([])} /></> : null}
    </View>
    <ScrollView testID="episode-grid" nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 200, flexGrow: 0 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {episodes.map(item => <Pressable key={item.id} accessibilityRole={multi ? 'checkbox' : 'button'} accessibilityLabel={multi ? item.title : `添加 ${item.title}`}
        aria-checked={multi ? selected.includes(item.id) : undefined} accessibilityState={{ checked: multi ? selected.includes(item.id) : undefined, disabled: busy }} disabled={busy}
        onPress={() => { if (multi) setSelected(old => old.includes(item.id) ? old.filter(id => id !== item.id) : [...old, item.id]); else void submit([item.id]); }}
        style={[ui.secondary, { width: width >= 500 ? '48%' : '100%', minHeight: 44, padding: 10, borderRadius: 8, opacity: busy ? 0.45 : 1 }, selected.includes(item.id) && { borderColor: theme.color('#65d59b') }]}>
        <Text style={ui.text}>{multi ? selected.includes(item.id) ? '☑ ' : '☐ ' : '▶ '}{item.title}</Text>
      </Pressable>)}
    </ScrollView>
    {multi ? <View style={ui.row}><Text style={[ui.muted, { flex: 1 }]}>已选 {selected.length} 集</Text>
      <RoomButton label={adding ? '正在添加…' : '添加所选'} disabled={busy || !selected.length} onPress={() => void submit(selected)} /></View> : null}
    {notice ? <Text accessibilityLiveRegion="polite" style={ui.muted}>{notice}</Text> : null}{error ? <Text style={ui.error}>{error}</Text> : null}
  </View>;
}
