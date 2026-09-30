import Slider from '@react-native-community/slider';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useSession } from '@/state/session';
import { nativeVideoSource } from '@/lib/media';
import { formatTime } from '@/lib/sources';
import { writePreference } from '@/lib/preferences';
import { type VlcPlayer } from '@/lib/vlcPlayer';
import { RoomButton, RoomInput, ui } from './RoomUi';

export function PlaybackControls({ player, host, control, fullscreen, toggleFullscreen }: { player: VlcPlayer; host: boolean; control: (action: 'play' | 'pause' | 'seek', value?: number) => void; fullscreen: boolean; toggleFullscreen: () => void }) {
  const { session } = useSession(); const [time, setTime] = useState(0); const [duration, setDuration] = useState(0); const [playing, setPlaying] = useState(false);
  const [settings, setSettings] = useState(false); const [trackVersion, setTrackVersion] = useState(0); const [subtitle, setSubtitle] = useState(''); const [error, setError] = useState('');
  const [volume, setVolume] = useState(player.mediaSettings.volume); const [delay, setDelay] = useState(0);
  useEffect(() => {
    const progress = player.addListener('timeUpdate', event => setTime(event.currentTime));
    const play = player.addListener('playingChange', event => setPlaying(event.isPlaying));
    const loaded = player.addListener('sourceLoad', event => { setDuration(event.duration); setTrackVersion(value => value + 1); });
    return () => { progress.remove(); play.remove(); loaded.remove(); };
  }, [player]);
  return <View style={ui.content}><View style={ui.row}><Text style={ui.muted}>{formatTime(time)} / {formatTime(duration)}</Text><Text style={ui.muted}>{host ? '房主控制' : '跟随房主'}</Text><RoomButton label="画中画" secondary onPress={() => void player.startPictureInPicture().catch(() => setError('设备当前无法进入画中画'))} /></View>{error && !settings ? <Text style={ui.error}>{error}</Text> : null}
    <Slider accessibilityLabel="播放进度" minimumValue={0} maximumValue={Math.max(1, duration)} value={time} disabled={!host || duration <= 0} minimumTrackTintColor="#65d59b" maximumTrackTintColor="#343d41" onSlidingComplete={value => control('seek', value)} />
    <View style={ui.row}><RoomButton label="−15 秒" secondary disabled={!host} onPress={() => control('seek', time - 15)} /><RoomButton label={playing ? '暂停' : '播放'} disabled={!host} onPress={() => control(playing ? 'pause' : 'play')} /><RoomButton label="+15 秒" secondary disabled={!host} onPress={() => control('seek', time + 15)} /><RoomButton label={fullscreen ? '退出全屏' : '全屏'} onPress={toggleFullscreen} secondary /><RoomButton label="播放设置" onPress={() => setSettings(value => !value)} secondary /></View>
    {settings ? <View style={ui.card}><Text style={ui.text}>倍速</Text><View style={ui.row}>{[0.5, 1, 1.25, 1.5, 2].map(rate => <RoomButton key={rate} label={`${rate}×`} secondary disabled={!host} onPress={() => { player.playbackRate = rate; }} />)}</View>
      <Text style={ui.text}>本机音量 · {Math.round(volume)}%</Text><Slider accessibilityLabel="本机音量" minimumValue={0} maximumValue={100} value={volume} minimumTrackTintColor="#65d59b" onValueChange={value => { setVolume(value); player.configure({ volume: value }); }} onSlidingComplete={value => { void writePreference('zviewer-volume', { value }).catch(() => {}); }} />
      <Text style={ui.text}>音轨</Text><View style={ui.row}>{player.mediaTracks.audio.map(track => <RoomButton key={track.id} label={track.name || `音轨 ${track.id}`} secondary onPress={() => player.configure({ tracks: { ...player.mediaSettings.tracks, audio: track.id } })} />)}</View>
      <Text style={ui.text}>字幕</Text><View style={ui.row}><RoomButton label="关闭字幕" secondary onPress={() => player.configure({ tracks: { ...player.mediaSettings.tracks, subtitle: -1 } })} />{player.mediaTracks.subtitle.map(track => <RoomButton key={track.id} label={track.name || `字幕 ${track.id}`} secondary onPress={() => player.configure({ tracks: { ...player.mediaSettings.tracks, subtitle: track.id } })} />)}</View>
      <Text style={ui.muted}>{trackVersion && !player.mediaTracks.audio.length && !player.mediaTracks.subtitle.length ? '当前源未报告可选轨道' : '轨道由播放器检测，显示名称与媒体文件一致'}</Text>
      <RoomInput value={subtitle} onChangeText={setSubtitle} autoCapitalize="none" keyboardType="url" placeholder="外部 SRT / ASS / VTT 字幕地址" /><RoomButton label="加载字幕" disabled={!subtitle.trim()} onPress={() => { try { if (!session) return; const media = nativeVideoSource({ sourceUrl: subtitle.trim() }, session.serverUrl, session.accessToken); player.configure({ subtitleUri: media.uri }); setError(''); } catch { setError('字幕地址无效或当前设备无法访问'); } }} secondary />
      <Text style={ui.text}>字幕延迟 {delay.toFixed(1)} 秒</Text><View style={ui.row}>{[-0.5, 0.5].map(change => <RoomButton key={change} label={change < 0 ? '提前 0.5 秒' : '延后 0.5 秒'} secondary onPress={() => { const next = delay + change; setDelay(next); player.configure({ subtitleDelay: next }); }} />)}</View>{error ? <Text style={ui.error}>{error}</Text> : null}
    </View> : null}
  </View>;
}
