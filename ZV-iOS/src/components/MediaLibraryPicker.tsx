import { useMediaPreferences } from '@/hooks/useMediaPreferences';
import { MediaDisplayTools } from './MediaDisplayTools';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, useWindowDimensions, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useAppearance } from '@/state/appearance';
import { useSession } from '@/state/session';
import { addLibraryEntry, canAddWholeLibrary, libraryImage, libraryRoute, selectLibraryMount, type LibraryEntry, type LibraryKind } from '@/lib/mediaLibrary';
import { addSourceBatch } from '@/lib/sourceBatch';
import type { SourceSelection } from '@/lib/sources';
import { messageFor } from '@/lib/server';
import { RoomButton, RoomIconButton, RoomInput, ui as baseUi } from './RoomUi';
import { SourceDropdown } from './SourceDropdown';
import { SourcePoster } from './SourcePoster';
import { AppDialog } from './AppDialog';
import { SourceBreadcrumbs } from './SourceBreadcrumbs';

type Mount = { id: number; name: string; serverUrl: string; directLink?: boolean };
export function MediaLibraryPicker({ kind, add, onBusyChange }: { kind: LibraryKind; add: (value: SourceSelection) => Promise<void>; onBusyChange: (busy: boolean) => void }) {
  const display = useMediaPreferences();
  const theme = useAppearance(); const ui = theme.styles(baseUi); const { request } = useSession(); const { width } = useWindowDimensions();
  const name = kind === 'emby' ? 'Emby' : 'Jellyfin';
  const [mounts, setMounts] = useState<Mount[]>([]); const [mountId, setMountId] = useState(''); const [directLink, setDirectLink] = useState(false);
  const [entries, setEntries] = useState<LibraryEntry[]>([]); const [history, setHistory] = useState<LibraryEntry[]>([]);
  const [keyword, setKeyword] = useState(''); const [searchView, setSearchView] = useState(false);
  const [open, setOpen] = useState(false); const [wide, setWide] = useState(false); const [wall, setWall] = useState(true); const [multi, setMulti] = useState(false);
  const [selected, setSelected] = useState<string[]>([]); const [contentWidth, setContentWidth] = useState(300);
  const [leafDirectories, setLeafDirectories] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false); const [adding, setAdding] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [confirmSeries, setConfirmSeries] = useState<LibraryEntry | null>(null);
  const operation = useRef<AbortController | null>(null); const submitLock = useRef(false); const mount = mounts.find(item => String(item.id) === mountId);
  const mountIdRef = useRef('');
  const episodeView = entries.length > 0 && entries.every(entry => entry.type === 'file' && entry.embyType === 'Episode');
  const grid = episodeView ? display.episodeMode === 'grid' : wall;
  const columns = episodeView ? Math.max(1, Math.floor((contentWidth + 12) / 132)) : contentWidth < 280 ? 1 : contentWidth < 520 ? 2 : contentWidth < 860 ? 3 : 4;
  const cardWidth = Math.max(1, (contentWidth - 12 * (columns - 1)) / columns); const locked = busy || adding;
  const task = useCallback(async (work: (signal: AbortSignal) => Promise<void>) => {
    operation.current?.abort(); const controller = new AbortController(); operation.current = controller;
    setBusy(true); setError('');
    try { await work(controller.signal); } catch (failure) { if (!controller.signal.aborted) setError(messageFor(failure)); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }, []);
  const loadMounts = useCallback(() => task(async signal => { const data = await request<{ mounts: Mount[] }>(`/api/${kind}/mounts`, { signal }); if (!signal.aborted) { const selectedMount = selectLibraryMount(data.mounts, mountIdRef.current); mountIdRef.current = selectedMount ? String(selectedMount.id) : ''; setMounts(data.mounts); setMountId(mountIdRef.current); setDirectLink(selectedMount?.directLink === true); } }), [kind, request, task]);
  useEffect(() => { let active = true; void Promise.resolve().then(() => { if (active) void loadMounts(); }); return () => { active = false; operation.current?.abort(); }; }, [loadMounts]);
  const inspectDirectories = async (values: LibraryEntry[], signal: AbortSignal) => {
    const candidates = values.filter(entry => ['Series', 'Season'].includes(entry.embyType || '')); let next = 0;
    setLeafDirectories(old => ({ ...old, ...Object.fromEntries(candidates.map(entry => [entry.path, false])) }));
    await Promise.all(Array.from({ length: Math.min(4, candidates.length) }, async () => {
      while (!signal.aborted && next < candidates.length) {
        const entry = candidates[next++];
        try { const data = await request<{ entries: LibraryEntry[] }>(libraryRoute(kind, Number(mountId), entry.path), { signal }); if (!signal.aborted) setLeafDirectories(old => ({ ...old, [entry.path]: canAddWholeLibrary(data.entries) })); }
        catch { if (!signal.aborted) setLeafDirectories(old => ({ ...old, [entry.path]: false })); }
      }
    }));
  };
  const browse = (stack: LibraryEntry[]) => task(async signal => {
    setEntries([]); setSelected([]); setSearchView(false); setConfirmSeries(null); setNotice('');
    const data = await request<{ entries: LibraryEntry[] }>(libraryRoute(kind, Number(mountId), stack.at(-1)?.path), { signal });
    if (!signal.aborted) { setEntries(data.entries); setHistory(stack); void inspectDirectories(data.entries, signal); }
  });
  const search = () => task(async signal => {
    setEntries([]); setSelected([]); setConfirmSeries(null); setNotice(''); const query = keyword.trim();
    const data = await request<{ entries: LibraryEntry[] }>(query ? `/api/${kind}/mounts/${mountId}/search?term=${encodeURIComponent(query)}` : libraryRoute(kind, Number(mountId), history.at(-1)?.path), { signal });
    if (!signal.aborted) { setEntries(data.entries); setSearchView(!!query); void inspectDirectories(data.entries, signal); }
  });
  const submit = async (ids: string[], series?: LibraryEntry) => {
    if (!mount || submitLock.current || busy) return;
    submitLock.current = true; operation.current?.abort(); const controller = new AbortController(); operation.current = controller;
    const targets = series ? [series] : entries.filter(item => item.type !== 'directory' && ids.includes(item.path));
    setAdding(true); onBusyChange(true); setError(''); setNotice('');
    try {
      const result = await addSourceBatch(targets, entry => entry.path, entry => addLibraryEntry(request, kind, { ...mount, directLink }, entry, !!series, add, controller.signal), controller.signal);
      setSelected(values => values.filter(value => !result.added.includes(value)));
      if (result.cancelled) setNotice(`已停止添加，已添加 ${result.added.length} 个条目，其余保留选择`);
      else if (result.added.length) setNotice(`已添加 ${series ? '整部 / 整季卡' : `${result.added.length} 个条目`}，可继续选择`);
      if (result.failures.length) setError(`${result.failures.length} 个条目添加失败，保留选择可重试：${result.failures[0].message}`);
      if (series && result.added.length) setConfirmSeries(null);
    } finally { submitLock.current = false; if (operation.current === controller) setAdding(false); onBusyChange(false); }
  };
  const close = () => { if (adding) { operation.current?.abort(); setNotice('正在停止，等待已提交条目确认…'); } else { operation.current?.abort(); setBusy(false); setOpen(false); } };
  const choose = (entry: LibraryEntry) => {
    if (locked) return;
    if (entry.type === 'directory') { void browse([...history, entry]); return; }
    setSelected(values => values.includes(entry.path) ? values.filter(value => value !== entry.path) : multi ? [...values, entry.path] : [entry.path]); setNotice(''); setError('');
  };
  const current = history.at(-1); const files = entries.filter(entry => entry.type !== 'directory');
  const allSelected = files.length > 0 && files.every(entry => selected.includes(entry.path));
  const feedback = <>{adding ? <ActivityIndicator color={theme.color('#65d59b')} /> : null}{notice ? <Text accessibilityLiveRegion="polite" style={ui.muted}>{notice}</Text> : null}{error ? <Text accessibilityLiveRegion="assertive" style={ui.error}>{error}</Text> : null}</>;
  return <View style={{ gap: 12 }}>
    <Text style={ui.text}>使用已保存的 {name} 挂载</Text>
    <SourceDropdown label={`使用已保存的 ${name} 挂载`} testID="library-mount" value={mountId} options={mounts.map(item => ({ id: String(item.id), name: item.name }))} disabled={locked} onChange={value => { operation.current?.abort(); mountIdRef.current = value; setMountId(value); setDirectLink(!!mounts.find(item => String(item.id) === value)?.directLink); setEntries([]); setHistory([]); setSelected([]); setConfirmSeries(null); setLeafDirectories({}); setNotice(''); setError(''); }} />
    <View style={ui.row}><View style={{ flex: 1 }}><RoomButton label={`浏览 ${name} 媒体库`} secondary disabled={!mount || locked} onPress={() => { setOpen(true); if (!entries.length) void browse(history); }} /></View><RoomIconButton label="刷新挂载" icon="refresh-cw" onPress={() => { if (!locked) { setEntries([]); setHistory([]); setSelected([]); setConfirmSeries(null); setLeafDirectories({}); setNotice(''); void loadMounts(); } }} /></View>
    <Text style={ui.text}>播放方式</Text><SourceDropdown label="播放方式" value={directLink ? 'direct' : 'proxy'} options={[{ id: 'proxy', name: '服务器转发' }, { id: 'direct', name: '直链直连' }]} disabled={locked} onChange={value => setDirectLink(value === 'direct')} />
    <Text style={ui.muted}>{mount ? '浏览媒体库选择电影 / 剧集，多选模式可批量添加。' : '服务器暂无已配置的媒体库挂载。'}</Text>
    {selected.length ? <><Text style={ui.text}>{multi ? `已选择 ${selected.length} 个条目` : entries.find(entry => entry.path === selected[0])?.name}</Text><RoomButton label={adding ? '正在添加…' : '添加'} disabled={locked} onPress={() => void submit(selected)} /></> : null}
    {adding && !open ? <RoomButton label="停止添加" secondary onPress={close} /> : null}
    {!open ? feedback : null}
    <AppDialog visible={open} title={`浏览 ${name} 媒体库`} maxWidth={wide ? Math.max(300, width - 32) : 960} close={close} titleActions={<View style={ui.row}><MediaDisplayTools compact /><RoomIconButton label={wide ? '还原媒体库' : '展开媒体库'} icon={wide ? 'minimize' : 'maximize'} onPress={() => setWide(value => !value)} /></View>} footer={<View style={{ gap: 8, flexShrink: 0 }}>
      {feedback}<Text style={ui.muted}>{selected.length ? `已选择 ${selected.length} 个条目` : '多选模式可批量添加'}</Text>
      <View style={[ui.row, { justifyContent: 'flex-end' }]}>{multi && files.length ? <RoomButton label={allSelected ? '取消全选' : '全选'} secondary disabled={locked} onPress={() => setSelected(allSelected ? [] : files.map(entry => entry.path))} /> : null}<RoomButton label={adding ? '停止添加' : '取消'} secondary onPress={close} /><RoomButton label={adding ? '正在添加…' : multi ? `添加 (${selected.length})` : '添加当前条目'} disabled={locked || !selected.length} onPress={() => void submit(selected)} /></View>
    </View>}>
      <View style={ui.row}><RoomInput value={keyword} onChangeText={setKeyword} placeholder="搜索媒体库（电影 / 剧集 / 单集）" style={{ flex: 1, minWidth: 110 }} onSubmitEditing={() => { if (!locked) void search(); }} /><RoomButton label="搜索" secondary disabled={locked} onPress={() => void search()} /></View>
      <SourceBreadcrumbs disabled={locked} items={[
        { id: 'root', label: mount?.name || name, ...(history.length || searchView ? { onPress: () => { void browse([]); } } : {}) },
        ...history.map((item, index) => ({ id: `history-${index}`, label: item.name, ...(index < history.length - 1 || searchView ? { onPress: () => { void browse(history.slice(0, index + 1)); } } : {}) })),
        ...(searchView ? [{ id: 'search', label: `搜索结果 · ${entries.length}` }] : []),
      ]} />
      <View style={[ui.row, { justifyContent: 'space-between' }]}>{episodeView ? <MediaDisplayTools episodes names={false} /> : <View style={{ flexDirection: 'row', borderRadius: 22, borderWidth: 1, borderColor: theme.color('#343d41'), padding: 3 }}>{[{ value: false, label: '列表', icon: 'list' as const }, { value: true, label: '海报墙', icon: 'grid' as const }].map(mode => <Pressable key={mode.label} accessibilityRole="button" accessibilityLabel={mode.label} accessibilityState={{ selected: wall === mode.value, disabled: locked }} disabled={locked} onAccessibilityTap={() => { if (!locked) setWall(mode.value); }} onPress={() => setWall(mode.value)} style={{ minHeight: 40, paddingHorizontal: 12, borderRadius: 19, gap: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: wall === mode.value ? theme.color('#343d41') : 'transparent' }}><Feather name={mode.icon} size={18} color={theme.color('#edf1ef')} /><Text style={ui.text}>{mode.label}</Text></Pressable>)}</View>}<RoomButton label={multi ? '退出多选' : '多选'} secondary selected={multi} disabled={locked} onPress={() => { setMulti(value => !value); setSelected([]); }} /></View>
      {searchView || history.length ? <View style={ui.row}><RoomButton label={searchView ? '返回目录' : '上一级'} secondary disabled={locked} onPress={() => void browse(searchView ? history : history.slice(0, -1))} />{!searchView && ['Series', 'Season'].includes(current?.embyType || '') ? <RoomButton label={current?.embyType === 'Series' ? '添加整部' : '添加整季'} secondary disabled={locked || !canAddWholeLibrary(entries)} onPress={() => setConfirmSeries(current!)} /> : null}</View> : null}
      {busy ? <ActivityIndicator color={theme.color('#65d59b')} /> : null}
      <View testID="library-results" onLayout={event => setContentWidth(event.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
        {mount ? entries.map(entry => { const chosen = selected.includes(entry.path); const posterWidth = grid ? Math.max(1, cardWidth - 2) : 60; const posterHeight = entry.embyType === 'Episode' ? posterWidth * 9 / 16 : posterWidth * 3 / 2;
          return <View key={entry.path} testID={`library-card-${entry.path}`} style={{ width: grid ? cardWidth : contentWidth, borderRadius: 12, borderWidth: 1, borderColor: theme.color(chosen ? '#65d59b' : '#343d41'), overflow: 'hidden' }}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${entry.type === 'directory' ? '浏览目录' : '选择影片'} ${entry.name}`} accessibilityState={{ selected: chosen, disabled: locked }} disabled={locked} onAccessibilityTap={() => { if (!locked) choose(entry); }} onPress={() => choose(entry)} style={{ flexDirection: grid ? 'column' : 'row', gap: grid ? 0 : 12, alignItems: grid ? undefined : 'center', padding: grid ? 0 : 8 }}>
              <View><SourcePoster serverProxy uri={libraryImage(kind, mount.id, entry)} width={posterWidth} height={posterHeight} />{chosen ? <View style={{ position: 'absolute', top: 6, left: 6, borderRadius: 4, backgroundColor: theme.color('#65d59b'), padding: 3 }}><Feather name="check" size={16} color={theme.color('#111417')} /></View> : null}{entry.type === 'directory' && entry.childCount != null ? <Text style={{ position: 'absolute', right: 6, top: 6, borderRadius: 5, backgroundColor: 'rgba(0,0,0,0.65)', color: '#fff', paddingHorizontal: 6, paddingVertical: 2 }}>{entry.childCount} 项</Text> : null}</View>
              <View style={{ padding: grid ? 10 : 0, gap: 4, flex: grid ? undefined : 1, minWidth: 0 }}><Text numberOfLines={display.fullNames ? undefined : grid ? 2 : 1} style={ui.text}>{entry.indexNumber ? `S${entry.parentIndexNumber ?? '?'}E${entry.indexNumber} · ` : ''}{entry.name}</Text>{chosen ? <Text style={ui.muted}>已选择</Text> : null}</View>
            </Pressable>
            {['Series', 'Season'].includes(entry.embyType || '') ? <View style={{ padding: 8 }}><RoomButton label={entry.embyType === 'Series' ? '添加整部' : '添加整季'} secondary disabled={locked || leafDirectories[entry.path] !== true} onPress={() => setConfirmSeries(entry)} /></View> : null}
          </View>;
        }) : null}
        {!busy && !entries.length ? <Text style={ui.muted}>{searchView ? '未找到匹配的影片' : '当前目录为空'}</Text> : null}
      </View>
      {confirmSeries ? <View style={ui.card}><Text style={ui.text}>将「{confirmSeries.name}」的全部分集添加为一张片单卡？添加后可在片单切集。</Text><View style={ui.row}><RoomButton label="取消整季添加" secondary disabled={locked} onPress={() => setConfirmSeries(null)} /><RoomButton label="确认添加" disabled={locked} onPress={() => void submit([], confirmSeries)} /></View></View> : null}
    </AppDialog>
  </View>;
}
