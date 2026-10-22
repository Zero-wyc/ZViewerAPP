import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useSession } from '@/state/session';
import { useAppearance } from '@/state/appearance';
import { readMovieBiliPolicy, applyMovieBiliPolicy, defaultBiliPolicy, qualities, onBiliQualityResolved, type BiliPolicy } from '@/lib/biliNative';
import { moviePlayback, type Movie } from '@/lib/sources';
import { messageFor } from '@/lib/server';
import { RoomButton, ui as baseUi } from './RoomUi';
import { SourceDropdown } from './SourceDropdown';
export function BiliMovieSettings({ movie }: { movie: Movie }) {
  const { session } = useSession();
  if (!session) return null;
  const scope = JSON.stringify([session.serverUrl, session.user.id, session.accessToken, movie.id, moviePlayback(movie).sourceUrl]);
  return <BiliMovieSettingsContent key={scope} movie={movie} />;
}
function BiliMovieSettingsContent({ movie }: { movie: Movie }) {
  const theme = useAppearance(); const ui = theme.styles(baseUi); const { session, request } = useSession();
  const [policy, setPolicy] = useState(defaultBiliPolicy); const [actual, setActual] = useState<number | null>(null); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [dashAllowed, setDashAllowed] = useState(false);
  const [loading, setLoading] = useState(true); const operation = useRef<AbortController | null>(null);
  const mounted = useRef(false); const policyVersion = useRef(0);
  const url = moviePlayback(movie).sourceUrl;
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; operation.current?.abort(); operation.current = null; }; }, []);
  useEffect(() => {
    const cancel = new AbortController(); const version = policyVersion.current;
    const current = () => mounted.current && !cancel.signal.aborted;
    if (session) {
      void readMovieBiliPolicy(session.serverUrl, movie.id).then(value => { if (current() && policyVersion.current === version) setPolicy(value); }).finally(() => { if (current()) setLoading(false); });
      void request<{ settings: { dashDisabled?: boolean } }>('/api/auth/public-settings', { signal: cancel.signal }).then(value => { if (current()) setDashAllowed(value.settings?.dashDisabled === false); }).catch(() => {});
    }
    return () => { cancel.abort(); };
  }, [session, request, movie.id]);
  useEffect(() => onBiliQualityResolved((resolved, qn) => { if (mounted.current && resolved === url) setActual(qn); }), [url]);
  const change = async (patch: Partial<BiliPolicy>) => {
    if (!session || loading || operation.current) return;
    const controller = new AbortController(); operation.current = controller;
    policyVersion.current++;
    const current = () => mounted.current && operation.current === controller && !controller.signal.aborted;
    setBusy(true); setMessage('');
    const next = { ...policy, ...patch, dashAllowed, revision: policy.revision + 1 };
    try {
      const media = await applyMovieBiliPolicy({ url, server: session.serverUrl, token: session.accessToken, movieId: movie.id, policy: next }, controller.signal, current);
      if (current()) { setPolicy(next); setActual(media.currentQn ?? null); }
    } catch (error) { if (current()) setMessage(`切换失败：${messageFor(error)}。保留原画质策略、暂停状态与进度。`); }
    finally { if (operation.current === controller) { operation.current = null; if (mounted.current && !controller.signal.aborted) setBusy(false); } }
  };
  const blocked = busy || loading || !session;
  return <View style={ui.content}><Text style={ui.muted}>本片策略 · 实际画质 {actual ?? '尚未解析'}</Text><View style={ui.row}><RoomButton label={policy.cliEnabled ? '✓ 本机 CLI' : '服务器解析'} secondary disabled={blocked} onPress={() => void change({ cliEnabled: !policy.cliEnabled })} /><RoomButton label={policy.preferMp4 ? 'MP4 优先' : '服务器 DASH'} secondary disabled={blocked || policy.cliEnabled || !dashAllowed} onPress={() => void change({ preferMp4: !policy.preferMp4 })} /></View><SourceDropdown label="影片画质" value={String(policy.qn)} options={qualities.map(qn => ({ id: String(qn), name: ({ 0: '自动', 127: '8K', 120: '4K', 116: '1080P 60帧', 112: '1080P 高码率', 80: '1080P', 74: '720P 60帧', 64: '720P', 32: '480P', 16: '360P' } as Record<number, string>)[qn] }))} disabled={blocked} onChange={value => void change({ qn: Number(value) })} />{!loading && !dashAllowed ? <Text style={ui.muted}>管理员限制服务器 DASH；本机 CLI 可独立解析。</Text> : null}{message ? <Text style={ui.error}>{message}</Text> : null}</View>;
}
