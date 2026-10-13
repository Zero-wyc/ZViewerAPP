import { checkAbort } from '@/lib/cancellation';
import { addAnimeEpisode, type AnimeEpisode } from '@/lib/animeSources';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useSession } from '@/state/session';
import { useAppearance } from '@/state/appearance';
import { messageFor } from '@/lib/server';
import type { SourceSelection } from '@/lib/sources';
import { RoomButton, RoomInput, ui as baseUi } from './RoomUi';
import { SourceDropdown } from './SourceDropdown';
import { EpisodePicker } from './EpisodePicker';
import { SourcePoster } from './SourcePoster';
type Source = { id: string; name: string };
type Result = { id: string; title: string; cover?: string; poster?: string; description?: string };
type Episode = AnimeEpisode;
export function AnimePicker({ add, initialKind = 'anisubs', keyword, onKeywordChange, onBusyChange }: { add: (value: SourceSelection) => Promise<void>; initialKind?: string; keyword: string; onKeywordChange: (value: string) => void; onBusyChange?: (busy: boolean) => void }) {
  const theme = useAppearance(); const ui = theme.styles(baseUi);
  const { request } = useSession(); const kind = initialKind; const root = `/api/stream/${kind}`;
  const [sources, setSources] = useState<Source[]>([]); const [source, setSource] = useState('');
  const [results, setResults] = useState<Result[]>([]); const [episodes, setEpisodes] = useState<Episode[]>([]); const [expanded, setExpanded] = useState(''); const [name, setName] = useState('');
  const [busy, setBusy] = useState(false); const [loadingSources, setLoadingSources] = useState(true); const [searched, setSearched] = useState(false); const [error, setError] = useState('');
  const operation = useRef<AbortController | null>(null); const keywordRef = useRef(keyword); useEffect(() => { keywordRef.current = keyword; }, [keyword]);
  const [sourceRetry, setSourceRetry] = useState(0);
  useEffect(() => {
    const cancel = new AbortController();
    void request<{ sources: Source[] }>(`${root}/sources`, { signal: cancel.signal }).then(value => {
      if (!cancel.signal.aborted) { setSources(value.sources); setSource(value.sources[0]?.id || ''); }
    }).catch(failure => { if (!cancel.signal.aborted) setError(messageFor(failure)); }).finally(() => { if (!cancel.signal.aborted) setLoadingSources(false); });
    return () => { cancel.abort(); operation.current?.abort(); };
  }, [root, request, sourceRetry]);
  const search = useCallback(async (selectedSource: string, term: string) => {
    operation.current?.abort(); const controller = new AbortController(); operation.current = controller;
    setExpanded(''); setEpisodes([]); setResults([]); setSearched(false); setError('');
    if (!term.trim() || !selectedSource) { setBusy(false); return; }
    setBusy(true);
    try { const data = await request<{ results: Result[] }>(`${root}/search?${new URLSearchParams({ source: selectedSource, keyword: term.trim() })}`, { signal: controller.signal }); if (!controller.signal.aborted) { setResults(data.results); setSearched(true); } }
    catch (failure) { if (!controller.signal.aborted) setError(messageFor(failure)); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }, [request, root]);
  // Source changes search once; typing retains explicit search semantics.
  useEffect(() => { if (source) void search(source, keywordRef.current); }, [source, search]);
  const expand = async (item: Result) => {
    if (expanded === item.id) { setExpanded(''); return; }
    operation.current?.abort(); const controller = new AbortController(); operation.current = controller; setBusy(true); setError(''); setEpisodes([]);
    try { const data = await request<{ episodes: Episode[] }>(`${root}/episodes?${new URLSearchParams({ source, identifier: item.id })}`, { signal: controller.signal }); if (!controller.signal.aborted) { setName(item.title); setEpisodes(data.episodes); setExpanded(item.id); } }
    catch (failure) { if (!controller.signal.aborted) setError(messageFor(failure)); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const submit = async (ids: string[]) => {
    const controller = new AbortController(); operation.current = controller; setBusy(true); onBusyChange?.(true); const added: string[] = [];
    try { for (const episode of episodes.filter(item => ids.includes(item.id))) {
      checkAbort(controller.signal);
      try {
        await addAnimeEpisode(request, kind, source, name, episode, add, controller.signal);
        added.push(episode.id);
      } catch (failure) { if (!controller.signal.aborted) setError(messageFor(failure)); }
    } } finally { if (!controller.signal.aborted) setBusy(false); onBusyChange?.(false); }
    return added;
  };
  return <View style={{ gap: 12 }}>
    <Text style={ui.title}>{kind === 'anisubs' ? 'ani-subs 番剧源' : kind === 'kazumi' ? 'Kazumi 番剧源' : '传统番剧源'}</Text>
    <SourceDropdown label="番剧数据源" testID="anime-source" value={source} options={sources} disabled={busy || loadingSources || !sources.length} onChange={setSource} />
    <View style={ui.row}><RoomInput value={keyword} onChangeText={onKeywordChange} placeholder="搜索番剧名称" style={{ flex: 1, minWidth: 130 }} onSubmitEditing={() => { if (!busy) void search(source, keyword); }} /><RoomButton label="搜索" disabled={busy || !source || !keyword.trim()} onPress={() => void search(source, keyword)} /></View>
    <Text style={ui.muted}>{loadingSources ? '加载数据源…' : searched ? `共 ${results.length} 条结果` : '输入关键词开始搜索；切源保留关键词'}</Text>
    <ScrollView testID="anime-results" nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 380, flexGrow: 0 }} contentContainerStyle={{ gap: 8 }}>
      {results.map(item => <View key={item.id} style={ui.card}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><SourcePoster uri={item.cover || item.poster} proxyPath={`${root}/proxy?${new URLSearchParams({ url: item.cover || item.poster || '', referer: item.id })}`} /><View style={{ flex: 1, minWidth: 0, gap: 8 }}><Text style={ui.text}>{item.title}</Text>{item.description ? <Text style={ui.muted} numberOfLines={2}>{item.description}</Text> : null}<RoomButton label={expanded === item.id ? '收起选集' : '展开选集'} secondary disabled={busy} onPress={() => void expand(item)} /></View></View>
        {expanded === item.id ? episodes.length ? <EpisodePicker key={`${source}:${item.id}`} episodes={episodes} disabled={busy} onAdd={submit} /> : <Text style={ui.muted}>暂无集数</Text> : null}
      </View>)}
    </ScrollView>
    {busy || loadingSources ? <ActivityIndicator color={theme.color('#65d59b')} /> : null}{error ? <><Text style={ui.error}>{error}</Text>{!source ? <RoomButton label="重新加载数据源" secondary disabled={busy || loadingSources} onPress={() => { setError(''); setLoadingSources(true); setSourceRetry(value => value + 1); }} /> : <RoomButton label="重试搜索" secondary disabled={busy || !keyword.trim()} onPress={() => void search(source, keyword)} />}</> : null}
  </View>;
}
