import Feather from '@expo/vector-icons/Feather';
import Slider from '@react-native-community/slider';
import { BlurView } from 'expo-blur';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { readPreference, writePreference } from '@/lib/preferences';
import { formatTime } from '@/lib/sources';
import type { TimedText } from '@/lib/timeline';
import type { VlcPlayer } from '@/lib/vlcPlayer';
import { useAppearance } from '@/state/appearance';
import { AppDialog } from './AppDialog';
import { MediaImage } from './MediaImage';
import { MusicVideo } from './MusicVideo';
import { RoomButton, ui as baseUi } from './RoomUi';

type Mode = 'sequence' | 'order' | 'repeat-one' | 'shuffle';
type Props = {
  song?: { name: string; artist: string; cover: string; songId: number };
  trackKey: string | null; expanded: boolean; pure: boolean; setPure: (value: boolean) => void;
  audio: VlcPlayer; playing: boolean; time: number; duration: number; lyrics: TimedText[]; lyricIndex: number;
  lyricError: string; retryLyrics: () => void; close: () => void; openQueue: () => void; openComments: () => void;
  control: (action: 'play' | 'pause' | 'seek' | 'prev' | 'next', value?: number) => void;
  mode: Mode; setMode: (mode: Mode) => void; host: boolean;
  quality: string; setQuality: (value: string) => void;
};
const modes: Mode[] = ['sequence', 'order', 'repeat-one', 'shuffle'];
const modeNames = ['顺序循环', '按顺序播放', '单曲循环', '随机播放'];

