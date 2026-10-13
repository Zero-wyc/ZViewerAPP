import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, useWindowDimensions, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useAppearance } from '@/state/appearance';
import { useSession } from '@/state/session';
import { checkAbort } from '@/lib/cancellation';
import { addDirectoryFiles, browseDirectory, directoryNames, directoryManualPath, directoryParent, listDirectoryRoots, type DirectoryEntry, type DirectoryKind, type DirectoryRoot } from '@/lib/directorySources';
import type { SourceSelection } from '@/lib/sources';
import { messageFor } from '@/lib/server';
import { AppDialog } from './AppDialog';
import { RoomButton, RoomIconButton, RoomInput, ui as baseUi } from './RoomUi';
import { SourceDropdown } from './SourceDropdown';

export function DirectoryPicker({ kind, add, onBusyChange }: { kind: DirectoryKind; add: (value: SourceSelection) => Promise<void>; onBusyChange: (busy: boolean) => void }) {
  const theme = useAppearance(); const ui = theme.styles(baseUi); const { request } = useSession(); const { width } = useWindowDimensions(); const name = directoryNames[kind];
  const [roots, setRoots] = useState<DirectoryRoot[]>([]); const [rootIndex, setRootIndex] = useState('0'); const root = roots[Number(rootIndex)];
  const [open, setOpen] = useState(false); const [wide, setWide] = useState(false); const [multi, setMulti] = useState(false); const [manual, setManual] = useState('');
  const [path, setPath] = useState(''); const [entries, setEntries] = useState<DirectoryEntry[]>([]); const [parentEntries, setParentEntries] = useState<DirectoryEntry[]>([]); const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false); const [adding, setAdding] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [contentWidth, setContentWidth] = useState(300);
  const operation = useRef<AbortController | null>(null); const submitting = useRef(false); const openRef = useRef(false); const locked = busy || adding; const parent = root ? directoryParent(path || root.path, root.path) : null;
  useEffect(() => { openRef.current = open; }, [open]);
  const files = entries.filter(entry => entry.type === 'file'); const allSelected = !!files.length && files.every(entry => selected.includes(entry.path));
  const task = useCallback(async (work: (signal: AbortSignal) => Promise<void>) => {
    operation.current?.abort(); const controller = new AbortController(); operation.current = controller; setBusy(true); setError('');
    try { await work(controller.signal); } catch (failure) { if (!controller.signal.aborted) setError(messageFor(failure)); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }, []);
  const loadRoots = useCallback(() => task(async signal => {
    const values = await listDirectoryRoots(request, kind, signal); checkAbort(signal);
    setRoots(values); setRootIndex('0'); setPath(''); setEntries([]); setParentEntries([]); setSelected([]); setNotice('');
    if (!values.length) { setError(kind === 'server-files' ? '没有可用文件空间' : '暂无挂载，请先配置后刷新'); return; }
    if (openRef.current) { const data = await browseDirectory(request, kind, values[0], values[0].path, signal); checkAbort(signal); setPath(data.currentPath || values[0].path); setEntries(data.entries); }
  }), [request, kind, task]);
  useEffect(() => { let active = true; void Promise.resolve().then(() => { if (active) void loadRoots(); }); return () => { active = false; operation.current?.abort(); }; }, [loadRoots]);
  const load = (next: string, target = root) => {
    if (!target) return;
    void task(async signal => {
      setSelected([]); setEntries([]); setParentEntries([]); setNotice('');
      const data = await browseDirectory(request, kind, target, next, signal); checkAbort(signal); const current = data.currentPath || next;
      setPath(current); setEntries(data.entries);
      const previous = directoryParent(current, target.path);
      if (previous) { try { const upper = await browseDirectory(request, kind, target, previous, signal); if (!signal.aborted) setParentEntries(upper.entries); } catch { /* Current directory remains available if the parent cannot be read. */ } }
    });
  };
  const submit = async (values: DirectoryEntry[]) => {
    if (!root || submitting.current || locked || !values.length) return;
    submitting.current = true; operation.current?.abort(); const controller = new AbortController(); operation.current = controller; setAdding(true); onBusyChange(true); setError(''); setNotice('');
    try {
      const result = await addDirectoryFiles(request, kind, root, values, add, controller.signal); checkAbort(controller.signal);
      setSelected(old => old.filter(value => !result.added.includes(value))); if (result.added.length) { setNotice(`已添加 ${result.added.length} 个文件，可继续选择`); if (values.length === 1 && result.added.includes(directoryManualPath(manual, kind, root))) setManual(''); }
      if (result.failures.length) setError(`${result.failures.length} 个文件添加失败，保留选择可重试：${result.failures[0].message}`);
    } catch (failure) { if (!controller.signal.aborted) setError(messageFor(failure)); }
    finally { submitting.current = false; if (!controller.signal.aborted) setAdding(false); onBusyChange(false); }
  };
  const select = (entry: DirectoryEntry) => {
    if (locked) return; if (entry.type === 'directory') { load(entry.path); return; }
    setSelected(old => old.includes(entry.path) ? old.filter(value => value !== entry.path) : multi ? [...old, entry.path] : [entry.path]); setNotice(''); setError('');
  };
  const switchRoot = (value: string) => { setRootIndex(value); setManual(''); setNotice(''); setPath(''); setEntries([]); setParentEntries([]); setSelected([]); if (open && roots[Number(value)]) load(roots[Number(value)].path, roots[Number(value)]); };
  const close = () => { if (!locked) setOpen(false); };
  const feedback = <>{adding ? <ActivityIndicator color={theme.color('#65d59b')} /> : null}{notice ? <Text accessibilityLiveRegion="polite" style={ui.muted}>{notice}</Text> : null}{error ? <Text accessibilityLiveRegion="assertive" style={ui.error}>{error}</Text> : null}</>;
  const renderEntries = (values: DirectoryEntry[], selectable: boolean) => values.map(entry => {
    const chosen = selectable && selected.includes(entry.path);
    return <Pressable key={entry.path} testID={`directory-entry-${selectable ? 'current' : 'parent'}-${entry.path}`} accessibilityRole="button" accessibilityLabel={`${entry.type === 'directory' ? '打开目录' : selectable ? '选择文件' : '上级文件'} ${entry.name}`} accessibilityState={{ selected: chosen, disabled: locked || !selectable && entry.type !== 'directory' }} disabled={locked || !selectable && entry.type !== 'directory'} onPress={() => selectable ? select(entry) : load(entry.path)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 8, backgroundColor: chosen ? theme.color('#343d41') : 'transparent', borderWidth: chosen ? 1 : 0, borderColor: theme.color('#65d59b') }}>
      <Feather name={entry.type === 'directory' ? 'folder' : chosen ? 'check-square' : 'file'} size={20} color={theme.color(entry.type === 'directory' || chosen ? '#65d59b' : '#a8b3b6')} /><View style={{ flex: 1, minWidth: 0, gap: 4 }}><Text style={ui.text}>{entry.name}</Text>{entry.size != null && entry.type === 'file' ? <Text style={ui.muted}>{(entry.size / 1024 / 1024).toFixed(1)} MB</Text> : null}</View>
    </Pressable>;
  });
  return <View style={{ gap: 12 }}>
    <Text style={ui.text}>{kind === 'server-files' ? '文件空间' : `使用已保存的 ${name} 挂载`}</Text><SourceDropdown label="文件空间与挂载" value={rootIndex} options={roots.map((value, index) => ({ id: String(index), name: value.name }))} disabled={locked} onChange={switchRoot} />
    <View style={ui.row}><View style={{ flex: 1 }}><RoomButton label={kind === 'server-files' ? '浏览服务器文件' : `浏览 ${name} 目录`} secondary disabled={locked || !root} onPress={() => { setOpen(true); if (!path) load(root!.path); }} /></View><RoomIconButton label="刷新目录挂载" icon="refresh-cw" onPress={() => { if (!locked) void loadRoots(); }} /></View>
    <RoomInput placeholder="手动输入路径，或通过浏览选择文件" autoCapitalize="none" value={manual} onChangeText={setManual} onSubmitEditing={() => { if (!locked && root && manual.trim()) void submit([{ name: manual.trim().split('/').at(-1) || '文件', path: directoryManualPath(manual, kind, root), type: 'file' }]); }} />
    <RoomButton label={adding ? '正在添加…' : '添加'} disabled={locked || !root || !manual.trim()} onPress={() => void submit([{ name: manual.trim().split('/').at(-1) || '文件', path: directoryManualPath(manual, kind, root!), type: 'file' }])} />
    {!open ? feedback : null}
    <AppDialog visible={open} title={kind === 'server-files' ? '浏览服务器文件' : `浏览 ${name} 目录`} maxWidth={wide ? Math.max(300, width - 32) : 960} close={close} titleActions={<RoomIconButton label={wide ? '还原目录弹窗' : '展开目录弹窗'} icon={wide ? 'minimize' : 'maximize'} onPress={() => setWide(value => !value)} />} footer={<View style={{ gap: 8, flexShrink: 0 }}>
      {feedback}<Text style={ui.muted}>{selected.length ? `已选择 ${selected.length} 个文件` : '多选模式可批量添加'}</Text><View style={[ui.row, { justifyContent: 'flex-end' }]}>{multi && files.length ? <RoomButton label={allSelected ? '取消全选' : '全选文件'} secondary disabled={locked} onPress={() => setSelected(allSelected ? [] : files.map(entry => entry.path))} /> : null}<RoomButton label="取消" secondary disabled={locked} onPress={close} /><RoomButton label={adding ? '正在添加…' : multi ? `添加文件 (${selected.length})` : '添加当前文件'} disabled={locked || !selected.length} onPress={() => void submit(files.filter(entry => selected.includes(entry.path)))} /></View>
    </View>}>
      <View style={ui.row}><View style={{ flex: 1, minWidth: 120 }}><SourceDropdown label="切换文件空间与挂载" value={rootIndex} options={roots.map((value, index) => ({ id: String(index), name: value.name }))} disabled={locked} onChange={switchRoot} /></View><RoomButton label={multi ? '退出多选' : '多选'} secondary selected={multi} disabled={locked} onPress={() => { setMulti(old => !old); setSelected([]); }} /></View>
      <Text style={ui.muted}>{path || root?.path || '/'}</Text>{busy ? <ActivityIndicator color={theme.color('#65d59b')} /> : null}
      <View testID="directory-columns" onLayout={event => setContentWidth(event.nativeEvent.layout.width)} style={{ flexDirection: contentWidth >= 600 ? 'row' : 'column', gap: 12 }}>
        <View testID="directory-parent" style={[ui.card, { flex: contentWidth >= 600 ? 1 : undefined, minWidth: 0, borderWidth: 1, borderColor: theme.color('#343d41') }]}><Text style={ui.title}>上级目录</Text>{parent ? <><RoomButton label="返回上一级" secondary disabled={locked} onPress={() => load(parent)} />{renderEntries(parentEntries.filter(entry => entry.type === 'directory'), false)}</> : <Text style={ui.muted}>已在根目录</Text>}</View>
        <View testID="directory-current" style={[ui.card, { flex: contentWidth >= 600 ? 1 : undefined, minWidth: 0, minHeight: 140, borderWidth: 1, borderColor: theme.color('#343d41') }]}><Text style={ui.title}>当前目录</Text>{renderEntries(entries, true)}{!busy && !entries.length ? <Text style={ui.muted}>当前目录为空</Text> : null}</View>
      </View>
    </AppDialog>
  </View>;
}
