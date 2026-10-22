import Feather from '@expo/vector-icons/Feather';
import Slider from '@react-native-community/slider';
import { BlurView } from 'expo-blur';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { readPreference, writePreference } from '@/lib/preferences';
import { formatTime } from '@/lib/sources';
import type { MusicLyric } from '@/lib/musicLyrics';
import type { VlcPlayer } from '@/lib/vlcPlayer';
import { useAppearance } from '@/state/appearance';
import { AppDialog } from './AppDialog';
import { MediaImage } from './MediaImage';
import { MusicVideo } from './MusicVideo';
import { MusicModeIcon } from './MusicModeIcon';
import { MusicSeekSlider } from './MusicSeekSlider';
import { ui as baseUi } from './RoomUi';
import { MusicOption, MusicSection } from './MusicUi';

type Mode = 'sequence' | 'order' | 'repeat-one' | 'shuffle';
type Props = {
  song?: { name: string; artist: string; cover: string; songId: number };
  trackKey: string | null; expanded: boolean; pure: boolean; setPure: (value: boolean) => void;
  audio: VlcPlayer; playing: boolean; time: number; duration: number; lyrics: MusicLyric[]; lyricIndex: number;
  lyricError: string; retryLyrics: () => void; close: () => void; openQueue: () => void; openComments: () => void;
  control: (action: 'play' | 'pause' | 'seek' | 'prev' | 'next', value?: number) => void;
  mode: Mode; setMode: (mode: Mode) => void; host: boolean; queueOpen?: boolean; commentBadge?: string;
  quality: string; setQuality: (value: string) => void;
};
const modes: Mode[] = ['sequence', 'order', 'repeat-one', 'shuffle'];
const modeNames = ['顺序循环', '按顺序播放', '单曲循环', '随机播放'];

