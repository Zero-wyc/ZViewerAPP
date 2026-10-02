import { requireOptionalNativeModule } from 'expo';
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';
import type { LibVlcPlayerViewProps, LibVlcPlayerViewRef } from 'expo-libvlc-player';
import { VlcPlayer, type VlcSnapshot } from '@/lib/vlcPlayer';
import { readPreference } from '@/lib/preferences';

// Expo Go/Web previews must report a missing kernel rather than crash during
// startup. There is deliberately no alternate playback engine in this app.
const VlcView: ComponentType<LibVlcPlayerViewProps> | null = Platform.OS === 'ios' && requireOptionalNativeModule('ExpoLibVlcPlayer')
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- native capability detection must precede package loading.
  ? require('expo-libvlc-player').LibVlcPlayerView : null;

export function useVlcVideo(silent = false) {
  const [snapshot, setSnapshot] = useState<VlcSnapshot | null>(null);
  const player = useMemo(() => new VlcPlayer(setSnapshot, !!VlcView), []);
  useEffect(() => { player.connect(); return () => player.dispose(); }, [player]);
  useEffect(() => { if (silent) { player.configure({ volume: 0 }); return; } let active = true; void readPreference('zviewer-volume', { value: 100 }).then(value => { if (active) player.configure({ volume: value.value }); }); return () => { active = false; }; }, [player, silent]);
  return { player, snapshot };
}

export function VlcVideo({ video, style, background = false }: { video: ReturnType<typeof useVlcVideo>; style: StyleProp<ViewStyle>; background?: boolean }) {
  const { player, snapshot } = video;
  if (!snapshot || !VlcView) return null;
  return <VlcSurface key={snapshot.id} player={player} snapshot={snapshot} style={style} background={background} />;
}

function VlcSurface({ player, snapshot, style, background }: { player: VlcPlayer; snapshot: VlcSnapshot; style: StyleProp<ViewStyle>; background: boolean }) {
  const ref = useRef<LibVlcPlayerViewRef | null>(null);
  useEffect(() => {
    player.attach(snapshot.id, ref.current);
    return () => player.attach(snapshot.id, null);
  }, [player, snapshot.id]);
  if (!VlcView) return null;
  return <VlcView
    ref={ref}
    style={style}
    source={snapshot.source.uri}
    options={snapshot.source.options}
    slaves={[...snapshot.source.slaves.map(slave => ({ source: slave.uri, type: 'audio' as const, selected: true })), ...(snapshot.settings.subtitleUri ? [{ source: snapshot.settings.subtitleUri, type: 'subtitle' as const, selected: true }] : [])]}
    tracks={snapshot.settings.tracks}
    volume={snapshot.settings.volume}
    delays={{ subtitle: Math.round(snapshot.settings.subtitleDelay * 1000000) }}
    autoplay={snapshot.autoplay}
    pictureInPicture={!background}
    time={Math.round(snapshot.initialTime * 1000)}
    rate={snapshot.rate}
    contentFit={background ? 'cover' : 'contain'}
    audioMixingMode="mixWithOthers"
    onFirstPlay={event => player.loaded(snapshot.id, event.media.length)}
    onTimeChanged={event => player.progress(snapshot.id, event.value)}
    onPlaying={() => player.playingChanged(snapshot.id, true)}
    onPaused={() => player.playingChanged(snapshot.id, false)}
    onStopped={() => player.playingChanged(snapshot.id, false)}
    onESAdded={event => player.tracks(snapshot.id, event)}
    onEncounteredError={() => player.fail(snapshot.id, '播放失败，请检查媒体编码、分段读取与鉴权')}
    onDialogDisplay={() => player.fail(snapshot.id, '媒体需要额外鉴权，请刷新登录或重新选择影片')}
  />;
}
