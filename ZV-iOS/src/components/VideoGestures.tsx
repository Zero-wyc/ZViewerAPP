import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { VideoTap, seekTarget } from '@/lib/videoGesture';
import type { VlcPlayer } from '@/lib/vlcPlayer';
export function VideoGestures({ player, fullscreen, enabled = true, show, control }: { player: VlcPlayer; fullscreen: boolean; enabled?: boolean; show: () => void; control: (action: 'play' | 'pause' | 'seek', value?: number) => void }) {
  const tap = useRef(new VideoTap()); const start = useRef<{ x: number; y: number; time: number } | null>(null); const width = useRef(0);
  useEffect(() => { tap.current.cancel(); }, [enabled, fullscreen]);
  if (!enabled) return null;
  return <View accessible accessibilityRole="button" accessibilityLabel="视频表面：双击中间播放或暂停，全屏双击两侧跳转" accessibilityActions={[{ name: 'activate', label: '显示控件' }, { name: 'toggle', label: '申请播放 / 暂停' }, { name: 'back', label: '后退 15 秒' }, { name: 'forward', label: '前进 15 秒' }]} onAccessibilityAction={event => { show(); const action = event.nativeEvent.actionName; if (action === 'toggle') control(player.playing ? 'pause' : 'play'); if (fullscreen && (action === 'back' || action === 'forward')) { const target = seekTarget(player.currentTime, action === 'back' ? -15 : 15, player.duration); if (target !== null) control('seek', target); } }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onLayout={event => { width.current = event.nativeEvent.layout.width; }}
    onStartShouldSetResponder={() => true}
    onResponderGrant={event => { start.current = { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY, time: Date.now() }; }}
    onResponderTerminate={() => { start.current = null; tap.current.cancel(); }}
    onResponderRelease={event => {
      const first = start.current; start.current = null;
      if (!first || Date.now() - first.time > 250 || Math.hypot(event.nativeEvent.locationX - first.x, event.nativeEvent.locationY - first.y) > 12) { tap.current.cancel(); return; }
      show(); const action = tap.current.tap(first.x, first.y, Date.now(), width.current, fullscreen);
      if (action === 'toggle') control(player.playing ? 'pause' : 'play');
      if (action === 'back' || action === 'forward') { const target = seekTarget(player.currentTime, action === 'back' ? -15 : 15, player.duration); if (target !== null) control('seek', target); }
    }} />;
}
