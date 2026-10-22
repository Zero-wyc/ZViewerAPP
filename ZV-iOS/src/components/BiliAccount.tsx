import { useAppearance } from '@/state/appearance';
import { useEffect, useState } from 'react';
import { AppState, Image, Pressable, Text, View } from 'react-native';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import { biliOperation } from '@/lib/nativeBridge';
import { onBiliChange, resetBiliPlayback, type BiliStatus } from '@/lib/biliNative';
import { messageFor } from '@/lib/server';
import { ui as baseUi } from './RoomUi';
import { AppDialog } from './AppDialog';
import { useMediaPalette } from './MediaPanelUi';
export function BiliAccount({ presentation = 'card', label = 'B站账号', iconOnly = false }: { compact?: boolean; presentation?: 'card' | 'entry'; label?: string; iconOnly?: boolean }) {
  const theme = useAppearance();
  const p = useMediaPalette();
  const ui = theme.styles(baseUi);

  const [status, setStatus] = useState<BiliStatus | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<{ qrcodeKey: string; qrDataUrl: string } | null>(null); const [message, setMessage] = useState('');
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let current = true, revision = 0;
    const refresh = () => {
      const request = ++revision;
      void biliOperation<BiliStatus>('start').then(value => { if (current && request === revision) { setStatus(value); setError(value.loginError || ''); } })
        .catch(failure => { if (current && request === revision) { setStatus(null); setError(messageFor(failure)); } });
    };
    refresh();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    const unsubscribe = onBiliChange(refresh);
    return () => { current = false; subscription.remove(); unsubscribe(); };
  }, [expanded]);
  useEffect(() => {
    if (!qr) return; let current = true; let pending = false;
    const timer = setInterval(() => { if (pending) return; pending = true; void biliOperation<{ status: number; message: string; loggedIn?: boolean }>('poll', qr.qrcodeKey).then(async value => {
      if (!current) return; setMessage(value.message);
      if (value.loggedIn || value.status === 86038) { setQr(null); if (value.loggedIn) { resetBiliPlayback(); const next = await biliOperation<BiliStatus>('status'); if (current) setStatus(next); } }
    }).catch(failure => { if (current) { setError(messageFor(failure)); setQr(null); } }).finally(() => { pending = false; }); }, 2500);
    return () => { current = false; clearInterval(timer); };
  }, [qr]);
  const task = async (work: () => Promise<void>) => { setBusy(true); setError(''); try { await work(); } catch (failure) { setError(messageFor(failure)); } finally { setBusy(false); } };
  const login = () => void task(async () => { const value = await biliOperation<{ qrcodeKey: string; qrDataUrl: string }>('qr'); setQr(value); setMessage('请使用哔哩哔哩扫码并确认'); });
  const logout = () => void task(async () => { setQr(null); setStatus(await biliOperation<BiliStatus>('logout')); resetBiliPlayback(); });
  const refreshStatus = () => void task(async () => { const next = await biliOperation<BiliStatus>('start'); setStatus(next); setError(next.loginError || ''); });
  const accountAction = (text: string, action: () => void) => <Pressable accessibilityRole="button" accessibilityLabel={text} accessibilityState={{ disabled: busy }} disabled={busy} onAccessibilityTap={() => { if (!busy) action(); }} onPress={action} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: p.line, borderRadius: 12, opacity: busy ? .5 : 1 }}><Text style={{ color: p.text, fontSize: 14 }}>{text}</Text></Pressable>;
  const card = <View style={{ gap: 12 }}>
    <Text accessibilityLiveRegion="polite" style={ui.muted}>{status ? `本机 CLI 服务${status.ready ? '已启动' : '未启动'} · ${status.loggedIn ? '已登录' : status.loginError ? '登录待恢复' : '未登录'}` : '正在检查本机 CLI 状态'}</Text>
    {status?.loggedIn ? <><Text style={ui.text}>{status.user?.name || 'B站用户'} · {status.user?.vipStatus === 1 ? '大会员' : '普通账号'}</Text><Text style={[ui.muted, { lineHeight: 21 }]}>默认自动选择本机可播放的最高普通画质；高画质不可用时优先 720p。自动模式排除 HDR 和杜比视界。</Text></> : <Text style={[ui.muted, { lineHeight: 21 }]}>登录后默认自动最高画质。登录凭据加密保存在本机，不发送给 ZViewer 服务器。</Text>}
    <View style={ui.row}>{accountAction(busy ? '处理中…' : status?.loggedIn ? '切换 B站账号' : qr ? '重新获取二维码' : '获取登录二维码', login)}{accountAction('刷新本机状态', refreshStatus)}{status?.loggedIn ? accountAction('退出 B站登录', logout) : null}</View>
    {qr ? <><Image accessibilityLabel="本机 B站登录二维码" source={{ uri: qr.qrDataUrl }} style={{ width: 220, maxWidth: '100%', height: 220, alignSelf: 'center', backgroundColor: 'white' }} /><Text accessibilityLiveRegion="polite" style={ui.muted}>{message}</Text><Text style={[ui.muted, { lineHeight: 20 }]}>可用另一设备扫码；同一手机请截图后在 B站“扫一扫”中从相册识别。</Text></> : null}
    {error ? <Text accessibilityLiveRegion="assertive" style={ui.error}>{error}</Text> : null}
  </View>;
  const openAccount = () => setExpanded(true);
  return presentation === 'entry' ? <View style={iconOnly ? { width: 64, flexShrink: 0 } : { flex: 1, minWidth: 0 }}><Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityValue={{ text: status?.loggedIn ? '已登录' : '未登录' }} accessibilityState={{ expanded }} onAccessibilityTap={openAccount} onPress={openAccount} style={{ minHeight: 46, borderWidth: 1, borderColor: p.line, borderRadius: iconOnly ? 10 : 14, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: iconOnly ? p.field : 'transparent' }}><FontAwesome6 name="bilibili" brand size={iconOnly ? 28 : 19} color={status?.loggedIn ? '#fb7299' : p.text} />{!iconOnly ? <><Text numberOfLines={1} style={{ color: p.text, fontSize: 14, flexShrink: 1 }}>{label}</Text>{status ? <Text style={{ color: status.loggedIn ? theme.dark ? '#ff91b5' : '#c43667' : p.muted, fontSize: 12 }}>{status.loggedIn ? '已登录' : '未登录'}</Text> : null}</> : null}</Pressable><AppDialog visible={expanded} title={label} titleSuffix={status?.loggedIn ? <Text style={{ color: theme.dark ? '#ff91b5' : '#c43667' }}> · 已登录</Text> : null} close={() => { setExpanded(false); setQr(null); }}>{card}</AppDialog></View> : card;
}
