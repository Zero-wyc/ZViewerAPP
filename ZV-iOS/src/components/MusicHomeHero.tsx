import Feather from '@expo/vector-icons/Feather';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, PanResponder, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useAppearance } from '@/state/appearance';
import { localDate } from '@/lib/musicCollection';
import { MediaImage } from './MediaImage';

function bannerResponder(count: number, width: number, begin: () => void, end: () => void, step: (direction: number) => void) {
  let startX = 0; let startY = 0; let singleTouch = false;
  return PanResponder.create({
    onStartShouldSetPanResponderCapture: event => {
      startX = event.nativeEvent.pageX; startY = event.nativeEvent.pageY;
      singleTouch = event.nativeEvent.touches.length === 1;
      return false;
    },
    onMoveShouldSetPanResponder: event => {
      const dx = event.nativeEvent.pageX - startX; const dy = event.nativeEvent.pageY - startY;
      return count > 1 && singleTouch && event.nativeEvent.touches.length === 1 && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.4;
    },
    onPanResponderGrant: begin,
    onPanResponderStart: event => { if (event.nativeEvent.touches.length !== 1) singleTouch = false; },
    onPanResponderRelease: event => {
      end();
      const dx = event.nativeEvent.pageX - startX; const dy = event.nativeEvent.pageY - startY;
      if (!singleTouch || Math.abs(dx) <= Math.abs(dy) * 1.4 || Math.abs(dx) < Math.min(80, Math.max(32, width * .1))) return;
      step(dx < 0 ? 1 : -1);
    },
    onPanResponderTerminate: end,
    onPanResponderTerminationRequest: () => true,
  });
}

