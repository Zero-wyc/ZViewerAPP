import Feather from '@expo/vector-icons/Feather';
import Slider from '@react-native-community/slider';
import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
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
import { menuAnchorInPortal, playbackMenuPlacement, type MenuRect } from '@/lib/playbackMenu';

type Props = { nextEnabled: boolean; nextBusy: boolean; next: () => void; sync: () => void; roomId: string; subtitles: ReturnType<typeof useSubtitles>; danmaku: ReturnType<typeof useDanmaku>; player: VlcPlayer; host: boolean; control: (action: 'play' | 'pause' | 'seek' | 'rate', value?: number) => void; fullscreen: boolean; toggleFullscreen: () => void; refresh: () => void; orientation: ScreenOrientationControl; hide: () => void; interact: (active: boolean) => void };
function ControlIcon({ label, name, onPress, disabled = false, selected = false }: { label: string; name: ComponentProps<typeof Feather>['name']; onPress: () => void; disabled?: boolean; selected?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected }} disabled={disabled} onAccessibilityTap={() => { if (!disabled) onPress(); }} onPress={onPress} style={[styles.icon, selected && styles.selected, disabled && { opacity: .4 }]}><Feather name={name} color="#f3f7fa" size={22} /></Pressable>;
}
export function PlaybackControls({ nextEnabled, nextBusy, next, sync, player, host, control, fullscreen, toggleFullscreen, subtitles, danmaku, roomId, refresh, orientation, hide, interact }: Props) {
  const theme = useAppearance(); const { socket, connected } = useSession(); const insets = useSafeAreaInsets();
  const [time, setTime] = useState(player.currentTime); const [duration, setDuration] = useState(player.duration); const [playing, setPlaying] = useState(player.playing);
  const [settings, setSettings] = useState(false); const [quick, setQuick] = useState<'rate' | 'volume' | null>(null); const [trackVersion, setTrackVersion] = useState(0);
  const [rate, setRate] = useState(player.playbackRate); const [volume, setVolume] = useState(player.mediaSettings.volume);
  const [rowWidth, setRowWidth] = useState(0);
  const [width, setWidth] = useState(0); const [draft, setDraft] = useState(''); const [sending, setSending] = useState(false); const [error, setError] = useState('');
  const [more, setMore] = useState(false); const [composerOpen, setComposerOpen] = useState(false);
  const moreButton = useRef<View | null>(null); const menuPortal = useRef<View | null>(null);
  const moreOpen = useRef(false); const measurement = useRef(0);
  const [menuGeometry, setMenuGeometry] = useState<{ anchor: MenuRect; portal: MenuRect } | null>(null);
  const [menuContentHeight, setMenuContentHeight] = useState(0); const [keyboardTop, setKeyboardTop] = useState<number | null>(null);
  const window = useWindowDimensions();
  const cancelMeasurement = useCallback(() => { moreOpen.current = false; measurement.current++; }, []);
  const closeMore = useCallback(() => { cancelMeasurement(); setMore(false); setMenuGeometry(null); }, [cancelMeasurement]);
  const measureMenu = useCallback(() => {
    if (!moreOpen.current || !moreButton.current || !menuPortal.current) return;
    const version = ++measurement.current;
    moreButton.current.measureInWindow((x, y, width, height) => {
      menuPortal.current?.measureInWindow((px, py, pw, ph) => {
        if (!moreOpen.current || version !== measurement.current || width <= 0 || height <= 0 || pw <= 0 || ph <= 0) return;
        const portal = { x: px, y: py, width: pw, height: ph };
        setMenuGeometry({ anchor: menuAnchorInPortal({ x, y, width, height }, portal), portal });
      });
    });
  }, []);
  const toggleMore = () => {
    if (moreOpen.current) { closeMore(); return; }
    moreOpen.current = true; setMenuGeometry(null); setMenuContentHeight(0); setMore(true);
  };
  useEffect(() => { if (more) measureMenu(); }, [more, window.width, window.height, window.fontScale, insets.top, insets.bottom, insets.left, insets.right, composerOpen, width, rowWidth, measureMenu]);
  useEffect(() => {
    const changed = Keyboard.addListener('keyboardDidChangeFrame', event => { setKeyboardTop(event.endCoordinates.screenY); measureMenu(); });
    const hidden = Keyboard.addListener('keyboardDidHide', () => { setKeyboardTop(null); measureMenu(); });
    return () => { changed.remove(); hidden.remove(); cancelMeasurement(); };
  }, [measureMenu, cancelMeasurement]);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [focused, setFocused] = useState(false); const [sliding, setSliding] = useState(false);
  const wide = width >= 700;
  // Measure the content row after border, padding and safe-area deductions.
  // Keep 44pt targets; low-frequency controls remain in the existing menu.
  const inlineVolume = rowWidth >= 6 * 44;
  const inlineSettings = rowWidth >= 7 * 44;
  const inlineOrientation = fullscreen && rowWidth >= 8 * 44;
  const openVolume = () => { setQuick('volume'); closeMore(); };
  const openSettings = () => { setSettings(true); closeMore(); };
  const portalHeight = menuGeometry ? Math.min(menuGeometry.portal.height, keyboardTop === null ? menuGeometry.portal.height : Math.max(0, keyboardTop - menuGeometry.portal.y)) : window.height;
  const placement = playbackMenuPlacement(menuGeometry?.anchor ?? { x: 0, y: 0, width: 44, height: 44 }, { width: menuGeometry?.portal.width ?? window.width, height: portalHeight }, { ...insets, bottom: keyboardTop === null ? insets.bottom : 0 }, menuContentHeight);
  useEffect(() => { interact(more || settings || !!quick || focused || sliding || orientation.busy); return () => interact(false); }, [more, settings, quick, focused, sliding, orientation.busy, interact]);
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
  const composer = <View style={styles.composer}><ControlIcon label={danmaku.preferences.enabled ? '关闭弹幕' : '开启弹幕'} name="message-square" onPress={() => danmaku.change({ enabled: !danmaku.preferences.enabled })} selected={danmaku.preferences.enabled} /><TextInput accessibilityLabel="发送弹幕" placeholder="发个友善的弹幕" placeholderTextColor="#bbc6d1" style={styles.input} value={draft} onChangeText={setDraft} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} maxLength={300} returnKeyType="send" onSubmitEditing={() => void send()} /><ControlIcon label="发送弹幕" name="send" onPress={() => void send()} disabled={sending || !connected || !draft.trim()} /></View>;
  return <View testID="watch-control-bar" onLayout={event => { setWidth(event.nativeEvent.layout.width); measureMenu(); }} style={[styles.root, { paddingLeft: fullscreen ? Math.max(8, insets.left) : 8, paddingRight: fullscreen ? Math.max(8, insets.right) : 8, paddingBottom: fullscreen ? Math.max(6, insets.bottom) : 6 }]}>
      <Slider accessibilityLabel="播放进度" style={{ height: 28, marginHorizontal: -2 }} minimumValue={0} maximumValue={Math.max(1, duration)} tapToSeek value={dragStart ?? Math.min(time, Math.max(1, duration))} disabled={duration <= 0} minimumTrackTintColor="#1463b6" maximumTrackTintColor="#ffffff40" thumbTintColor="#9cdbff" onSlidingStart={value => { setDragStart(value); setSliding(true); }} onSlidingComplete={value => { control('seek', value); setDragStart(null); setSliding(false); }} />
      <Text style={[styles.time, { paddingHorizontal: 8 }]}>{formatTime(time)} / {formatTime(duration)}</Text>
      {composerOpen || wide ? composer : null}
      <View testID="watch-control-actions" onLayout={event => setRowWidth(event.nativeEvent.layout.width)} style={styles.row}><ControlIcon label={playing ? (host ? '暂停' : '申请暂停') : (host ? '播放' : '申请继续播放')} name={playing ? 'pause' : 'play'} onPress={() => control(playing ? 'pause' : 'play')} />
        <ControlIcon label={nextBusy ? '正在切换下一部' : '下一个影片'} name="skip-forward" onPress={next} disabled={!nextEnabled || nextBusy} />
        <ControlIcon label={danmaku.preferences.enabled ? '关闭弹幕' : '开启弹幕'} name="message-square" onPress={() => danmaku.change({ enabled: !danmaku.preferences.enabled })} selected={danmaku.preferences.enabled} />
        {inlineVolume ? <ControlIcon label="本机音量" name={volume <= 0 ? 'volume-x' : 'volume-2'} onPress={openVolume} /> : null}
        {inlineSettings ? <ControlIcon label="播放设置" name="settings" onPress={openSettings} /> : null}
        <View ref={moreButton} collapsable={false} onLayout={measureMenu}><ControlIcon label="更多播放操作" name="more-horizontal" onPress={toggleMore} /></View>
        {inlineOrientation ? <ScreenOrientationButton state={orientation} color="#f3f7fa" /> : null}
        <ControlIcon label={fullscreen ? '退出全屏' : '全屏'} name={fullscreen ? 'minimize' : 'maximize'} onPress={toggleFullscreen} />
      </View>
      <Modal visible={more} transparent animationType="fade" supportedOrientations={['portrait', 'portrait-upside-down', 'landscape']} onShow={measureMenu} onRequestClose={closeMore}>
        {more ? <View ref={menuPortal} collapsable={false} onLayout={measureMenu} style={{ flex: 1 }}>
        <Pressable accessibilityLabel="关闭更多播放操作" onPress={closeMore} onAccessibilityTap={closeMore} style={StyleSheet.absoluteFill} />
        <View testID="watch-more-menu" accessibilityViewIsModal pointerEvents={menuGeometry && menuContentHeight > 0 ? 'auto' : 'none'} style={{ position: 'absolute', opacity: menuGeometry && menuContentHeight > 0 ? 1 : 0, left: placement.left, top: placement.top, width: placement.width, maxHeight: placement.maxHeight, borderRadius: 14, backgroundColor: '#19232e', borderColor: '#ffffff30', borderWidth: 1, padding: 8 }}>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: Math.max(0, placement.maxHeight - 18) }} onContentSizeChange={(_width, height) => { setMenuContentHeight(height); measureMenu(); }}>
            <Pressable accessibilityRole="button" onPress={() => { setComposerOpen(value => !value); closeMore(); }} style={styles.menuItem}><Text style={styles.menuText}>{composerOpen ? '收起弹幕输入' : '发送弹幕'}</Text></Pressable>
            {!inlineVolume ? <Pressable accessibilityRole="button" accessibilityLabel="本机音量" onPress={openVolume} onAccessibilityTap={openVolume} style={styles.menuItem}><Text style={styles.menuText}>本机音量</Text></Pressable> : null}
            {!inlineSettings ? <Pressable accessibilityRole="button" accessibilityLabel="播放设置" onPress={openSettings} onAccessibilityTap={openSettings} style={styles.menuItem}><Text style={styles.menuText}>播放设置</Text></Pressable> : null}
            <Pressable accessibilityRole="button" onPress={() => { setQuick('rate'); closeMore(); }} style={styles.menuItem}><Text style={styles.menuText}>倍速 · {rate}×</Text></Pressable>
            {host ? <Pressable accessibilityRole="button" onPress={() => { sync(); closeMore(); }} style={styles.menuItem}><Text style={styles.menuText}>同步进度</Text></Pressable> : null}
            <Pressable accessibilityRole="button" onPress={() => { refresh(); closeMore(); }} style={styles.menuItem}><Text style={styles.menuText}>重载视频</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => { hide(); closeMore(); }} style={styles.menuItem}><Text style={styles.menuText}>隐藏控制栏</Text></Pressable>
            {fullscreen ? <ScreenOrientationButton state={orientation} color="#f3f7fa" /> : null}
          </ScrollView>
        </View>
        </View> : null}
      </Modal>
    {orientation.error ? <Text accessibilityLiveRegion="polite" style={{ color: '#ffb4ab', padding: 6 }}>{orientation.error}</Text> : null}
    {error ? <Text style={{ color: '#ffb4ab', padding: 6 }}>{error}</Text> : null}
    <PlaybackSettings visible={settings} close={() => setSettings(false)} player={player} subtitles={subtitles} danmaku={danmaku} roomId={roomId} host={host} trackVersion={trackVersion} />
    <AppDialog visible={!!quick} title={quick === 'rate' ? '播放倍速' : '本机音量'} close={() => setQuick(null)} maxWidth={420}>
      {quick === 'rate' ? <><MediaTabs tabs={[.5, .75, 1, 1.25, 1.5, 2].map(value => ({ value: String(value), label: `${value}×` }))} value={String(rate)} onChange={value => { if (host) { control('rate', Number(value)); setQuick(null); } }} />{!host ? <Text style={{ color: theme.color('#a8b3b6') }}>倍速由房主调整</Text> : null}</> : <MediaSlider label="本机音量" value={volume} maximumValue={100} displayValue={`${Math.round(volume)}%`} onChange={value => { setVolume(value); player.configure({ volume: value }); }} onComplete={value => { void writePreference('zviewer-volume', { value }).catch(() => {}); }} />}
    </AppDialog>
  </View>;
}
const styles = StyleSheet.create({
  root: { backgroundColor: 'rgba(15,23,32,0.94)', borderWidth: 1, borderColor: '#ffffff18', borderRadius: 14, paddingTop: 0 },
  menuItem: { minHeight: 44, justifyContent: 'center', padding: 10 },
  menuText: { color: '#f3f7fa', fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  icon: { minHeight: 44, width: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  selected: { backgroundColor: '#ffffff16' },
  time: { color: '#f3f7fa', fontSize: 11, fontVariant: ['tabular-nums'], marginRight: 6, flexShrink: 1 },
  composer: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, minWidth: 0, minHeight: 38, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#ffffff20', color: '#fff', fontSize: 13 },
});
