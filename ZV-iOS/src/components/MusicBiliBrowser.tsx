import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSession } from '@/state/session';
import { useAppearance } from '@/state/appearance';
import { normalizeBiliCatalog, biliCount, type BiliCatalogItem } from '@/lib/biliCatalog';
import { biliPartSelection, biliMusicItem } from '@/lib/biliSelectionFlow';
import { resolveInputBili, defaultBiliPolicy } from '@/lib/biliNative';
import { formatTime } from '@/lib/sources';
import { messageFor } from '@/lib/server';
import type { Song } from '@/lib/musicCollection';
import { AppDialog } from './AppDialog';
import { BiliVideoPicker } from './BiliVideoPicker';
import { SourcePoster } from './SourcePoster';
import { RoomInput, ui as baseUi } from './RoomUi';
import { MusicButton as RoomButton, MusicIcon as RoomIconButton, MusicSection, useMusicColors } from './MusicUi';

type Query = { kind: 'ranking' | 'search' | 'favorites'; keyword: string; page: number; folder: number };
type Folder = { id: number; title: string };
type Result = { items?: Record<string, unknown>[]; total?: number; folders?: Folder[] };
const initialQuery: Query = { kind: 'ranking', keyword: '', page: 1, folder: 0 };

// Read the same NAS music routes as the Android/Harmony music page. Playback
// still uses the shared native/server account boundary and canonical BV/CID.
export function MusicBiliBrowser({ add, play, searchRequest }: { searchRequest?: { id: number; keyword?: string }; add: (song: Song) => Promise<void>; play: (song: Song) => Promise<void> }) {
  const { session, request } = useSession(); const theme = useAppearance(); const ui = theme.styles(baseUi); const colors = useMusicColors();
  const [query, setQuery] = useState(initialQuery); const [keyword, setKeyword] = useState(''); const [searchOpen, setSearchOpen] = useState(false);
  const [items, setItems] = useState<BiliCatalogItem[]>([]); const [folders, setFolders] = useState<Folder[]>([]); const [total, setTotal] = useState<number | null>(null);
  const [busy, setBusy] = useState(false); const [choosing, setChoosing] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [version, setVersion] = useState(0); const [picker, setPicker] = useState(false); const [width, setWidth] = useState(320);
  const selection = useRef<AbortController | null>(null); const scope = `${session?.serverUrl}:${session?.user.id}`;
  useEffect(() => () => { selection.current?.abort(); }, [scope]);
  useEffect(() => {
    if (!searchRequest) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      setSearchOpen(true);
      if (searchRequest.keyword?.trim()) { setKeyword(searchRequest.keyword); setQuery({ ...initialQuery, kind: 'search', keyword: searchRequest.keyword.trim() }); }
    });
    return () => { active = false; };
  }, [searchRequest]);
  useEffect(() => {
    const cancel = new AbortController();
    void Promise.resolve().then(async () => {
      if (cancel.signal.aborted) return; setBusy(true); setError(''); setItems([]);
      try {
        const params = new URLSearchParams({ pn: String(query.page), ps: '20' });
        let path = '/api/stream/bilibili/region-new';
        if (query.kind === 'ranking') params.set('rid', '3');
        if (query.kind === 'search') { path = '/api/stream/bilibili/search'; params.set('keyword', query.keyword); params.set('mode', 'search'); }
        if (query.kind === 'favorites') { path = '/api/stream/bilibili/fav-videos'; if (query.folder) params.set('mediaId', String(query.folder)); }
        const requests = await Promise.allSettled([
          request<Result>(`${path}?${params}`, { signal: cancel.signal }),
          query.kind === 'favorites' ? request<Result>('/api/stream/bilibili/fav-folders', { signal: cancel.signal }) : Promise.resolve({ folders: [] } as Result),
        ]);
        if (cancel.signal.aborted) return;
        if (requests[1].status === 'fulfilled') setFolders(requests[1].value.folders || []);
        if (requests[0].status === 'rejected') throw requests[0].reason;
        const data = requests[0].value; setItems(normalizeBiliCatalog(data as Record<string, unknown>, 'search', false)); setTotal(Number.isFinite(data.total) ? data.total! : null);
      } catch (failure) { if (!cancel.signal.aborted) setError(messageFor(failure)); }
      finally { if (!cancel.signal.aborted) setBusy(false); }
    });
    return () => cancel.abort();
  }, [query, request, scope, version]);
  const choose = useCallback(async (item: BiliCatalogItem, immediately: boolean) => {
    if (!session || selection.current) return;
    const cancel = new AbortController(); selection.current = cancel; setChoosing(true); setNotice('正在解析视频…'); setError('');
    try {
      const url = new URL(item.url || `https://www.bilibili.com/video/${item.bvid}`); if (item.cid) url.searchParams.set('cid', String(item.cid));
      const media = await resolveInputBili(url.toString(), session.serverUrl, session.accessToken, defaultBiliPolicy, cancel.signal);
      if (cancel.signal.aborted) return;
      const song = biliMusicItem({ ...biliPartSelection(url.toString(), media), title: item.title || media.title, cover: item.cover }); song.artist = item.author || '哔哩哔哩';
      setNotice(immediately ? '正在添加并播放…' : '正在加入队列…'); await (immediately ? play(song) : add(song));
      if (!cancel.signal.aborted) setNotice(immediately ? '已提交播放' : '已提交加入队列');
    } catch (failure) { if (!cancel.signal.aborted) { setNotice(''); setError(messageFor(failure)); } }
    finally { if (selection.current === cancel) { selection.current = null; if (!cancel.signal.aborted) setChoosing(false); } }
  }, [session, play, add]);
  const blocked = busy || choosing; const gap = 14; const columns = Math.max(1, Math.min(4, Math.floor((width + gap) / (150 + gap)))); const cardWidth = Math.floor((width - gap * (columns - 1)) / columns);
  const chip = (label: string, selected: boolean, action: () => void) => <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected, disabled: blocked }} disabled={blocked} onPress={action} style={{ minHeight: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: theme.dark ? selected ? '#40504a' : '#273231' : selected ? '#d2dfe9' : '#e8edf3', justifyContent: 'center' }}><Text style={ui.text}>{label}</Text></Pressable>;
  const tab = (label: string, selected: boolean, action: () => void) => <Pressable accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected, disabled: blocked }} disabled={blocked} onPress={action} style={{ minHeight: 44, paddingHorizontal: 4, justifyContent: 'center', borderBottomWidth: selected ? 2 : 0, borderColor: theme.color('#65d59b') }}><Text style={[ui.text, { fontSize: 18, fontWeight: selected ? '700' : '500' }]}>{label}</Text></Pressable>;
  return <View testID="music-bili-browser" style={{ gap: 18 }} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <MusicSection label="BILIBILI" />
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text style={{ color: colors.text, fontWeight: '700', fontSize: 22 }}>哔哩哔哩</Text>{tab('音乐分区', query.kind !== 'favorites', () => setQuery(initialQuery))}{tab('我的收藏', query.kind === 'favorites', () => setQuery({ ...initialQuery, kind: 'favorites' }))}<View style={{ flex: 1 }} /><RoomIconButton label="解析 B站音乐链接" icon="plus" onPress={() => setPicker(true)} /></View>
    {searchOpen ? <View style={ui.row}><RoomInput accessibilityLabel="B站音乐关键词" placeholder="搜索 B站音乐" value={keyword} onChangeText={setKeyword} style={{ flex: 1, minWidth: 130 }} onSubmitEditing={() => { if (keyword.trim() && !blocked) setQuery({ ...initialQuery, kind: 'search', keyword: keyword.trim() }); }} /><RoomButton label="搜索" disabled={blocked || !keyword.trim()} onPress={() => setQuery({ ...initialQuery, kind: 'search', keyword: keyword.trim() })} /></View> : null}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ flex: 1, minWidth: 0 }}>{query.kind !== 'favorites' ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>{chip('推荐榜单', query.kind === 'ranking', () => setQuery(initialQuery))}{['中术', '华语音乐', '古典音乐'].map(label => chip(label, query.kind === 'search' && query.keyword === label, () => setQuery({ ...initialQuery, kind: 'search', keyword: label })))}</ScrollView> : <><Text style={ui.muted}>服务端 B站账号的收藏夹</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>{folders.map(folder => chip(folder.title, query.folder === folder.id, () => setQuery({ ...initialQuery, kind: 'favorites', folder: folder.id })))}</ScrollView></>}</View></View>
    {blocked ? <View style={ui.row}><ActivityIndicator color={theme.color('#65d59b')} /><Text accessibilityLiveRegion="polite" style={ui.muted}>{choosing ? notice : '正在获取音乐视频…'}</Text></View> : null}
    {!blocked && notice ? <Text accessibilityLiveRegion="polite" style={ui.muted}>{notice}</Text> : null}
    {error ? <View style={{ gap: 8 }}><Text accessibilityLiveRegion="assertive" style={ui.error}>{error}</Text><RoomButton label="重试获取" secondary disabled={blocked} onPress={() => setVersion(value => value + 1)} /></View> : null}
    {!busy && !error && !items.length ? <Text style={ui.muted}>{query.kind === 'favorites' ? '当前收藏夹没有可用视频；收藏来自服务端 B站账号。' : '没有找到音乐视频，可换个分类或搜索关键词。'}</Text> : null}
    <View testID="music-bili-grid" style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: gap, rowGap: 24, alignItems: 'flex-start' }}>{items.map(item => <View key={item.bvid} style={{ width: cardWidth, gap: 7 }}><View style={{ width: cardWidth, height: cardWidth * 9 / 16 }}><Pressable accessibilityRole="button" accessibilityLabel={`播放 ${item.title}`} disabled={blocked} onPress={() => void choose(item, true)}><SourcePoster uri={item.cover} width={cardWidth} height={cardWidth * 9 / 16} /><View pointerEvents="none" style={{ position: 'absolute', top: 6, left: 7, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, backgroundColor: '#0007' }}><Text style={{ color: '#fff', fontSize: 11, fontWeight: '500' }}>▷ {biliCount(item.play)}</Text></View><View pointerEvents="none" style={{ position: 'absolute', right: 7, bottom: 7, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 3, backgroundColor: '#0009' }}><Text style={{ color: '#fff', fontSize: 11, fontVariant: ['tabular-nums'] }}>{formatTime(item.duration || 0)}</Text></View></Pressable><View style={{ position: 'absolute', bottom: 3, right: 51 }}><RoomIconButton label={`添加到队列 ${item.title}`} icon="plus" iconSize={18} color="#fff" disabled={blocked} style={{ width: 30, height: 30, borderRadius: 7, backgroundColor: '#0008' }} onPress={() => void choose(item, false)} /></View></View><Text numberOfLines={2} style={{ color: colors.text, fontSize: 15, lineHeight: 21, height: 42, fontWeight: '500' }}>{item.title}</Text><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12, lineHeight: 18, height: 18 }}>{item.author || '哔哩哔哩'}</Text></View>)}</View>
    {items.length ? <View style={ui.row}><RoomButton label="上一页" secondary disabled={blocked || query.page <= 1} onPress={() => setQuery(current => ({ ...current, page: current.page - 1 }))} /><Text style={ui.muted}>第 {query.page} 页{total === null ? '' : ` · 共 ${total} 条`}</Text><RoomButton label="下一页" secondary disabled={blocked || (total === null ? items.length < 20 : query.page * 20 >= total)} onPress={() => setQuery(current => ({ ...current, page: current.page + 1 }))} /><RoomIconButton label="刷新音乐视频" icon="refresh-cw" onPress={() => setVersion(value => value + 1)} /></View> : null}
    <AppDialog visible={picker} title="添加 B站音乐" close={() => setPicker(false)}><BiliVideoPicker active={picker} allowPgc={false} onAdd={async (value, immediately) => { const song = biliMusicItem(value); await (immediately ? play(song) : add(song)); setPicker(false); }} /></AppDialog>
  </View>;
}
