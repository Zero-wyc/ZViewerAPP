import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, Switch, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useSession } from '@/state/session';
import { nativeBridge, type ScreenShareSnapshot } from '@/lib/nativeBridge';
import { emitAck } from '@/lib/socket';
import { screenShareExpiry, isActiveScreenShare, screenShareQualities, screenShareFrameRates } from '@/lib/screenShareSession';
import { useAppearance } from '@/state/appearance';
import { ui as baseUi } from './RoomUi';
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
  const [framesPerSecond, setFramesPerSecond] = useState(30);
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
        server: fresh.serverUrl, roomId, token: fresh.accessToken, expires: screenShareExpiry(fresh.accessToken), systemAudio, quality, framesPerSecond, certificateException,
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
  const p = theme.color('#1463b6'); const surface = theme.color('#0f1720'); const container = theme.color('#19232e');
  const phaseIcon = snapshot.phase === 'sharing' ? 'cast' : snapshot.phase === 'paused' ? 'pause-circle' : snapshot.phase === 'error' ? 'alert-circle' : 'monitor';
  const phaseColor = snapshot.phase === 'sharing' ? '#65d59b' : snapshot.phase === 'error' ? '#ffb4ab' : '#9cdbff';

  return <Surface readable testID="screen-share-host" style={{ padding: 0, gap: 0, minWidth: 0, overflow: 'hidden' }}>
    {/* 头部状态区 */}
    <View style={{ padding: 20, gap: 14, backgroundColor: container, borderBottomWidth: 1, borderColor: theme.color('#ffffff12') }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: surface, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name={phaseIcon} size={26} color={phaseColor} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Text style={[ui.title, { fontSize: 19, fontWeight: '600' }]}>屏幕共享</Text>
          <Text style={[ui.muted, { fontSize: 14 }]}>{labels[snapshot.phase]}</Text>
        </View>
        {busy || active && !['sharing', 'paused'].includes(snapshot.phase) ? <ActivityIndicator color={phaseColor} /> : null}
      </View>

      {/* 共享状态指示器 */}
      {snapshot.phase === 'sharing' || snapshot.phase === 'paused' ? (
        <View style={{ paddingTop: 8, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="users" size={15} color={theme.color('#a8b3b6')} />
              <Text style={[ui.text, { fontSize: 14 }]}>{snapshot.viewers || 0} / 2 观众</Text>
            </View>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="activity" size={15} color={theme.color('#a8b3b6')} />
              <Text style={[ui.text, { fontSize: 14 }]}>{snapshot.capturedFrames || 0} 帧</Text>
            </View>
          </View>
          {snapshot.width && snapshot.height ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="monitor" size={15} color={theme.color('#a8b3b6')} />
              <Text style={[ui.muted, { fontSize: 13 }]}>
                {snapshot.width} × {snapshot.height} @ {snapshot.framesPerSecond || 30} fps
                {snapshot.audioSamples ? ' · 含应用声音' : ''}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>

    {/* 设置区域 */}
    <View style={{ padding: 20, gap: 18 }}>
      {/* 应用声音开关 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 14, backgroundColor: container, borderRadius: 14, minHeight: 56 }}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[ui.text, { fontSize: 15, fontWeight: '500' }]}>应用声音</Text>
          <Text style={[ui.muted, { fontSize: 12 }]}>捕获系统允许的应用音频</Text>
        </View>
        <Switch
          accessibilityLabel="共享应用声音"
          value={systemAudio}
          disabled={busy || active && snapshot.phase === 'requesting-permission'}
          trackColor={{ true: p, false: theme.color('#43566b') }}
          thumbColor="#fff"
          onValueChange={value => {
            setSystemAudio(value);
            if (current.current) void nativeBridge?.screenShareControl?.(current.current, JSON.stringify({ systemAudio: value })).catch(() => setMessage('应用声音设置未生效'));
          }}
        />
      </View>

      {/* 分辨率设置 */}
      <View style={{ gap: 10 }}>
        <Text style={[ui.text, { fontSize: 14, fontWeight: '500' }]}>分辨率上限</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {screenShareQualities.map(value => {
            const selected = quality === value;
            return <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: active || busy }}
              disabled={active || busy}
              onPress={() => setQuality(value)}
              style={{
                flex: 1,
                minHeight: 44,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 12,
                backgroundColor: selected ? p : container,
                borderWidth: 1,
                borderColor: selected ? p : theme.color('#ffffff18'),
                opacity: active || busy ? 0.5 : 1
              }}
            >
              <Text style={{ color: selected ? '#fff' : theme.color('#a8b3b6'), fontSize: 15, fontWeight: selected ? '600' : '400' }}>
                {value}
              </Text>
            </Pressable>;
          })}
        </View>
      </View>

      {/* 帧率设置 */}
      <View style={{ gap: 10 }}>
        <Text style={[ui.text, { fontSize: 14, fontWeight: '500' }]}>帧率上限</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {screenShareFrameRates.map(value => {
            const selected = framesPerSecond === value;
            return <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: active || busy }}
              disabled={active || busy}
              onPress={() => setFramesPerSecond(value)}
              style={{
                flex: 1,
                minHeight: 44,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 12,
                backgroundColor: selected ? p : container,
                borderWidth: 1,
                borderColor: selected ? p : theme.color('#ffffff18'),
                opacity: active || busy ? 0.5 : 1
              }}
            >
              <Text style={{ color: selected ? '#fff' : theme.color('#a8b3b6'), fontSize: 15, fontWeight: selected ? '600' : '400' }}>
                {value} fps
              </Text>
            </Pressable>;
          })}
        </View>
      </View>

      {/* 操作按钮 */}
      <View style={{ flexDirection: 'row', gap: 10, paddingTop: 8 }}>
        {active ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={snapshot.phase === 'paused' ? '恢复共享' : '暂停共享'}
              disabled={!['sharing', 'paused'].includes(snapshot.phase)}
              onPress={() => {
                if (!['sharing', 'paused'].includes(snapshot.phase)) return;
                void nativeBridge?.screenShareControl?.(current.current, JSON.stringify({ paused: snapshot.phase !== 'paused' })).catch(() => setMessage('共享暂停状态未确认'));
              }}
              style={{
                flex: 1,
                minHeight: 50,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 14,
                backgroundColor: container,
                borderWidth: 1,
                borderColor: theme.color('#ffffff18')
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name={snapshot.phase === 'paused' ? 'play' : 'pause'} size={18} color={theme.color('#a8b3b6')} />
                <Text style={{ color: theme.color('#a8b3b6'), fontSize: 16, fontWeight: '500' }}>
                  {snapshot.phase === 'paused' ? '恢复' : '暂停'}
                </Text>
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="停止共享"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={() => void stop()}
              style={{
                flex: 1,
                minHeight: 50,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 14,
                backgroundColor: '#d32f2f',
                opacity: busy ? 0.6 : 1
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="square" size={18} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>停止共享</Text>
              </View>
            </Pressable>
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="开始共享"
            accessibilityState={{ disabled: busy || !capability?.available || !socket?.connected }}
            disabled={busy || !capability?.available || !socket?.connected}
            onPress={() => void start()}
            style={{
              flex: 1,
              minHeight: 50,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 14,
              backgroundColor: p,
              opacity: busy || !capability?.available || !socket?.connected ? 0.5 : 1
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Feather name="cast" size={20} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '600' }}>开始共享</Text>
            </View>
          </Pressable>
        )}
      </View>

      {/* 提示信息 */}
      <View style={{ paddingTop: 4, gap: 10 }}>
        {!active ? (
          <View style={{ flexDirection: 'row', gap: 10, padding: 12, backgroundColor: theme.color('#0a0f16'), borderRadius: 12, borderLeftWidth: 3, borderLeftColor: '#9cdbff' }}>
            <Feather name="info" size={16} color="#9cdbff" style={{ marginTop: 2 }} />
            <Text style={[ui.muted, { flex: 1, fontSize: 13, lineHeight: 19 }]}>
              应用声音取决于系统允许捕获的内容，不包含麦克风音频
            </Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10, padding: 12, backgroundColor: theme.color('#0a0f16'), borderRadius: 12, borderLeftWidth: 3, borderLeftColor: '#ffd54f' }}>
            <Feather name="alert-triangle" size={16} color="#ffd54f" style={{ marginTop: 2 }} />
            <Text style={[ui.muted, { flex: 1, fontSize: 13, lineHeight: 19 }]}>
              共享期间由原生连接持有房主身份，聊天、语音与设置暂不可用，停止后恢复
            </Text>
          </View>
        )}
        {(message || snapshot.message || capability?.message) ? (
          <View style={{ flexDirection: 'row', gap: 10, padding: 12, backgroundColor: theme.color('#3d1215'), borderRadius: 12, borderLeftWidth: 3, borderLeftColor: '#ffb4ab' }}>
            <Feather name="alert-circle" size={16} color="#ffb4ab" style={{ marginTop: 2 }} />
            <Text accessibilityLiveRegion="polite" style={[ui.error, { flex: 1, fontSize: 13, lineHeight: 19 }]}>
              {message || snapshot.message || capability?.message}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  </Surface>;
}
