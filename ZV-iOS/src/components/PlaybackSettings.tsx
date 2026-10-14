import Feather from '@expo/vector-icons/Feather';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { nativeVideoSource } from '@/lib/media';
import type { VlcPlayer } from '@/lib/vlcPlayer';
import { useSession } from '@/state/session';
import { useAppearance } from '@/state/appearance';
import { AppDialog } from './AppDialog';
import { DanmakuSettings, type useDanmaku } from './Danmaku';
import { DanmakuManager } from './DanmakuManager';
import { MediaSwitch, MediaTabs, useMediaPalette } from './MediaPanelUi';
import { RoomButton, RoomInput, ui as baseUi } from './RoomUi';
import { SubtitlePanel, type useSubtitles } from './Subtitles';

export function PlaybackSettings({ visible, close, player, subtitles, danmaku, roomId, host, trackVersion }: { visible: boolean; close: () => void; player: VlcPlayer; subtitles: ReturnType<typeof useSubtitles>; danmaku: ReturnType<typeof useDanmaku>; roomId: string; host: boolean; trackVersion: number }) {
  const theme = useAppearance(); const ui = theme.styles(baseUi); const p = useMediaPalette(); const { session } = useSession();
  const [tab, setTab] = useState<'subtitles' | 'danmaku'>('subtitles');
  const [advanced, setAdvanced] = useState(false); const [tracksOpen, setTracksOpen] = useState(false);
  const [subtitle, setSubtitle] = useState(''); const [error, setError] = useState('');
  const previous = useRef<{ native: number; uri?: string; synced: boolean } | null>(null);
  useEffect(() => { const listener = player.addListener('statusChange', event => { if (event.status === 'loading' || event.status === 'idle') previous.current = null; }); return () => { listener.remove(); }; }, [player]);
  const enabled = subtitles.state.enabled || !!player.mediaSettings.subtitleUri || (player.selectedTracks.subtitle ?? -1) >= 0;
  const toggle = (value: boolean) => {
    if (!value) {
      previous.current = { native: player.selectedTracks.subtitle ?? -1, uri: player.mediaSettings.subtitleUri, synced: subtitles.state.enabled };
      subtitles.selectNative(-1);
    } else if (previous.current?.uri) subtitles.selectNative(previous.current.uri);
    else if (previous.current && previous.current.native >= 0 && player.mediaTracks.subtitle.some(track => track.id === previous.current?.native)) subtitles.selectNative(previous.current.native);
    else if (subtitles.state.tracks.length || previous.current?.synced) subtitles.change({ enabled: true });
    else { const track = player.mediaTracks.subtitle.find(track => track.id >= 0); if (track) subtitles.selectNative(track.id); else subtitles.change({ enabled: true }); }
  };
  return <AppDialog visible={visible} title="播放设置" closeLabel="关闭设置" close={close} maxWidth={480} presentation="trailing">
    <View testID="playback-settings-tabs"><MediaTabs tabs={[{ value: 'subtitles', label: '字幕' }, { value: 'danmaku', label: '弹幕' }]} value={tab} onChange={setTab} /></View>
    {tab === 'subtitles' ? <>
      <MediaSwitch label="启用字幕" value={enabled} onChange={toggle} />
      <Pressable accessibilityRole="button" accessibilityLabel={advanced ? '收起高级设置' : '高级设置'} accessibilityState={{ expanded: advanced }} onPress={() => setAdvanced(value => !value)} style={{ minHeight: 48, borderWidth: 1, borderColor: p.line, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Text style={{ color: p.muted, fontSize: 15 }}>{advanced ? '收起高级设置' : '高级设置'}</Text><Feather name={advanced ? 'chevron-up' : 'chevron-right'} size={18} color={p.muted} /></Pressable>
      {advanced ? <View style={{ gap: 12, paddingTop: 8 }}>
        <Text style={ui.title}>字幕管理</Text>
        <View testID="subtitle-tracks" style={ui.row}><RoomButton label="关闭字幕" secondary selected={!enabled} onPress={() => subtitles.selectNative(-1)} />{player.mediaTracks.subtitle.filter(track => track.id >= 0).map(track => <RoomButton key={track.id} label={track.name || `字幕 ${track.id}`} secondary selected={!subtitles.state.enabled && player.selectedTracks.subtitle === track.id} onPress={() => subtitles.selectNative(track.id)} />)}</View>
        <Text style={ui.muted}>{trackVersion > 0 && !player.mediaTracks.subtitle.some(track => track.id >= 0) ? '当前视频没有内嵌字幕，可加载外部字幕' : '选择内嵌字幕或加载外部字幕'}</Text>
        <RoomInput value={subtitle} onChangeText={setSubtitle} autoCapitalize="none" keyboardType="url" placeholder="外部 SRT / ASS / VTT 字幕地址" />
        <RoomButton label="加载字幕" disabled={!subtitle.trim()} secondary onPress={() => { try { if (!session) return; const media = nativeVideoSource({ sourceUrl: subtitle.trim() }, session.serverUrl, session.accessToken); subtitles.selectNative(media.uri); setError(''); } catch { setError('字幕地址无效或当前设备无法访问'); } }} />
        <Text style={ui.text}>原生字幕延迟 {player.mediaSettings.subtitleDelay.toFixed(1)} 秒</Text><View style={ui.row}>{[-0.5, 0.5].map(change => <RoomButton key={change} label={change < 0 ? '提前 0.5 秒' : '延后 0.5 秒'} secondary onPress={() => player.configure({ subtitleDelay: player.mediaSettings.subtitleDelay + change })} />)}</View>
        <SubtitlePanel subtitles={subtitles} />
        <RoomButton label="画中画" secondary onPress={() => void player.startPictureInPicture().catch(() => setError('设备当前无法进入画中画'))} />
      </View> : null}
    </> : <><DanmakuSettings state={danmaku} /><Pressable accessibilityRole="button" accessibilityLabel="弹幕轨道" accessibilityState={{ expanded: tracksOpen }} onPress={() => setTracksOpen(value => !value)} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderColor: p.line }}><Text style={ui.text}>弹幕轨道 · {danmaku.tracks.length}</Text><Feather name={tracksOpen ? 'chevron-up' : 'chevron-down'} size={18} color={p.muted} /></Pressable>{tracksOpen ? <DanmakuManager roomId={roomId} host={host} tracks={danmaku.tracks} /> : null}</>}
    {error ? <Text style={ui.error}>{error}</Text> : null}
  </AppDialog>;
}
