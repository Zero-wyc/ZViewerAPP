import { useAppearance } from '@/state/appearance';
import { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { biliOperation } from '@/lib/nativeBridge';
import { qualities, resetBiliPlayback, setBiliQuality, type BiliStatus } from '@/lib/biliNative';
import { readPreference } from '@/lib/preferences';
import { messageFor } from '@/lib/server';
import { RoomButton, ui as baseUi } from './RoomUi';
export function BiliAccount({ compact = false }: { compact?: boolean }) {
  const theme = useAppearance();
  const ui = theme.styles(baseUi);

  const [status, setStatus] = useState<BiliStatus | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<{ qrcodeKey: string; qrDataUrl: string } | null>(null); const [message, setMessage] = useState(''); const [qn, setQn] = useState(0);
  const [settings, setSettings] = useState(false);
  useEffect(() => { let current = true; void biliOperation<BiliStatus>('start').then(value => { if (current) setStatus(value); }).catch(() => {}); void readPreference('zviewer-bili-quality', { qn: 0 }).then(value => { if (current) setQn(value.qn); }); return () => { current = false; }; }, []);
  useEffect(() => {
    if (!qr) return; let current = true; let pending = false;
    const timer = setInterval(() => { if (pending) return; pending = true; void biliOperation<{ status: number; message: string; loggedIn?: boolean }>('poll', qr.qrcodeKey).then(async value => {
      if (!current) return; setMessage(value.message);
      if (value.loggedIn || value.status === 86038) { setQr(null); if (value.loggedIn) { resetBiliPlayback(); const next = await biliOperation<BiliStatus>('status'); if (current) setStatus(next); } }
    }).catch(failure => { if (current) { setError(messageFor(failure)); setQr(null); } }).finally(() => { pending = false; }); }, 2500);
    return () => { current = false; clearInterval(timer); };
  }, [qr]);
  const task = async (work: () => Promise<void>) => { setBusy(true); setError(''); try { await work(); } catch (failure) { setError(messageFor(failure)); } finally { setBusy(false); } };
  return <View style={ui.card}><Text style={ui.title}>B站登录状态</Text><Text style={ui.text}>{status?.loggedIn ? `${status.user?.name || '已登录'}${status.user?.vipStatus === 1 ? ' · 大会员' : ''}` : '登录 B站后可播放账号有权限的视频'}</Text><View style={ui.row}>{!status?.loggedIn || !compact ? <RoomButton label="扫码登录" disabled={busy} secondary onPress={() => void task(async () => { const value = await biliOperation<{ qrcodeKey: string; qrDataUrl: string }>('qr'); setQr(value); setMessage('请使用哔哩哔哩扫码并确认'); })} /> : null}{status?.loggedIn ? <RoomButton label="退出账号" secondary disabled={busy} onPress={() => void task(async () => { setQr(null); setStatus(await biliOperation<BiliStatus>('logout')); resetBiliPlayback(); })} /> : null}{compact ? <RoomButton label={settings ? '收起画质设置' : '画质设置'} secondary disabled={busy} onPress={() => setSettings(value => !value)} /> : null}</View>{qr ? <Image source={{ uri: qr.qrDataUrl }} style={{ width: 220, height: 220, backgroundColor: 'white' }} /> : null}{message ? <Text style={ui.muted}>{message}</Text> : null}{!compact || settings ? <><Text style={ui.title}>画质 · {qn || '自动最高可用'}</Text><View style={ui.row}>{qualities.map((value, index) => <RoomButton key={value} label={['自动', '8K', '4K', '1080P60', '1080P+', '1080P', '720P60', '720P', '480P', '360P'][index]} secondary disabled={busy || qn === value} onPress={() => void task(async () => { await setBiliQuality(value); setQn(value); })} />)}</View><Text style={ui.muted}>自动选择账号和设备可播放的画质，播放失败时尝试较低画质。</Text></> : null}{error ? <Text style={ui.error}>{error}</Text> : null}</View>;
}
