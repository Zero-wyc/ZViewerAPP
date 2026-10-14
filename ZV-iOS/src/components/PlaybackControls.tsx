import Feather from '@expo/vector-icons/Feather';
import Slider from '@react-native-community/slider';
import { useEffect, useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppearance } from '@/state/appearance';
import { useSession } from '@/state/session';
import { formatTime } from '@/lib/sources';
import { writePreference } from '@/lib/preferences';
import { emitAck } from '@/lib/socket';
import { messageFor } from '@/lib/server';
import type { VlcPlayer } from '@/lib/vlcPlayer';
import { AppDialog } from './AppDialog';
import { MediaSlider, MediaTabs } from './MediaPanelUi';
import { ScreenOrientationButton } from './ScreenOrientationButton';
import type { ScreenOrientationControl } from '@/hooks/usePlayerDisplay';
import { PlaybackSettings } from './PlaybackSettings';
import type { useSubtitles } from './Subtitles';
import type { useDanmaku } from './Danmaku';

type Props = { roomId: string; subtitles: ReturnType<typeof useSubtitles>; danmaku: ReturnType<typeof useDanmaku>; player: VlcPlayer; host: boolean; control: (action: 'play' | 'pause' | 'seek' | 'rate', value?: number) => void; fullscreen: boolean; toggleFullscreen: () => void; refresh: () => void; orientation: ScreenOrientationControl; hide: () => void; interact: (active: boolean) => void };
export function PlaybackControls({ player, host, control, fullscreen, toggleFullscreen, subtitles, danmaku, roomId, refresh, orientation, hide, interact }: Props) {
  const theme = useAppearance(); const { socket, connected } = useSession(); const insets = useSafeAreaInsets();
  const [time, setTime] = useState(player.currentTime); const [duration, setDuration] = useState(player.duration); const [playing, setPlaying] = useState(player.playing);
  const [settings, setSettings] = useState(false); const [quick, setQuick] = useState<'rate' | 'volume' | null>(null); const [trackVersion, setTrackVersion] = useState(0);
  const [rate, setRate] = useState(player.playbackRate); const [volume, setVolume] = useState(player.mediaSettings.volume);
  const [width, setWidth] = useState(0); const [draft, setDraft] = useState(''); const [sending, setSending] = useState(false); const [error, setError] = useState('');
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [focused, setFocused] = useState(false); const [sliding, setSliding] = useState(false);
  const wide = width >= 700;
  useEffect(() => { interact(settings || !!quick || focused || sliding || orientation.busy); return () => interact(false); }, [settings, quick, focused, sliding, orientation.busy, interact]);
  useEffect(() => {
    const progress = player.addListener('timeUpdate', event => setTime(event.currentTime));
    const seek = player.addListener('seekChange', event => setTime(event.currentTime));
    const play = player.addListener('playingChange', event => setPlaying(event.isPlaying));
    const loaded = player.addListener('sourceLoad', event => { setDuration(event.duration); setTrackVersion(value => value + 1); });
    const configured = player.addListener('settingsChange', value => { setVolume(value.volume); setTrackVersion(version => version + 1); });
    const speed = player.addListener('playbackRateChange', value => setRate(value.playbackRate));
    const status = player.addListener('statusChange', event => { if (event.status === 'loading' || event.status === 'idle') { setTime(0); setDuration(0); setRate(player.playbackRate); setError(''); setTrackVersion(value => value + 1); } });
    return () => { progress.remove(); seek.remove(); play.remove(); loaded.remove(); status.remove(); configured.remove(); speed.remove(); };
  }, [player]);
  const send = async () => {
    if (!socket?.connected || !draft.trim() || sending) return;
    setSending(true); setError('');
    try { await emitAck(socket, 'send-danmaku', { roomId, content: draft.trim(), videoTime: player.currentTime }); setDraft(''); }
    catch (failure) { setError(messageFor(failure)); } finally { setSending(false); }
  };
  const icon = (label: string, name: ComponentProps<typeof Feather>['name'], action: () => void, disabled = false, selected = false) => <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected }} disabled={disabled} onPress={action} style={[styles.icon, selected && styles.selected, disabled && { opacity: .4 }]}><Feather name={name} color="#f3f7fa" size={22} /></Pressable>;
  const composer = <View style={styles.composer}>{icon(danmaku.preferences.enabled ? '关闭弹幕' : '开启弹幕', 'message-square', () => danmaku.change({ enabled: !danmaku.preferences.enabled }), false, danmaku.preferences.enabled)}<TextInput accessibilityLabel="发送弹幕" placeholder="发个友善的弹幕" placeholderTextColor="#bbc6d1" style={styles.input} value={draft} onChangeText={setDraft} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} maxLength={300} returnKeyType="send" onSubmitEditing={() => void send()} />{icon('发送弹幕', 'send', () => void send(), sending || !connected || !draft.trim())}</View>;
  return <View testID="watch-control-bar" onLayout={event => setWidth(event.nativeEvent.layout.width)} style={[styles.root, { paddingLeft: fullscreen ? Math.max(8, insets.left) : 8, paddingRight: fullscreen ? Math.max(8, insets.right) : 8, paddingBottom: fullscreen ? Math.max(6, insets.bottom) : 6 }]}>
      <Slider accessibilityLabel="播放进度" style={{ height: 28, marginHorizontal: -2 }} minimumValue={0} maximumValue={Math.max(1, duration)} tapToSeek value={dragStart ?? Math.min(time, Math.max(1, duration))} disabled={duration <= 0} minimumTrackTintColor="#1463b6" maximumTrackTintColor="#ffffff40" thumbTintColor="#9cdbff" onSlidingStart={value => { setDragStart(value); setSliding(true); }} onSlidingComplete={value => { control('seek', value); setDragStart(null); setSliding(false); }} />
      <View style={styles.row}>{icon(playing ? '暂停' : '播放', playing ? 'pause' : 'play', () => control(playing ? 'pause' : 'play'))}<Text numberOfLines={1} style={styles.time}>{formatTime(time)} / {formatTime(duration)}</Text>{wide ? composer : <View style={{ flex: 1 }} />}
        <Pressable accessibilityRole="button" accessibilityLabel="播放倍速" onPress={() => setQuick('rate')} style={styles.icon}><Text style={{ color: '#f3f7fa', fontSize: 13 }}>{rate}×</Text></Pressable>
        {icon('本机音量', volume <= 0 ? 'volume-x' : 'volume-2', () => setQuick('volume'))}
        {wide ? icon('刷新播放', 'refresh-cw', refresh) : null}
        {wide && fullscreen ? icon('隐藏播放控件', 'eye-off', hide) : null}
        {icon('设置', 'settings', () => setSettings(true))}
        {wide && fullscreen ? <ScreenOrientationButton state={orientation} color="#f3f7fa" /> : null}
        {icon(fullscreen ? '退出全屏' : '全屏', fullscreen ? 'minimize' : 'maximize', toggleFullscreen)}
      </View>{!wide ? <View style={styles.row}>{composer}{icon('刷新播放', 'refresh-cw', refresh)}{fullscreen ? <ScreenOrientationButton state={orientation} color="#f3f7fa" /> : null}</View> : null}
    {orientation.error ? <Text accessibilityLiveRegion="polite" style={{ color: '#ffb4ab', padding: 6 }}>{orientation.error}</Text> : null}
    {error ? <Text style={{ color: '#ffb4ab', padding: 6 }}>{error}</Text> : null}
    <PlaybackSettings visible={settings} close={() => setSettings(false)} player={player} subtitles={subtitles} danmaku={danmaku} roomId={roomId} host={host} trackVersion={trackVersion} />
    <AppDialog visible={!!quick} title={quick === 'rate' ? '播放倍速' : '本机音量'} close={() => setQuick(null)} maxWidth={420}>
      {quick === 'rate' ? <><MediaTabs tabs={[.5, 1, 1.25, 1.5, 2].map(value => ({ value: String(value), label: `${value}×` }))} value={String(rate)} onChange={value => { if (host) { control('rate', Number(value)); setQuick(null); } }} />{!host ? <Text style={{ color: theme.color('#a8b3b6') }}>倍速由房主调整</Text> : null}</> : <MediaSlider label="本机音量" value={volume} maximumValue={100} displayValue={`${Math.round(volume)}%`} onChange={value => { setVolume(value); player.configure({ volume: value }); }} onComplete={value => { void writePreference('zviewer-volume', { value }).catch(() => {}); }} />}
    </AppDialog>
  </View>;
}
const styles = StyleSheet.create({
  root: { backgroundColor: 'rgba(15,23,32,0.94)', borderWidth: 1, borderColor: '#ffffff18', borderRadius: 14, paddingTop: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  icon: { minHeight: 44, width: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  selected: { backgroundColor: '#ffffff16' },
  time: { color: '#f3f7fa', fontSize: 11, fontVariant: ['tabular-nums'], marginRight: 6, flexShrink: 1 },
  composer: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, minWidth: 0, minHeight: 38, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#ffffff20', color: '#fff', fontSize: 13 },
});