export function MusicHomeHero({ banners, daily, disabled }: { banners: string[]; daily: () => void; disabled: boolean }) {
  const theme = useAppearance(); const window = useWindowDimensions(); const [width, setWidth] = useState(window.width - 56);
  const [index, setIndex] = useState(0); const [date, setDate] = useState(localDate);
  const touching = useRef(false); const interactedAt = useRef(0);
  const ink = theme.color('#edf1ef'); const muted = theme.color('#a8b3b6'); const paper = theme.color('#111417');
  const banner = banners[index % Math.max(1, banners.length)]; const compact = width < 700;
  const beginSwipe = useCallback(() => { touching.current = true; interactedAt.current = Date.now(); }, []);
  const endSwipe = useCallback(() => { touching.current = false; interactedAt.current = Date.now(); }, []);
  const stepBanner = useCallback((direction: number) => { if (banners.length > 1) setIndex(old => (old + direction + banners.length) % banners.length); }, [banners.length]);
  // PanResponder.create only registers these callbacks; ref reads/writes occur on gestures, never during render.
  // eslint-disable-next-line react-hooks/refs
  const swipe = useMemo(() => bannerResponder(banners.length, width, beginSwipe, endSwipe, stepBanner), [banners.length, width, beginSwipe, endSwipe, stepBanner]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => { const now = new Date(); setDate(localDate(now)); clearTimeout(timer); timer = setTimeout(refresh, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime() + 100); };
    refresh(); const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, []);
  useEffect(() => {
    if (banners.length < 2 || theme.preferences.reduceMotion) return;
    const timer = setInterval(() => { if (!touching.current && Date.now() - interactedAt.current >= 6000) setIndex(old => (old + 1) % banners.length); }, 6000);
    return () => clearInterval(timer);
  }, [banners.length, theme.preferences.reduceMotion]);
  return <View testID="music-home-hero" onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ gap: compact ? 24 : 20 }}>
    <View style={{ gap: 10 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Text style={{ backgroundColor: ink, color: paper, paddingHorizontal: 10, paddingVertical: 3, fontSize: 10, letterSpacing: 1 }}>RECOMMENDED MUSIC</Text><View style={{ height: 1, flex: 1, backgroundColor: ink, opacity: .4 }} /></View>
      <View testID="music-home-banner" {...swipe.panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel={`音乐横幅 ${index % Math.max(1, banners.length) + 1}/${Math.max(1, banners.length)}，左右滑动切换`} accessibilityActions={banners.length > 1 ? [{ name: 'increment', label: '下一张' }, { name: 'decrement', label: '上一张' }] : []} onAccessibilityAction={event => { if (banners.length < 2) return; interactedAt.current = Date.now(); setIndex(old => (old + (event.nativeEvent.actionName === 'increment' ? 1 : -1) + banners.length) % banners.length); }} style={{ width: '100%', aspectRatio: 2.4, overflow: 'hidden', backgroundColor: theme.color('#202729'), justifyContent: 'center', alignItems: 'center' }}>
        {banner ? <MediaImage testID="music-home-banner-image" variant="banner" source={{ uri: banner }} resizeMode="cover" style={{ width: '100%', height: '100%' }} /> : <><Feather name="music" size={compact ? 36 : 56} color={ink} /><Text style={{ color: ink, fontSize: compact ? 22 : 30, marginTop: 12 }}>网易云音乐</Text></>}
      </View>
      {banners.length > 1 ? <View style={{ flexDirection: 'row', gap: 6 }}>{banners.map((_, i) => <Pressable key={i} accessibilityRole="button" accessibilityLabel={`切换到第 ${i + 1} 张音乐横幅`} accessibilityState={{ selected: i === index % banners.length }} onPress={() => { interactedAt.current = Date.now(); setIndex(i); }} style={{ minHeight: 24, minWidth: 28, justifyContent: 'center' }}><View style={{ height: i === index % banners.length ? 3 : 1, width: i === index % banners.length ? 46 : 24, backgroundColor: ink, opacity: i === index % banners.length ? 1 : .4 }} /></Pressable>)}</View> : null}
    </View>
    <Pressable testID="music-home-daily" accessibilityRole="button" accessibilityLabel="每日推荐歌曲" disabled={disabled} onPress={daily} style={{ minHeight: compact ? 145 : 190, flexDirection: 'row', alignItems: 'center', paddingHorizontal: compact ? 18 : 32, backgroundColor: theme.dark ? '#ffffff09' : '#00000006', opacity: disabled ? .5 : 1 }}>
      <View style={{ flex: 1, alignSelf: 'stretch', justifyContent: 'center', paddingVertical: 20, alignItems: 'center', gap: 3 }}>
        <View style={{ position: 'absolute', top: 12, left: 0, width: 20, height: 20, borderLeftWidth: 2, borderTopWidth: 2, borderColor: ink }} /><View style={{ position: 'absolute', bottom: 12, right: 0, width: 20, height: 20, borderRightWidth: 2, borderBottomWidth: 2, borderColor: ink }} />
        <Text style={{ color: ink, fontSize: compact ? 28 : 36, fontWeight: '700', letterSpacing: 8 }}>每日</Text><Text style={{ color: muted, fontSize: compact ? 8 : 11, letterSpacing: 1 }}>DAILY RECOMMENDATION</Text><Text style={{ color: ink, fontSize: compact ? 28 : 36, fontWeight: '700', letterSpacing: 8 }}>推荐</Text>
      </View>
      <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: compact ? 20 : 40 }}><View style={{ width: compact ? 40 : 52, height: compact ? 40 : 52, backgroundColor: ink, justifyContent: 'center', alignItems: 'center' }}><Feather name="play" color={paper} size={compact ? 22 : 28} /></View><Text testID="music-home-date" style={{ color: ink, fontSize: compact ? 32 : 44, lineHeight: compact ? 37 : 50, fontVariant: ['tabular-nums'] }}>{date.slice(5,7)}{'\n'}{date.slice(8,10)}</Text></View>
      <View style={{ position: 'absolute', right: 12, top: 12, width: 6, height: 6, borderRadius: 3, backgroundColor: muted }} />
    </Pressable>
  </View>;
}
