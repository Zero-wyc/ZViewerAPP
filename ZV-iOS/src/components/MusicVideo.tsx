import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppearance } from '@/state/appearance';
import { useSession } from '@/state/session';
import { readPreference, writePreference } from '@/lib/preferences';
import { defaultBiliPolicy, playbackSource, resolveLocalBili, type BiliMedia } from '@/lib/biliNative';
import { biliSelection } from '@/lib/biliSelection';
import { NativeMediaAdapter } from '@/lib/mediaAdapter';
import type { VlcPlayer } from '@/lib/vlcPlayer';
import { BiliCatalog } from './BiliCatalog';
import { AppDialog } from './AppDialog';
import { EpisodePicker } from './EpisodePicker';
import { SourceDropdown } from './SourceDropdown';
import { VlcVideo, useVlcVideo } from './VlcVideo';
import { VideoGestures } from './VideoGestures';
import { RoomButton, RoomInput, ui as baseUi } from './RoomUi';
type Binding = { url: string; qn: number; cli: boolean; dash: boolean };
export type MusicVideoControls = { hasVideo: boolean; videoReady: boolean; openPicker: () => void; enterPure: () => void; error: string };
export function MusicVideo({ trackKey, expanded, pure, setPure, audio, control, children }: { trackKey: string | null; expanded: boolean; pure: boolean; setPure: (value: boolean) => void; audio: VlcPlayer; control: (action: 'play' | 'pause' | 'seek', value?: number) => void; children: (controls: MusicVideoControls) => ReactNode }) {
  const theme = useAppearance(); const ui = theme.styles(baseUi); const { session, request } = useSession(); const video = useVlcVideo(true); const { player } = video;
  const [bindings, setBindings] = useState<Record<string, Binding>>({}); const [loaded, setLoaded] = useState(false); const [picker, setPicker] = useState(false); const [url, setUrl] = useState(''); const [parts, setParts] = useState<BiliMedia | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [showExit, setShowExit] = useState(true); const [disabled, setDisabled] = useState<string[]>([]); const [dashAllowed, setDashAllowed] = useState(false);
  const adapter = useRef<NativeMediaAdapter | null>(null); const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefKey = session ? `zviewer-music-videos-${session.user.id}` : 'zviewer-music-videos';
  useEffect(() => { let active = true; void readPreference<{ entries: Record<string, Binding> }>(prefKey, { entries: {} }).then(value => { if (active) { setBindings(value.entries); setLoaded(true); } }); void request<{ settings: { dashDisabled?: boolean } }>('/api/auth/public-settings').then(value => { if (active) setDashAllowed(value.settings?.dashDisabled === false); }).catch(() => {}); return () => { active = false; }; }, [prefKey, request]);
  useEffect(() => { const port = new NativeMediaAdapter(player, playbackSource); adapter.current = port; return () => { port.dispose(); adapter.current = null; }; }, [player]);
  const biliUrl = trackKey?.startsWith('bili:') ? `https://www.bilibili.com/video/${trackKey.split(':')[1]}?cid=${trackKey.split(':')[2]}` : '';
  const binding = trackKey && !disabled.includes(trackKey) && bindings[trackKey]?.url !== '' ? bindings[trackKey] || (biliUrl ? { url: biliUrl, qn: 64, cli: true, dash: false } : null) : null;
  const sourceUrl = binding?.url; const qn = binding?.qn; const cli = binding?.cli; const dash = binding?.dash;
  const [readyRevision, setReadyRevision] = useState(-1);
  const videoRevision = video.snapshot?.id;
  const videoReady = readyRevision === videoRevision && player.duration > 0 && !player.preparing;
  useEffect(() => {
    const load = player.addListener('sourceLoad', () => setReadyRevision(player.duration > 0 && !player.preparing ? videoRevision ?? -1 : -1));
    const status = player.addListener('statusChange', event => { if (event.status === 'error') { setReadyRevision(-1); setPure(false); } });
    return () => { load.remove(); status.remove(); };
  }, [player, videoRevision, setPure]);
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
  const select = async (page?: number, cid?: number) => {
    setBusy(true);
    try { const value = biliSelection(url); const parsed = new URL(value.url); if (page) parsed.searchParams.set('p', String(page)); if (cid) parsed.searchParams.set('cid', String(cid)); await save({ url: parsed.toString(), qn: binding?.qn ?? 64, cli: binding?.cli ?? true, dash: binding?.dash ?? false }); return true; }
    catch { setError('视频设置保存失败，请检查 B站链接后重试'); return false; }
    finally { setBusy(false); }
  };
  return <><View pointerEvents={pure ? 'auto' : 'none'} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}><VlcVideo video={video} background style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />{pure ? <VideoGestures player={audio} fullscreen show={revealExit} control={control} /> : null}{pure && showExit ? <SafeAreaView pointerEvents="box-none" style={{ flex: 1 }}><View style={{ alignSelf: 'flex-end', padding: 12 }}><RoomButton label="退出纯净视频" secondary onPress={() => setPure(false)} /></View></SafeAreaView> : null}</View>
    {/* The render prop only builds controls; its handlers access timers after a press. */}
    {/* eslint-disable-next-line react-hooks/refs -- refs are accessed only inside deferred press handlers. */}
    {children({ hasVideo: !!binding, videoReady, openPicker: () => { setUrl(binding?.url || ''); setParts(null); setPicker(true); }, enterPure: () => { if (binding && videoReady) { revealExit(); setPure(true); } }, error })}
    <AppDialog visible={picker} title="关联视频" close={() => setPicker(false)} maxWidth={720}><RoomInput value={url} onChangeText={value => { setUrl(value); setParts(null); }} placeholder="B站视频链接 / BV 号" autoCapitalize="none" /><RoomButton label="保存视频" disabled={!url.trim() || busy} onPress={() => select()} />{binding ? <RoomButton label="删除关联视频" secondary disabled={busy} onPress={() => { setBusy(true); void save(null).catch(() => setError('视频设置保存失败')).finally(() => setBusy(false)); }} /> : null}<RoomButton label="解析分 P" secondary disabled={!url.trim() || busy} onPress={() => { setBusy(true); void Promise.resolve().then(() => resolveLocalBili(biliSelection(url).url)).then(setParts).catch(() => setError('分 P 解析失败，请检查本机账号')).finally(() => setBusy(false)); }} />{parts?.pages?.length ? <EpisodePicker singleOnly disabled={busy} episodes={parts.pages.map(part => ({ id: String(part.cid), title: `P${part.page} ${part.part}` }))} onAdd={async ids => { const part = parts.pages?.find(item => String(item.cid) === ids[0]); if (!part) return []; return await select(part.page, part.cid) ? [String(part.cid)] : []; }} /> : null}<Text style={ui.title}>视频分辨率与解析</Text><SourceDropdown label="视频画质" value={String(binding?.qn ?? 64)} disabled={!binding || busy} options={[{ id: '0', name: '自动' }, { id: '16', name: '360P' }, { id: '32', name: '480P' }, { id: '64', name: '720P' }, { id: '80', name: '1080P' }, { id: '112', name: '1080P 高码率' }, { id: '116', name: '1080P 60帧' }, { id: '120', name: '4K' }]} onChange={value => { if (binding) void save({ ...binding, qn: Number(value) }); }} /><RoomButton label={binding?.cli ? '✓ 本机 CLI' : '服务器解析'} secondary disabled={!binding} onPress={() => { if (binding) void save({ ...binding, cli: !binding.cli }); }} /><RoomButton label={binding?.dash ? '✓ 服务器 DASH' : '服务器 MP4'} secondary disabled={!binding || binding.cli || !dashAllowed} onPress={() => { if (binding) void save({ ...binding, dash: !binding.dash }); }} /><BiliCatalog choose={item => { setUrl(`https://www.bilibili.com/video/${item.bvid}${item.cid ? `?cid=${item.cid}` : ''}`); setParts(null); }} />{error ? <Text style={ui.error}>{error}</Text> : null}</AppDialog>
  </>;
}
