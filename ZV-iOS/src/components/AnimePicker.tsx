import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useSession } from '@/state/session';
import { useAppearance } from '@/state/appearance';
import { messageFor } from '@/lib/server';
import type { SourceSelection } from '@/lib/sources';
import { RoomButton, RoomInput, ui as baseUi } from './RoomUi';
type Source = { id: string; name: string };
type Result = { id: string; title: string; source?: string };
type Episode = { id: string; title: string; episodeNumber: number; playbackParams: Record<string, unknown> };
export function AnimePicker({ add }: { add: (value: SourceSelection) => Promise<void> }) {
  const theme = useAppearance(); const ui = theme.styles(baseUi);
  const { request } = useSession(); const [kind, setKind] = useState('anisubs'); const [sources, setSources] = useState<Source[]>([]); const [source, setSource] = useState(''); const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<Result[]>([]); const [episodes, setEpisodes] = useState<Episode[]>([]); const [selected, setSelected] = useState<string[]>([]); const [name, setName] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [progress, setProgress] = useState('');
  const root = `/api/stream/${kind}`;
  useEffect(() => { const cancel = new AbortController(); void request<{ sources: Source[] }>(`${root}/sources`, { signal: cancel.signal }).then(value => { if (!cancel.signal.aborted) setSources(value.sources); }).catch(() => {}); return () => cancel.abort(); }, [root, request]);
  const task = async (work: () => Promise<void>) => { setBusy(true); setError(''); try { await work(); } catch (failure) { setError(messageFor(failure)); } finally { setBusy(false); } };
  const addEpisode = async (episode: Episode) => {
    const title = `${name} · ${episode.title}`;
    if (kind === 'anisubs') { await add({ title, source: 'anime', url: `anisubs://${source}/${episode.id}`, sourceMeta: { sourceId: source, episode, originalTitle: title } }); return; }
    const media = await request<{ url: string; audioUrl?: string; headers?: Record<string, string>; format?: string }>(`${root}/resolve`, { method: 'POST', body: JSON.stringify({ source, episode }) });
    const proxy = (url: string) => { const params = new URLSearchParams({ url }); for (const [key, value] of Object.entries(media.headers || {})) { const header = ({ referer: 'referer', 'user-agent': 'userAgent', origin: 'origin', cookie: 'cookie' } as Record<string, string>)[key.toLowerCase()]; if (header) params.set(header, value); } return `${root}/proxy?${params}`; };
    await add({ title, source: kind === 'anime' ? 'mp4' : kind, url: proxy(media.url), ...(media.audioUrl ? { audioUrl: proxy(media.audioUrl) } : {}), format: media.format });
  };
  const submit = () => task(async () => {
    const items = episodes.filter(item => selected.includes(item.id)); const failures: string[] = []; let done = 0;
    for (const episode of items) { try { await addEpisode(episode); setEpisodes(old => old.filter(item => item.id !== episode.id)); } catch { failures.push(episode.id); } done++; setProgress(`${done}/${items.length}`); }
    setSelected(failures); if (failures.length) setError(`${items.length - failures.length} 集添加成功，${failures.length} 集失败；保留选择，可重试`);
  });
  return <View style={ui.card}><Text style={ui.title}>番剧与 Kazumi</Text><View style={ui.row}>{['anisubs', 'anime', 'kazumi'].map(value => <RoomButton key={value} label={value === 'anisubs' ? 'AniSubs 番剧' : value === 'anime' ? '传统番剧源' : 'Kazumi'} secondary disabled={busy} onPress={() => { setKind(value); setSource(''); setResults([]); setEpisodes([]); setSelected([]); }} />)}</View>{sources.map(item => <RoomButton key={item.id} label={`${source === item.id ? '✓ ' : ''}${item.name}`} secondary disabled={busy} onPress={() => { setSource(item.id); setResults([]); setEpisodes([]); setSelected([]); }} />)}<RoomInput value={keyword} onChangeText={setKeyword} placeholder="搜索番剧名称" /><RoomButton label="搜索番剧" secondary disabled={busy || !source || !keyword.trim()} onPress={() => void task(async () => { setEpisodes([]); setSelected([]); setResults((await request<{ results: Result[] }>(`${root}/search?${new URLSearchParams({ source, keyword })}`)).results); })} />{results.map(item => <RoomButton key={item.id} label={item.title} secondary disabled={busy} onPress={() => void task(async () => { setName(item.title); setSelected([]); setEpisodes((await request<{ episodes: Episode[] }>(`${root}/episodes?${new URLSearchParams({ source, identifier: item.id })}`)).episodes); })} />)}{episodes.length ? <View style={ui.row}><RoomButton label="全选" secondary disabled={busy} onPress={() => setSelected(episodes.map(item => item.id))} /><RoomButton label="取消选择" secondary disabled={busy} onPress={() => setSelected([])} /><RoomButton label={`添加所选 ${selected.length} 集 ${busy ? progress : ''}`} disabled={busy || !selected.length} onPress={() => void submit()} /></View> : null}{episodes.map(episode => <RoomButton key={episode.id} label={`${selected.includes(episode.id) ? '✓ ' : ''}${episode.title}`} disabled={busy} secondary onPress={() => setSelected(old => old.includes(episode.id) ? old.filter(id => id !== episode.id) : [...old, episode.id])} />)}{error ? <Text style={ui.error}>{error}</Text> : null}</View>;
}
