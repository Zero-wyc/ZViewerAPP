import { useAppearance } from '@/state/appearance';
import Slider from '@react-native-community/slider';
import Feather from '@expo/vector-icons/Feather';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/state/session';
import { nativeVideoSource } from '@/lib/media';
import { formatTime } from '@/lib/sources';
import { writePreference } from '@/lib/preferences';
import { type VlcPlayer } from '@/lib/vlcPlayer';
import { RoomButton, RoomInput, ui as baseUi } from './RoomUi';

export function PlaybackControls({ player, host, control, fullscreen, toggleFullscreen }: { player: VlcPlayer; host: boolean; control: (action: 'play' | 'pause' | 'seek' | 'rate', value?: number) => void; fullscreen: boolean; toggleFullscreen: () => void }) {
  const theme = useAppearance();
  const ui = theme.styles(baseUi);

  const { session } = useSession(); const insets = useSafeAreaInsets(); const [time, setTime] = useState(0); const [duration, setDuration] = useState(0); const [playing, setPlaying] = useState(false);
  const [settings, setSettings] = useState(false); const [trackVersion, setTrackVersion] = useState(0); const [subtitle, setSubtitle] = useState(''); const [error, setError] = useState('');
  const [volume, setVolume] = useState(player.mediaSettings.volume); const [delay, setDelay] = useState(0);
  useEffect(() => {
    const progress = player.addListener('timeUpdate', event => setTime(event.currentTime));
    const play = player.addListener('playingChange', event => setPlaying(event.isPlaying));
    const loaded = player.addListener('sourceLoad', event => { setDuration(event.duration); setTrackVersion(value => value + 1); });
    const status = player.addListener('statusChange', event => { if (event.status === 'loading' || event.status === 'idle') { setTime(0); setDuration(0); } });
    return () => { progress.remove(); play.remove(); loaded.remove(); status.remove(); };
  }, [player]);
  const icons = { 播放: 'play', 暂停: 'pause', 设置: 'settings', 全屏: 'maximize', 退出全屏: 'minimize', '−15秒': 'rotate-ccw', '+15秒': 'rotate-cw' } as const;
  const button = (label: keyof typeof icons, action: () => void, disabled = false) => <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={action} style={{ minHeight: 44, minWidth: 44, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'center', opacity: disabled ? 0.4 : 1 }}><Feather name={icons[label]} color="#fff" size={20} /></Pressable>;
  return <View style={{ gap: 0, paddingLeft: fullscreen ? Math.max(10, insets.left) : 10, paddingRight: fullscreen ? Math.max(10, insets.right) : 10, paddingBottom: fullscreen ? Math.max(4, insets.bottom) : 4, backgroundColor: 'rgba(0,0,0,0.7)' }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Text style={{ color: theme.color('#fff', 'color'), fontSize: 12 }}>{formatTime(time)} / {formatTime(duration)}</Text><Slider style={{ flex: 1, minHeight: 32 }} accessibilityLabel="播放进度" minimumValue={0} maximumValue={Math.max(1, duration)} value={time} disabled={duration <= 0} minimumTrackTintColor="#65d59b" maximumTrackTintColor="#aaa" onSlidingComplete={value => control('seek', value)} /></View>{error && !settings ? <Text style={ui.error}>{error}</Text> : null}
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>{button(playing ? '暂停' : '播放', () => control(playing ? 'pause' : 'play'))}{button('−15秒', () => control('seek', time - 15))}{button('+15秒', () => control('seek', time + 15))}<View style={{ flex: 1 }} />{button('设置', () => setSettings(true))}{button(fullscreen ? '退出全屏' : '全屏', toggleFullscreen)}</View>
    <Modal visible={settings} transparent animationType="fade" supportedOrientations={['portrait', 'landscape']} onRequestClose={() => setSettings(false)}><View style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.65)' }}><ScrollView style={{ maxHeight: '90%', width: '100%', maxWidth: 600, alignSelf: 'center' }} contentContainerStyle={ui.card}><View style={ui.row}><Text style={[ui.title, { flex: 1 }]}>播放设置</Text><RoomButton label="关闭设置" secondary onPress={() => setSettings(false)} /></View><RoomButton label="画中画" secondary onPress={() => void player.startPictureInPicture().catch(() => setError('设备当前无法进入画中画'))} /><Text style={ui.text}>倍速</Text><View style={ui.row}>{[0.5, 1, 1.25, 1.5, 2].map(rate => <RoomButton key={rate} label={`${rate}×`} secondary disabled={!host} onPress={() => { control('rate', rate); }} />)}</View>
      <Text style={ui.text}>本机音量 · {Math.round(volume)}%</Text><Slider accessibilityLabel="本机音量" minimumValue={0} maximumValue={100} value={volume} minimumTrackTintColor="#65d59b" onValueChange={value => { setVolume(value); player.configure({ volume: value }); }} onSlidingComplete={value => { void writePreference('zviewer-volume', { value }).catch(() => {}); }} />
      <Text style={ui.text}>音轨</Text><View style={ui.row}>{player.mediaTracks.audio.map(track => <RoomButton key={track.id} label={track.name || `音轨 ${track.id}`} secondary onPress={() => player.configure({ tracks: { ...player.mediaSettings.tracks, audio: track.id } })} />)}</View>
      <Text style={ui.text}>字幕</Text><View style={ui.row}><RoomButton label="关闭字幕" secondary onPress={() => player.configure({ tracks: { ...player.mediaSettings.tracks, subtitle: -1 } })} />{player.mediaTracks.subtitle.map(track => <RoomButton key={track.id} label={track.name || `字幕 ${track.id}`} secondary onPress={() => player.configure({ tracks: { ...player.mediaSettings.tracks, subtitle: track.id } })} />)}</View>
      <Text style={ui.muted}>{trackVersion && !player.mediaTracks.audio.length && !player.mediaTracks.subtitle.length ? '当前源未报告可选轨道' : '轨道由播放器检测，显示名称与媒体文件一致'}</Text>
      <RoomInput value={subtitle} onChangeText={setSubtitle} autoCapitalize="none" keyboardType="url" placeholder="外部 SRT / ASS / VTT 字幕地址" /><RoomButton label="加载字幕" disabled={!subtitle.trim()} onPress={() => { try { if (!session) return; const media = nativeVideoSource({ sourceUrl: subtitle.trim() }, session.serverUrl, session.accessToken); player.configure({ subtitleUri: media.uri }); setError(''); } catch { setError('字幕地址无效或当前设备无法访问'); } }} secondary />
      <Text style={ui.text}>字幕延迟 {delay.toFixed(1)} 秒</Text><View style={ui.row}>{[-0.5, 0.5].map(change => <RoomButton key={change} label={change < 0 ? '提前 0.5 秒' : '延后 0.5 秒'} secondary onPress={() => { const next = delay + change; setDelay(next); player.configure({ subtitleDelay: next }); }} />)}</View>{error ? <Text style={ui.error}>{error}</Text> : null}
    </ScrollView></View></Modal>
  </View>;
}
