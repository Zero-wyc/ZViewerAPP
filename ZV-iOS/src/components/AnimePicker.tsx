import { useMediaPreferences } from '@/hooks/useMediaPreferences';
import { MediaDisplayTools } from './MediaDisplayTools';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, Text, useWindowDimensions, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { checkAbort } from '@/lib/cancellation';
import { addAnimeEpisodes, type AnimeEpisode } from '@/lib/animeSources';
import { useSession } from '@/state/session';
import { useAppearance } from '@/state/appearance';
import { messageFor } from '@/lib/server';
import type { SourceSelection } from '@/lib/sources';
import { RoomButton, RoomIconButton, RoomInput, ui as baseUi } from './RoomUi';
import { SourceDropdown } from './SourceDropdown';
import { SourcePoster } from './SourcePoster';
import { AppDialog } from './AppDialog';
import { SourceBreadcrumbs } from './SourceBreadcrumbs';
import { useMediaPalette } from './MediaPanelUi';

type Source = { id: string; name: string };
type Result = { id: string; title: string; cover?: string; poster?: string; description?: string };
export function AnimePicker({ add, initialKind = 'anisubs', keyword, onKeywordChange, onBusyChange, pendingSelections }: { add: (value: SourceSelection) => Promise<void>; initialKind?: string; keyword: string; onKeywordChange: (value: string) => void; onBusyChange?: (busy: boolean) => void; pendingSelections: { current: Map<string, SourceSelection> } }) {
  const display = useMediaPreferences();
  const theme = useAppearance(); const ui = theme.styles(baseUi); const p = useMediaPalette(); const { request } = useSession(); const { width } = useWindowDimensions();
  const kind = initialKind; const root = `/api/stream/${kind}`; const title = kind === 'anisubs' ? 'ani-subs 番剧源' : kind === 'kazumi' ? 'Kazumi 番剧源' : '传统番剧源';
  const [open, setOpen] = useState(false); const [wide, setWide] = useState(false); const [wall, setWall] = useState(true); const [multi, setMulti] = useState(false); const [contentWidth, setContentWidth] = useState(300);
  const [sources, setSources] = useState<Source[]>([]); const [source, setSource] = useState(''); const [sourceRetry, setSourceRetry] = useState(0);
  const [results, setResults] = useState<Result[]>([]); const [current, setCurrent] = useState<Result | null>(null); const [episodes, setEpisodes] = useState<AnimeEpisode[]>([]); const [selected, setSelected] = useState<string[]>([]); const [confirmWhole, setConfirmWhole] = useState(false);
  const [busy, setBusy] = useState(false); const [adding, setAdding] = useState(false); const [loadingSources, setLoadingSources] = useState(false); const [searched, setSearched] = useState(false); const [error, setError] = useState(''); const [sourceError, setSourceError] = useState(''); const [notice, setNotice] = useState('');
  const operation = useRef<AbortController | null>(null); const submitLock = useRef(false); const keywordRef = useRef(keyword);
  const failedWhole = useRef(new Map<string, string[]>());
  useEffect(() => { keywordRef.current = keyword; }, [keyword]);
  const locked = busy || adding || loadingSources; const columns = contentWidth < 280 ? 1 : contentWidth < 520 ? 2 : contentWidth < 860 ? 3 : 4; const cardWidth = Math.max(1, (contentWidth - 12 * (columns - 1)) / columns);
  const allSelected = !!episodes.length && episodes.every(item => selected.includes(item.id));
  const episodeColumns = Math.max(1, Math.floor((contentWidth - 26 + 8) / 128));
  const episodeWidth = Math.max(1, Math.floor((contentWidth - 26 - (episodeColumns - 1) * 8) / episodeColumns));
  const selectEpisode = (id: string) => { if (locked) return; setSelected(values => values.includes(id) ? values.filter(value => value !== id) : multi ? [...values, id] : [id]); setConfirmWhole(false); setNotice(''); setError(''); };
  useEffect(() => {
    if (!open) return;
    const cancel = new AbortController();
    void request<{ sources: Source[] }>(`${root}/sources`, { signal: cancel.signal }).then(value => {
      if (cancel.signal.aborted) return; setSources(value.sources); setSource(old => value.sources.some(item => item.id === old) ? old : value.sources[0]?.id || '');
      if (!value.sources.length) setSourceError('未找到可用数据源，请检查订阅配置');
    }).catch(failure => { if (!cancel.signal.aborted) setSourceError(messageFor(failure)); }).finally(() => { if (!cancel.signal.aborted) setLoadingSources(false); });
    return () => { cancel.abort(); };
  }, [open, root, request, sourceRetry]);
  useEffect(() => () => { operation.current?.abort(); }, []);
  const task = useCallback(async (work: (signal: AbortSignal) => Promise<void>) => {
    operation.current?.abort(); const controller = new AbortController(); operation.current = controller; setBusy(true); setError(''); setNotice('');
    try { await work(controller.signal); } catch (failure) { if (!controller.signal.aborted) setError(messageFor(failure)); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }, []);
  const search = useCallback((selectedSource: string, term: string) => task(async signal => {
    Keyboard.dismiss(); setCurrent(null); setEpisodes([]); setSelected([]); setConfirmWhole(false); setResults([]); setSearched(false); failedWhole.current.clear();
    if (!term.trim() || !selectedSource) return;
    const data = await request<{ results: Result[] }>(`${root}/search?${new URLSearchParams({ source: selectedSource, keyword: term.trim() })}`, { signal }); checkAbort(signal); setResults(data.results); setSearched(true);
  }), [request, root, task]);
  // Opening and source changes search once; typing still requires Search.
  useEffect(() => { if (open && source && !loadingSources && !sourceError) void search(source, keywordRef.current); }, [open, source, loadingSources, sourceError, search]);
  const close = () => { if (submitLock.current) return; operation.current?.abort(); setBusy(false); setOpen(false); setSelected([]); setConfirmWhole(false); };
  const browse = (item: Result, whole = false) => {
    if (locked) return;
    void task(async signal => {
      setSelected([]); setConfirmWhole(false);
      const data = await request<{ episodes: AnimeEpisode[] }>(`${root}/episodes?${new URLSearchParams({ source, identifier: item.id })}`, { signal }); checkAbort(signal);
      setCurrent(item); setEpisodes(data.episodes); if (whole && data.episodes.length && data.episodes.every(episode => !!episode.id)) { setSelected(failedWhole.current.get(item.id) || data.episodes.map(episode => episode.id)); setConfirmWhole(true); }
    });
  };
  const submit = async () => {
    if (!current || locked || submitLock.current || !selected.length) return;
    submitLock.current = true; operation.current?.abort(); const controller = new AbortController(); operation.current = controller;
    setAdding(true); onBusyChange?.(true); setError(''); setNotice('');
    try {
      const result = await addAnimeEpisodes(request, kind, source, current.title, episodes.filter(item => selected.includes(item.id)), add, controller.signal, pendingSelections.current);
      setSelected(values => values.filter(id => !result.added.includes(id))); setConfirmWhole(false);
      if (confirmWhole || failedWhole.current.has(current.id)) { const remaining = (failedWhole.current.get(current.id) || selected).filter(id => !result.added.includes(id)); if (remaining.length) failedWhole.current.set(current.id, remaining); else failedWhole.current.delete(current.id); }
      if (result.cancelled) setNotice(`已停止添加，已添加 ${result.added.length} 集，其余保留选择`);
      else if (result.added.length) setNotice(`已添加 ${result.added.length} 集，可继续选择`);
      if (result.failures.length) setError(`${result.failures.length} 集添加失败，保留选择可重试：${result.failures[0].message}`);
    } catch (failure) { if (!controller.signal.aborted) setError(messageFor(failure)); }
    finally { submitLock.current = false; if (operation.current === controller) setAdding(false); onBusyChange?.(false); }
  };
  const poster = (item: Result, posterWidth: number) => <SourcePoster uri={item.cover || item.poster} proxyPath={`${root}/proxy?${new URLSearchParams({ url: item.cover || item.poster || '', referer: item.id })}`} width={posterWidth} height={posterWidth * 1.5} contain />;
  return <View style={{ gap: 12 }}>
    <View style={{ borderRadius: 18, borderWidth: 1, borderColor: p.line, padding: 14 }}><Text style={[ui.muted, { lineHeight: 22 }]}>{kind === 'kazumi' ? '从 Kazumi XPath 规则源搜索番剧并选择集数播放。' : kind === 'anisubs' ? '从聚合番剧源搜索番剧并选择集数播放。' : '从传统番剧源搜索番剧并选择集数播放。'}</Text></View>
    <RoomButton label="搜索番剧" onPress={() => { setLoadingSources(true); setSourceError(''); setOpen(true); }} />
    <AppDialog visible={open} title={title} maxWidth={wide ? Math.max(300, width - 32) : 960} close={close} titleActions={<View style={ui.row}><MediaDisplayTools compact /><RoomIconButton label={wide ? '还原番剧弹窗' : '展开番剧弹窗'} icon={wide ? 'minimize' : 'maximize'} onPress={() => setWide(value => !value)} /></View>} footer={<View style={{ gap: 8, flexShrink: 0 }}>
      {notice ? <Text accessibilityLiveRegion="polite" style={ui.muted}>{notice}</Text> : null}{error ? <Text accessibilityLiveRegion="assertive" style={ui.error}>{error}</Text> : null}
      <Text style={ui.muted}>{confirmWhole ? `已选《${current?.title}》${selected.length} 集，点击添加` : selected.length ? `已选择 ${selected.length} 集` : '多选模式可批量添加'}</Text>
      <View style={[ui.row, { justifyContent: 'flex-end' }]}>{current && episodes.length && !confirmWhole ? <RoomButton label={allSelected ? '取消全选' : `全选 (${episodes.length})`} secondary disabled={locked} onPress={() => { setMulti(true); setSelected(allSelected ? [] : episodes.map(item => item.id)); }} /> : null}<RoomButton label={adding ? '停止添加' : confirmWhole ? '取消整部添加' : '取消'} secondary onPress={() => { if (adding) { operation.current?.abort(); setNotice('正在停止，等待已提交条目确认…'); } else if (confirmWhole) { setConfirmWhole(false); setSelected([]); } else close(); }} /><RoomButton label={adding ? '正在添加…' : confirmWhole ? `确认添加 ${selected.length} 集` : multi ? `添加集数 (${selected.length})` : '添加当前条目'} disabled={locked || !selected.length} onPress={() => void submit()} /></View>
    </View>}>
      <View testID="anime-search-controls" style={ui.row}><View style={{ width: contentWidth >= 600 ? 180 : '100%', minWidth: 0 }}><SourceDropdown label="番剧数据源" testID="anime-source" value={source} options={sources} disabled={adding || loadingSources || !sources.length} onChange={value => { if (value !== source) { operation.current?.abort(); setSource(value); } }} /></View><RoomInput value={keyword} onChangeText={onKeywordChange} placeholder="搜索番剧名称" style={{ flex: 1, minWidth: 110 }} onSubmitEditing={() => { if (!locked) void search(source, keyword); }} /><RoomIconButton label="清空番剧搜索" icon="x" onPress={() => { if (!adding) { onKeywordChange(''); void search(source, ''); } }} /><RoomButton label="搜索" disabled={locked || !source || !keyword.trim()} onPress={() => void search(source, keyword)} /></View>
      {sourceError ? <><Text style={ui.error}>{sourceError}</Text><RoomButton label="重新加载数据源" secondary disabled={loadingSources || adding} onPress={() => { setLoadingSources(true); setSourceError(''); setSourceRetry(value => value + 1); }} /></> : null}
      <SourceBreadcrumbs disabled={locked} items={[{ id: 'results', label: '番剧搜索结果', ...(current ? { onPress: () => { setCurrent(null); setSelected([]); setConfirmWhole(false); } } : {}) }, ...(current ? [{ id: 'current', label: current.title }] : [])]} />
      <View style={[ui.row, { justifyContent: 'space-between' }]}>{current ? <MediaDisplayTools episodes names={false} /> : <View style={{ flexDirection: 'row', borderRadius: 22, borderWidth: 1, borderColor: p.line, padding: 3 }}>{[{ value: false, label: '番剧列表', title: '列表', icon: 'list' as const }, { value: true, label: '番剧海报墙', title: '海报墙', icon: 'grid' as const }].map(mode => <Pressable key={mode.label} accessibilityRole="button" accessibilityLabel={mode.label} accessibilityState={{ selected: wall === mode.value }} onAccessibilityTap={() => setWall(mode.value)} onPress={() => setWall(mode.value)} style={{ minHeight: 40, paddingHorizontal: 12, borderRadius: 19, gap: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: wall === mode.value ? p.container : 'transparent' }}><Feather name={mode.icon} size={18} color={p.text} /><Text style={ui.text}>{mode.title}</Text></Pressable>)}</View>}<RoomButton label={multi ? '退出多选' : '多选'} secondary selected={multi} disabled={locked} onPress={() => { setMulti(value => !value); setSelected([]); setConfirmWhole(false); }} /></View>
      {current ? <View style={ui.row}><RoomButton label="返回搜索结果" secondary disabled={locked} onPress={() => { setCurrent(null); setEpisodes([]); setSelected([]); setConfirmWhole(false); setError(''); setNotice(''); }} /><RoomButton label="添加整部" secondary disabled={locked || !episodes.length || episodes.some(item => !item.id)} onPress={() => { setSelected(failedWhole.current.get(current.id) || episodes.map(item => item.id)); setConfirmWhole(true); }} /></View> : null}
      {busy || adding || loadingSources ? <ActivityIndicator color={theme.color('#65d59b')} /> : null}
      <View testID="anime-results" onLayout={event => setContentWidth(event.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start', minHeight: 100 }}>
        {current ? <View style={{ width: '100%', borderWidth: 1, borderColor: p.line, borderRadius: 18, overflow: 'hidden' }}><Text style={[ui.text, { fontWeight: '600', padding: 14, borderBottomWidth: 1, borderColor: p.line }]}>集数（{episodes.length}）</Text><View style={{ padding: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{episodes.map(item => { const chosen = selected.includes(item.id); return <Pressable key={item.id} testID={`anime-episode-${item.id}`} accessibilityRole="button" accessibilityLabel={`选择集数 ${item.title}`} accessibilityState={{ selected: chosen, disabled: locked }} disabled={locked} onAccessibilityTap={() => selectEpisode(item.id)} onPress={() => selectEpisode(item.id)} style={{ width: display.episodeMode === 'grid' ? episodeWidth : '100%', minHeight: 58, padding: 10, borderRadius: 12, backgroundColor: chosen ? p.container : 'transparent', flexDirection: display.episodeMode === 'grid' ? 'column' : 'row', gap: 10, alignItems: display.episodeMode === 'grid' ? 'flex-start' : 'center', opacity: locked ? .5 : 1 }}><Feather name={chosen ? 'check-square' : 'film'} size={22} color={chosen ? p.accent : p.muted} /><Text numberOfLines={display.fullNames ? undefined : 1} style={[ui.text, { flexShrink: 1, minWidth: 0 }]}>{item.title}</Text></Pressable>; })}</View></View> : results.map(item => <View key={item.id} testID={`anime-result-${item.id}`} style={{ width: wall ? cardWidth : '100%', gap: 8, flexDirection: wall ? 'column' : 'row', alignItems: wall ? 'stretch' : 'center' }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`打开番剧 ${item.title}`} disabled={locked} onAccessibilityTap={() => { if (!locked) browse(item); }} onPress={() => browse(item)} style={{ width: wall ? cardWidth : 72 }}>{poster(item, wall ? cardWidth : 72)}</Pressable>
          <View style={{ flex: wall ? undefined : 1, minWidth: 0, gap: 8 }}><Pressable accessibilityRole="button" accessibilityLabel={`查看集数 ${item.title}`} disabled={locked} onAccessibilityTap={() => { if (!locked) browse(item); }} onPress={() => browse(item)}><Text numberOfLines={display.fullNames ? undefined : wall ? 2 : 1} style={ui.text}>{item.title}</Text></Pressable>{!wall && item.description ? <Text style={ui.muted} numberOfLines={2}>{item.description}</Text> : null}<View style={ui.row}><Text style={[ui.muted, { flex: 1 }]}>剧集</Text><RoomButton label="整部" secondary disabled={locked} onPress={() => browse(item, true)} /></View></View>
        </View>)}
        {!busy && !loadingSources && !(current ? episodes.length : results.length) ? <Text style={ui.muted}>{current ? '暂无集数' : searched ? '没有找到匹配的番剧' : '输入关键词开始搜索番剧'}</Text> : null}
      </View>
      {error && !adding ? <RoomButton label={current ? '重新加载集数' : '重试搜索'} secondary disabled={locked || !source} onPress={() => current ? browse(current) : void search(source, keyword)} /> : null}
    </AppDialog>
  </View>;
}
