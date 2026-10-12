import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useAppearance } from '@/state/appearance';
import { useSession } from '@/state/session';
import { enumerateLibrary, libraryImage, libraryRoute, librarySelection, resolveLibrary, type LibraryEntry, type LibraryKind } from '@/lib/mediaLibrary';
import type { SourceSelection } from '@/lib/sources';
import { messageFor } from '@/lib/server';
import { RoomButton, RoomInput, ui as baseUi } from './RoomUi';
import { SourceDropdown } from './SourceDropdown';
import { SourcePoster } from './SourcePoster';
import { EpisodePicker } from './EpisodePicker';
type Mount = { id: number; name: string; serverUrl: string };
export function MediaLibraryPicker({ kind, add, onBusyChange }: { kind: LibraryKind; add: (value: SourceSelection) => Promise<void>; onBusyChange: (busy: boolean) => void }) {
  const theme = useAppearance(); const ui = theme.styles(baseUi); const { request } = useSession();
  const [mounts, setMounts] = useState<Mount[]>([]); const [mountId, setMountId] = useState('');
  const [entries, setEntries] = useState<LibraryEntry[]>([]); const [history, setHistory] = useState<LibraryEntry[]>([]);
  const [keyword, setKeyword] = useState(''); const [searchView, setSearchView] = useState(false);
  const [busy, setBusy] = useState(false); const [adding, setAdding] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [confirmSeries, setConfirmSeries] = useState<LibraryEntry | null>(null);
  const operation = useRef<AbortController | null>(null); const mount = mounts.find(item => String(item.id) === mountId);
  const task = useCallback(async (work: (signal: AbortSignal) => Promise<void>) => {
    operation.current?.abort(); const controller = new AbortController(); operation.current = controller;
    setBusy(true); setError('');
    try { await work(controller.signal); } catch (failure) { if (!controller.signal.aborted) setError(messageFor(failure)); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }, []);
  const loadMounts = useCallback(() => task(async signal => { const data = await request<{ mounts: Mount[] }>(`/api/${kind}/mounts`, { signal }); if (!signal.aborted) { setMounts(data.mounts); setMountId(value => data.mounts.some(item => String(item.id) === value) ? value : String(data.mounts[0]?.id || '')); } }), [kind, request, task]);
  useEffect(() => { let active = true; void Promise.resolve().then(() => { if (active) void loadMounts(); }); return () => { active = false; operation.current?.abort(); }; }, [loadMounts]);
  const browse = useCallback((stack: LibraryEntry[]) => task(async signal => {
    setEntries([]); setSearchView(false); setConfirmSeries(null);
    const data = await request<{ entries: LibraryEntry[] }>(libraryRoute(kind, Number(mountId), stack.at(-1)?.path), { signal });
    if (!signal.aborted) { setEntries(data.entries); setHistory(stack); }
  }), [request, kind, mountId, task]);
  useEffect(() => { let active = true; void Promise.resolve().then(() => { if (active && mountId) { setKeyword(''); setNotice(''); void browse([]); } }); return () => { active = false; }; }, [mountId, browse]);
  const search = () => task(async signal => {
    if (!keyword.trim()) { void browse(history); return; }
    setEntries([]); setSearchView(true); setConfirmSeries(null);
    const data = await request<{ entries: LibraryEntry[] }>(`/api/${kind}/mounts/${mountId}/search?term=${encodeURIComponent(keyword.trim())}`, { signal });
    if (!signal.aborted) setEntries(data.entries);
  });
  const submit = async (ids: string[], series?: LibraryEntry) => {
    if (!mount || adding) return [];
    operation.current?.abort(); const controller = new AbortController(); operation.current = controller;
    const added: string[] = []; setAdding(true); onBusyChange(true); setError(''); setNotice('');
    try {
      const targets = series ? [series] : entries.filter(item => ids.includes(item.path));
      for (const entry of targets) {
        try {
          const pages = series ? await enumerateLibrary(request, kind, mount.id, entry, controller.signal) : undefined;
          if (pages && !pages.length) throw new Error('该目录没有可播放的分集');
          const media = await resolveLibrary(request, kind, mount.id, pages?.[0]?.path || entry.path, controller.signal);
          controller.signal.throwIfAborted(); await add(librarySelection(kind, mount, entry, media, pages)); controller.signal.throwIfAborted(); added.push(entry.path);
        } catch (failure) { if (controller.signal.aborted) break; setError(messageFor(failure)); }
      }
      if (!controller.signal.aborted) { if (added.length) setNotice(`已添加 ${series ? '整部 / 整季卡' : `${added.length} 个条目`}，可继续选择`); if (series && added.length) setConfirmSeries(null); }
    } finally { if (!controller.signal.aborted) setAdding(false); onBusyChange(false); }
    return added;
  };
  return <View style={{ gap: 12 }}>
    <View style={ui.row}><Text style={[ui.title, { flex: 1 }]}>{kind === 'emby' ? 'Emby' : 'Jellyfin'} 媒体库</Text><RoomButton label="刷新挂载" secondary disabled={busy || adding} onPress={() => void loadMounts()} /></View>
    <SourceDropdown label="选择挂载" testID="library-mount" value={mountId} options={mounts.map(item => ({ id: String(item.id), name: item.name }))} disabled={busy || adding} onChange={value => { operation.current?.abort(); setEntries([]); setHistory([]); setConfirmSeries(null); setMountId(value); }} />
    {!mounts.length && !busy ? <Text style={ui.muted}>暂无挂载，请在下方「管理我的挂载」中添加，然后刷新</Text> : null}
    {mount ? <>
      <View style={ui.row}><RoomInput value={keyword} onChangeText={setKeyword} placeholder="搜索媒体库（电影 / 剧集 / 单集）" style={{ flex: 1, minWidth: 130 }} onSubmitEditing={() => { if (!busy && !adding) void search(); }} /><RoomButton label="搜索" disabled={busy || adding || !keyword.trim()} onPress={() => void search()} /></View>
      <View style={ui.row}><Text style={[ui.muted, { flex: 1 }]}>{searchView ? `搜索结果 · ${entries.length}` : [mount.name, ...history.map(item => item.name)].join(' / ')}</Text>{searchView ? <RoomButton label="返回目录" secondary disabled={busy || adding} onPress={() => void browse(history)} /> : history.length ? <RoomButton label="上一级" secondary disabled={busy || adding} onPress={() => void browse(history.slice(0, -1))} /> : null}</View>
      <ScrollView testID="library-results" nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 370, flexGrow: 0 }} contentContainerStyle={{ gap: 8 }}>
        {entries.filter(entry => entry.type === 'directory').map(entry => <View key={entry.path} style={[ui.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}><SourcePoster serverProxy uri={libraryImage(kind, mount.id, entry)} /><View style={{ flex: 1, minWidth: 0, gap: 8 }}><Text style={ui.text}>{entry.name}</Text><View style={ui.row}><RoomButton label="浏览目录" secondary disabled={busy || adding} onPress={() => void browse([...history, entry])} />{['Series', 'Season'].includes(entry.embyType || '') ? <RoomButton label={entry.embyType === 'Series' ? '添加整部' : '添加整季'} disabled={busy || adding} onPress={() => setConfirmSeries(entry)} /> : null}</View></View></View>)}
        {!busy && !entries.length ? <Text style={ui.muted}>{searchView ? '未找到匹配的影片' : '当前目录为空'}</Text> : null}
        {entries.some(item => item.type !== 'directory') ? <EpisodePicker key={`${mountId}:${searchView}:${history.at(-1)?.path}:${entries.map(item => item.path).join(',')}`} episodes={entries.filter(item => item.type !== 'directory').map(item => ({ id: item.path, title: `${item.indexNumber ? `S${item.parentIndexNumber ?? '?'}E${item.indexNumber} · ` : ''}${item.name}` }))} disabled={busy || adding} onAdd={submit} /> : null}
      </ScrollView>
      {confirmSeries ? <View style={ui.card}><Text style={ui.text}>将「{confirmSeries.name}」的全部分集添加为一张片单卡？添加后可在片单切集。</Text><View style={ui.row}><RoomButton label="取消" secondary disabled={adding} onPress={() => setConfirmSeries(null)} /><RoomButton label={adding ? '正在添加…' : '确认添加'} disabled={adding || busy} onPress={() => void submit([], confirmSeries)} /></View></View> : null}
    </> : null}
    {busy || adding ? <ActivityIndicator color={theme.color('#65d59b')} /> : null}{notice ? <Text accessibilityLiveRegion="polite" style={ui.muted}>{notice}</Text> : null}{error ? <Text style={ui.error}>{error}</Text> : null}
  </View>;
}
