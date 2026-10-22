import { useEffect, useRef, useState } from 'react';
import { Image, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useSession } from '@/state/session';
import { useAppearance } from '@/state/appearance';
import { messageFor } from '@/lib/server';
import { AppDialog } from './AppDialog';
import { RoomButton, ui as baseUi } from './RoomUi';
import { useMediaPalette } from './MediaPanelUi';

export function BiliServerAccount() {
  const { request } = useSession(); const theme = useAppearance(); const ui = theme.styles(baseUi); const p = useMediaPalette();
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [qr, setQr] = useState<{ qrcodeKey: string; qrDataUrl: string } | null>(null); const [message, setMessage] = useState('');
  const operation = useRef<AbortController | null>(null); const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true; const cancel = new AbortController();
    void request<{ loggedIn: boolean }>('/api/stream/bilibili/login-status', { signal: cancel.signal }).then(value => { if (!cancel.signal.aborted) setLoggedIn(value.loggedIn === true); }).catch(() => {});
    return () => { mounted.current = false; cancel.abort(); operation.current?.abort(); };
  }, [request]);
  useEffect(() => {
    if (!qr) return; const cancel = new AbortController(); let pending = false; const expires = Date.now() + 180000;
    const timer = setInterval(() => {
      if (pending || cancel.signal.aborted) return;
      if (Date.now() > expires) { setMessage('二维码已过期，请关闭后重新获取'); clearInterval(timer); return; }
      pending = true;
      void request<{ status: number; message?: string; loggedIn: boolean }>(`/api/stream/bilibili/qr/poll?${new URLSearchParams({ qrcode_key: qr.qrcodeKey })}`, { signal: cancel.signal }).then(value => {
        if (cancel.signal.aborted) return;
        setMessage(value.message || ['请使用哔哩哔哩扫码', '已扫码，请在手机上确认', '已登录', '二维码已过期'][value.status] || '等待扫码');
        if (value.loggedIn) { setLoggedIn(true); setQr(null); }
        else if (value.status === 3) clearInterval(timer);
      }).catch(failure => { if (!cancel.signal.aborted) { setMessage(messageFor(failure)); clearInterval(timer); } }).finally(() => { pending = false; });
    }, 2500);
    return () => { cancel.abort(); clearInterval(timer); };
  }, [qr, request]);
  const task = async (work: (signal: AbortSignal) => Promise<void>) => {
    if (busy) return; operation.current?.abort(); const controller = new AbortController(); operation.current = controller; setBusy(true); setError('');
    try { await work(controller.signal); } catch (failure) { if (!controller.signal.aborted && mounted.current) setError(messageFor(failure)); }
    finally { if (mounted.current) setBusy(false); }
  };
  return <View style={{ gap: 9, paddingTop: 8 }}><View style={ui.row}><Feather name="file-text" size={17} color={p.accent} /><Text style={ui.muted}>服务端 B站账号</Text></View>
    <View style={ui.row}>{loggedIn ? <><Text style={ui.text}>已登录服务端账号</Text><RoomButton label="退出服务端账号" secondary disabled={busy} onPress={() => void task(async signal => { await request('/api/stream/bilibili/logout', { method: 'POST', signal }); if (!signal.aborted) setLoggedIn(false); })} /></> : <RoomButton label={busy ? '正在获取二维码…' : '登录服务端 B站账号'} secondary disabled={busy} onPress={() => void task(async signal => { const value = await request<{ qrcodeKey: string; qrDataUrl: string }>('/api/stream/bilibili/qr', { signal }); if (signal.aborted) return; if (!value.qrcodeKey || !value.qrDataUrl?.startsWith('data:image/')) throw new Error('服务器未返回有效的登录二维码，请重试'); setMessage('请使用哔哩哔哩扫码并确认'); setQr(value); })} />}</View>
    <Text style={ui.muted}>{loggedIn ? '已登录服务端账号，画质取决于账号权限与源站返回。' : '服务端未登录时可能只能解析低画质或试看片段。'}</Text>
    {error ? <Text style={ui.error}>{error}</Text> : null}
    <AppDialog visible={!!qr} title="登录服务端 B站账号" close={() => setQr(null)}><Text style={ui.muted}>扫码后账号保存在当前服务器，供此服务器账号解析普通视频。</Text>{qr ? <Image accessibilityLabel="服务端 B站登录二维码" source={{ uri: qr.qrDataUrl }} style={{ width: 220, height: 220, alignSelf: 'center', backgroundColor: '#fff' }} /> : null}<Text accessibilityLiveRegion="polite" style={ui.text}>{message}</Text></AppDialog>
  </View>;
}
