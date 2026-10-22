import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useSession } from '@/state/session';
import { useAppearance } from '@/state/appearance';
import type { SourceSelection } from '@/lib/sources';
import { messageFor } from '@/lib/server';
import { addCmsEpisodes, type CmsDetail } from '@/lib/cmsSources';
import { AppDialog } from './AppDialog';
import { EpisodePicker } from './EpisodePicker';
import { SourceDropdown } from './SourceDropdown';
import { RoomButton, RoomInput, ui as baseUi } from './RoomUi';
import { MediaDisplayTools } from './MediaDisplayTools';

type Result = { id: string; title: string };
export function CmsPicker({ add, onBusyChange }: { add: (value: SourceSelection) => Promise<void>; onBusyChange: (busy: boolean) => void }) {
  const { request } = useSession(); const theme = useAppearance(); const ui = theme.styles(baseUi);
  const [open, setOpen] = useState(false); const [sources, setSources] = useState<{ id: string; name: string }[]>([]); const [source, setSource] = useState('');
  const [keyword, setKeyword] = useState(''); const [results, setResults] = useState<Result[]>([]); const [searched, setSearched] = useState(false); const [detail, setDetail] = useState<CmsDetail | null>(null); const [group, setGroup] = useState('0');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const operation = useRef<AbortController | null>(null);
  const submitting = useRef(false);
  useEffect(() => () => { operation.current?.abort(); onBusyChange(false); }, [onBusyChange]);
  const task = async (work: (signal: AbortSignal) => Promise<void>) => {
    operation.current?.abort(); const controller = new AbortController(); operation.current = controller; setBusy(true); setError('');
    try { await work(controller.signal); } catch (failure) { if (!controller.signal.aborted) setError(messageFor(failure)); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const begin = () => { setOpen(true); void task(async signal => { const data = await request<{ sources: { id: string; name: string }[] }>('/api/stream/cms/sources', { signal }); if (signal.aborted) return; setSources(data.sources); setSource(value => data.sources.some(item => item.id === value) ? value : data.sources[0]?.id || ''); }); };
  const episodes = detail?.playGroups[Number(group)]?.episodes || [];
  return <View style={{ gap: 10 }}><Text style={ui.muted}>从服务器配置的 TVBox 站点搜索影片，选择播放组与集数后添加。</Text><RoomButton label="搜索 TVBox 采集源" onPress={begin} />
    <AppDialog visible={open} title="TVBox 采集源" titleActions={<MediaDisplayTools compact />} close={() => { if (!submitting.current) { operation.current?.abort(); setBusy(false); setOpen(false); } }}>
      <SourceDropdown label="采集站点" value={source} options={sources} disabled={busy} onChange={value => { setSource(value); setResults([]); setSearched(false); setDetail(null); }} />
      {!sources.length && !busy ? <Text style={ui.muted}>服务器尚未配置可用的 TVBox 采集站点。</Text> : null}
      <View style={ui.row}><RoomInput placeholder="搜索影片" value={keyword} onChangeText={setKeyword} style={{ flex: 1, minWidth: 100 }} /><RoomButton label="搜索" disabled={busy || !source || !keyword.trim()} onPress={() => void task(async signal => { const data = await request<{ results: Result[] }>(`/api/stream/cms/search?${new URLSearchParams({ source, keyword: keyword.trim() })}`, { signal }); if (!signal.aborted) { setDetail(null); setResults(data.results); setSearched(true); } })} /></View>
      {!detail && !busy && !results.length ? <Text style={ui.muted}>{searched ? '没有找到匹配的影片，可更换站点或关键词重试。' : '输入关键词开始搜索影片。'}</Text> : null}
      {detail ? <><RoomButton label="返回搜索结果" secondary disabled={busy} onPress={() => setDetail(null)} /><Text style={ui.title}>{detail.title}</Text>
        <SourceDropdown label="播放组" value={group} options={detail.playGroups.map((item, index) => ({ id: String(index), name: item.name }))} disabled={busy} onChange={setGroup} />
        <EpisodePicker showNames={false} key={`${source}:${detail.id}:${group}`} disabled={busy} onCancel={() => operation.current?.abort()} episodes={episodes.map((episode, index) => ({ id: String(index), title: episode.title }))} onAdd={async ids => {
          if (submitting.current) return [];
          submitting.current = true; operation.current?.abort(); const controller = new AbortController(); operation.current = controller;
          onBusyChange(true); setBusy(true); setError('');
          try {
            const result = await addCmsEpisodes(source, detail, Number(group), ids, add, controller.signal);
            if (result.failures.length && !controller.signal.aborted) setError(`${result.failures.length} 集添加失败，保留选择可重试：${result.failures[0].message}`);
            return result.added;
          } catch (failure) { if (!controller.signal.aborted) setError(messageFor(failure)); return []; }
          finally { submitting.current = false; if (operation.current === controller) setBusy(false); onBusyChange(false); }
        }} />
      </> : results.map(item => <RoomButton key={item.id} label={item.title} secondary disabled={busy} onPress={() => void task(async signal => { const data = await request<{ detail: CmsDetail }>(`/api/stream/cms/detail?${new URLSearchParams({ source, vodId: item.id })}`, { signal }); if (!signal.aborted) { setDetail(data.detail); setGroup('0'); } })} />)}
      {busy ? <Text style={ui.muted}>正在处理…</Text> : null}{error ? <Text style={ui.error}>{error}</Text> : null}
    </AppDialog>
  </View>;
}
