import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useSession } from '@/state/session';
import { useAppearance } from '@/state/appearance';
import { messageFor } from '@/lib/server';
import type { SourceSelection } from '@/lib/sources';
import { RoomButton, RoomInput, ui as baseUi } from './RoomUi';
import { SourceDropdown } from './SourceDropdown';
import { EpisodePicker } from './EpisodePicker';
type Source = { id: string; name: string };
type Result = { id: string; title: string; source?: string };
type Episode = { id: string; title: string; episodeNumber: number; playbackParams: Record<string, unknown> };
export function AnimePicker({ add, initialKind = 'anisubs', onBusyChange }: { add: (value: SourceSelection) => Promise<void>; initialKind?: string; onBusyChange?: (busy: boolean) => void }) {
  const theme = useAppearance(); const ui = theme.styles(baseUi);
  const { request } = useSession(); const kind = initialKind; const [sources, setSources] = useState<Source[]>([]); const [source, setSource] = useState(''); const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<Result[]>([]); const [episodes, setEpisodes] = useState<Episode[]>([]); const [expanded, setExpanded] = useState(''); const [name, setName] = useState(''); const [busy, setBusy] = useState(false); const [loadingSources, setLoadingSources] = useState(true); const [searched, setSearched] = useState(false); const [error, setError] = useState('');
  const root = `/api/stream/${kind}`;
  useEffect(() => {
    const cancel = new AbortController();
    void request<{ sources: Source[] }>(`${root}/sources`, { signal: cancel.signal }).then(value => {
      if (!cancel.signal.aborted) { setSources(value.sources); setSource(value.sources[0]?.id || ''); }
    }).catch(failure => { if (!cancel.signal.aborted) setError(messageFor(failure)); })
      .finally(() => { if (!cancel.signal.aborted) setLoadingSources(false); });
    return () => cancel.abort();
  }, [root, request]);
  const working = (value: boolean) => { setBusy(value); onBusyChange?.(value); };
  const task = async (work: () => Promise<void>) => { working(true); setError(''); try { await work(); } catch (failure) { setError(messageFor(failure)); } finally { working(false); } };
  const addEpisode = async (episode: Episode) => {
    const title = `${name} · ${episode.title}`;
    if (kind === 'anisubs') { await add({ title, source: 'anime', url: `anisubs://${source}/${episode.id}`, sourceMeta: { sourceId: source, episode, originalTitle: title } }); return; }
    const media = await request<{ url: string; audioUrl?: string; headers?: Record<string, string>; format?: string }>(`${root}/resolve`, { method: 'POST', body: JSON.stringify({ source, episode }) });
    const proxy = (url: string) => { const params = new URLSearchParams({ url }); for (const [key, value] of Object.entries(media.headers || {})) { const header = ({ referer: 'referer', 'user-agent': 'userAgent', origin: 'origin', cookie: 'cookie' } as Record<string, string>)[key.toLowerCase()]; if (header) params.set(header, value); } return `${root}/proxy?${params}`; };
    await add({ title, source: kind === 'anime' ? 'mp4' : kind, url: proxy(media.url), ...(media.audioUrl ? { audioUrl: proxy(media.audioUrl) } : {}), format: media.format });
  };
  const submit = async (ids: string[]) => {
    working(true); const added: string[] = [];
    try { for (const episode of episodes.filter(item => ids.includes(item.id))) { try { await addEpisode(episode); added.push(episode.id); } catch { /* EpisodePicker retains failed items for retry. */ } } }
    finally { working(false); }
    return added;
  };
  return <View style={ui.card}>
    <Text style={ui.title}>{kind === 'anisubs' ? 'ani-subs 番剧源' : kind === 'kazumi' ? 'Kazumi 番剧源' : '传统番剧源'}</Text>
    <Text style={ui.muted}>{loadingSources ? '加载数据源…' : `${sources.length} 个数据源可用`}</Text>
    <SourceDropdown label="番剧数据源" testID="anime-source" value={source} options={sources} disabled={busy || loadingSources || !sources.length}
      onChange={value => { setSource(value); setResults([]); setExpanded(''); setEpisodes([]); setSearched(false); setError(''); }} />
    <RoomInput value={keyword} onChangeText={setKeyword} placeholder="搜索番剧名称" />
    <RoomButton label="搜索番剧" disabled={busy || !source || !keyword.trim()} onPress={() => void task(async () => {
      setEpisodes([]); setExpanded(''); setResults([]); setSearched(false);
      setResults((await request<{ results: Result[] }>(`${root}/search?${new URLSearchParams({ source, keyword: keyword.trim() })}`)).results); setSearched(true);
    })} />
    <Text style={ui.muted}>{searched ? `共 ${results.length} 条结果` : '输入关键词开始搜索'}</Text>
    {results.length ? <ScrollView testID="anime-results" nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 360, flexGrow: 0 }} contentContainerStyle={{ gap: 8 }}>
      {results.map(item => <View key={item.id} style={ui.card}>
        <RoomButton label={`${expanded === item.id ? '收起选集' : '展开选集'} · ${item.title}`} secondary disabled={busy} onPress={() => {
          if (expanded === item.id) { setExpanded(''); return; }
          void task(async () => { setEpisodes([]); const data = await request<{ episodes: Episode[] }>(`${root}/episodes?${new URLSearchParams({ source, identifier: item.id })}`); setName(item.title); setEpisodes(data.episodes); setExpanded(item.id); });
        }} />
        {expanded === item.id ? episodes.length ? <EpisodePicker key={`${source}:${item.id}`} episodes={episodes} disabled={busy} onAdd={submit} /> : <Text style={ui.muted}>暂无集数</Text> : null}
      </View>)}
    </ScrollView> : null}
    {busy || loadingSources ? <ActivityIndicator color={theme.color('#65d59b')} /> : null}{error ? <Text style={ui.error}>{error}</Text> : null}
  </View>;
}
