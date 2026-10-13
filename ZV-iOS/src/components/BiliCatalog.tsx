import { useAppearance } from '@/state/appearance';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, Text, View } from 'react-native';
import { biliOperation, nativeBridge } from '@/lib/nativeBridge';
import { resolveLocalBili } from '@/lib/biliNative';
import { biliCount, biliGrid, chooseBiliPage, normalizeBiliCatalog, type BiliCatalogItem, type BiliView } from '@/lib/biliCatalog';
import { formatTime } from '@/lib/sources';
import { useSession } from '@/state/session';
import { messageFor } from '@/lib/server';
import { RoomButton, RoomInput, ui as baseUi } from './RoomUi';
import { SourceDropdown } from './SourceDropdown';
import { SourcePoster } from './SourcePoster';

type Container = { id: number; title: string; season_id?: number };
export function BiliCatalog({ choose, allowPgc = false, active = true }: { allowPgc?: boolean; active?: boolean; choose: (item: BiliCatalogItem) => void | Promise<void> }) {
  const theme = useAppearance(); const ui = theme.styles(baseUi); const { request } = useSession();
  const generation = useRef(0); useEffect(() => { const lifecycle = generation; ++lifecycle.current; return () => { ++lifecycle.current; }; }, [active]);
  const [detail, setDetail] = useState<{ item: BiliCatalogItem; view: BiliView } | null>(null);
  const [keyword, setKeyword] = useState(''); const [searchKind, setSearchKind] = useState('search'); const [kind, setKind] = useState('search');
  const [items, setItems] = useState<BiliCatalogItem[]>([]); const [groups, setGroups] = useState<Container[]>([]); const [total, setTotal] = useState<number | null>(null);
  const [groupKind, setGroupKind] = useState(''); const [id, setId] = useState(0); const [page, setPage] = useState(1); const [busy, setBusy] = useState(false); const [hasNext, setHasNext] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [collection, setCollection] = useState(''); const [more, setMore] = useState(false);
  const [containerWidth, setContainerWidth] = useState(300); const grid = biliGrid(containerWidth);
  const load = async (next: string, pn = 1, value = 0) => {
    const ticket = ++generation.current; Keyboard.dismiss(); setDetail(null); setBusy(true); setError(''); setNotice('正在搜索…');
    try {
      const params: Record<string, unknown> = { kind: next, keyword, page: pn, id: value };
      if (next === 'collection') { const url = new URL(collection); params.mid = Number(url.pathname.split('/')[1]); params.id = Number(url.searchParams.get('sid') || url.searchParams.get('season_id') || url.pathname.match(/lists\/(\d+)/)?.[1]); if (!/^(space\.)?bilibili\.com$/.test(url.hostname) || !params.mid || !params.id) throw new Error('请填写有效的 B站合集链接'); }
      let data: Record<string, unknown>;
      if (nativeBridge) data = (await biliOperation<{ data: Record<string, unknown> }>('catalog', JSON.stringify(params))).data;
      else if (next === 'search') data = await request(`/api/stream/bilibili/search?${new URLSearchParams({ keyword: keyword.trim(), pn: String(pn), mode: 'search' })}`);
      else throw new Error('番剧及个人栏目需要包含本机 B站模块的安装包');
      if (ticket !== generation.current) return;
      setKind(next); setPage(pn); setId(value); setNotice('');
      const count = Number(data.numResults ?? data.total); const pageSize = Number(data.pagesize ?? data.page_size ?? (next === 'following' ? 15 : 20));
      setHasNext(!Number.isFinite(count) || pn * pageSize < count);
      if (next === 'folders' || next === 'following') { setGroups(((data.list || []) as Container[]).map(item => ({ id: item.season_id || item.id, title: item.title }))); setGroupKind(next === 'folders' ? 'favorites' : 'episodes'); setItems([]); setTotal(null); }
      else { setGroups([]); const result = normalizeBiliCatalog(data, next, allowPgc); setItems(result); const count = Number(data.numResults ?? data.total); setTotal(Number.isFinite(count) ? count : null); if (!result.length) setNotice('没有找到匹配的视频'); }
    } catch (failure) { if (ticket === generation.current) { setNotice(''); setError(messageFor(failure)); } }
    finally { setBusy(false); }
  };
  const select = async (item: BiliCatalogItem, view: BiliView, part?: NonNullable<BiliView['pages']>[number]) => {
    setBusy(true); setError(''); setNotice('正在解析并添加…');
    try { await choose(chooseBiliPage(item, view, part)); setNotice('已选择，正在准备播放'); }
    catch (failure) { setNotice(''); setError(messageFor(failure)); }
    finally { setBusy(false); }
  };
  const expand = async (item: BiliCatalogItem) => {
    const ticket = ++generation.current; setBusy(true); setError(''); setNotice('正在获取分集…');
    try {
      let view: BiliView;
      if (item.epId || item.seasonId) view = await resolveLocalBili(item.url!);
      else {
        try { if (!nativeBridge) throw new Error('preview'); view = (await biliOperation<{ data: BiliView }>('catalog', JSON.stringify({ kind: 'view', bvid: item.bvid }))).data; }
        catch { view = await request<BiliView>(`/api/stream/bilibili/view?bvid=${encodeURIComponent(item.bvid)}`); }
      }
      if (ticket !== generation.current) return;
      if ((view.pages?.length || 0) > 1) { setDetail({ item, view }); setNotice('选择分集后直接添加播放'); }
      else await select(item, view);
    } catch (failure) { if (ticket === generation.current) { setNotice(''); setError(messageFor(failure)); } }
    finally { setBusy(false); }
  };
  return <View style={{ gap: 12 }} onLayout={event => setContainerWidth(event.nativeEvent.layout.width)}>
    {detail ? <>
      <RoomButton label="返回搜索结果" secondary disabled={busy} onPress={() => { setDetail(null); setNotice(''); }} />
      <View style={ui.row}><SourcePoster uri={detail.item.cover} width={140} naturalRatio /><Text style={[ui.text, { flex: 1 }]}>{detail.view.title}</Text></View>
      <Text style={ui.muted}>共 {detail.view.pages?.length} {detail.item.epId || detail.item.seasonId ? '集' : 'P'} · 选择后添加播放</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: grid.gap }}>{detail.view.pages?.map(part => <View key={part.page} style={{ width: grid.width }}><RoomButton label={`${part.epId ? '第' : 'P'}${part.page}${part.epId ? '集' : ''} · ${part.part}`} secondary disabled={busy} onPress={() => void select(detail.item, detail.view, part)} /></View>)}</View>
    </> : <>
      <View style={ui.row}><RoomInput value={keyword} onChangeText={setKeyword} placeholder="搜索 B站视频" style={{ flex: 1, minWidth: 110 }} onSubmitEditing={() => { if (!busy && keyword.trim()) void load(searchKind); }} /><RoomButton label="搜索" disabled={busy || !keyword.trim()} onPress={() => void load(searchKind)} /></View>
      <View style={ui.row}>{allowPgc ? <View style={{ flex: 1, minWidth: 130 }}><SourceDropdown label="搜索类型" value={searchKind} options={[{ id: 'search', name: '视频' }, { id: 'search-bangumi', name: '番剧' }, { id: 'search-ft', name: '影视' }]} disabled={busy} onChange={setSearchKind} /></View> : null}<RoomButton label={more ? '收起栏目' : '我的栏目'} secondary disabled={busy} onPress={() => setMore(value => !value)} /></View>
      {more ? <View style={ui.card}><View style={ui.row}>{[{ id: 'recommended', name: '推荐视频' }, { id: 'folders', name: '我的收藏' }, { id: 'following', name: '关注番剧' }].map(value => <RoomButton key={value.id} label={value.name} secondary disabled={busy} onPress={() => void load(value.id)} />)}</View><RoomInput value={collection} onChangeText={setCollection} autoCapitalize="none" placeholder="B站合集链接" /><RoomButton label="浏览合集" secondary disabled={busy || !collection} onPress={() => void load('collection')} /></View> : null}
      {groups.map(item => <RoomButton key={item.id} label={item.title} secondary disabled={busy} onPress={() => void load(groupKind, 1, item.id)} />)}
      {items.length ? <Text style={ui.muted}>{total == null ? `本页 ${items.length} 条结果` : `共 ${total} 条结果`} · 点击封面添加播放</Text> : null}
      <View testID="bili-result-grid" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: grid.gap, alignItems: 'flex-start' }}>
        {Array.from({ length: grid.columns }, (_, column) => <View key={column} style={{ width: grid.width, gap: grid.gap }}>{items.filter((_, index) => index % grid.columns === column).map(item => <Pressable key={item.url || item.bvid} testID={`bili-result-${item.bvid || item.epId || item.seasonId}`} accessibilityRole="button" accessibilityLabel={`选择视频 ${item.title}`} disabled={busy} onPress={() => void expand(item)} style={[ui.card, { width: grid.width, padding: 0, gap: 0, overflow: 'hidden' }]}>
          <View><SourcePoster uri={item.cover} width={Math.max(1, grid.width - 2)} naturalRatio />{item.duration ? <Text style={{ position: 'absolute', bottom: 8, right: 8, color: '#fff', backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, fontSize: 12 }}>{formatTime(item.duration)}</Text> : null}</View>
          <View style={{ padding: 12, gap: 6 }}><Text style={ui.text}>{item.title}</Text>{item.author ? <Text style={ui.muted}>{item.author}</Text> : null}{item.play ? <Text style={ui.muted}>{biliCount(item.play)} 播放</Text> : null}</View>
        </Pressable>)}</View>)}
      </View>
      {items.length || groups.length && kind === 'following' ? <View style={ui.row}><RoomButton label="上一页" secondary disabled={busy || page <= 1} onPress={() => void load(kind, page - 1, id)} /><Text style={ui.muted}>第 {page} 页</Text><RoomButton label="下一页" secondary disabled={busy || ['recommended', 'episodes'].includes(kind) || !hasNext} onPress={() => void load(kind, page + 1, id)} /></View> : null}
    </>}
    {busy ? <ActivityIndicator color={theme.color('#65d59b')} /> : null}{notice ? <Text accessibilityLiveRegion="polite" style={ui.muted}>{notice}</Text> : null}{error ? <Text accessibilityLiveRegion="assertive" style={ui.error}>{error}</Text> : null}
  </View>;
}
