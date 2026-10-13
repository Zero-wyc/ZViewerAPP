import { BiliVideoPicker } from './BiliVideoPicker';
import { useAppearance } from '@/state/appearance';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '@/state/session';
import { messageFor } from '@/lib/server';
import { canonicalSelection, type SourceSelection } from '@/lib/sources';
import { RoomButton, RoomInput, ui as baseUi } from './RoomUi';
import { AnimePicker } from './AnimePicker';
import { MountManager } from './MountManager';
import { SourceDropdown } from './SourceDropdown';
import { Surface } from './Surface';
import { MediaLibraryPicker } from './MediaLibraryPicker';
import { DirectoryPicker } from './DirectoryPicker';
import type { DirectoryKind } from '@/lib/directorySources';

const kinds = ['webdav', 'ftp', 'openlist', 'emby', 'jellyfin'];
const sourceOptions = [
  { id: 'bilibili', name: '哔哩哔哩' }, { id: 'mp4', name: '视频直链' },
  ...kinds.map(id => ({ id, name: ({ webdav: 'WebDAV', ftp: 'FTP', openlist: 'OpenList', emby: 'Emby', jellyfin: 'Jellyfin' } as Record<string, string>)[id] })),
  { id: 'anisubs', name: 'ani-subs 番剧源' }, { id: 'anime', name: '传统番剧源' }, { id: 'kazumi', name: 'Kazumi 番剧源' }, { id: 'server-files', name: '服务器文件' },
];
export function SourcePicker({ visible, onClose, onAdd }: { visible: boolean; onClose: () => void; onAdd: (value: SourceSelection, playAfterAdd?: boolean) => Promise<void> }) {
  const theme = useAppearance();
  const ui = theme.styles(baseUi);

  const { session } = useSession();
  const [sourceType, setSourceType] = useState('mp4');
  const [animeKeyword, setAnimeKeyword] = useState('');
  const pendingAnimeSelections = useRef(new Map<string, SourceSelection>());
  const [childBusy, setChildBusy] = useState(false);
  const [title, setTitle] = useState(''); const [url, setUrl] = useState('');
  const [audioUrl, setAudioUrl] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const version = useRef(0);
  useEffect(() => { const invalidate = () => { ++version.current; }; invalidate(); return invalidate; }, [visible, session?.serverUrl, session?.user.id]);
  const task = async (work: () => Promise<void>) => { setBusy(true); setError(''); try { await work(); } catch (failure) { setError(messageFor(failure)); } finally { setBusy(false); } };
  const add = async (value: SourceSelection, closeAfter = true, playAfterAdd = false) => {
    if (!session) return;
    await onAdd(canonicalSelection(value, session.serverUrl, session.accessToken), playAfterAdd);
    setTitle(''); setUrl(''); setAudioUrl(''); if (closeAfter) onClose();
  };
  const locked = busy || childBusy;
  const close = () => { if (locked) return; ++version.current; onClose(); };
  // Match the app's orientation mask: a portrait-only modal conflicts with
  // the room's landscape lock when UIKit presents its view controller.
  return <Modal visible={visible} transparent animationType="fade" supportedOrientations={['portrait', 'portrait-upside-down', 'landscape']} onRequestClose={close}><SafeAreaView style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', padding: 16 }}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'center' }}><Surface readable testID="source-picker" style={{ flexGrow: 0, flexShrink: 1, maxHeight: '92%', width: '100%', maxWidth: 720, alignSelf: 'center', backgroundColor: theme.color('#1b2024', 'backgroundColor'), borderRadius: theme.preferences.radius, padding: 16, gap: 12 }}>
    <View style={ui.row}><Text style={[ui.title, { flex: 1 }]}>添加影片</Text><RoomButton label="完成" onPress={close} disabled={locked} secondary /></View>
    <ScrollView style={{ flexGrow: 0, flexShrink: 1, minHeight: 0 }} contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
    <SourceDropdown label="影片来源" testID="movie-source" value={sourceType} options={sourceOptions.filter(item => item.id !== 'server-files' || session?.user.role === 'root')} disabled={locked}
      onChange={value => { ++version.current; setSourceType(value); setError(''); }} />
    {sourceType === 'mp4' ? <>
    <Text style={ui.title}>视频直链</Text><RoomInput placeholder="影片名称" value={title} onChangeText={setTitle} />
    <RoomInput placeholder="MP4 / MKV / HLS / FLV 等 HTTP(S) 媒体地址" value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" />
    <RoomInput placeholder="独立音轨地址（可选）" value={audioUrl} onChangeText={setAudioUrl} autoCapitalize="none" keyboardType="url" />
    <RoomButton label="添加到片单" disabled={busy || !url.trim()} onPress={() => void task(() => add({ title: title.trim() || '视频直链', url: url.trim(), source: 'mp4', ...(audioUrl.trim() ? { audioUrl: audioUrl.trim() } : {}) }))} />
    </> : null}
    {sourceType === 'bilibili' ? <BiliVideoPicker active={visible} allowWholeMovie onBusyChange={setChildBusy} onAdd={(value, playNow) => add(value, playNow, playNow)} /> : null}
    {['anisubs', 'anime', 'kazumi'].includes(sourceType) && visible ? <AnimePicker key={`${sourceType}:${session?.serverUrl}`} initialKind={sourceType} keyword={animeKeyword} onKeywordChange={setAnimeKeyword} onBusyChange={setChildBusy} pendingSelections={pendingAnimeSelections} add={value => add(value, false)} /> : null}
    {['emby', 'jellyfin'].includes(sourceType) && visible ? <><MediaLibraryPicker key={`${sourceType}:${session?.serverUrl}`} kind={sourceType as 'emby' | 'jellyfin'} add={value => add(value, false)} onBusyChange={setChildBusy} /><MountManager /></> : null}
    {['webdav', 'ftp', 'openlist', 'server-files'].includes(sourceType) && visible ? <><DirectoryPicker key={`${sourceType}:${session?.serverUrl}`} kind={sourceType as DirectoryKind} add={value => add(value, false)} onBusyChange={setChildBusy} />{sourceType !== 'server-files' ? <MountManager /> : null}</> : null}
    {busy ? <ActivityIndicator color="#65d59b" /> : null}{error ? <Text accessibilityLiveRegion="assertive" style={ui.error}>{error}</Text> : null}
  </ScrollView></Surface></KeyboardAvoidingView></SafeAreaView></Modal>;
}
