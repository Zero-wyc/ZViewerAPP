import { requireOptionalNativeModule } from 'expo';
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';
import { isDevice } from 'expo-device';
import type { LibVlcPlayerViewProps, LibVlcPlayerViewRef } from 'expo-libvlc-player';
import { VlcPlayer, vlcEventRevision, type VlcSnapshot } from '@/lib/vlcPlayer';
import { readPreference } from '@/lib/preferences';
import { connectionUrl } from '@/lib/connectionTransport';

// Expo Go/Web previews must report a missing kernel rather than crash during
// startup. There is deliberately no alternate playback engine in this app.
const VlcView: ComponentType<LibVlcPlayerViewProps & { backgroundAudio?: boolean }> | null = Platform.OS === 'ios' && requireOptionalNativeModule('ExpoLibVlcPlayer')
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- native capability detection must precede package loading.
  ? require('expo-libvlc-player').LibVlcPlayerView : null;

export function useVlcVideo(silent = false, persistent = false) {
  const [snapshot, setSnapshot] = useState<VlcSnapshot | null>(null);
  const player = useMemo(() => new VlcPlayer(setSnapshot, !!VlcView, persistent), [persistent]);
  useEffect(() => { player.connect(); return () => player.dispose(); }, [player]);
  useEffect(() => { if (silent) { player.configure({ volume: 0 }); return; } let active = true; void readPreference('zviewer-volume', { value: 100 }).then(value => { if (active) player.configure({ volume: value.value }); }); return () => { active = false; }; }, [player, silent]);
  return { player, snapshot };
}

export function VlcVideo({ video, style, background = false, backgroundAudio = false }: { video: ReturnType<typeof useVlcVideo>; style: StyleProp<ViewStyle>; background?: boolean; backgroundAudio?: boolean }) {
  const { player, snapshot } = video;
  if (!snapshot || !VlcView) return null;
  return <VlcSurface key={backgroundAudio ? 'music' : snapshot.id} player={player} snapshot={snapshot} style={style} background={background} backgroundAudio={backgroundAudio} />;
}

function VlcSurface({ player, snapshot, style, background, backgroundAudio }: { player: VlcPlayer; snapshot: VlcSnapshot; style: StyleProp<ViewStyle>; background: boolean; backgroundAudio: boolean }) {
  const ref = useRef<LibVlcPlayerViewRef | null>(null);
  // Native options changes recreate VLC. Keep this array stable across clock,
  // seek and autoplay renders; Simulator VideoToolbox can produce blank frames.
  const options = useMemo(() => __DEV__ && !isDevice ? [...snapshot.source.options, 'codec=avcodec', 'avcodec-threads=1'] : snapshot.source.options, [snapshot.source.options]);
  useEffect(() => {
    player.attach(snapshot.id, ref.current as LibVlcPlayerViewRef & { replaceSource?(uri: string, options: string[], revision: number): Promise<void> }, true);
    return () => player.attach(snapshot.id, null);
  }, [player, snapshot.id]);
  if (!VlcView) return null;
  return <VlcView
    ref={ref}
    style={style}
    {...({ zviewerOwnerId: player.nativeOwnerId, zviewerRevision: snapshot.id, zviewerBackgroundDecoration: background, zviewerPreciseVideoSeek: !backgroundAudio && snapshot.source.contentType === 'hls' } as object)}
    source={connectionUrl(snapshot.source.uri)}
    options={options}
    slaves={[...snapshot.source.slaves.map(slave => ({ source: connectionUrl(slave.uri), type: 'audio' as const, selected: true })), ...(snapshot.settings.subtitleUri ? [{ source: connectionUrl(snapshot.settings.subtitleUri), type: 'subtitle' as const, selected: true }] : [])]}
    tracks={snapshot.settings.tracks}
    volume={snapshot.settings.volume}
    delays={{ subtitle: Math.round(snapshot.settings.subtitleDelay * 1000000) }}
    autoplay={snapshot.autoplay}
    pictureInPicture={isDevice && !background && !backgroundAudio}
    backgroundAudio={backgroundAudio}
    rate={snapshot.rate}
    contentFit={background ? 'cover' : 'contain'}
    audioMixingMode={background ? 'mixWithOthers' : 'doNotMix'}
    onFirstPlay={event => { const revision = vlcEventRevision(event, snapshot.id); player.videoSize(revision, event.video.width, event.video.height); player.loaded(revision, event.media.length); }}
    onTimeChanged={event => { const revision = vlcEventRevision(event, snapshot.id); const size = event as typeof event & { width?: number; height?: number; length?: number }; player.videoSize(revision, size.width || 0, size.height || 0); player.durationChanged(revision, size.length || 0); player.progress(revision, event.value); }}
    onPlaying={(event?: unknown) => player.playingChanged(vlcEventRevision(event, snapshot.id), true)}
    onPaused={(event?: unknown) => player.playingChanged(vlcEventRevision(event, snapshot.id), false)}
    onStopped={(event?: unknown) => player.stopped(vlcEventRevision(event, snapshot.id))}
    onESAdded={event => player.tracks(snapshot.id, event)}
    onEncounteredError={() => player.fail(snapshot.id, '播放失败，请检查媒体编码、分段读取与鉴权')}
    onDialogDisplay={() => player.fail(snapshot.id, '媒体需要额外鉴权，请刷新登录或重新选择影片')}
  />;
}
