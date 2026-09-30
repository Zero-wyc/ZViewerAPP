import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Switch, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { useSession } from '@/state/session';
import type { VlcPlayer } from '@/lib/vlcPlayer';
import { trackTimeline, upperBound, type DanmakuItem, type DanmakuTrack } from '@/lib/timeline';
import { readPreference, writePreference } from '@/lib/preferences';
import { RoomButton, ui } from './RoomUi';
const defaults = { enabled: true, scaleWithScreen: true, size: 20, opacity: 0.85, speed: 8 };
type Preferences = typeof defaults;
type Active = DanmakuItem & { key: number; lane: number; start: number };
export function useDanmaku(roomId: string, player: VlcPlayer, enabled: boolean) {
  const { request, socket } = useSession(); const [preferences, setPreferences] = useState(defaults); const [tracks, setTracks] = useState<DanmakuTrack[]>([]); const [live, setLive] = useState<DanmakuItem[]>([]);
  useEffect(() => { let active = true; void readPreference('zviewer-danmaku', defaults).then(value => { if (active) setPreferences(value); }); return () => { active = false; }; }, []);
  useEffect(() => {
    if (!enabled || !socket) return;
    let active = true; const updated = (payload: { roomId: string; tracks: DanmakuTrack[] }) => { if (payload.roomId === roomId) setTracks(payload.tracks || []); };
    const received = (payload: { id: string; text: string }) => setLive(previous => [...previous.slice(-99), { id: payload.id, content: payload.text, time: player.currentTime, color: 0xffffff }]);
    socket.on('danmaku-tracks-updated', updated); socket.on('danmaku', received);
    void request<{ tracks: DanmakuTrack[] }>(`/api/rooms/${encodeURIComponent(roomId)}/danmaku-tracks`).then(data => { if (active) setTracks(data.tracks); }).catch(() => {});
    return () => { active = false; socket.off('danmaku-tracks-updated', updated); socket.off('danmaku', received); setLive([]); setTracks([]); };
  }, [enabled, roomId, player, request, socket]);
  const change = (next: Partial<Preferences>) => { const value = { ...preferences, ...next }; setPreferences(value); void writePreference('zviewer-danmaku', value).catch(() => {}); };
  return { preferences, change, tracks, live };
}
export function DanmakuOverlay({ player, state, width, height }: { player: VlcPlayer; state: ReturnType<typeof useDanmaku>; width: number; height: number }) {
  const { preferences, tracks, live } = state; const [items, setItems] = useState<Active[]>([]); const [playing, setPlaying] = useState(player.playing);
  const next = useRef(0); const laneEnd = useRef<number[]>([]); const [last, setLast] = useState(0); const seen = useRef(new Set<string>()); const liveRef = useRef(live);
  useEffect(() => { liveRef.current = live; }, [live]);
  const font = preferences.size * (preferences.scaleWithScreen ? Math.min(2, Math.max(0.7, width / 560)) : 1);
  useEffect(() => {
    const timeline = trackTimeline(tracks); let cursor = upperBound(timeline, player.currentTime); let previous = player.currentTime;
    laneEnd.current = []; seen.current.clear();
    const tick = player.addListener('timeUpdate', ({ currentTime }) => {
      if (!preferences.enabled) return;
      if (currentTime < previous - 0.5 || currentTime - previous > 2) { cursor = upperBound(timeline, Math.max(0, currentTime - 0.1)); laneEnd.current = []; setItems([]); }
      previous = currentTime; setLast(currentTime);
      const due: DanmakuItem[] = [];
      while (cursor < timeline.length && timeline[cursor].time <= currentTime) { if (timeline[cursor].time >= currentTime - 0.6) due.push(timeline[cursor]); cursor++; }
      due.push(...liveRef.current.filter(item => !seen.current.has(item.id) && item.time <= currentTime + 0.5 && item.time >= currentTime - 2));
      const active: Active[] = []; const lanes = Math.max(1, Math.floor(height * 0.7 / (font + 8)));
      for (const item of due.slice(0, 12)) {
        seen.current.add(item.id); const lane = Array.from({ length: lanes }, (_, i) => i).find(i => (laneEnd.current[i] || 0) <= currentTime);
        if (lane === undefined) continue;
        const length = Math.min(width * 1.5, Math.max(font, item.content.length * font));
        laneEnd.current[lane] = currentTime + ((item.mode === 4 || item.mode === 5) ? preferences.speed : preferences.speed * length / (width + length) + 0.4);
        active.push({ ...item, key: next.current++, lane, start: currentTime });
      }
      setItems(old => [...old.filter(item => currentTime - item.start <= preferences.speed), ...active].slice(-40));
    }); const status = player.addListener('playingChange', event => setPlaying(event.isPlaying)); const load = player.addListener('statusChange', event => { if (event.status === 'loading' || event.status === 'idle') { setItems([]); laneEnd.current = []; } });
    return () => { tick.remove(); status.remove(); load.remove(); };
  }, [player, tracks, width, height, font, preferences]);
  if (!preferences.enabled) return null;
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>{items.map(item => <FlyingText key={item.key} item={item} width={width} font={font} opacity={preferences.opacity} duration={preferences.speed} playing={playing} time={last} />)}</View>;
}
function FlyingText({ item, width, font, opacity, duration, playing, time }: { item: Active; width: number; font: number; opacity: number; duration: number; playing: boolean; time: number }) {
  const [position] = useState(() => new Animated.Value(width)); const fixed = item.mode === 4 || item.mode === 5;
  useEffect(() => {
    if (fixed) return;
    if (!playing) { position.stopAnimation(); return; }
    const animation = Animated.timing(position, { toValue: -Math.min(width * 1.5, item.content.length * font), duration: Math.max(0, duration - (time - item.start)) * 1000, easing: Easing.linear, useNativeDriver: true }); animation.start(); return () => animation.stop();
  }, [playing, fixed, position, item, width, font, duration, time]);
  return <Animated.Text numberOfLines={1} style={{ position: 'absolute', top: item.mode === 4 ? undefined : item.lane * (font + 8), bottom: item.mode === 4 ? item.lane * (font + 8) : undefined, ...(fixed ? { alignSelf: 'center' } : { transform: [{ translateX: position }] }), color: `#${Math.max(0, Math.min(0xffffff, item.color ?? 0xffffff)).toString(16).padStart(6, '0')}`, fontSize: font, opacity, fontWeight: '600', textShadowColor: '#000', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 }}>{item.content.slice(0, 300)}</Animated.Text>;
}
export function DanmakuSettings({ state }: { state: ReturnType<typeof useDanmaku> }) {
  const [open, setOpen] = useState(false); const { preferences: p, change } = state;
  return <View style={ui.content}><View style={ui.row}><Text style={ui.text}>弹幕</Text><Switch value={p.enabled} onValueChange={value => change({ enabled: value })} /><RoomButton label="弹幕设置" secondary onPress={() => setOpen(value => !value)} /></View>{open ? <View style={ui.card}><View style={ui.row}><Text style={ui.text}>随屏幕缩放</Text><Switch value={p.scaleWithScreen} onValueChange={value => change({ scaleWithScreen: value })} /></View><Text style={ui.text}>字号 {Math.round(p.size)}</Text><Slider minimumValue={12} maximumValue={36} value={p.size} onSlidingComplete={value => change({ size: value })} /><Text style={ui.text}>不透明度 {Math.round(p.opacity * 100)}%</Text><Slider minimumValue={0.2} maximumValue={1} value={p.opacity} onSlidingComplete={value => change({ opacity: value })} /><Text style={ui.text}>穿屏时间 {p.speed.toFixed(0)} 秒</Text><Slider minimumValue={4} maximumValue={15} value={p.speed} onSlidingComplete={value => change({ speed: value })} /><Text style={ui.muted}>已加载 {state.tracks.length} 条弹幕轨道</Text></View> : null}</View>;
}
