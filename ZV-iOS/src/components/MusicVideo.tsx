import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppearance } from '@/state/appearance';
import { useSession } from '@/state/session';
import { readPreference, writePreference } from '@/lib/preferences';
import { defaultBiliPolicy, playbackSource } from '@/lib/biliNative';
import { NativeMediaAdapter } from '@/lib/mediaAdapter';
import { MusicVideoSync } from '@/lib/musicVideoSync';
import type { VlcPlayer } from '@/lib/vlcPlayer';
import { BiliVideoPicker } from './BiliVideoPicker';
import { AppDialog } from './AppDialog';
import { SourceDropdown } from './SourceDropdown';
import { VlcVideo, useVlcVideo } from './VlcVideo';
import { VideoGestures } from './VideoGestures';
import { RoomButton, ui as baseUi } from './RoomUi';
type Binding = { url: string; qn: number; cli: boolean; dash: boolean };
export type MusicVideoControls = { hasVideo: boolean; videoReady: boolean; openPicker: () => void; enterPure: () => void; error: string };
export function MusicVideo({ trackKey, expanded, pure, setPure, audio, control, children }: { trackKey: string | null; expanded: boolean; pure: boolean; setPure: (value: boolean) => void; audio: VlcPlayer; control: (action: 'play' | 'pause' | 'seek', value?: number) => void; children: (controls: MusicVideoControls) => ReactNode }) {
  const theme = useAppearance(); const ui = theme.styles(baseUi); const { session, request } = useSession(); const video = useVlcVideo(true); const { player } = video;
  const [bindings, setBindings] = useState<Record<string, Binding>>({}); const [loaded, setLoaded] = useState(false); const [picker, setPicker] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [showExit, setShowExit] = useState(true); const [disabled, setDisabled] = useState<string[]>([]); const [dashAllowed, setDashAllowed] = useState(false);
  const adapter = useRef<NativeMediaAdapter | null>(null); const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [resume, setResume] = useState(0);
  const [decorationFailed, setDecorationFailed] = useState(false);
  const foregroundRef = useRef(AppState.currentState === 'active');
  const operation = useRef(0); const failed = useRef(false);
  const synchronize = useRef<(() => void) | null>(null);
  const releaseDecoration = useCallback(() => {
    adapter.current?.cancelPending(); player.pause();
    if (session) void adapter.current?.apply(null, session.serverUrl, session.accessToken).catch(() => {});
  }, [player, session]);
  const prefKey = session ? `zviewer-music-videos-${session.user.id}` : 'zviewer-music-videos';
  useEffect(() => { let active = true; void readPreference<{ entries: Record<string, Binding> }>(prefKey, { entries: {} }).then(value => { if (active) { setBindings(value.entries); setLoaded(true); } }); void request<{ settings: { dashDisabled?: boolean } }>('/api/auth/public-settings').then(value => { if (active) setDashAllowed(value.settings?.dashDisabled === false); }).catch(() => {}); return () => { active = false; }; }, [prefKey, request]);
  useEffect(() => { const port = new NativeMediaAdapter(player, playbackSource); adapter.current = port; return () => { port.dispose(); adapter.current = null; }; }, [player]);
  useEffect(() => {
    const invalidate = () => { operation.current++; };
    const subscription = AppState.addEventListener('change', phase => {
      const active = phase === 'active'; foregroundRef.current = active; setForeground(active);
      invalidate();
      if (active) { failed.current = false; setResume(value => value + 1); return; }
      // This must run in the event callback: a background React commit may be
      // deferred, while the optional video must stop decoding immediately.
      releaseDecoration();
    });
    return () => { invalidate(); subscription.remove(); };
  }, [releaseDecoration]);
  const biliUrl = trackKey?.startsWith('bili:') ? `https://www.bilibili.com/video/${trackKey.split(':')[1]}?cid=${trackKey.split(':')[2]}` : '';
  const binding = trackKey && !disabled.includes(trackKey) && bindings[trackKey]?.url !== '' ? bindings[trackKey] || (biliUrl ? { url: biliUrl, qn: 64, cli: true, dash: false } : null) : null;
  const sourceUrl = binding?.url; const qn = binding?.qn; const cli = binding?.cli; const dash = binding?.dash;
  const [readyRevision, setReadyRevision] = useState(-1);
  const videoRevision = video.snapshot?.id;
  const showVideo = foreground && expanded && !!binding && !decorationFailed;
  const videoReady = showVideo && readyRevision === videoRevision && player.duration > 0 && !player.preparing;
  useEffect(() => {
    const load = player.addListener('sourceLoad', () => setReadyRevision(player.duration > 0 && !player.preparing ? videoRevision ?? -1 : -1));
    const status = player.addListener('statusChange', event => { if (event.status === 'error') { failed.current = true; setDecorationFailed(true); adapter.current?.nativeFailed(); releaseDecoration(); setReadyRevision(-1); setPure(false); setError('视频背景加载失败，主音频继续播放'); } });
    return () => { load.remove(); status.remove(); };
  }, [player, videoRevision, setPure, releaseDecoration]);
  useEffect(() => {
    if (!session || !adapter.current) return; const media = adapter.current; let active = true; const version = ++operation.current; setError(''); failed.current = false; setDecorationFailed(false);
    const current = () => active && version === operation.current && foregroundRef.current && !failed.current;
    // Null replaces release the source and reset ready markers. The same URL
    // added later therefore crosses the native load path again.
    // Resolve without capturing a stale audio position. The synchronizer takes
    // the latest confirmed audio clock once the native input has prepared.
    const next = foreground && foregroundRef.current && expanded && loaded && sourceUrl ? { sourceUrl, sourceType: 'bilibili', format: 'muted-video', isPlaying: audio.playing, currentTime: 0, biliPolicy: { ...defaultBiliPolicy, qn: qn || 0, cliEnabled: cli !== false, preferMp4: !dash, dashAllowed } } : null;
    player.configure({ volume: 0 });
    void media.apply(next, session.serverUrl, session.accessToken).then(() => { if (current() && next) synchronize.current?.(); }).catch(() => { if (current()) { failed.current = true; setDecorationFailed(true); releaseDecoration(); setReadyRevision(-1); setPure(false); setError('视频背景加载失败，主音频继续播放'); } });
    return () => { active = false; media.cancelPending(); };
  }, [trackKey, sourceUrl, qn, cli, dash, dashAllowed, expanded, loaded, session, audio, player, foreground, resume, releaseDecoration, setPure]);
  useEffect(() => {
    const follower = new MusicVideoSync(audio, player);
    const sync = () => { if (foregroundRef.current && foreground && !failed.current && expanded && loaded && sourceUrl && !adapter.current?.busy) follower.sync(); };
    const seek = () => { follower.requestSeek(); sync(); };
    synchronize.current = sync;
    const listeners = [audio.addListener('timeUpdate', sync), audio.addListener('playingChange', sync), audio.addListener('playbackRateChange', sync), audio.addListener('seekChange', seek), audio.addListener('seekSettled', sync), audio.addListener('sourceLoad', seek), player.addListener('sourceLoad', sync)];
    sync();
    return () => { if (synchronize.current === sync) synchronize.current = null; listeners.forEach(listener => listener.remove()); };
  }, [audio, player, trackKey, expanded, sourceUrl, qn, cli, dash, dashAllowed, loaded, foreground, resume, session]);
  useEffect(() => () => { if (exitTimer.current) clearTimeout(exitTimer.current); }, []);
  const revealExit = () => { setShowExit(true); if (exitTimer.current) clearTimeout(exitTimer.current); exitTimer.current = setTimeout(() => setShowExit(false), 3000); };
  const save = async (next: Binding | null) => {
    if (!trackKey) return; const entries = { ...bindings }; if (next) entries[trackKey] = next; else entries[trackKey] = { url: '', qn: 64, cli: true, dash: false };
    while (Object.keys(entries).length > 12) delete entries[Object.keys(entries)[0]];
    await writePreference(prefKey, { entries }); setBindings(entries); setDisabled(old => next ? old.filter(key => key !== trackKey) : [...old.filter(key => key !== trackKey), trackKey]); if (!next) { await adapter.current?.apply(null, session!.serverUrl, session!.accessToken); } setPicker(false);
  };
  return <><View pointerEvents={pure ? 'auto' : 'none'} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: pure ? '#000' : 'transparent' }}>{showVideo ? <VlcVideo video={video} background style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} /> : null}{pure ? <VideoGestures player={audio} fullscreen show={revealExit} control={control} /> : null}{pure && showExit ? <SafeAreaView pointerEvents="box-none" style={{ flex: 1 }}><View style={{ alignSelf: 'flex-end', padding: 12 }}><RoomButton label="退出纯净视频" secondary onPress={() => setPure(false)} /></View></SafeAreaView> : null}</View>
    {/* The render prop only builds controls; its handlers access timers after a press. */}
    {/* eslint-disable-next-line react-hooks/refs -- refs are accessed only inside deferred press handlers. */}
    {children({ hasVideo: !!binding, videoReady, openPicker: () => { setPicker(true); }, enterPure: () => { if (binding && videoReady) { revealExit(); setPure(true); } }, error })}
    <AppDialog visible={picker} title="关联视频" close={() => setPicker(false)} maxWidth={720}><BiliVideoPicker key={`${prefKey}:${trackKey}`} active={picker} initialUrl={binding?.url || ''} singleOnly onBusyChange={setBusy} onAdd={async value => { await save({ url: value.url, qn: binding?.qn ?? 64, cli: value.cliOnly || (binding?.cli ?? true), dash: value.cliOnly ? false : binding?.dash ?? false }); }} />{binding ? <RoomButton label="删除关联视频" secondary disabled={busy} onPress={() => { setBusy(true); void save(null).catch(() => setError('视频设置保存失败')).finally(() => setBusy(false)); }} /> : null}<Text style={ui.title}>视频分辨率与解析</Text><SourceDropdown label="视频画质" value={String(binding?.qn ?? 64)} disabled={!binding || busy} options={[{ id: '0', name: '自动' }, { id: '16', name: '360P' }, { id: '32', name: '480P' }, { id: '64', name: '720P' }, { id: '80', name: '1080P' }, { id: '112', name: '1080P 高码率' }, { id: '116', name: '1080P 60帧' }, { id: '120', name: '4K' }]} onChange={value => { if (binding) void save({ ...binding, qn: Number(value) }); }} /><RoomButton label={binding?.cli ? '✓ 本机 CLI' : '服务器解析'} secondary disabled={!binding} onPress={() => { if (binding) void save({ ...binding, cli: !binding.cli }); }} /><RoomButton label={binding?.dash ? '✓ 服务器 DASH' : '服务器 MP4'} secondary disabled={!binding || binding.cli || !dashAllowed} onPress={() => { if (binding) void save({ ...binding, dash: !binding.dash }); }} />{error ? <Text style={ui.error}>{error}</Text> : null}</AppDialog>
  </>;
}
