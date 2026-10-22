import { View, Text, Pressable } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { BlurView } from 'expo-blur';
import { useAppearance } from '@/state/appearance';
import { MediaImage } from './MediaImage';
import { MusicIcon, useMusicColors } from './MusicUi';

export function MusicMiniPlayer({ song, playing, track, time, duration, compact, open, queue, control }: { song?: { name: string; artist: string; cover: string }; playing: boolean; track: string | null; time: number; duration: number; compact: boolean; open: () => void; queue: () => void; control: (action: 'prev' | 'next' | 'play' | 'pause') => void }) {
  const p = useMusicColors(); const theme = useAppearance();
  const progress = duration > 0 ? Math.min(1, Math.max(0, time / duration)) : 0;
  return <View style={{ position: 'absolute', left: 16, right: 16, bottom: compact ? 10 : 18, alignItems: 'center' }}><View testID="music-mini-player" style={{ width: '100%', maxWidth: 740, minHeight: 72, borderRadius: 18, overflow: 'hidden', backgroundColor: p.glass, borderWidth: .5, borderColor: p.line, boxShadow: p.dark ? '0 6px 24px rgba(0,0,0,.16)' : '0 6px 22px rgba(30,47,72,.1)' }}>
    {!theme.preferences.reduceMotion ? <BlurView pointerEvents="none" tint={p.dark ? 'dark' : 'light'} intensity={32} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} /> : null}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 11 }}><Pressable accessibilityRole="button" accessibilityLabel="打开完整音乐播放器" onPress={open} onAccessibilityTap={open} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 }}>{song?.cover ? <MediaImage source={{ uri: song.cover }} style={{ width: 46, height: 46, borderRadius: 9 }} /> : <View style={{ width: 46, height: 46, borderRadius: 9, backgroundColor: p.soft, justifyContent: 'center', alignItems: 'center' }}><Feather name="music" size={20} color={p.muted} /></View>}<View style={{ flex: 1, minWidth: 0, gap: 4 }}><Text numberOfLines={1} style={{ color: p.text, fontSize: 15, lineHeight: 20, fontWeight: '600' }}>{song?.name || '一起听'}</Text>{song?.artist ? <Text numberOfLines={1} style={{ color: p.muted, fontSize: 11, lineHeight: 16 }}>{song.artist}</Text> : null}</View></Pressable><View style={{ flexDirection: 'row', alignItems: 'center' }}><MusicIcon label="上一首" icon="chevron-left" disabled={!track} onPress={() => control('prev')} /><MusicIcon label={playing ? '暂停' : '播放'} icon={playing ? 'pause' : 'play'} disabled={!track} onPress={() => control(playing ? 'pause' : 'play')} /><MusicIcon label="下一首" icon="chevron-right" disabled={!track} onPress={() => control('next')} /><MusicIcon label="队列" icon="list" onPress={queue} /></View></View>
    {track && duration > 0 ? <View pointerEvents="none" style={{ position: 'absolute', left: 18, right: 18, bottom: 0, height: 2, backgroundColor: p.soft }}><View style={{ width: `${progress * 100}%`, height: 2, backgroundColor: p.accent, opacity: .7 }} /></View> : null}
  </View></View>;
}
