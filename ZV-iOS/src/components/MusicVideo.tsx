import { useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppearance } from '@/state/appearance';
import { useSession } from '@/state/session';
import { readPreference, writePreference } from '@/lib/preferences';
import { defaultBiliPolicy, playbackSource, resolveLocalBili, type BiliMedia } from '@/lib/biliNative';
import { biliSelection } from '@/lib/biliSelection';
import { NativeMediaAdapter } from '@/lib/mediaAdapter';
import type { VlcPlayer } from '@/lib/vlcPlayer';
import { BiliCatalog } from './BiliCatalog';
import { VlcVideo, useVlcVideo } from './VlcVideo';
import { VideoGestures } from './VideoGestures';
import { RoomButton, RoomInput, ui as baseUi } from './RoomUi';
type Binding = { url: string; qn: number; cli: boolean; dash: boolean };
export function MusicVideo({ trackKey, expanded, pure, setPure, audio, control }: { trackKey: string | null; expanded: boolean; pure: boolean; setPure: (value: boolean) => void; audio: VlcPlayer; control: (action: 'play' | 'pause' | 'seek', value?: number) => void }) {
  const theme = useAppearance(); const ui = theme.styles(baseUi); const { session, request } = useSession(); const video = useVlcVideo(true); const { player } = video;
  const [bindings, setBindings] = useState<Record<string, Binding>>({}); const [loaded, setLoaded] = useState(false); const [picker, setPicker] = useState(false); const [url, setUrl] = useState(''); const [parts, setParts] = useState<BiliMedia | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [showExit, setShowExit] = useState(true); const [disabled, setDisabled] = useState<string[]>([]); const [dashAllowed, setDashAllowed] = useState(false);
  const adapter = useRef<NativeMediaAdapter | null>(null); const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefKey = session ? `zviewer-music-videos-${session.user.id}` : 'zviewer-music-videos';
  useEffect(() => { let active = true; void readPreference<{ entries: Record<string, Binding> }>(prefKey, { entries: {} }).then(value => { if (active) { setBindings(value.entries); setLoaded(true); } }); void request<{ settings: { dashDisabled?: boolean } }>('/api/auth/public-settings').then(value => { if (active) setDashAllowed(value.settings?.dashDisabled === false); }).catch(() => {}); return () => { active = false; }; }, [prefKey, request]);
  useEffect(() => { const port = new NativeMediaAdapter(player, playbackSource); adapter.current = port; return () => { port.dispose(); adapter.current = null; }; }, [player]);
  const biliUrl = trackKey?.startsWith('bili:') ? `https://www.bilibili.com/video/${trackKey.split(':')[1]}?cid=${trackKey.split(':')[2]}` : '';
  const binding = trackKey && !disabled.includes(trackKey) && bindings[trackKey]?.url !== '' ? bindings[trackKey] || (biliUrl ? { url: biliUrl, qn: 64, cli: true, dash: false } : null) : null;
  const sourceUrl = binding?.url; const qn = binding?.qn; const cli = binding?.cli; const dash = binding?.dash;
  useEffect(() => {
    if (!session || !adapter.current) return; const media = adapter.current; let active = true; setError('');
    // Null replaces release the source and reset ready markers. The same URL
    // added later therefore crosses the native load path again.
    const next = expanded && loaded && sourceUrl ? { sourceUrl, sourceType: 'bilibili', format: 'muted-video', isPlaying: audio.playing, currentTime: audio.currentTime, biliPolicy: { ...defaultBiliPolicy, qn: qn || 0, cliEnabled: cli !== false, preferMp4: !dash, dashAllowed } } : null;
    player.configure({ volume: 0 });
    void media.apply(next, session.serverUrl, session.accessToken).then(() => { if (active && next) { player.currentTime = audio.currentTime; } }).catch(() => { if (active) setError('视频背景加载失败，主音频继续播放'); });
    return () => { active = false; media.cancelPending(); };
  }, [sourceUrl, qn, cli, dash, dashAllowed, expanded, loaded, session, audio, player]);
  useEffect(() => {
    const sync = () => { if (!expanded || !sourceUrl || player.preparing) return; if (Math.abs(player.currentTime - audio.currentTime) > 1) player.currentTime = audio.currentTime; if (audio.playing) player.play(); else player.pause(); };
    const time = audio.addListener('timeUpdate', sync); const playing = audio.addListener('playingChange', sync); const loaded = player.addListener('sourceLoad', sync);
    return () => { time.remove(); playing.remove(); loaded.remove(); };
  }, [audio, player, expanded, sourceUrl]);
  useEffect(() => () => { if (exitTimer.current) clearTimeout(exitTimer.current); }, []);
  const revealExit = () => { setShowExit(true); if (exitTimer.current) clearTimeout(exitTimer.current); exitTimer.current = setTimeout(() => setShowExit(false), 3000); };
  const save = async (next: Binding | null) => {
    if (!trackKey) return; const entries = { ...bindings }; if (next) entries[trackKey] = next; else entries[trackKey] = { url: '', qn: 64, cli: true, dash: false };
    while (Object.keys(entries).length > 12) delete entries[Object.keys(entries)[0]];
    await writePreference(prefKey, { entries }); setBindings(entries); setDisabled(old => next ? old.filter(key => key !== trackKey) : [...old.filter(key => key !== trackKey), trackKey]); if (!next) { await adapter.current?.apply(null, session!.serverUrl, session!.accessToken); } setPicker(false);
  };
  const select = (page?: number, cid?: number) => { try { const value = biliSelection(url); const parsed = new URL(value.url); if (page) parsed.searchParams.set('p', String(page)); if (cid) parsed.searchParams.set('cid', String(cid)); void save({ url: parsed.toString(), qn: binding?.qn ?? 64, cli: binding?.cli ?? true, dash: binding?.dash ?? false }).catch(() => setError('视频设置保存失败')); } catch { setError('请输入有效 B站视频链接或 BV 号'); } };
  return <><View pointerEvents={pure ? 'auto' : 'none'} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}><VlcVideo video={video} background style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />{pure ? <VideoGestures player={audio} fullscreen show={revealExit} control={control} /> : null}{pure && showExit ? <SafeAreaView pointerEvents="box-none" style={{ flex: 1 }}><View style={{ alignSelf: 'flex-end', padding: 12 }}><RoomButton label="退出纯净视频" secondary onPress={() => setPure(false)} /></View></SafeAreaView> : null}</View>
    {!pure ? <View style={[ui.row, { zIndex: 1 }]}><RoomButton label="追加 / 更换视频" secondary disabled={!trackKey} onPress={() => { setUrl(binding?.url || ''); setParts(null); setPicker(true); }} /><RoomButton label="纯净视频" secondary disabled={!binding} onPress={() => { revealExit(); setPure(true); }} />{binding ? <RoomButton label="删除关联视频" secondary onPress={() => void save(null)} /> : null}{error ? <Text style={ui.error}>{error}</Text> : null}</View> : null}
    <Modal visible={picker} transparent animationType={theme.preferences.reduceMotion ? 'none' : 'fade'} supportedOrientations={['portrait', 'landscape']} onRequestClose={() => setPicker(false)}><View style={{ flex: 1, padding: 20, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center' }}><SafeAreaView style={{ width: '100%', maxWidth: 720, maxHeight: '92%', alignSelf: 'center', borderRadius: 16, backgroundColor: theme.dark ? '#1b2024' : '#fff', padding: 16 }}><View style={ui.row}><Text style={[ui.title, { flex: 1 }]} numberOfLines={1}>关联视频</Text><RoomButton label="关闭" secondary onPress={() => setPicker(false)} /></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingVertical: 12 }}><RoomInput value={url} onChangeText={value => { setUrl(value); setParts(null); }} placeholder="B站视频链接 / BV 号" autoCapitalize="none" /><RoomButton label="保存视频" disabled={!url.trim() || busy} onPress={() => select()} /><RoomButton label="解析分 P" secondary disabled={!url.trim() || busy} onPress={() => { setBusy(true); void Promise.resolve().then(() => resolveLocalBili(biliSelection(url).url)).then(setParts).catch(() => setError('分 P 解析失败，请检查本机账号')).finally(() => setBusy(false)); }} />{parts?.pages?.map(part => <RoomButton key={part.cid} label={`P${part.page} ${part.part}`} secondary onPress={() => select(part.page, part.cid)} />)}<Text style={ui.title}>视频分辨率与解析</Text><View style={ui.row}>{[0, 16, 32, 64, 80, 112, 116, 120].map(value => <RoomButton key={value} label={`${binding?.qn === value ? '✓ ' : ''}${value || '自动'}`} secondary disabled={!binding} onPress={() => { if (binding) void save({ ...binding, qn: value }); }} />)}</View><RoomButton label={binding?.cli ? '✓ 本机 CLI' : '服务器解析'} secondary disabled={!binding} onPress={() => { if (binding) void save({ ...binding, cli: !binding.cli }); }} /><RoomButton label={binding?.dash ? '✓ 服务器 DASH' : '服务器 MP4'} secondary disabled={!binding || binding.cli || !dashAllowed} onPress={() => { if (binding) void save({ ...binding, dash: !binding.dash }); }} /><BiliCatalog choose={item => { setUrl(`https://www.bilibili.com/video/${item.bvid}${item.cid ? `?cid=${item.cid}` : ''}`); setParts(null); }} />{error ? <Text style={ui.error}>{error}</Text> : null}</ScrollView></SafeAreaView></View></Modal>
  </>;
}
