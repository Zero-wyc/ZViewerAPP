import { useAppearance } from '@/state/appearance';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { DanmakuTypeIcon } from './DanmakuTypeIcon';
import { MediaSlider, MediaSwitch, useMediaPalette } from './MediaPanelUi';
import { useSession } from '@/state/session';
import type { VlcPlayer } from '@/lib/vlcPlayer';
import { trackTimeline, upperBound, type DanmakuItem, type DanmakuTrack } from '@/lib/timeline';
import { normalizeDanmakuMeta, mergeRealtimeDanmaku, danmakuRoomBlocked, type RealtimeDanmaku, type DanmakuMeta } from '@/lib/danmakuRoom';
import { readPreference, writePreference } from '@/lib/preferences';
import { ui as baseUi } from './RoomUi';
import { defaultDanmakuPreferences as defaults, danmakuArea, danmakuLanes, danmakuVisible, normalizeDanmakuPreferences } from '@/lib/danmakuLayout';
import { danmakuMediaKey, DanmakuWrites, scopeDanmakuTrack, sourceDanmakuTracks, type DanmakuBinding, type DanmakuTicket, type DanmakuMutation } from '@/lib/danmakuSource';
import { danmakuBody, importDanmaku } from '@/lib/danmakuImport';
type Preferences = typeof defaults;
type Active = DanmakuItem & { key: number; lane: number; start: number };
const emptyKeywords: string[] = []; const emptyDeleted: unknown[] = [];
type RoomDanmaku = { scope: string; tracks: DanmakuTrack[]; live: DanmakuItem[]; meta: DanmakuMeta; error: string };
const emptyRoomDanmaku = (scope: string): RoomDanmaku => ({ scope, tracks: [], live: [], meta: normalizeDanmakuMeta(null), error: '' });
export function useDanmaku(roomId: string, player: VlcPlayer, enabled: boolean, binding?: DanmakuBinding) {
  const { request, socket, session } = useSession(); const [preferences, setPreferences] = useState(defaults); const [room, setRoom] = useState(() => emptyRoomDanmaku(''));
  const mediaKey = danmakuMediaKey(binding?.media);
  const roomKey = JSON.stringify([roomId, session?.serverUrl, session?.user.id]);
  const scope = JSON.stringify([roomKey, socket?.id, enabled, mediaKey, binding?.canManage === true]);
  const writes = useMemo(() => new DanmakuWrites(roomKey), [roomKey]);
  const ticket = useMemo<DanmakuTicket>(() => ({ scope, mediaKey, active: false, canManage: binding?.canManage === true }), [scope, mediaKey, binding?.canManage]);
  const root = `/api/rooms/${encodeURIComponent(roomId)}/danmaku-tracks`;
  const mutate: DanmakuMutation = async (path, init) => {
    if (!path.startsWith(root + '/') && path !== root) throw new Error('弹幕操作地址无效');
    const { signal, ...submitted } = init;
    const options = { ...submitted };
    if (path === root && init.method === 'POST' && mediaKey) options.body = danmakuBody(scopeDanmakuTrack(JSON.parse(String(init.body)), mediaKey));
    const result = await writes.run(ticket, async () => {
      if (signal?.aborted) throw new Error('弹幕操作已取消');
      return request(path, options);
    });
    if (!writes.accepts(ticket)) throw new Error('视频已切换，旧弹幕操作已结束');
    if (init.method === 'DELETE' && decodeURIComponent(path.slice(root.length + 1)) === scopeDanmakuTrack({ trackId: 'default', label: '当前视频', items: [] }, mediaKey).trackId) {
      writes.suppressDefault(ticket);
      const removed = decodeURIComponent(path.slice(root.length + 1));
      setRoom(previous => previous.scope === scope ? { ...previous, tracks: previous.tracks.filter(track => track.trackId !== removed) } : previous);
    }
    return result;
  };
  useEffect(() => { let active = true; void readPreference('zviewer-danmaku', defaults).then(value => { if (active) setPreferences(normalizeDanmakuPreferences(value)); }); return () => { active = false; }; }, []);
  useEffect(() => {
    if (!enabled || !socket) return;
    let trackRevision = 0, metaRevision = 0, tracksReady = false, persistedDefault = false; let automatic: DanmakuTrack | null = null;
    const controller = new AbortController(); const { changed, legacy } = writes.open(ticket);
    const active = () => writes.accepts(ticket) && !controller.signal.aborted;
    const update = (change: (previous: RoomDanmaku) => RoomDanmaku) => { if (active()) setRoom(previous => change(previous.scope === scope ? previous : emptyRoomDanmaku(scope))); };
    const defaultId = scopeDanmakuTrack({ trackId: 'default', label: '当前视频', items: [] }, mediaKey).trackId;
    const tracksForSource = (values: DanmakuTrack[], fromServer = false) => {
      let selected = mediaKey ? sourceDanmakuTracks(values, mediaKey, legacy) : values;
      if (fromServer) {
        const present = selected.some(track => track.trackId === defaultId);
        if (persistedDefault && !present) writes.suppressDefault(ticket);
        persistedDefault = present;
      }
      if (writes.defaultSuppressed(ticket)) selected = selected.filter(track => track.trackId !== defaultId);
      return automatic && !writes.defaultSuppressed(ticket) && !selected.some(track => track.trackId === automatic!.trackId) ? [...selected, automatic] : selected;
    };
    const updated = (payload: { roomId: string; tracks: DanmakuTrack[] }) => { if (!active() || !tracksReady || payload?.roomId !== roomId) return; trackRevision++; const tracks = tracksForSource(Array.isArray(payload.tracks) ? payload.tracks : [], true); update(previous => ({ ...previous, tracks })); };
    const metaUpdated = (payload: { roomId: string; meta: unknown }) => { if (!active() || payload?.roomId !== roomId) return; metaRevision++; const meta = normalizeDanmakuMeta(payload.meta); update(previous => ({ ...previous, meta: { ...meta, realtimeLog: mergeRealtimeDanmaku(previous.meta.realtimeLog, meta.realtimeLog) } })); };
    const received = (payload: { roomId?: string; id: string; text: string; sender?: string; videoTime?: number }) => {
      if (!active() || payload?.roomId && payload.roomId !== roomId || typeof payload?.id !== 'string' || typeof payload.text !== 'string') return;
      update(previous => {
        const existing = previous.meta.realtimeLog.find(item => item.id === payload.id);
        const entry: RealtimeDanmaku = existing || { id: payload.id, content: payload.text, ...(typeof payload.sender === 'string' ? { sender: payload.sender } : {}), ...(Number.isFinite(payload.videoTime) && payload.videoTime! >= 0 ? { time: payload.videoTime } : {}) };
        return { ...previous, live: [...previous.live.filter(item => item.id !== payload.id).slice(-99), { id: payload.id, content: payload.text, time: player.currentTime, color: 0xffffff }], meta: { ...previous.meta, realtimeLog: mergeRealtimeDanmaku(previous.meta.realtimeLog, [entry]) } };
      });
    };
    socket.on('danmaku-tracks-updated', updated); socket.on('danmaku-meta-updated', metaUpdated); socket.on('danmaku', received);
    const clearing = changed && ticket.canManage;
    const ready = clearing ? writes.run(ticket, () => request(root + '/bulk', { method: 'POST', body: danmakuBody({ tracks: [] }) })) : Promise.resolve();
    const loadTracks = () => {
      if (!active()) return;
      tracksReady = true; const initialTracks = trackRevision;
      return request<{ tracks: DanmakuTrack[] }>(root, { signal: controller.signal }).then(data => { if (active() && trackRevision === initialTracks) { const tracks = tracksForSource(Array.isArray(data.tracks) ? data.tracks : [], true); update(previous => ({ ...previous, tracks })); } });
    };
    const tracksLoaded = clearing ? ready.then(loadTracks) : loadTracks();
    void tracksLoaded?.catch(() => { if (active()) update(previous => ({ ...previous, error: '弹幕轨道加载或切换清理失败，请重新进入房间重试' })); });
    const cid = binding?.media?.sourceType === 'bilibili' ? binding.media.cid : 0;
    if (Number.isSafeInteger(cid) && cid! > 0) {
      void request<{ danmaku: DanmakuItem[] }>(`/api/stream/bilibili/danmaku?cid=${cid}`, { signal: controller.signal }).then(async data => {
        if (!active()) return;
        const items = importDanmaku(JSON.stringify(data.danmaku), 'bilibili-video');
        if (ticket.canManage) await tracksLoaded;
        if (!active()) return;
        automatic = scopeDanmakuTrack({ trackId: 'default', label: '当前视频', source: 'bilibili-video', items, offset: 0, hidden: false }, mediaKey);
        const saved = ticket.canManage && !persistedDefault && !writes.defaultSuppressed(ticket) ? writes.run(ticket, () => request(root, { method: 'POST', body: danmakuBody(automatic!) })) : null;
        update(previous => ({ ...previous, tracks: tracksForSource(previous.tracks) }));
        if (saved) await saved;
      }).catch(() => { if (active()) update(previous => ({ ...previous, error: '当前视频自动弹幕加载或保存失败，可在线搜索后导入重试' })); });
    }
    const initialMeta = metaRevision;
    void request<{ meta: unknown }>(`/api/rooms/${encodeURIComponent(roomId)}/danmaku-meta`, { signal: controller.signal }).then(data => { if (active() && metaRevision === initialMeta) { const meta = normalizeDanmakuMeta(data.meta); update(previous => ({ ...previous, meta: { ...meta, realtimeLog: mergeRealtimeDanmaku(previous.meta.realtimeLog, meta.realtimeLog) } })); } }).catch(() => { if (active() && metaRevision === initialMeta) update(previous => ({ ...previous, error: '实时弹幕历史加载失败，请重新进入房间重试' })); });
    return () => { writes.close(ticket); controller.abort(); socket.off('danmaku-tracks-updated', updated); socket.off('danmaku-meta-updated', metaUpdated); socket.off('danmaku', received); };
  }, [enabled, roomId, player, request, socket, scope, mediaKey, root, writes, ticket, binding?.media?.sourceType, binding?.media?.cid]);
  const change = (next: Partial<Preferences>) => { const value = { ...preferences, ...next }; setPreferences(value); void writePreference('zviewer-danmaku', value).catch(() => {}); };
  const current = room.scope === scope ? room : emptyRoomDanmaku(scope);
  return { preferences, change, mediaKey, mutate, canManage: binding?.canManage === true, tracks: current.tracks, live: current.live, realtime: current.meta.realtimeLog, blockKeywords: current.meta.blockKeywords, deletedLog: current.meta.deletedLog, error: current.error };
}
export function DanmakuOverlay({ player, state, width, height }: { player: VlcPlayer; state: ReturnType<typeof useDanmaku>; width: number; height: number }) {
  useAppearance();

  const { preferences, tracks, live } = state; const blockKeywords = state.blockKeywords || emptyKeywords; const deletedLog = state.deletedLog || emptyDeleted; const [items, setItems] = useState<Active[]>([]); const [playing, setPlaying] = useState(player.playing);
  const next = useRef(0); const laneEnd = useRef<number[]>([]); const [last, setLast] = useState(0); const seen = useRef(new Set<string>()); const liveRef = useRef(live);
  useEffect(() => { liveRef.current = live; }, [live]);
  const font = preferences.size * (preferences.scaleWithScreen ? Math.min(2, Math.max(0.7, width / 560)) : 1);
  useEffect(() => {
    const timeline = trackTimeline(tracks); let cursor = upperBound(timeline, player.currentTime - 0.0001); let previous = player.currentTime;
    laneEnd.current = []; seen.current.clear();
    const tick = player.addListener('timeUpdate', ({ currentTime }) => {
      if (!preferences.enabled) return;
      if (currentTime < previous - 0.5 || currentTime - previous > 2) { cursor = upperBound(timeline, Math.max(0, currentTime - 0.1) - 0.0001); laneEnd.current = []; setItems([]); }
      previous = currentTime; setLast(currentTime);
      const due: DanmakuItem[] = [];
      while (cursor < timeline.length && timeline[cursor].time <= currentTime) { if (timeline[cursor].time >= currentTime - 0.6) due.push(timeline[cursor]); cursor++; }
      due.push(...liveRef.current.filter(item => !seen.current.has(item.id) && item.time <= currentTime + 0.5 && item.time >= currentTime - 2));
      const active: Active[] = []; const lanes = danmakuLanes(height, preferences.displayArea, font);
      for (const item of due.filter(item => danmakuVisible(item, preferences.filters) && !danmakuRoomBlocked(item, blockKeywords, deletedLog)).slice(0, 12)) {
        seen.current.add(item.id); const lane = Array.from({ length: lanes }, (_, i) => i).find(i => (laneEnd.current[i] || 0) <= currentTime);
        if (lane === undefined) continue;
        const length = Math.min(width * 1.5, Math.max(font, item.content.length * font));
        laneEnd.current[lane] = currentTime + ((item.mode === 4 || item.mode === 5) ? preferences.speed : preferences.speed * length / (width + length) + 0.4);
        active.push({ ...item, key: next.current++, lane, start: currentTime });
      }
      setItems(old => [...old.filter(item => currentTime - item.start <= preferences.speed && danmakuVisible(item, preferences.filters) && !danmakuRoomBlocked(item, blockKeywords, deletedLog)), ...active].slice(-40));
    }); const status = player.addListener('playingChange', event => setPlaying(event.isPlaying)); const load = player.addListener('statusChange', event => { if (event.status === 'loading' || event.status === 'idle') { setItems([]); laneEnd.current = []; } });
    return () => { tick.remove(); status.remove(); load.remove(); };
  }, [player, tracks, width, height, font, preferences, blockKeywords, deletedLog]);
  if (!preferences.enabled) return null;
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { bottom: undefined, height: danmakuArea(height, preferences.displayArea), overflow: 'hidden' }]}>{items.filter(item => danmakuVisible(item, preferences.filters) && !danmakuRoomBlocked(item, blockKeywords, deletedLog)).map(item => <FlyingText key={item.key} item={item} width={width} font={font} opacity={preferences.opacity} duration={preferences.speed} playing={playing} time={last} />)}</View>;
}
function FlyingText({ item, width, font, opacity, duration, playing, time }: { item: Active; width: number; font: number; opacity: number; duration: number; playing: boolean; time: number }) {
  useAppearance();

  const [position] = useState(() => new Animated.Value(width)); const fixed = item.mode === 4 || item.mode === 5;
  useEffect(() => {
    if (fixed) return;
    if (!playing) { position.stopAnimation(); return; }
    const animation = Animated.timing(position, { toValue: -Math.min(width * 1.5, item.content.length * font), duration: Math.max(0, duration - (time - item.start)) * 1000, easing: Easing.linear, useNativeDriver: true }); animation.start(); return () => animation.stop();
  }, [playing, fixed, position, item, width, font, duration, time]);
  return <Animated.Text numberOfLines={1} style={{ position: 'absolute', top: item.mode === 4 ? undefined : item.lane * (font + 8), bottom: item.mode === 4 ? item.lane * (font + 8) : undefined, ...(fixed ? { alignSelf: 'center' } : { transform: [{ translateX: position }] }), color: `#${Math.max(0, Math.min(0xffffff, item.color ?? 0xffffff)).toString(16).padStart(6, '0')}`, fontSize: font, opacity, fontWeight: '600', textShadowColor: '#000', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 }}>{item.content.slice(0, 300)}</Animated.Text>;
}
export function DanmakuSettings({ state }: { state: ReturnType<typeof useDanmaku> }) {
  const theme = useAppearance(); const ui = theme.styles(baseUi); const palette = useMediaPalette();
  const [open, setOpen] = useState(false); const { preferences: p, change } = state;
  return <View style={{ gap: 12 }}>
    <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 }}><Text style={ui.title}>弹幕设置</Text><Switch accessibilityLabel="启用弹幕" style={{ alignSelf: 'center' }} value={p.enabled} onValueChange={enabled => change({ enabled })} trackColor={{ true: palette.accent, false: palette.line }} thumbColor="#fff" /></View>
      <Pressable accessibilityRole="button" accessibilityLabel={open ? '收起更多弹幕设置' : '查看更多弹幕设置'} accessibilityState={{ expanded: open }} onPress={() => setOpen(value => !value)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}><Text style={ui.muted}>{open ? '收起' : '查看更多'}</Text><Feather name={open ? 'chevron-up' : 'chevron-down'} size={18} color={palette.muted} /></Pressable>
    </View>
    <MediaSlider inline label="显示区域" value={p.displayArea} minimumValue={.25} step={.05} displayValue={`${Math.round(p.displayArea * 100)}%`} onChange={displayArea => change({ displayArea })} />
    <MediaSlider inline label="不透明度" value={p.opacity} minimumValue={.2} displayValue={`${Math.round(p.opacity * 100)}%`} onChange={opacity => change({ opacity })} />
    {open ? <><MediaSwitch label="随屏幕缩放" value={p.scaleWithScreen} onChange={scaleWithScreen => change({ scaleWithScreen })} /><MediaSlider label="字号" value={p.size} minimumValue={12} maximumValue={36} step={1} displayValue={`${Math.round(p.size)} px`} onChange={size => change({ size })} /><MediaSlider label="穿屏时间" value={p.speed} minimumValue={4} maximumValue={15} step={1} displayValue={`${p.speed.toFixed(0)} 秒`} onChange={speed => change({ speed })} /></> : null}
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}><Text style={ui.title}>弹幕类型</Text><Text style={ui.muted}>点按切换显示</Text></View>
    <View testID="danmaku-type-filters" style={{ flexDirection: 'row', gap: 8 }}>{(['fixed', 'scroll', 'color', 'advanced'] as const).map((key, index) => {
      const label = ['固定', '滚动', '彩色', '高级'][index]; const enabled = p.filters[key]; const color = enabled ? palette.accent : palette.muted;
      return <Pressable key={key} accessibilityRole="button" accessibilityLabel={`显示${label}弹幕`} accessibilityHint={enabled ? '点击屏蔽' : '点击开启'} accessibilityState={{ selected: enabled }} onPress={() => change({ filters: { ...p.filters, [key]: !enabled } })} style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 8, paddingVertical: 8 }}>
        <View style={{ width: 54, height: 54, borderRadius: 16, backgroundColor: enabled ? palette.container : palette.field, borderWidth: 1, borderColor: enabled ? 'transparent' : palette.line, alignItems: 'center', justifyContent: 'center' }}><DanmakuTypeIcon type={key} color={color} />{!enabled ? <View pointerEvents="none" style={{ position: 'absolute', width: 38, height: 2, borderRadius: 1, backgroundColor: palette.muted, transform: [{ rotate: '-45deg' }] }} /> : null}</View><Text style={{ color, fontSize: 14 }}>{label}</Text>
      </Pressable>;
    })}</View>
    <Pressable accessibilityRole="button" accessibilityLabel="恢复默认弹幕设置" onPress={() => change(defaults)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Feather name="rotate-ccw" size={17} color={palette.muted} /><Text style={ui.muted}>恢复默认设置</Text></Pressable>
  </View>;
}