/** Shared mobile player: a framed playback card, tool strip and independently scrolling lyrics. */
export function ExpandedMusicPlayer(props: Props) {
  const theme = useAppearance(); const ui = theme.styles(baseUi); const insets = useSafeAreaInsets();
  const window = useWindowDimensions(); const [size, setSize] = useState({ width: window.width, height: window.height });
  const [tone, setTone] = useState<'light' | 'dark'>('light'); const [settings, setSettings] = useState(false);
  const [lyricsOpen, setLyricsOpen] = useState(true); const [mobileLyrics, setMobileLyrics] = useState(false);
  const [volume, setVolume] = useState(props.audio.mediaSettings.volume);
  const lyricScroll = useRef<ScrollView>(null); const lyricOffsets = useRef(new Map<number, number>());
  const manualUntil = useRef(0); const followTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Match the Android/Harmony portrait and short-landscape breakpoints, including portrait iPad.
  const mobile = size.width < 768 && size.height >= size.width;
  const short = size.width > size.height && size.height < 520;
  const dark = tone === 'dark'; const ink = dark ? '#ffffff' : '#1c1c1c';
  const glass = dark ? 'rgba(20,20,24,0.72)' : 'rgba(255,255,255,0.72)';
  const showLyrics = props.lyrics.length > 0 && lyricsOpen;
  const lyricOnly = mobile && mobileLyrics && showLyrics;
  const availableHeight = Math.max(120, size.height - Math.max(insets.top, short ? 36 : mobile ? 64 : 95) - Math.max(insets.bottom, short ? 20 : mobile ? 12 : 60));
  const horizontalPadding = Math.max(insets.left, short ? 16 : 45) + Math.max(insets.right, short ? 16 : 45);
  const balancedWidth = showLyrics ? Math.max(280, (size.width - horizontalPadding - 78) * .48) : 480;
  const cardWidth = mobile ? Math.min(420, size.width - 24) : Math.min(480, Math.max(280, size.height * .42), balancedWidth, size.width - horizontalPadding - 50);
  // Explicit pixel dimensions: percentage width + aspectRatio stretched the native iPad cover.
  const coverSize = Math.max(64, Math.min(cardWidth - 64, size.height * (mobile ? .36 : .38), availableHeight - (short ? 150 : mobile ? (cardWidth < 308 ? 380 : 336) : 300)));
  const followLyric = useCallback(() => {
    const offset = lyricOffsets.current.get(Math.max(0, props.lyricIndex));
    if (offset !== undefined && Date.now() >= manualUntil.current) lyricScroll.current?.scrollTo({ y: Math.max(0, offset - Math.min(260, availableHeight * .42)), animated: !theme.preferences.reduceMotion });
  }, [props.lyricIndex, availableHeight, theme.preferences.reduceMotion]);
  useEffect(() => {
    let active = true; void readPreference('zviewer-player-ui-tone', { mode: 'light' }).then(value => { if (active && (value.mode === 'light' || value.mode === 'dark')) setTone(value.mode); });
    return () => { active = false; if (followTimer.current) clearTimeout(followTimer.current); };
  }, []);
  useEffect(() => { followLyric(); }, [followLyric, props.trackKey, showLyrics, lyricOnly]);
  const changeTone = () => { const mode = dark ? 'light' : 'dark'; setTone(mode); void writePreference('zviewer-player-ui-tone', { mode }).catch(() => {}); };
  const icon = (label: string, name: React.ComponentProps<typeof Feather>['name'], action: () => void, disabled = false, selected = false) =>
    <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected }} disabled={disabled} onPress={action} style={[styles.icon, { opacity: disabled ? .35 : 1, backgroundColor: selected ? (dark ? '#ffffff25' : '#00000015') : 'transparent' }]}><Feather name={name} size={22} color={ink} /></Pressable>;
  return <View testID="expanded-music-player" onLayout={event => { const { width, height } = event.nativeEvent.layout; setSize(old => old.width === width && old.height === height ? old : { width, height }); }} style={[styles.root, { backgroundColor: theme.dark ? '#20272a' : '#e8edf3' }]}>
    {props.song?.cover ? <View pointerEvents="none" style={StyleSheet.absoluteFill}><MediaImage source={{ uri: props.song.cover }} blurRadius={40} resizeMode="cover" style={StyleSheet.absoluteFill} /><View style={[StyleSheet.absoluteFill, { backgroundColor: theme.dark ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.5)' }]} /></View> : null}
    <MusicVideo trackKey={props.trackKey} expanded={props.expanded} pure={props.pure} setPure={props.setPure} audio={props.audio} control={props.control}>{video => {
      const toolbar = <View testID="player-tool-strip" style={[styles.tools, { flexDirection: mobile ? 'row' : 'column', backgroundColor: glass, flexWrap: mobile ? 'wrap' : 'nowrap', width: mobile ? undefined : 44 }]}>
        {icon(mobile ? (lyricOnly ? '显示播放卡' : '显示歌词') : (showLyrics ? '隐藏歌词' : '显示歌词'), 'align-left', () => { if (mobile) setMobileLyrics(value => !value); else setLyricsOpen(value => !value); }, !props.lyrics.length, mobile ? lyricOnly : showLyrics)}
        {icon('追加 / 更换视频', 'video', video.openPicker, !props.trackKey)}
        {video.hasVideo ? icon('纯净视频', 'maximize', video.enterPure, !video.videoReady) : null}
        {icon(`播放模式：${modeNames[modes.indexOf(props.mode)]}`, props.mode === 'shuffle' ? 'shuffle' : 'repeat', () => props.setMode(modes[(modes.indexOf(props.mode) + 1) % modes.length]), !props.host || !props.trackKey)}
        {icon('歌曲评论', 'message-circle', props.openComments, !props.song?.songId)}
        {icon('播放队列', 'list', props.openQueue)}
        {icon('音乐设置', 'sliders', () => setSettings(true))}
        {icon('切换播放器明暗', dark ? 'sun' : 'moon', changeTone)}
      </View>;
      return <View pointerEvents={props.pure ? 'none' : 'auto'} style={[styles.foreground, { opacity: props.pure ? 0 : 1, paddingTop: Math.max(insets.top, short ? 36 : mobile ? 64 : 95), paddingBottom: Math.max(insets.bottom, short ? 20 : mobile ? 12 : 60), paddingLeft: Math.max(insets.left, mobile ? 12 : short ? 16 : 45), paddingRight: Math.max(insets.right, mobile ? 12 : short ? 16 : 45) }]}>
        <View style={{ position: 'absolute', top: Math.max(12, insets.top), right: Math.max(12, insets.right), backgroundColor: glass, borderRadius: 22 }}>{icon('收起 / 关闭', 'chevron-down', props.close)}</View>
        <View style={[styles.main, { flexDirection: mobile ? 'column' : 'row', gap: mobile ? 10 : 28 }]}>
          {!lyricOnly ? <View testID="player-card-and-tools" style={{ flexDirection: 'row', alignItems: 'center', alignSelf: mobile ? 'center' : undefined, width: cardWidth + (mobile ? 0 : 50), maxHeight: '100%' }}>
            <View testID="player-card-frame" style={{ width: cardWidth, padding: 12, paddingBottom: short ? 8 : Math.max(12, size.height * .04) }}>
              {(['tl', 'tr', 'bl', 'br'] as const).map(corner => <View key={corner} pointerEvents="none" style={[styles.corner, { backgroundColor: ink }, corner.includes('t') ? { top: 0 } : { bottom: 0 }, corner.includes('l') ? { left: 0 } : { right: 0 }]} />)}
              <View testID="player-card" style={{ overflow: 'hidden', backgroundColor: glass, padding: short ? 10 : 14, gap: short ? 4 : 8 }}>
                {!theme.preferences.reduceMotion ? <BlurView pointerEvents="none" intensity={25} tint={dark ? 'dark' : 'light'} style={[StyleSheet.absoluteFill, { zIndex: -1 }]} /> : null}
                <View style={{ alignItems: 'center', padding: short ? 0 : 6 }}><View testID="player-cover-frame" style={{ width: coverSize, height: coverSize }}>
                  {props.song?.cover ? <MediaImage testID="player-album-cover" source={{ uri: props.song.cover }} resizeMode="contain" style={{ width: coverSize, height: coverSize }} /> : <View style={[styles.emptyCover, { width: coverSize, height: coverSize }]}><Feather name="music" size={Math.min(72, coverSize / 2)} color={ink} /></View>}
                  {(['tl', 'tr', 'bl', 'br'] as const).map(corner => <View key={corner} pointerEvents="none" style={[styles.bracket, { borderColor: ink }, corner.includes('t') ? { top: -4, borderTopWidth: 2 } : { bottom: -4, borderBottomWidth: 2 }, corner.includes('l') ? { left: -4, borderLeftWidth: 2 } : { right: -4, borderRightWidth: 2 }]} />)}
                </View></View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}><View style={{ width: 5, height: 22, backgroundColor: ink }} /><Text numberOfLines={1} style={{ flex: 1, color: ink, fontWeight: '700', fontSize: short ? 15 : Math.max(15, Math.min(22, size.height * .024)) }}>{props.song?.name || '还没有歌曲'}</Text></View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 4, height: 4, backgroundColor: ink }} /><Text numberOfLines={1} style={{ flex: 1, color: ink, fontSize: 12 }}>{props.song?.artist || '在主框架搜索添加'}</Text>{short ? <View style={styles.transport}>{icon('上一首', 'chevron-left', () => props.control('prev'), !props.trackKey)}{icon(props.playing ? '暂停' : '播放', props.playing ? 'pause' : 'play', () => props.control(props.playing ? 'pause' : 'play'), !props.trackKey)}{icon('下一首', 'chevron-right', () => props.control('next'), !props.trackKey)}</View> : null}</View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: ink, fontSize: 11 }}>{formatTime(props.time)}</Text><Text style={{ color: ink, fontSize: 11 }}>{formatTime(props.duration)}</Text></View>
                <Slider accessibilityLabel="音乐进度" style={{ height: 20, marginHorizontal: -4 }} minimumValue={0} maximumValue={Math.max(1, props.duration)} value={Math.min(props.time, Math.max(1, props.duration))} disabled={props.duration <= 0} onSlidingComplete={value => props.control('seek', value)} minimumTrackTintColor={ink} maximumTrackTintColor={dark ? '#ffffff35' : '#00000025'} thumbTintColor={ink} />
                {!short ? <><View style={styles.transport}>{icon('上一首', 'chevron-left', () => props.control('prev'), !props.trackKey)}{icon(props.playing ? '暂停' : '播放', props.playing ? 'pause' : 'play', () => props.control(props.playing ? 'pause' : 'play'), !props.trackKey)}{icon('下一首', 'chevron-right', () => props.control('next'), !props.trackKey)}</View><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={{ color: ink, fontSize: 9 }}>VOLUME</Text><Slider accessibilityLabel="音乐音量" style={{ flex: 1, height: 24 }} minimumValue={0} maximumValue={100} value={volume} onValueChange={value => { setVolume(value); props.audio.configure({ volume: value }); }} onSlidingComplete={value => void writePreference('zviewer-volume', { value }).catch(() => {})} minimumTrackTintColor={ink} maximumTrackTintColor={dark ? '#ffffff35' : '#00000025'} thumbTintColor={ink} /><Text style={{ color: ink, fontSize: 9 }}>{Math.round(volume)}%</Text></View></> : null}
              </View>
            </View>
            {!mobile ? <ScrollView style={{ width: 50, flexGrow: 0, maxHeight: availableHeight }} contentContainerStyle={{ alignItems: 'center' }}>{toolbar}</ScrollView> : null}
          </View> : null}
          {mobile ? toolbar : null}
          {showLyrics && (!mobile || lyricOnly) ? <View testID="player-lyrics-panel" style={[styles.lyrics, { backgroundColor: glass }]}><ScrollView ref={lyricScroll} onScrollBeginDrag={() => { manualUntil.current = Date.now() + 60_000; }} onScrollEndDrag={() => { manualUntil.current = Date.now() + 1200; if (followTimer.current) clearTimeout(followTimer.current); followTimer.current = setTimeout(followLyric, 1300); }} contentContainerStyle={{ paddingVertical: short ? 40 : 100, paddingHorizontal: 16, gap: 10 }}>
            {props.lyrics.map((line, index) => <Pressable key={`${props.trackKey}:${line.time}:${index}`} accessibilityRole="button" accessibilityLabel={`跳转歌词：${line.content}`} onLayout={event => { lyricOffsets.current.set(index, event.nativeEvent.layout.y); if (index === Math.max(0, props.lyricIndex)) followLyric(); }} onPress={() => props.control('seek', line.time)} style={{ paddingVertical: 10, paddingHorizontal: 12, backgroundColor: index === props.lyricIndex ? ink : 'transparent' }}><Text style={{ color: index === props.lyricIndex ? (dark ? '#141418' : '#ffffff') : ink, fontSize: short ? 16 : 20, fontWeight: '600' }}>{line.content}</Text></Pressable>)}
          </ScrollView></View> : null}
        </View>
        {props.lyricError || video.error ? <View style={{ backgroundColor: glass, padding: 8 }}><Text style={{ color: ink }}>{props.lyricError || video.error}</Text>{props.lyricError ? <Pressable accessibilityRole="button" onPress={props.retryLyrics}><Text style={{ color: ink, padding: 8 }}>重试歌词</Text></Pressable> : null}</View> : null}
      </View>;
    }}</MusicVideo>
    <AppDialog visible={settings} title="音乐设置" close={() => setSettings(false)}><Text style={ui.title}>播放模式</Text><View style={ui.row}>{modes.map((mode, index) => <RoomButton key={mode} label={modeNames[index]} secondary disabled={!props.host || props.mode === mode} onPress={() => props.setMode(mode)} />)}</View><Text style={ui.title}>网易云音质</Text><View style={ui.row}>{['lossless', 'exhigh', 'higher', 'standard'].map((quality, index) => <RoomButton key={quality} label={['无损优先', '极高', '较高', '标准'][index]} secondary disabled={props.quality === quality} onPress={() => props.setQuality(quality)} />)}</View><Text style={ui.muted}>服务器按账号权限回退音质</Text><RoomButton label={dark ? '播放器：深色' : '播放器：浅色'} secondary onPress={changeTone} /></AppDialog>
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' },
  foreground: { flex: 1, minHeight: 0, gap: 8 },
  main: { flex: 1, minHeight: 0, minWidth: 0, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  tools: { alignItems: 'center', justifyContent: 'center', borderRadius: 4, flexShrink: 0 },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  corner: { position: 'absolute', width: 8, height: 8 },
  bracket: { position: 'absolute', width: 12, height: 12 },
  emptyCover: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#80808020' },
  lyrics: { flex: 1, alignSelf: 'stretch', minHeight: 0, minWidth: 0, overflow: 'hidden', borderRadius: 4 },
});
