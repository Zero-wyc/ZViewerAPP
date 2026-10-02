import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useSession } from '@/state/session';
import { useAppearance } from '@/state/appearance';
import { readMovieBiliPolicy, saveMovieBiliPolicy, defaultBiliPolicy, qualities, resolveLocalBili, resolveServerBili, onBiliQualityResolved, type BiliPolicy } from '@/lib/biliNative';
import { moviePlayback, type Movie } from '@/lib/sources';
import { RoomButton, ui as baseUi } from './RoomUi';
export function BiliMovieSettings({ movie }: { movie: Movie }) {
  const theme = useAppearance(); const ui = theme.styles(baseUi); const { session, request } = useSession();
  const [policy, setPolicy] = useState(defaultBiliPolicy); const [actual, setActual] = useState<number | null>(null); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [dashAllowed, setDashAllowed] = useState(false);
  useEffect(() => { let active = true; if (session) void readMovieBiliPolicy(session.serverUrl, movie.id).then(value => { if (active) setPolicy(value); }); void request<{ settings: { dashDisabled?: boolean } }>('/api/auth/public-settings').then(value => { if (active) setDashAllowed(value.settings?.dashDisabled === false); }).catch(() => {}); return () => { active = false; }; }, [session, request, movie.id]);
  useEffect(() => onBiliQualityResolved((url, qn) => { if (url === moviePlayback(movie).sourceUrl) setActual(qn); }), [movie]);
  const change = async (patch: Partial<BiliPolicy>) => {
    if (!session) return; setBusy(true); setMessage('');
    const next = { ...policy, ...patch, dashAllowed, revision: policy.revision + 1 };
    try {
      const url = moviePlayback(movie).sourceUrl;
      if (next.cliEnabled) { const media = await resolveLocalBili(url, `${session.serverUrl}:${movie.id}`, next); setActual(media.currentQn); }
      else { await resolveServerBili(url, session.serverUrl, session.accessToken, next); setActual(null); }
      await saveMovieBiliPolicy(session.serverUrl, movie.id, next); setPolicy(next);
    } catch { setMessage('切换失败，保留原画质策略、暂停状态与进度。CLI 需要本机登录。'); }
    finally { setBusy(false); }
  };
  return <View style={ui.content}><Text style={ui.muted}>本片策略 · 实际画质 {actual ?? '尚未解析'}</Text><View style={ui.row}><RoomButton label={policy.cliEnabled ? '✓ 本机 CLI' : '服务器解析'} secondary disabled={busy} onPress={() => void change({ cliEnabled: !policy.cliEnabled })} /><RoomButton label={policy.preferMp4 ? 'MP4 优先' : '服务器 DASH'} secondary disabled={busy || policy.cliEnabled || !dashAllowed} onPress={() => void change({ preferMp4: !policy.preferMp4 })} /></View><View style={ui.row}>{qualities.map(qn => <RoomButton key={qn} label={qn === 0 ? '自动' : `${qn}`} secondary disabled={busy || policy.qn === qn} onPress={() => void change({ qn })} />)}</View>{!dashAllowed ? <Text style={ui.muted}>管理员限制服务器 DASH；本机 CLI 可独立解析。</Text> : null}{message ? <Text style={ui.error}>{message}</Text> : null}</View>;
}
