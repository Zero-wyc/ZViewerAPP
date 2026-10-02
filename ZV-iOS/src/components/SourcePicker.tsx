import { useAppearance } from '@/state/appearance';
import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '@/state/session';
import { messageFor } from '@/lib/server';
import { canonicalSelection, type SourceSelection } from '@/lib/sources';
import { RoomButton, RoomInput, ui as baseUi } from './RoomUi';
import { resolveLocalBili, type BiliMedia } from '@/lib/biliNative';
import { BiliAccount } from './BiliAccount';
import { BiliCatalog } from './BiliCatalog';
import { AnimePicker } from './AnimePicker';
import { MountManager } from './MountManager';
import { SourceDropdown } from './SourceDropdown';
import { EpisodePicker } from './EpisodePicker';
import { Surface } from './Surface';

type Entry = { name: string; path: string; type: string };
type Location = { kind: string; id?: number; path?: string; serverUrl?: string; name: string };
const kinds = ['webdav', 'ftp', 'openlist', 'emby', 'jellyfin'];
const sourceOptions = [
  { id: 'bilibili', name: '哔哩哔哩' }, { id: 'mp4', name: '视频直链' },
  ...kinds.map(id => ({ id, name: ({ webdav: 'WebDAV', ftp: 'FTP', openlist: 'OpenList', emby: 'Emby', jellyfin: 'Jellyfin' } as Record<string, string>)[id] })),
  { id: 'anisubs', name: 'ani-subs 番剧源' }, { id: 'anime', name: '传统番剧源' }, { id: 'kazumi', name: 'Kazumi 番剧源' }, { id: 'server-files', name: '服务器文件' },
];
export function SourcePicker({ visible, onClose, onAdd }: { visible: boolean; onClose: () => void; onAdd: (value: SourceSelection) => Promise<void> }) {
  const theme = useAppearance();
  const ui = theme.styles(baseUi);

  const { request, session } = useSession();
  const [sourceType, setSourceType] = useState('mp4');
  const [childBusy, setChildBusy] = useState(false);
  const [biliUrl, setBiliUrl] = useState(''); const [bili, setBili] = useState<BiliMedia | null>(null);
  const [title, setTitle] = useState(''); const [url, setUrl] = useState('');
  const [audioUrl, setAudioUrl] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [locations, setLocations] = useState<Location[]>([]); const [entries, setEntries] = useState<Entry[]>([]);
  const [history, setHistory] = useState<Location[]>([]); const version = useRef(0);
  const location = history.at(-1);
  const task = async (work: () => Promise<void>) => { setBusy(true); setError(''); try { await work(); } catch (failure) { setError(messageFor(failure)); } finally { setBusy(false); } };
  const roots = () => task(async () => {
    const id = ++version.current; setHistory([]); setEntries([]);
    const results = await Promise.allSettled(kinds.filter(kind => kind === sourceType).map(kind => request<{ mounts: { id: number; name: string; serverUrl: string; path?: string }[] }>(`/api/${kind}/mounts`).then(data => data.mounts.map(mount => ({ kind, id: mount.id, serverUrl: mount.serverUrl, path: mount.path || '/', name: mount.name })))));
    const values: Location[] = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
    if (sourceType === 'server-files' && session?.user.role === 'root') {
      const data = await request<{ roots: { key: string; name: string }[] }>('/api/server-files/roots');
      values.unshift(...data.roots.map(root => ({ kind: 'server-files', path: `${root.key}:/`, name: root.name })));
    }
    if (id === version.current) { setLocations(values); if (!values.length) setError('没有可用挂载；请先在账号中配置媒体来源，或添加视频直链'); }
  });
  const browse = (next: Location, stack = [...history, next]) => task(async () => {
    const id = ++version.current;
    const route = next.kind === 'server-files' ? '/api/server-files/browse' : `/api/${next.kind}/mounts/${next.id}/browse`;
    const data = await request<{ entries: Entry[] }>(`${route}?path=${encodeURIComponent(next.path || '/')}`);
    if (id === version.current) { setHistory(stack); setEntries(data.entries); }
  });
  const add = async (value: SourceSelection, closeAfter = true) => {
    if (!session) return;
    await onAdd(canonicalSelection(value, session.serverUrl, session.accessToken));
    setTitle(''); setUrl(''); setAudioUrl(''); if (closeAfter) onClose();
  };
  const select = (entry: Entry) => {
    if (!location) return;
    if (entry.type === 'directory') { void browse({ ...location, path: entry.path, name: entry.name }); return; }
    void task(async () => {
      const query = new URLSearchParams({ path: entry.path, ...(location.id ? { mountId: String(location.id) } : {}) });
      const data = await request<{ title?: string; videoUrl: string; format?: string }>(`/api/${location.kind}/resolve?${query}`);
      await add({ title: data.title || entry.name, url: data.videoUrl, source: location.kind, format: data.format, ...(location.id ? { serverUrl: location.serverUrl, path: entry.path, directLink: false } : {}) });
    });
  };
  const locked = busy || childBusy;
  const close = () => { if (locked) return; ++version.current; onClose(); };
  // Match the app's orientation mask: a portrait-only modal conflicts with
  // the room's landscape lock when UIKit presents its view controller.
  return <Modal visible={visible} transparent animationType="fade" supportedOrientations={['portrait', 'portrait-upside-down', 'landscape']} onRequestClose={close}><SafeAreaView style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', padding: 16 }}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'center' }}><Surface readable testID="source-picker" style={{ flexGrow: 0, flexShrink: 1, maxHeight: '92%', width: '100%', maxWidth: 720, alignSelf: 'center', backgroundColor: theme.color('#1b2024', 'backgroundColor'), borderRadius: theme.preferences.radius, padding: 16, gap: 12 }}>
    <View style={ui.row}><Text style={[ui.title, { flex: 1 }]}>添加影片</Text><RoomButton label="完成" onPress={close} disabled={locked} secondary /></View>
    <ScrollView style={{ flexGrow: 0, flexShrink: 1, minHeight: 0 }} contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
    <SourceDropdown label="影片来源" testID="movie-source" value={sourceType} options={sourceOptions.filter(item => item.id !== 'server-files' || session?.user.role === 'root')} disabled={locked}
      onChange={value => { ++version.current; setSourceType(value); setHistory([]); setEntries([]); setLocations([]); setError(''); }} />
    {sourceType === 'mp4' ? <>
    <Text style={ui.title}>视频直链</Text><RoomInput placeholder="影片名称" value={title} onChangeText={setTitle} />
    <RoomInput placeholder="MP4 / MKV / HLS / FLV 等 HTTP(S) 媒体地址" value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" />
    <RoomInput placeholder="独立音轨地址（可选）" value={audioUrl} onChangeText={setAudioUrl} autoCapitalize="none" keyboardType="url" />
    <RoomButton label="添加到片单" disabled={busy || !url.trim()} onPress={() => void task(() => add({ title: title.trim() || '视频直链', url: url.trim(), source: 'mp4', ...(audioUrl.trim() ? { audioUrl: audioUrl.trim() } : {}) }))} />
    </> : null}
    {sourceType === 'bilibili' ? <>
    <BiliAccount /><BiliCatalog choose={item => { const next = `https://www.bilibili.com/video/${item.bvid}${item.cid ? `?cid=${item.cid}` : ''}`; setBiliUrl(next); setTitle(item.title); setBili(null); }} />
    <Text style={ui.title}>B站视频</Text><RoomInput placeholder="B站视频链接 / BV 号（可附分 P）" value={biliUrl} onChangeText={value => { setBiliUrl(value); setBili(null); }} autoCapitalize="none" /><RoomButton label="解析分 P" secondary disabled={busy || !biliUrl.trim()} onPress={() => void task(async () => { const next = /^BV[\w]+$/.test(biliUrl.trim()) ? `https://www.bilibili.com/video/${biliUrl.trim()}` : biliUrl.trim(); setBiliUrl(next); setBili(await resolveLocalBili(next)); })} />{bili ? <><Text style={ui.muted}>{bili.title} · 当前画质 {bili.currentQn}</Text><EpisodePicker key={biliUrl} episodes={(bili.pages?.length ? bili.pages : [{ page: 1, cid: 0, part: bili.title }]).map(part => ({ id: String(part.page), title: `P${part.page} · ${part.part}` }))} disabled={busy} onAdd={async ids => {
      const added: string[] = []; setBusy(true);
      try { for (const id of ids) { const part = bili.pages?.find(item => String(item.page) === id) || { page: 1, cid: 0, part: bili.title }; try { const target = new URL(biliUrl); target.searchParams.set('p', String(part.page)); if (part.cid) target.searchParams.set('cid', String(part.cid)); await add({ title: `${bili.title} · ${part.part}`, url: target.toString(), source: 'bilibili' }, false); added.push(id); } catch { /* Keep failed P selections for retry. */ } } }
      finally { setBusy(false); } return added;
    }} /></> : null}
    </> : null}
    {['anisubs', 'anime', 'kazumi'].includes(sourceType) ? <AnimePicker key={sourceType} initialKind={sourceType} onBusyChange={setChildBusy} add={value => add(value, false)} /> : null}
    {kinds.includes(sourceType) || sourceType === 'server-files' ? <>
    <Text style={ui.title}>媒体来源</Text><RoomButton label="服务器文件与我的挂载" disabled={busy} onPress={() => void roots()} secondary />
    {location ? <><Text style={ui.muted}>{location.name}</Text><RoomButton label="返回上一级" disabled={busy} onPress={() => { const previous = history.slice(0, -1); if (previous.length) void browse(previous.at(-1)!, previous); else { setHistory([]); setEntries([]); } }} secondary />{entries.map(entry => <RoomButton key={entry.path} label={`${entry.type === 'directory' ? '▸' : '▶'} ${entry.name}`} disabled={busy} secondary onPress={() => select(entry)} />)}</> : locations.map(item => <RoomButton key={`${item.kind}:${item.id}:${item.path}`} label={item.name} onPress={() => void browse(item)} disabled={busy} secondary />)}
    {sourceType !== 'server-files' ? <MountManager /> : null}</> : null}
    {busy ? <ActivityIndicator color="#65d59b" /> : null}{error ? <Text style={ui.error}>{error}</Text> : null}
  </ScrollView></Surface></KeyboardAvoidingView></SafeAreaView></Modal>;
}
