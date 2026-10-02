import Feather from '@expo/vector-icons/Feather';
import { useEffect, useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { fmModes, fmScenes, type FmState, type PersonalFm } from '@/lib/personalFm';
import type { NcmRequest } from '@/lib/musicCollection';
import { messageFor } from '@/lib/server';
import { useAppearance } from '@/state/appearance';
import { AppDialog } from './AppDialog';
import { MediaImage } from './MediaImage';
import { RoomButton, ui as baseUi } from './RoomUi';

export function PersonalFmPanel({ fm, state, ncm, loggedIn, checking, host, trackKey, playing, togglePlay, login, trash }: { fm: PersonalFm; state: FmState; ncm: NcmRequest; loggedIn: boolean; checking: boolean; host: boolean; trackKey: string | null; playing: boolean; togglePlay: () => Promise<void>; login: () => void; trash: (id: number) => Promise<void> }) {
  const theme = useAppearance(); const ui = theme.styles(baseUi); const window = useWindowDimensions();
  const [width, setWidth] = useState(Math.max(200, window.width - 64)); const [modeOpen, setModeOpen] = useState(false);
  const [message, setMessage] = useState(''); const [actionBusy, setActionBusy] = useState(false);
  const [like, setLike] = useState({ id: 0, value: false });
  const current = state.current; const liked = like.id === current?.songId && like.value;
  const busy = state.switching || actionBusy; const ink = theme.color('#edf1ef'); const paper = theme.color('#111417');
  const task = async (work: () => Promise<unknown>) => { if (busy) return; setActionBusy(true); setMessage(''); try { await work(); } catch (error) { setMessage(messageFor(error)); } finally { setActionBusy(false); } };
  useEffect(() => {
    if (!loggedIn || !current) return; const controller = new AbortController();
    void ncm<{ account?: { id?: number }; profile?: { userId?: number } }>(`/user/account?timestamp=${Date.now()}`, controller.signal).then(async user => {
      const id = user.account?.id || user.profile?.userId; if (!id) return;
      const result = await ncm<{ ids?: number[] }>(`/likelist?uid=${id}&timestamp=${Date.now()}`, controller.signal);
      if (!controller.signal.aborted) setLike({ id: current.songId, value: result.ids?.includes(current.songId) === true });
    }).catch(() => {});
    return () => controller.abort();
  }, [current, loggedIn, ncm]);
  const center = width > 900 ? 246 : width > 640 ? 212 : 188; const side = width > 900 ? 168 : width > 640 ? 124 : 104; const gap = width > 900 ? 50 : width > 640 ? 12 : 10;
  const scale = Math.min(1, Math.max(0, width - 48) / (center + side * 2 + gap * 2));
  const active = fm.isActive(trackKey); const previous = state.history.at(-1); const next = state.pool.find(song => song.songId !== current?.songId);
  const action = (label: string, icon: React.ComponentProps<typeof Feather>['name'], handler: () => Promise<unknown>, disabled: boolean, solid = false, selected = false) => <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected }} disabled={disabled} onPress={() => void task(handler)} style={{ minWidth: 54, minHeight: 44, borderWidth: 1, borderColor: selected ? theme.color('#ffaaa5') : ink, backgroundColor: solid ? ink : 'transparent', alignItems: 'center', justifyContent: 'center', opacity: disabled ? .4 : 1 }}><Feather name={icon} size={19} color={selected ? theme.color('#ffaaa5') : solid ? paper : ink} /></Pressable>;
  return <View testID="personal-fm-panel" onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ alignSelf: 'center', width: '100%', maxWidth: 1050, minHeight: width < 640 ? 540 : 650, paddingHorizontal: width < 640 ? 12 : 34, paddingVertical: 24, borderWidth: 1, borderColor: theme.color('#343d41'), gap: 24 }}>
    {(['tl','tr','bl','br'] as const).map(corner => <View key={corner} pointerEvents="none" style={{ position: 'absolute', width: 10, height: 10, borderColor: ink, ...(corner.includes('t') ? { top: -1, borderTopWidth: 2 } : { bottom: -1, borderBottomWidth: 2 }), ...(corner.includes('l') ? { left: -1, borderLeftWidth: 2 } : { right: -1, borderRightWidth: 2 }) }} />)}
    <View style={{ alignItems: 'flex-end' }}><RoomButton label={`MODE · ${fmModes.find(mode => mode.value === state.mode)?.label}${state.mode === 'SCENE_RCMD' ? ` · ${fmScenes.find(scene => scene.value === state.scene)?.label}` : ''} ⌄`} secondary disabled={busy} onPress={() => setModeOpen(true)} /></View>
    <View style={{ alignItems: 'center', gap: 10 }}><Text style={{ color: paper, backgroundColor: ink, paddingHorizontal: 12, paddingVertical: 4, letterSpacing: 1, fontSize: 12 }}>PERSONAL FM</Text><Text style={[ui.title, { fontSize: 30 }]}>私人漫游</Text><Text style={ui.muted}>根据你的音乐喜好为你推荐</Text></View>
    {checking ? <Text style={[ui.muted, { textAlign: 'center' }]}>正在检查网易云账号…</Text> : !loggedIn ? <View style={{ alignItems: 'center', paddingVertical: 40, gap: 16 }}><Text style={ui.title}>请先登录网易云音乐</Text><Text style={ui.muted}>登录后开启专属音乐漫游</Text><RoomButton label="扫码登录" onPress={login} /></View> : <>
      <View testID="fm-cover-carousel" style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: gap * scale, minHeight: center * scale + 16 }}>
        {[previous, current, next].map((song, index) => { const size = (index === 1 ? center : side) * scale; const disabled = !host || busy || !song; const label = index === 0 ? '漫游上一首封面' : index === 1 ? '漫游播放 / 暂停' : '漫游下一首封面'; return <Pressable key={index} testID={`fm-cover-${index}`} accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={() => void task(() => index === 0 ? fm.prev() : index === 2 ? fm.next() : active ? togglePlay() : fm.start())} style={{ width: size, height: size, padding: index === 1 ? 8 : 6, borderWidth: 1, borderStyle: song ? 'solid' : 'dashed', borderColor: ink, opacity: index === 1 ? 1 : .52 }}>
          {song ? <MediaImage source={{ uri: song.cover }} style={{ width: size - (index === 1 ? 18 : 14), height: size - (index === 1 ? 18 : 14) }} /> : <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><Text style={[ui.muted, { fontSize: 10 }]}>{index === 0 ? 'NO PREV' : state.loading ? 'NEXT LOADING' : 'NO NEXT'}</Text></View>}
          {index === 1 && song ? <View pointerEvents="none" style={{ position: 'absolute', top: '50%', left: '50%', width: 56, height: 56, marginTop: -28, marginLeft: -28, backgroundColor: '#000000b8', justifyContent: 'center', alignItems: 'center' }}><Feather name={active && playing ? 'pause' : 'play'} size={30} color="#ffffff" /></View> : null}
        </Pressable>; })}
      </View>
      <View style={{ alignItems: 'center', gap: 8 }}><Text style={[ui.title, { fontSize: 21, textAlign: 'center' }]}>{current?.name || (state.loading ? '正在为你准备音乐…' : '无法加载漫游歌曲')}</Text><Text style={ui.muted}>{current?.artist}</Text><Text style={ui.muted}>{current?.album}</Text></View>
      {!host ? <Text style={[ui.muted, { textAlign: 'center' }]}>由房主控制漫游</Text> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
        {action('漫游上一首', 'skip-back', () => fm.prev(), !host || busy || !previous, true)}
        {action('不喜欢', 'trash-2', async () => { if (current) { await trash(current.songId); await fm.next(); } }, !host || busy || !current)}
        {action(liked ? '取消喜欢' : '喜欢', 'heart', async () => { if (!current) return; const value = !liked; await ncm(`/like?id=${current.songId}&like=${value}&timestamp=${Date.now()}`); setLike({ id: current.songId, value }); }, busy || !current, false, liked)}
        {action('漫游下一首', 'skip-forward', () => fm.next(), !host || busy, true)}
      </View>
      {state.loading && current ? <Text style={[ui.muted, { textAlign: 'center' }]}>正在补充漫游候选…</Text> : null}
      {state.error || message ? <View style={{ alignItems: 'center', gap: 10 }}><Text style={ui.error}>{message || state.error}</Text><RoomButton label="重试漫游" secondary disabled={busy || state.loading} onPress={() => void task(() => fm.refill())} /></View> : null}
    </>}
    <AppDialog visible={modeOpen} title="MODE SELECT" maxWidth={460} close={() => setModeOpen(false)}><View style={ui.row}>{fmModes.map(mode => <RoomButton key={mode.value} label={mode.label} secondary disabled={state.loading || busy} onPress={() => { void task(() => fm.changeMode(mode.value)); if (mode.value !== 'SCENE_RCMD') setModeOpen(false); }} />)}</View>{state.mode === 'SCENE_RCMD' ? <><Text style={ui.title}>选择场景</Text><View style={ui.row}>{fmScenes.map(scene => <RoomButton key={scene.value} label={scene.label} secondary disabled={state.loading || busy} onPress={() => { setModeOpen(false); void task(() => fm.changeMode('SCENE_RCMD', scene.value)); }} />)}</View></> : null}</AppDialog>
  </View>;
}
