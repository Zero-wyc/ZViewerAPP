import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSession } from '@/state/session';
import { useAppearance } from '@/state/appearance';
import { importDanmaku } from '@/lib/danmakuImport';
import type { DanmakuTrack } from '@/lib/timeline';
import { messageFor } from '@/lib/server';
import { AppDialog } from './AppDialog';
import { SourceDropdown } from './SourceDropdown';
import { RoomButton, RoomInput, ui as baseUi } from './RoomUi';
import { MediaImage } from './MediaImage';

type Entry = { id: string; title: string; cover?: string; description?: string; stats?: { play?: number; danmaku?: number }; episodeNumber?: number; playbackParams?: Record<string, unknown> };
export function DanmakuSearchDialog({ roomId, close, imported }: { roomId: string; close: () => void; imported: (message: string) => void }) {
  const { request, session } = useSession(); const theme = useAppearance(); const ui = theme.styles(baseUi);
  const { width, height } = useWindowDimensions(); const columns = width >= 760;
  const [sources, setSources] = useState<{ id: string; name: string }[]>([]);
  const [source, setSource] = useState(''); const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<Entry[]>([]); const [selected, setSelected] = useState<Entry | null>(null); const [episodes, setEpisodes] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [episodeWidth, setEpisodeWidth] = useState(280);
  const operation = useRef<AbortController | null>(null); const importing = useRef(false);
  useEffect(() => {
    const controller = new AbortController(); operation.current = controller;
    void request<{ sources: { id: string; name: string }[] }>('/api/stream/danmaku/sources', { signal: controller.signal }).then(data => { if (!controller.signal.aborted) { if (!Array.isArray(data.sources)) throw new Error('弹幕来源响应无效，请关闭后重试'); setSources(data.sources); setSource(data.sources[0]?.id || ''); } }).catch(failure => { if (!controller.signal.aborted) setError(messageFor(failure)); });
    return () => { controller.abort(); operation.current?.abort(); };
  }, [request]);
  const task = async (work: (signal: AbortSignal) => Promise<void>) => {
    if (importing.current) return;
    operation.current?.abort(); const controller = new AbortController(); operation.current = controller;
    setBusy(true); setError('');
    try { await work(controller.signal); } catch (failure) { if (!controller.signal.aborted) setError(messageFor(failure)); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const search = () => void task(async signal => { setSelected(null); setEpisodes([]); const data = await request<{ results: Entry[] }>(`/api/stream/danmaku/search?${new URLSearchParams({ source, keyword: keyword.trim() })}`, { signal }); signal.throwIfAborted(); setResults(data.results); if (!data.results.length) setError('没有找到弹幕源，请换个关键词'); });
  const select = (item: Entry) => void task(async signal => { setSelected(item); setEpisodes([]); const data = await request<{ episodes: Entry[] }>(`/api/stream/danmaku/episodes?${new URLSearchParams({ source, identifier: item.id })}`, { signal }); signal.throwIfAborted(); setEpisodes(data.episodes); if (!data.episodes.length) setError('这个条目没有可导入的集数'); });
  const importEpisode = (episode: Entry) => void task(async signal => {
    importing.current = true;
    try {
      const data = await request<{ danmaku: DanmakuTrack['items'] }>('/api/stream/danmaku/fetch', { method: 'POST', signal, body: JSON.stringify({ source, episode }) });
      signal.throwIfAborted(); const items = importDanmaku(JSON.stringify(data.danmaku));
      if (!items.length) throw new Error('该集没有可用弹幕，请选择其他集数');
      await request(`/api/rooms/${encodeURIComponent(roomId)}/danmaku-tracks`, { method: 'POST', signal, body: JSON.stringify({ trackId: `${source}:${episode.id}`, label: `${selected?.title || ''} · ${episode.title}`, source, items, offset: 0, hidden: false }) });
      signal.throwIfAborted(); imported(`已导入 ${episode.title} · ${items.length} 条弹幕`); close();
    } finally { importing.current = false; }
  });
  const listHeight = Math.min(columns ? 360 : 240, Math.max(100, height * (columns ? 0.46 : 0.25)));
  const coverSource = (cover: string) => {
    try {
      const url = new URL(cover.startsWith('//') ? `https:${cover}` : cover);
      if (session && ['hdslb.com', 'bilivideo.com', 'biliimg.com', 'bilibili.com'].some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) return { uri: `${session.serverUrl}/api/stream/proxy-image?url=${encodeURIComponent(url.href)}`, headers: { Authorization: `Bearer ${session.accessToken}` } };
    } catch {}
    return { uri: cover };
  };
  return <AppDialog visible title="在线搜索弹幕" maxWidth={900} close={() => { if (!importing.current) { operation.current?.abort(); close(); } }}>
    <SourceDropdown testID="danmaku-source" label="弹幕数据源" value={source} options={sources} disabled={busy || !sources.length} onChange={value => { operation.current?.abort(); setSource(value); setResults([]); setSelected(null); setEpisodes([]); setError(''); }} />
    <View style={ui.row}><RoomInput value={keyword} onChangeText={setKeyword} placeholder="影片名 / BV号" style={{ flex: 1, minWidth: 0 }} onSubmitEditing={() => { if (!busy && source && keyword.trim()) search(); }} /><RoomButton label={busy ? '加载中…' : '搜索弹幕'} disabled={busy || !source || !keyword.trim()} onPress={search} /></View>
    <View style={{ flexDirection: columns ? 'row' : 'column', gap: 12 }}>
      {columns || !selected ? <View style={{ flex: columns ? 1 : undefined, minWidth: 0, gap: 8 }}><Text style={ui.title}>搜索结果 · {results.length}</Text>
        <ScrollView testID="danmaku-search-results" nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: listHeight, flexGrow: 0 }} contentContainerStyle={{ gap: 8 }}>
          {results.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.title} disabled={busy} onPress={() => select(item)} style={[ui.card, { flexDirection: 'row', alignItems: 'center', gap: 10, opacity: busy ? .5 : 1 }]}>
            {item.cover ? <MediaImage source={coverSource(item.cover)} style={{ width: 80, height: 54, borderRadius: 6 }} /> : null}
            <View style={{ flex: 1, minWidth: 0, gap: 5 }}><Text numberOfLines={2} style={ui.text}>{item.title}</Text>{item.description ? <Text numberOfLines={2} style={ui.muted}>{item.description}</Text> : null}{item.stats ? <Text style={ui.muted}>{item.stats.play !== undefined ? `播放 ${item.stats.play.toLocaleString()}` : ''}{item.stats.danmaku !== undefined ? ` · 弹幕 ${item.stats.danmaku.toLocaleString()}` : ''}</Text> : null}</View>
          </Pressable>)}
          {!results.length ? <Text style={ui.muted}>输入影片名称或 BV 号搜索，然后选择集数导入</Text> : null}
        </ScrollView></View> : null}
      {selected ? <View style={{ width: columns ? 300 : undefined, gap: 8 }}><View style={ui.row}><Text numberOfLines={2} style={[ui.text, { flex: 1 }]}>{selected.title}</Text><RoomButton label="返回结果" secondary disabled={busy} onPress={() => { setSelected(null); setEpisodes([]); }} /></View><Text style={ui.title}>选择集数 · {episodes.length}</Text>
        <ScrollView testID="danmaku-search-episodes" onLayout={event => setEpisodeWidth(event.nativeEvent.layout.width)} nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: listHeight, flexGrow: 0 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {episodes.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.title} accessibilityHint="点击添加该集弹幕" disabled={busy} onPress={() => importEpisode(item)} style={[ui.button, ui.secondary, { width: Math.max(0, (episodeWidth - 8) / 2), paddingHorizontal: 8, paddingVertical: 8, opacity: busy ? .5 : 1 }]}><Text numberOfLines={2} style={[ui.text, { textAlign: 'center' }]}>{item.title}</Text></Pressable>)}
        </ScrollView></View> : null}
    </View>
    {error ? <Text accessibilityLiveRegion="polite" style={ui.error}>{error}</Text> : null}
    {busy ? <Text style={ui.muted}>正在加载或保存弹幕，请稍候</Text> : null}
  </AppDialog>;
}