/** Music playback surface; transport stays visible while secondary tools share one sheet. */
export function ExpandedMusicPlayer(props: Props) {
  const theme = useAppearance(); const ui = theme.styles(baseUi); const insets = useSafeAreaInsets();
  const window = useWindowDimensions(); const [size, setSize] = useState({ width: window.width, height: window.height });
  const [tone, setTone] = useState<'light' | 'dark'>('light'); const [settings, setSettings] = useState(false); const [more, setMore] = useState(false);
  const [lyricsOpen, setLyricsOpen] = useState(true); const [mobileLyrics, setMobileLyrics] = useState(false);
  const [roman, setRoman] = useState(true); const [translated, setTranslated] = useState(true); const [openError, setOpenError] = useState('');
  const [volume, setVolume] = useState(props.audio.mediaSettings.volume);
  const lyricScroll = useRef<ScrollView>(null); const lyricOffsets = useRef(new Map<number, number>());
  const manualUntil = useRef(0); const followTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Match the Android/Harmony portrait and short-landscape breakpoints, including portrait iPad.
  const mobile = size.width < 768 && size.height >= size.width;
  const short = size.width > size.height && size.height < 520;
  const compactCard = short || (mobile && size.height < 740);
  const dark = tone === 'dark'; const ink = dark ? '#ffffff' : '#1c1c1c';
  const glass = dark ? 'rgba(24,28,35,.88)' : 'rgba(255,255,255,.86)';
  const showLyrics = props.lyrics.length > 0 && lyricsOpen;
  const hasRoman = props.lyrics.some(line => !!line.roman?.trim()); const hasTranslation = props.lyrics.some(line => !!line.translation?.trim());
  const originalBvid = props.trackKey?.startsWith('bili:') ? props.trackKey.split(':')[1] : '';
  const lyricOnly = mobile && mobileLyrics && showLyrics;
  const availableHeight = Math.max(120, size.height - Math.max(insets.top, short ? 36 : mobile ? 64 : 95) - Math.max(insets.bottom, short ? 20 : mobile ? 12 : 60));
  const horizontalPadding = Math.max(insets.left, short ? 16 : 45) + Math.max(insets.right, short ? 16 : 45);
  const balancedWidth = showLyrics ? Math.max(280, (size.width - horizontalPadding - 78) * .48) : 480;
  const cardWidth = mobile ? Math.min(420, size.width - 40) : Math.min(480, Math.max(280, size.height * .42), balancedWidth, size.width - horizontalPadding - 50);
  // Explicit pixel dimensions: percentage width + aspectRatio stretched the native iPad cover.
  const coverSize = Math.max(64, Math.min(cardWidth - 48, size.height * (mobile ? .36 : .38), availableHeight - (short ? 260 : mobile ? compactCard ? 430 : 490 : 300)));
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
  const icon = (label: string, name: React.ComponentProps<typeof Feather>['name'], action: () => void, disabled = false, selected = false, prominent = false) =>
    <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected }} disabled={disabled} onPress={action} onAccessibilityTap={() => { if (!disabled) action(); }} style={[styles.icon, { opacity: disabled ? .35 : 1, width: prominent ? short ? 44 : compactCard ? 48 : 56 : 44, height: prominent ? short ? 44 : compactCard ? 48 : 56 : 44, borderRadius: prominent ? short ? 22 : compactCard ? 24 : 28 : 22, backgroundColor: prominent ? ink : selected ? (dark ? '#ffffff18' : '#0000000a') : 'transparent' }]}>{label.startsWith('播放模式：') ? <MusicModeIcon mode={props.mode} color={ink} /> : <Feather name={name} size={prominent && !short ? 27 : 21} color={prominent ? dark ? '#17212e' : '#fff' : ink} />}{label === '歌曲评论' && props.commentBadge ? <View style={{ position: 'absolute', right: -1, top: 0, minWidth: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: ink }}><Text style={{ color: dark ? '#141418' : '#fff', fontSize: 10, lineHeight: 18, textAlign: 'center', fontWeight: '700' }}>{props.commentBadge}</Text></View> : null}</Pressable>;
  return <View testID="expanded-music-player" onLayout={event => { const { width, height } = event.nativeEvent.layout; setSize(old => old.width === width && old.height === height ? old : { width, height }); }} style={[styles.root, { backgroundColor: dark ? '#161e29' : '#e8edf3' }]}>
    {props.song?.cover ? <View pointerEvents="none" style={StyleSheet.absoluteFill}><MediaImage source={{ uri: props.song.cover }} blurRadius={40} resizeMode="cover" style={StyleSheet.absoluteFill} /><View style={[StyleSheet.absoluteFill, { backgroundColor: dark ? 'rgba(10,18,30,.72)' : 'rgba(243,247,252,.78)' }]} /></View> : null}
    <MusicVideo trackKey={props.trackKey} expanded={props.expanded} pure={props.pure} setPure={props.setPure} audio={props.audio} control={props.control}>{video => {
      const toolbar = <View testID="player-tool-strip" style={[styles.tools, { flexDirection: mobile ? 'row' : 'column', backgroundColor: glass, width: mobile ? undefined : 52, borderColor: dark ? '#ffffff12' : '#ffffffa0' }]}>
        {icon(mobile ? (lyricOnly ? '显示播放卡' : '显示歌词') : (showLyrics ? '隐藏歌词' : '显示歌词'), 'align-left', () => { if (mobile) setMobileLyrics(value => !value); else setLyricsOpen(value => !value); }, !props.lyrics.length, mobile ? lyricOnly : showLyrics)}
        {video.hasVideo ? icon('纯净视频', 'maximize', video.enterPure, !video.videoReady) : null}
        {props.host ? icon(`播放模式：${modeNames[modes.indexOf(props.mode)]}`, props.mode === 'shuffle' ? 'shuffle' : props.mode === 'order' ? 'arrow-right' : props.mode === 'repeat-one' ? 'rotate-cw' : 'repeat', () => props.setMode(modes[(modes.indexOf(props.mode) + 1) % modes.length]), !props.trackKey) : null}
        {icon('歌曲评论', 'message-circle', props.openComments, !props.song?.songId && !originalBvid)}
        {icon('播放队列', 'list', props.openQueue, false, !!props.queueOpen)}
        {icon('更多播放选项', 'more-horizontal', () => setMore(true))}
      </View>;
      const openOriginal = () => { setMore(false); void Linking.openURL(`https://www.bilibili.com/video/${originalBvid}?t=${Math.max(0, Math.floor(props.audio.currentTime))}`).catch(() => setOpenError('打开 B站原视频失败，请稍后重试')); };
      return <View pointerEvents={props.pure ? 'none' : 'auto'} style={[styles.foreground, { opacity: props.pure ? 0 : 1, paddingTop: Math.max(insets.top, short ? 36 : mobile ? 64 : 95), paddingBottom: Math.max(insets.bottom, short ? 20 : mobile ? 12 : 60), paddingLeft: Math.max(insets.left, mobile ? 20 : short ? 16 : 45), paddingRight: Math.max(insets.right, mobile ? 20 : short ? 16 : 45) }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="收起 / 关闭" onPress={props.close} onAccessibilityTap={props.close} style={{ position: 'absolute', top: Math.max(12, insets.top), right: Math.max(12, insets.right), width: 44, height: 44, backgroundColor: 'rgba(255,255,255,.94)', borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}><Feather name="chevron-down" size={23} color="#182024" /></Pressable>
        <View style={[styles.main, { flexDirection: mobile ? 'column' : 'row', gap: mobile ? 10 : 28 }]}>
          {!lyricOnly ? <View testID="player-card-and-tools" style={{ flexDirection: 'row', alignItems: 'center', alignSelf: mobile ? 'center' : undefined, width: cardWidth + (mobile ? 0 : 68), maxHeight: '100%' }}>
            <View testID="player-card-frame" style={{ width: cardWidth }}>
              <View testID="player-card" style={{ overflow: 'hidden', borderRadius: 22, borderWidth: .5, borderColor: dark ? '#ffffff14' : '#ffffffb0', backgroundColor: glass, padding: short ? 14 : compactCard ? 16 : 24, gap: short ? 4 : compactCard ? 6 : 12, boxShadow: dark ? '0 12px 32px rgba(0,0,0,.15)' : '0 12px 32px rgba(39,55,79,.08)' }}>
                {!theme.preferences.reduceMotion ? <BlurView pointerEvents="none" intensity={25} tint={dark ? 'dark' : 'light'} style={[StyleSheet.absoluteFill, { zIndex: -1 }]} /> : null}
                <View style={{ alignItems: 'center', paddingBottom: short ? 0 : compactCard ? 6 : 10 }}><View testID="player-cover-frame" style={{ width: coverSize, height: coverSize, borderRadius: 13, overflow: 'hidden' }}>
                  {props.song?.cover ? <MediaImage testID="player-album-cover" source={{ uri: props.song.cover }} resizeMode="cover" style={{ width: coverSize, height: coverSize }} /> : <View style={[styles.emptyCover, { width: coverSize, height: coverSize }]}><Feather name="music" size={Math.min(72, coverSize / 2)} color={ink} /></View>}
                </View></View>
                <View style={{ gap: 6 }}><Text numberOfLines={2} style={{ color: ink, fontWeight: '600', fontSize: short ? 15 : compactCard ? 18 : 21, lineHeight: short ? 20 : compactCard ? 24 : 28 }}>{props.song?.name || '还没有歌曲'}</Text><Text numberOfLines={1} style={{ color: ink, opacity: .56, fontSize: 13, lineHeight: 18 }}>{props.song?.artist || '搜索并添加喜欢的音乐'}</Text></View>
                {short ? <View style={styles.transport}>{icon('上一首', 'chevron-left', () => props.control('prev'), !props.trackKey)}{icon(props.playing ? '暂停' : '播放', props.playing ? 'pause' : 'play', () => props.control(props.playing ? 'pause' : 'play'), !props.trackKey, false, true)}{icon('下一首', 'chevron-right', () => props.control('next'), !props.trackKey)}</View> : null}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: ink, opacity: .5, fontSize: 11, fontVariant: ['tabular-nums'] }}>{formatTime(props.time)}</Text><Text style={{ color: ink, opacity: .5, fontSize: 11, fontVariant: ['tabular-nums'] }}>{formatTime(props.duration)}</Text></View>
                <MusicSeekSlider key={props.trackKey} accessibilityLabel="音乐进度" style={{ height: 24, marginHorizontal: -4, marginTop: -10 }} minimumValue={0} maximumValue={Math.max(1, props.duration)} value={Math.min(props.time, Math.max(1, props.duration))} disabled={props.duration <= 0} onSlidingComplete={value => props.control('seek', value)} minimumTrackTintColor={ink} maximumTrackTintColor={dark ? '#ffffff35' : '#00000025'} thumbTintColor={ink} />
                {!short ? <><View style={styles.transport}>{icon('上一首', 'chevron-left', () => props.control('prev'), !props.trackKey)}{icon(props.playing ? '暂停' : '播放', props.playing ? 'pause' : 'play', () => props.control(props.playing ? 'pause' : 'play'), !props.trackKey, false, true)}{icon('下一首', 'chevron-right', () => props.control('next'), !props.trackKey)}</View><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Feather name="volume-1" color={ink} size={15} style={{ opacity: .5 }} /><Slider accessibilityLabel="音乐音量" style={{ flex: 1, height: 24 }} minimumValue={0} maximumValue={100} value={volume} onValueChange={value => { setVolume(value); props.audio.configure({ volume: value }); }} onSlidingComplete={value => void writePreference('zviewer-volume', { value }).catch(() => {})} minimumTrackTintColor={ink} maximumTrackTintColor={dark ? '#ffffff35' : '#00000025'} thumbTintColor={ink} /><Feather name="volume-2" color={ink} size={17} style={{ opacity: .5 }} /></View></> : null}
              </View>
            </View>
            {!mobile ? <ScrollView style={{ width: 68, flexGrow: 0, maxHeight: availableHeight }} contentContainerStyle={{ alignItems: 'flex-end' }}>{toolbar}</ScrollView> : null}
          </View> : null}
          {showLyrics && (!mobile || lyricOnly) ? <View testID="player-lyrics-panel" style={[styles.lyrics, { backgroundColor: glass }]}><ScrollView ref={lyricScroll} onScrollBeginDrag={() => { manualUntil.current = Date.now() + 60_000; }} onScrollEndDrag={() => { manualUntil.current = Date.now() + 1200; if (followTimer.current) clearTimeout(followTimer.current); followTimer.current = setTimeout(followLyric, 1300); }} contentContainerStyle={{ paddingVertical: short ? 40 : 100, paddingHorizontal: 16, gap: 10 }}>
            {props.lyrics.map((line, index) => <Pressable key={`${props.trackKey}:${line.time}:${index}`} accessibilityRole="button" accessibilityLabel={`跳转歌词：${line.content}`} onLayout={event => { lyricOffsets.current.set(index, event.nativeEvent.layout.y); if (index === Math.max(0, props.lyricIndex)) followLyric(); }} onPress={() => props.control('seek', line.time)} style={{ paddingVertical: 10, paddingHorizontal: 12, gap: 5, borderRadius: 14, backgroundColor: index === props.lyricIndex ? (dark ? '#ffffff0e' : '#ffffff65') : 'transparent' }}><Text style={{ color: ink, opacity: index === props.lyricIndex ? 1 : .42, fontSize: short ? 16 : 22, lineHeight: short ? 23 : 32, fontWeight: '600' }}>{line.content}</Text>{roman && line.roman ? <Text style={{ color: ink, opacity: index === props.lyricIndex ? .7 : .36, fontSize: 13 }}>{line.roman}</Text> : null}{translated && line.translation ? <Text style={{ color: ink, opacity: index === props.lyricIndex ? .7 : .36, fontSize: 14 }}>{line.translation}</Text> : null}</Pressable>)}
          </ScrollView></View> : null}
        </View>
        {mobile ? <View style={{ alignItems: 'center', paddingTop: 14 }}>{toolbar}</View> : null}
        <AppDialog visible={more} title="播放选项" close={() => setMore(false)}>
          {hasRoman || hasTranslation ? <><MusicSection label="LYRICS" />{hasRoman ? <MusicOption label={roman ? '隐藏罗马音' : '显示罗马音'} selected={roman} onPress={() => setRoman(value => !value)} /> : null}{hasTranslation ? <MusicOption label={translated ? '隐藏翻译' : '显示翻译'} selected={translated} onPress={() => setTranslated(value => !value)} /> : null}</> : null}
          {props.trackKey ? <MusicOption label="追加 / 更换视频" onPress={() => { setMore(false); video.openPicker(); }} /> : null}
          {/^BV[0-9A-Za-z]{10}$/.test(originalBvid) ? <MusicOption label="在哔哩哔哩打开原视频" onPress={openOriginal} /> : null}
          <MusicOption label="音乐设置" onPress={() => { setMore(false); setSettings(true); }} />
          <MusicOption label="切换播放器明暗" value={dark ? '深色' : '浅色'} onPress={changeTone} />
        </AppDialog>
        {props.lyricError || video.error ? <View style={{ backgroundColor: glass, padding: 8 }}><Text style={{ color: ink }}>{props.lyricError || video.error}</Text>{props.lyricError ? <Pressable accessibilityRole="button" onPress={props.retryLyrics}><Text style={{ color: ink, padding: 8 }}>重试歌词</Text></Pressable> : null}</View> : null}
        {openError ? <Text style={{ color: ink }}>{openError}</Text> : null}
      </View>;
    }}</MusicVideo>
    <AppDialog visible={settings} title="音乐设置" close={() => setSettings(false)}><MusicSection label="PLAYBACK" />{modes.map((mode, index) => <MusicOption key={mode} label={modeNames[index]} selected={props.mode === mode} disabled={!props.host} onPress={() => props.setMode(mode)} />)}<MusicSection label="AUDIO QUALITY" />{['lossless', 'exhigh', 'higher', 'standard'].map((quality, index) => <MusicOption key={quality} label={['无损优先', '极高', '较高', '标准'][index]} selected={props.quality === quality} onPress={() => props.setQuality(quality)} />)}<Text style={ui.muted}>服务器按账号权限回退音质</Text></AppDialog>
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' },
  foreground: { flex: 1, minHeight: 0, gap: 8 },
  main: { flex: 1, minHeight: 0, minWidth: 0, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  tools: { alignItems: 'center', justifyContent: 'center', borderRadius: 18, borderWidth: .5, padding: 4, flexShrink: 0 },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, paddingVertical: 2 },
  emptyCover: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#80808020' },
  lyrics: { flex: 1, alignSelf: 'stretch', minHeight: 0, minWidth: 0, overflow: 'hidden', borderRadius: 22 },
});
