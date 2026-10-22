import { CmsPicker } from './CmsPicker';
import { BiliVideoPicker } from './BiliVideoPicker';
import { useAppearance } from '@/state/appearance';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '@/state/session';
import { messageFor } from '@/lib/server';
import { canonicalSelection, type SourceSelection } from '@/lib/sources';
import { RoomButton, RoomIconButton, RoomInput, ui as baseUi } from './RoomUi';
import { useMediaPalette } from './MediaPanelUi';
import { AnimePicker } from './AnimePicker';
import { SourceDropdown } from './SourceDropdown';
import { Surface } from './Surface';
import { MediaLibraryPicker } from './MediaLibraryPicker';
import { DirectoryPicker } from './DirectoryPicker';
import type { DirectoryKind } from '@/lib/directorySources';
import { loadSourceAvailability } from '@/lib/sourceAvailability';

const kinds = ['webdav', 'ftp', 'openlist', 'emby', 'jellyfin'];
const sourceOptions = [
  { id: 'bilibili', name: '哔哩哔哩' }, { id: 'mp4', name: '视频直链' },
  ...kinds.map(id => ({ id, name: ({ webdav: 'WebDAV', ftp: 'FTP', openlist: 'OpenList', emby: 'Emby', jellyfin: 'Jellyfin' } as Record<string, string>)[id] })),
  { id: 'anisubs', name: 'ani-subs 番剧源' }, { id: 'kazumi', name: 'Kazumi 番剧源' }, { id: 'cms', name: 'TVBox 采集源' }, { id: 'server-files', name: '服务器文件' },
];
export function SourcePicker({ visible, onClose, onAdd }: { visible: boolean; onClose: () => void; onAdd: (value: SourceSelection, playAfterAdd?: boolean) => Promise<void> }) {
  const theme = useAppearance();
  const p = useMediaPalette();
  const ui = theme.styles(baseUi);

  const { session, request } = useSession();
  const [sourceType, setSourceType] = useState('bilibili');
  const [capabilities, setCapabilities] = useState<{ scope: string; beta: boolean; mounts: string[] } | null>(null);
  const [capabilityLoading, setCapabilityLoading] = useState(false); const [capabilityError, setCapabilityError] = useState(''); const [capabilityRetry, setCapabilityRetry] = useState(0);
  const sourceScope = `${session?.serverUrl}:${session?.user.id}`;
  useEffect(() => {
    if (!visible || !session) return;
    const controller = new AbortController();
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      setCapabilityLoading(true); setCapabilityError('');
      const { beta, mounts } = await loadSourceAvailability(request, kinds, controller.signal);
      if (!controller.signal.aborted) { setCapabilities({ scope: sourceScope, beta, mounts });
        setSourceType(value => kinds.includes(value) && !mounts.includes(value) || !beta && ['anime', 'anisubs', 'kazumi'].includes(value) ? 'bilibili' : value); }
    }).catch(failure => { if (!controller.signal.aborted) setCapabilityError(`来源加载失败：${messageFor(failure)}`); })
      .finally(() => { if (!controller.signal.aborted) setCapabilityLoading(false); });
    return () => controller.abort();
  }, [visible, session, request, sourceScope, capabilityRetry]);
  const [serverProxy, setServerProxy] = useState(false); const [playsvideoEnabled, setPlaysvideoEnabled] = useState(false);
  const [animeKeyword, setAnimeKeyword] = useState('');
  const pendingAnimeSelections = useRef(new Map<string, SourceSelection>());
  useEffect(() => { pendingAnimeSelections.current.clear(); }, [sourceScope]);
  const [childBusy, setChildBusy] = useState(false);
  const [title, setTitle] = useState(''); const [url, setUrl] = useState('');
  const [audioUrl, setAudioUrl] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const version = useRef(0);
  useEffect(() => { const invalidate = () => { ++version.current; }; invalidate(); return invalidate; }, [visible, session?.serverUrl, session?.user.id]);
  const task = async (work: () => Promise<void>) => { setBusy(true); setError(''); try { await work(); } catch (failure) { setError(messageFor(failure)); } finally { setBusy(false); } };
  const add = async (value: SourceSelection, closeAfter = true, playAfterAdd = false) => {
    if (!session) return;
    await onAdd(canonicalSelection({ ...value, ...(value.source !== 'bilibili' ? { playsvideoEnabled } : {}), ...(['anime', 'kazumi', 'cms'].includes(value.source) ? { serverProxy } : {}) }, session.serverUrl, session.accessToken), playAfterAdd);
    setTitle(''); setUrl(''); setAudioUrl(''); if (closeAfter) onClose();
  };
  const locked = busy || childBusy;
  const close = () => { if (locked) return; ++version.current; onClose(); };
  // Match the app's orientation mask: a portrait-only modal conflicts with
  // the room's landscape lock when UIKit presents its view controller.
  return <Modal onShow={() => { setServerProxy(false); setPlaysvideoEnabled(false); }} visible={visible} transparent animationType={theme.preferences.reduceMotion ? 'none' : 'fade'} supportedOrientations={['portrait', 'portrait-upside-down', 'landscape']} onRequestClose={close}><SafeAreaView style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', padding: 16 }}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'center' }}><Surface readable testID="source-picker" style={{ flexGrow: 0, flexShrink: 1, maxHeight: '94%', width: '100%', maxWidth: 720, alignSelf: 'center', backgroundColor: p.surface, borderWidth: 1, borderColor: p.line, borderRadius: theme.preferences.radius, padding: 16, gap: 14 }}>
    <View style={ui.row}><Text style={[ui.title, { flex: 1, fontSize: 22 }]}>添加影片</Text><RoomIconButton label="关闭添加影片" icon="x" onPress={close} /></View>
    <ScrollView style={{ flexGrow: 0, flexShrink: 1, minHeight: 0 }} contentContainerStyle={{ paddingBottom: 4 }} keyboardShouldPersistTaps="handled">
    <View style={{ borderWidth: 1, borderColor: p.line, borderRadius: 18, overflow: 'hidden' }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1, borderColor: p.line }}><View style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: p.container }}><Feather name="plus" size={25} color={p.text} /></View><View style={{ flex: 1 }}><Text style={[ui.title, { fontSize: 18 }]}>添加影片</Text><Text style={[ui.muted, { marginTop: 3 }]}>选择来源并添加</Text></View></View>
    <View style={{ padding: 16, gap: 12 }}>
    {capabilityLoading ? <Text style={ui.muted}>正在读取可用来源…</Text> : null}
    {capabilityError ? <View style={{ gap: 8 }}><Text accessibilityLiveRegion="assertive" style={ui.error}>{capabilityError}</Text><RoomButton label="重试加载来源" secondary disabled={locked || capabilityLoading} onPress={() => setCapabilityRetry(value => value + 1)} /></View> : null}
    <SourceDropdown label="影片来源" testID="movie-source" value={sourceType} options={sourceOptions.filter(item => (item.id !== 'server-files' || session?.user.role === 'root') && (!kinds.includes(item.id) || capabilities?.scope === sourceScope && capabilities.mounts.includes(item.id)) && (!['anisubs', 'anime', 'kazumi'].includes(item.id) || capabilities?.scope === sourceScope && capabilities.beta))} disabled={locked}
      onChange={value => { ++version.current; setSourceType(value); setError(''); }} />
    {sourceType === 'mp4' ? <>
    <RoomInput placeholder="影片名称（可选）" value={title} onChangeText={setTitle} />
    <RoomInput placeholder="MP4 / MKV / HLS / FLV 等 HTTP(S) 媒体地址" value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" />
    <RoomInput placeholder="独立音轨地址（可选）" value={audioUrl} onChangeText={setAudioUrl} autoCapitalize="none" keyboardType="url" />
    <RoomButton label="添加到片单" disabled={busy || !url.trim()} onPress={() => void task(() => add({ title: title.trim() || '视频直链', url: url.trim(), source: 'mp4', ...(audioUrl.trim() ? { audioUrl: audioUrl.trim() } : {}) }))} />
    </> : null}
    {sourceType === 'bilibili' ? <BiliVideoPicker active={visible} allowWholeMovie onBusyChange={setChildBusy} onAdd={(value, playNow) => add(value, playNow, playNow)} /> : null}
    {['anisubs', 'anime', 'kazumi'].includes(sourceType) && visible ? <AnimePicker key={`${sourceType}:${sourceScope}`} initialKind={sourceType} keyword={animeKeyword} onKeywordChange={setAnimeKeyword} onBusyChange={setChildBusy} pendingSelections={pendingAnimeSelections} add={value => add(value, false)} /> : null}
    {sourceType === 'cms' && visible ? <CmsPicker key={sourceScope} add={value => add(value, false)} onBusyChange={setChildBusy} /> : null}
    {['emby', 'jellyfin'].includes(sourceType) && visible ? <MediaLibraryPicker key={`${sourceType}:${sourceScope}`} kind={sourceType as 'emby' | 'jellyfin'} add={value => add(value, false)} onBusyChange={setChildBusy} /> : null}
    {['webdav', 'ftp', 'openlist', 'server-files'].includes(sourceType) && visible ? <DirectoryPicker key={`${sourceType}:${sourceScope}`} kind={sourceType as DirectoryKind} add={value => add(value, false)} onBusyChange={setChildBusy} /> : null}
    {sourceType !== 'bilibili' ? <View style={{ gap: 10 }}>
      {['anisubs', 'anime', 'kazumi', 'cms'].includes(sourceType) ? <DraftPolicy label="服务器中转" accessibilityLabel="添加影片服务器中转" value={serverProxy} disabled={locked} onChange={setServerProxy} description="关闭（默认）：直连源站，不会自动中转，有防盗链的源需开启。开启：媒体流经服务器中转，会占用服务器流量。" /> : null}
      <DraftPolicy label="浏览器转码引擎" accessibilityLabel="添加影片浏览器转码" value={playsvideoEnabled} disabled={locked} onChange={setPlaysvideoEnabled} description="为网页、Android 和鸿蒙保存重封装／转码偏好；iOS 继续使用 VLC。关闭后按原生策略播放。" />
    </View> : null}
    {busy ? <ActivityIndicator color="#65d59b" /> : null}{error ? <Text accessibilityLiveRegion="assertive" style={ui.error}>{error}</Text> : null}
    </View></View>
  </ScrollView></Surface></KeyboardAvoidingView></SafeAreaView></Modal>;
}

function DraftPolicy({ label, accessibilityLabel, value, disabled, onChange, description }: { label: string; accessibilityLabel: string; value: boolean; disabled: boolean; onChange: (value: boolean) => void; description: string }) {
  const p = useMediaPalette(); const toggle = () => { if (!disabled) onChange(!value); };
  return <Pressable accessibilityRole="switch" accessibilityLabel={accessibilityLabel} accessibilityState={{ checked: value, disabled }} disabled={disabled} onAccessibilityTap={toggle} onPress={toggle} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: p.container, borderRadius: 18, padding: 14, opacity: disabled ? .5 : 1 }}><View style={{ flex: 1, minWidth: 0, gap: 5 }}><Text style={{ color: p.text, fontSize: 15, fontWeight: '600' }}>{label}</Text><Text style={{ color: p.muted, fontSize: 13, lineHeight: 20 }}>{description}</Text></View><View pointerEvents="none"><Switch accessible={false} value={value} trackColor={{ false: p.line, true: p.accent }} thumbColor="#fff" /></View></Pressable>;
}
