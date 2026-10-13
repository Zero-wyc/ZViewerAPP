import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, useWindowDimensions, View } from 'react-native';
import { useSession } from '@/state/session';
import { useAppearance } from '@/state/appearance';
import { biliSelection } from '@/lib/biliSelection';
import { addSelectedBili, biliPartSelection } from '@/lib/biliSelectionFlow';
import { resolveLocalBili, type BiliMedia } from '@/lib/biliNative';
import type { BiliCatalogItem } from '@/lib/biliCatalog';
import type { SourceSelection } from '@/lib/sources';
import { messageFor } from '@/lib/server';
import { BiliAccount } from './BiliAccount';
import { BiliCatalog } from './BiliCatalog';
import { EpisodePicker } from './EpisodePicker';
import { AppDialog } from './AppDialog';
import { RoomButton, RoomIconButton, RoomInput, ui as baseUi } from './RoomUi';

// Watch movies, music queue and associated videos share resolution and P selection.
// Each caller only supplies its destination; native playback URLs stay local.
type PickerProps = {
  active?: boolean; initialUrl?: string; allowPgc?: boolean; allowWholeMovie?: boolean; singleOnly?: boolean;
  onAdd: (value: SourceSelection, playNow: boolean) => Promise<void>; onBusyChange?: (busy: boolean) => void;
};
export function BiliVideoPicker(props: PickerProps) {
  const { session } = useSession();
  return props.active === false ? null : <PickerContent key={`${session?.serverUrl}:${session?.user.id}:${props.initialUrl || ''}`} {...props} />;
}
function PickerContent({ active = true, initialUrl = '', allowPgc = true, allowWholeMovie = false, singleOnly = false, onAdd, onBusyChange }: PickerProps) {
  const theme = useAppearance(); const ui = theme.styles(baseUi); const { width } = useWindowDimensions();
  const [url, setUrl] = useState(initialUrl); const [media, setMedia] = useState<BiliMedia | null>(null);
  const [searchOpen, setSearchOpen] = useState(false); const [wide, setWide] = useState(false);
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState(''); const [error, setError] = useState('');
  const [retryItem, setRetryItem] = useState<BiliCatalogItem | null>(null);
  const generation = useRef(0); const submitting = useRef(false);
  useEffect(() => { const lifecycle = generation; ++lifecycle.current; return () => { ++lifecycle.current; }; }, []);
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  const task = async (work: (current: () => boolean) => Promise<void>) => {
    if (!active || submitting.current) return;
    submitting.current = true; const ticket = ++generation.current; const current = () => ticket === generation.current;
    setBusy(true); setError('');
    try { await work(current); } catch (failure) { if (current()) { setNotice(''); setError(messageFor(failure)); } }
    finally { submitting.current = false; setBusy(false); }
  };
  const select = async (item: BiliCatalogItem) => task(async current => {
    setSearchOpen(false); setMedia(null); setRetryItem(item); setUrl(item.url || `https://www.bilibili.com/video/${item.bvid}`);
    const result = await addSelectedBili(item, { active: current, resolve: resolveLocalBili, add: onAdd, status: value => { if (current()) setNotice(value); } });
    if (current()) { setMedia(result); setRetryItem(null); }
  });
  return <View testID="bili-video-picker" style={{ gap: 12 }}>
    <View style={ui.row}><RoomInput placeholder="视频链接 / BV / ep / ss" value={url} editable={!busy} onChangeText={value => { ++generation.current; setUrl(value); setMedia(null); setNotice(''); setError(''); setRetryItem(null); }} autoCapitalize="none" style={{ flex: 1, minWidth: 110 }} /><RoomButton label="搜索" secondary disabled={busy} onPress={() => setSearchOpen(true)} /></View>
    <RoomButton label={busy ? '正在处理…' : '解析'} disabled={busy || !url.trim()} onPress={() => void task(async current => {
      const parsed = biliSelection(url); if (!allowPgc && (parsed.epId || parsed.seasonId)) throw new Error('一起听播放列表暂不支持番剧身份，请选择普通 B站视频');
      setMedia(null); setNotice('正在解析视频…'); const result = await resolveLocalBili(parsed.url);
      if (current()) { setUrl(parsed.url); setMedia(result); setNotice('解析成功，选择下方分集添加'); }
    })} />
    <BiliAccount compact />
    {media ? <><Text style={ui.muted}>{media.title} · 当前画质 {media.currentQn}</Text>
      {allowWholeMovie && (media.pages?.length || 0) > 1 ? <RoomButton label="添加整部 / 多 P 卡" secondary disabled={busy} onPress={() => void task(async current => { const value = biliPartSelection(url, media, undefined, true); if (current()) await onAdd(value, false); })} /> : null}
      <EpisodePicker key={url} singleOnly={singleOnly} disabled={busy} episodes={(media.pages?.length ? media.pages : [{ page: media.currentPage || 1, cid: media.cid || 0, part: media.title }]).map(part => ({ id: String(part.page), title: `${part.epId ? '第' : 'P'}${part.page}${part.epId ? '集' : ''} · ${part.part}` }))} onAdd={async ids => {
        const added: string[] = [];
        await task(async current => { for (const id of ids) { if (!current()) break; const part = media.pages?.find(value => String(value.page) === id); try { await onAdd(biliPartSelection(url, media, part), false); added.push(id); } catch (failure) { if (current()) setError(messageFor(failure)); } } });
        return added;
      }} />
    </> : null}
    {busy ? <ActivityIndicator color={theme.color('#65d59b')} /> : null}
    {notice ? <Text accessibilityLiveRegion="polite" style={ui.muted}>{notice}</Text> : null}{error ? <Text accessibilityLiveRegion="assertive" style={ui.error}>{error}</Text> : null}
    {error && retryItem ? <RoomButton label="重试添加" secondary disabled={busy} onPress={() => void select(retryItem)} /> : null}
    <AppDialog visible={active && searchOpen} title="搜索 B站视频" maxWidth={wide ? Math.max(280, width - 32) : 960} titleActions={<RoomIconButton label={wide ? '还原弹窗' : '展开搜索'} icon={wide ? 'minimize' : 'maximize'} onPress={() => setWide(value => !value)} />} close={() => { ++generation.current; setSearchOpen(false); }}><BiliCatalog allowPgc={allowPgc} active={active && searchOpen} choose={select} /></AppDialog>
  </View>;
}
