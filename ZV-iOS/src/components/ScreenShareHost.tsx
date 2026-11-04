import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Switch, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useSession } from '@/state/session';
import { nativeBridge, type ScreenShareSnapshot } from '@/lib/nativeBridge';
import { emitAck } from '@/lib/socket';
import { screenShareExpiry, isActiveScreenShare } from '@/lib/screenShareSession';
import { useAppearance } from '@/state/appearance';
import { RoomButton, RoomIconButton, ui as baseUi } from './RoomUi';
import { Surface } from './Surface';

const labels: Record<ScreenShareSnapshot['phase'], string> = {
  idle: '尚未开始共享', 'requesting-permission': '等待系统授权', 'awaiting-host': '正在交接共享连接',
  starting: '正在连接共享服务', sharing: '正在共享屏幕', paused: '共享已暂停', stopped: '共享已停止', error: '共享未能继续',
};
export function ScreenShareHost({ roomId, onOwnership }: { roomId: string; onOwnership: (active: boolean) => void }) {
  const { session, socket, ensureFresh, certificateException } = useSession();
  const theme = useAppearance(); const ui = theme.styles(baseUi);
  const [capability, setCapability] = useState<{ available: boolean; message?: string } | null>(null);
  const [snapshot, setSnapshot] = useState<ScreenShareSnapshot>({ id: '', phase: 'idle' });
  const [systemAudio, setSystemAudio] = useState(true); const [quality, setQuality] = useState('720p');
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const current = useRef(''); const released = useRef(false); const claiming = useRef(false); const alive = useRef(true);
  const operation = useRef(0); const ownership = useRef(onOwnership);
  useEffect(() => { ownership.current = onOwnership; }, [onOwnership]);
  const active = isActiveScreenShare(snapshot.phase);
  const restore = useCallback(async () => {
    if (!released.current) { ownership.current(false); return; }
    released.current = false;
    if (socket?.connected) {
      for (let attempt = 0; attempt < 4 && alive.current; attempt++) {
        try { await emitAck(socket, 'register-host', { roomId }, 5000); ownership.current(false); return; }
        catch { await new Promise(resolve => setTimeout(resolve, 500)); }
      }
    }
    ownership.current(false);
    if (alive.current) setMessage('房主连接尚未恢复，请离开房间后重新进入');
  }, [socket, roomId]);
  const stop = async () => {
    operation.current++; setBusy(true);
    try { if (current.current) await nativeBridge?.screenShareStop?.(current.current); }
    catch { setMessage('停止请求未确认，请使用系统屏幕共享入口停止'); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    let live = true;
    void nativeBridge?.screenShareCapability?.().then(value => { if (live) setCapability(value); });
    if (!nativeBridge?.screenShareCapability) void Promise.resolve().then(() => { if (live) setCapability({ available: false, message: '主动共享需要包含广播扩展的新安装包' }); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    alive.current = true; let polling = false;
    const poll = async () => {
      const id = current.current;
      if (!id || polling || !nativeBridge?.screenShareSnapshot) return;
      polling = true;
      try {
        const value = await nativeBridge.screenShareSnapshot(id);
        if (!alive.current || current.current !== id) return;
        setSnapshot(value);
        if (value.phase === 'awaiting-host' && !claiming.current && !released.current) {
          claiming.current = true;
          const epoch = operation.current;
          try {
            if (!socket?.connected) throw new Error('房间连接已断开');
            await emitAck(socket, 'host-leave', { roomId });
            released.current = true;
            if (!alive.current || epoch !== operation.current) { await nativeBridge.screenShareStop?.(id); return; }
            await nativeBridge.screenShareControl?.(id, JSON.stringify({ claim: true }));
          } catch {
            await nativeBridge.screenShareStop?.(id);
            if (alive.current) setMessage('共享连接交接失败，请重试');
          } finally { claiming.current = false; }
        }
        if (value.phase === 'stopped' || value.phase === 'error') { current.current = ''; await restore(); }
      } catch { if (alive.current) setMessage('暂时无法读取系统共享状态'); }
      finally { polling = false; }
    };
    const timer = setInterval(() => { void poll(); }, 500);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void poll(); });
    return () => {
      // Invalidate an outstanding authorization or handoff operation.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      alive.current = false; operation.current++; clearInterval(timer); subscription.remove();
      const id = current.current; current.current = '';
      if (id) void nativeBridge?.screenShareStop?.(id);
      ownership.current(false);
    };
  }, [socket, roomId, restore, certificateException]);
  const start = async () => {
    if (busy || current.current || !socket?.connected || !session) return;
    setBusy(true); setMessage(''); const epoch = ++operation.current;
    try {
      const fresh = await ensureFresh({ expected: session });
      if (epoch !== operation.current || !alive.current) return;
      if (!nativeBridge?.screenSharePrepare || !nativeBridge.screenSharePresent) throw new Error('当前安装包缺少主动共享模块');
      const value = await nativeBridge.screenSharePrepare(JSON.stringify({
        server: fresh.serverUrl, roomId, token: fresh.accessToken, expires: screenShareExpiry(fresh.accessToken), systemAudio, quality, certificateException,
      }));
      if (epoch !== operation.current || !alive.current) { await nativeBridge.screenShareStop?.(value.id); return; }
      current.current = value.id; ownership.current(true);
      setSnapshot({ id: value.id, phase: 'requesting-permission' });
      await nativeBridge.screenSharePresent(value.id);
    } catch (error) {
      const id = current.current;
      if (id) await nativeBridge?.screenShareStop?.(id);
      current.current = ''; await restore();
      setSnapshot({ id: '', phase: 'error' });
      setMessage(error instanceof Error ? error.message : '无法开始共享');
    } finally { setBusy(false); }
  };
  return <Surface readable testID="screen-share-host" style={{ padding: 18, gap: 18, minWidth: 0 }}>
    <View style={[ui.row, { gap: 12 }]}><Feather name="cast" size={26} color={theme.color('#65d59b')} /><View style={{ flex: 1, minWidth: 0 }}><Text style={ui.title}>{labels[snapshot.phase]}</Text><Text style={ui.muted}>本机屏幕共享</Text></View>{busy || active && !['sharing', 'paused'].includes(snapshot.phase) ? <ActivityIndicator /> : null}</View>
    {snapshot.phase === 'sharing' || snapshot.phase === 'paused' ? <Text style={ui.text}>{snapshot.viewers || 0} / 2 位观众 · {snapshot.capturedFrames || 0} 帧已采集{snapshot.audioSamples ? ' · 已收到应用声音' : ''}</Text> : null}
    <View style={ui.row}><Text style={[ui.text, { flex: 1 }]}>应用声音</Text><Switch accessibilityLabel="共享应用声音" value={systemAudio} disabled={busy || active && snapshot.phase === 'requesting-permission'} onValueChange={value => {
      setSystemAudio(value);
      if (current.current) void nativeBridge?.screenShareControl?.(current.current, JSON.stringify({ systemAudio: value })).catch(() => setMessage('应用声音设置未生效'));
    }} /></View>
    <View style={ui.row}><Text style={ui.text}>画质</Text>{['540p', '720p'].map(value => <RoomButton key={value} label={value} secondary selected={quality === value} disabled={active || busy} onPress={() => setQuality(value)} />)}</View>
    <View style={ui.row}>{active ? <><RoomIconButton label={snapshot.phase === 'paused' ? '恢复共享' : '暂停共享'} icon={snapshot.phase === 'paused' ? 'play' : 'pause'} onPress={() => {
      if (!['sharing', 'paused'].includes(snapshot.phase)) return;
      void nativeBridge?.screenShareControl?.(current.current, JSON.stringify({ paused: snapshot.phase !== 'paused' })).catch(() => setMessage('共享暂停状态未确认'));
    }} /><RoomButton label="停止共享" disabled={busy} onPress={() => void stop()} /></> : <RoomButton label="开始共享" disabled={busy || !capability?.available || !socket?.connected} onPress={() => void start()} />}</View>
    <Text style={ui.muted}>应用声音取决于系统允许捕获的内容；本版不采集共享麦克风。</Text>
    {active ? <Text accessibilityLiveRegion="polite" style={ui.muted}>共享期间由原生连接持有房主身份，房间聊天、语音与设置暂不可操作。停止后恢复。</Text> : null}
    {message || snapshot.message || capability?.message ? <Text accessibilityLiveRegion="polite" style={ui.error}>{message || snapshot.message || capability?.message}</Text> : null}
  </Surface>;
}
