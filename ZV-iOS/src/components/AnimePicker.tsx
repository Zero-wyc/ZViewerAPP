import { useState } from 'react';
import { Text, View } from 'react-native';
import { useSession } from '@/state/session';
import { messageFor } from '@/lib/server';
import type { SourceSelection } from '@/lib/sources';
import { RoomButton, RoomInput, ui } from './RoomUi';
type Source = { id: string; name: string };
type Result = { id: string; title: string; source?: string };
type Episode = { id: string; title: string; episodeNumber: number; playbackParams: Record<string, unknown> };
export function AnimePicker({ add }: { add: (value: SourceSelection) => Promise<void> }) {
  const { request } = useSession(); const [kind, setKind] = useState('anisubs'); const [sources, setSources] = useState<Source[]>([]); const [source, setSource] = useState(''); const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<Result[]>([]); const [episodes, setEpisodes] = useState<Episode[]>([]); const [name, setName] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const root = `/api/stream/${kind}`; const task = async (work: () => Promise<void>) => { setBusy(true); setError(''); try { await work(); } catch (failure) { setError(messageFor(failure)); } finally { setBusy(false); } };
  return <View style={ui.card}><Text style={ui.title}>番剧与 Kazumi</Text><View style={ui.row}>{['anisubs', 'anime', 'kazumi'].map(value => <RoomButton key={value} label={value === 'anisubs' ? 'AniSubs 番剧' : value === 'anime' ? '传统番剧源' : 'Kazumi'} secondary disabled={busy} onPress={() => void task(async () => { setKind(value); setSource(''); setResults([]); setEpisodes([]); setSources((await request<{ sources: Source[] }>(`/api/stream/${value}/sources`)).sources); })} />)}</View>{sources.map(item => <RoomButton key={item.id} label={`${source === item.id ? '✓ ' : ''}${item.name}`} secondary disabled={busy} onPress={() => { setSource(item.id); setResults([]); setEpisodes([]); }} />)}<RoomInput value={keyword} onChangeText={setKeyword} placeholder="搜索番剧名称" /><RoomButton label="搜索番剧" secondary disabled={busy || !source || !keyword.trim()} onPress={() => void task(async () => { setEpisodes([]); setResults((await request<{ results: Result[] }>(`${root}/search?${new URLSearchParams({ source, keyword })}`)).results); })} />{results.map(item => <RoomButton key={item.id} label={item.title} secondary disabled={busy} onPress={() => void task(async () => { setName(item.title); setEpisodes((await request<{ episodes: Episode[] }>(`${root}/episodes?${new URLSearchParams({ source, identifier: item.id })}`)).episodes); })} />)}{episodes.map(episode => <RoomButton key={episode.id} label={episode.title} disabled={busy} secondary onPress={() => void task(async () => { const title = `${name} · ${episode.title}`;
      if (kind === 'anisubs') { await add({ title, source: 'anime', url: `anisubs://${source}/${episode.id}`, sourceMeta: { sourceId: source, episode, originalTitle: title } }); return; }
      const media = await request<{ url: string; audioUrl?: string; headers?: Record<string, string>; format?: string }>(`${root}/resolve`, { method: 'POST', body: JSON.stringify({ source, episode }) });
      const proxy = (url: string) => { const params = new URLSearchParams({ url }); for (const [key, value] of Object.entries(media.headers || {})) { const name = ({ referer: 'referer', 'user-agent': 'userAgent', origin: 'origin', cookie: 'cookie' } as Record<string, string>)[key.toLowerCase()]; if (name) params.set(name, value); } return `${root}/proxy?${params}`; };
      await add({ title, source: kind === 'anime' ? 'mp4' : kind, url: proxy(media.url), ...(media.audioUrl ? { audioUrl: proxy(media.audioUrl) } : {}), format: media.format }); })} />)}{error ? <Text style={ui.error}>{error}</Text> : null}</View>;
}
