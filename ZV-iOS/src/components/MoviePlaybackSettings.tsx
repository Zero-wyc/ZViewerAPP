import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import type { Movie } from '@/lib/sources';
import type { PlaybackPolicy } from '@/lib/media';
import { messageFor } from '@/lib/server';
import { playbackSettingsRetryError, playbackSettingsRetryMode, retryCurrentPlaybackSettings, type PlaybackSettingsRetry } from '@/lib/playbackSettingsRetry';
import { useAppearance } from '@/state/appearance';
import { RoomButton, ui as baseUi } from './RoomUi';

export type SavePlaybackSettings = (movie: Movie, patch: PlaybackPolicy, phase: (value: 'saving' | 'applying') => void) => Promise<void>;
export function MoviePlaybackSettings({ movie, canEdit, current, save }: { movie: Movie; canEdit: boolean; current: boolean; save: SavePlaybackSettings }) {
  const theme = useAppearance(); const ui = theme.styles(baseUi);
  const [status, setStatus] = useState(''); const [error, setError] = useState(''); const lock = useRef(false);
  const [retry, setRetry] = useState<PlaybackSettingsRetry | null>(null);
  const active = useRef(true); useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const busy = status === 'saving' || status === 'applying' || status === 'confirming';
  const kind = movie.source || movie.sourceType;
  if (kind === 'bilibili') return null;
  const change = async (patch: PlaybackPolicy, retrying: PlaybackSettingsRetry | null = null) => {
    if (lock.current || !canEdit) return; lock.current = true; setError(''); setRetry(null); setStatus(retrying ? 'confirming' : 'saving');
    let applying = false;
    const phase = (value: 'saving' | 'applying') => { if (value === 'applying') applying = true; if (active.current) setStatus(retrying && value === 'saving' ? 'confirming' : value); };
    try {
      if (retrying) await retryCurrentPlaybackSettings(retrying, value => save(movie, value, phase));
      else await save(movie, patch, phase);
      if (active.current) setStatus(retrying ? current ? 'confirmed-applied' : 'confirmed' : current ? 'applied' : 'saved');
    }
    catch (failure) {
      if (active.current) {
        const message = messageFor(failure);
        setStatus('failed'); setRetry(retrying || playbackSettingsRetryMode(message, applying));
        setError(retrying ? playbackSettingsRetryError(message) : message);
      }
    }
    finally { lock.current = false; }
  };
  const capsule = (field: 'serverProxy' | 'playsvideoEnabled', label: string, icon: 'server' | 'cpu', enabled: boolean) => <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: enabled, disabled: !canEdit || busy }} disabled={!canEdit || busy} onAccessibilityTap={() => { if (canEdit && !busy) void change({ [field]: !enabled }); }} onPress={() => void change({ [field]: !enabled })} style={{ minHeight: 44, minWidth: 130, flexGrow: 1, justifyContent: 'center' }}>
    <View style={{ minHeight: 32, paddingHorizontal: 10, borderRadius: 18, borderWidth: 1, borderColor: theme.color(enabled ? '#65d59b' : '#343d41'), backgroundColor: enabled ? theme.color('#65d59b', 'backgroundColor') : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 6, opacity: !canEdit || busy ? .55 : 1 }}>
      <Feather name={icon} size={14} color={theme.color(enabled ? '#111417' : '#a8b3b6')} /><Text style={{ flex: 1, textAlign: 'center', fontSize: 13, color: theme.color(enabled ? '#111417' : '#edf1ef') }}>{label}</Text><Feather name="check" size={14} style={{ opacity: enabled ? 1 : 0 }} color={theme.color('#111417')} />
    </View>
  </Pressable>;
  return <View style={{ gap: 6 }}><View style={[ui.row, { alignItems: 'stretch' }]}>
    {['anime', 'kazumi', 'cms'].includes(kind || '') ? capsule('serverProxy', '服务器中转', 'server', movie.serverProxy === true) : null}
    {capsule('playsvideoEnabled', '浏览器转码', 'cpu', movie.playsvideoEnabled !== false)}
  </View><Text style={ui.muted}>iOS 使用 VLC；浏览器转码为其他客户端保存共享偏好。</Text>
    {status ? <Text accessibilityLiveRegion="polite" style={ui.muted}>{({ saving: '正在保存…', confirming: '正在读取服务器当前设置…', applying: '正在应用到当前媒体…', applied: '已保存并应用', saved: '已保存', 'confirmed-applied': '已读取并应用服务器当前设置；上次修改未重新提交', confirmed: '已读取服务器当前设置；上次修改未重新提交', failed: '' } as Record<string, string>)[status]}</Text> : null}
    {error ? <><Text style={ui.error}>{error}</Text>{retry === 'save-unconfirmed' ? <Text style={ui.muted}>本次操作未确认保存成功。请读取服务器当前设置，核对开关后重新操作。</Text> : null}<RoomButton label={retry === 'saved' ? '重试应用服务器当前设置' : current ? '读取并应用服务器当前设置' : '读取服务器当前设置'} secondary disabled={!canEdit || busy} onPress={() => { if (retry) void change({}, retry); }} /></> : null}
  </View>;
}
