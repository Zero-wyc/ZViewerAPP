import { useState } from 'react';
import { Text, View } from 'react-native';
import { biliOperation } from '@/lib/nativeBridge';
import { messageFor } from '@/lib/server';
import { RoomButton, RoomInput, ui } from './RoomUi';
type Item = { bvid: string; title: string; cid?: number; duration?: number; author?: string };
type Container = { id: number; title: string };
type Catalog = { data: { result?: Item[]; item?: Item[]; medias?: Item[]; archives?: Item[]; episodes?: Item[]; list?: (Container & { season_id?: number })[] } };
export function BiliCatalog({ choose }: { choose: (item: Item) => void }) {
  const [keyword, setKeyword] = useState(''); const [kind, setKind] = useState('search'); const [items, setItems] = useState<Item[]>([]); const [groups, setGroups] = useState<Container[]>([]);
  const [groupKind, setGroupKind] = useState(''); const [id, setId] = useState(0); const [page, setPage] = useState(1); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [collection, setCollection] = useState('');
  const load = async (next: string, pn = 1, value = 0) => {
    setBusy(true); setError('');
    try {
      const params: Record<string, unknown> = { kind: next, keyword, page: pn, id: value };
      if (next === 'collection') { const parsed = new URL(collection); params.mid = Number(parsed.pathname.split('/')[1]); params.id = Number(parsed.searchParams.get('sid') || parsed.searchParams.get('season_id') || parsed.pathname.match(/lists\/(\d+)/)?.[1]); if (!/^(space\.)?bilibili\.com$/.test(parsed.hostname) || !params.mid || !params.id) throw new Error('请填写 space.bilibili.com/{mid}/lists/{sid} 或带 sid 的合集链接'); }
      const { data } = await biliOperation<Catalog>('catalog', JSON.stringify(params));
      setKind(next); setPage(pn); setId(value);
      if (next === 'folders' || next === 'following') { setGroups((data.list || []).map(item => ({ id: item.season_id || item.id, title: item.title }))); setGroupKind(next === 'folders' ? 'favorites' : 'episodes'); setItems([]); }
      else { setGroups([]); setItems((data.result || data.item || data.medias || data.archives || data.episodes || []).filter(item => !!item.bvid)); }
    } catch (failure) { setError(messageFor(failure)); } finally { setBusy(false); }
  };
  return <View style={ui.card}><Text style={ui.title}>B站检索与我的栏目</Text><RoomInput value={keyword} onChangeText={setKeyword} placeholder="搜索 B站视频 / 音乐" /><View style={ui.row}><RoomButton label="搜索 B站" secondary disabled={busy || !keyword.trim()} onPress={() => void load('search')} /><RoomButton label="推荐视频" secondary disabled={busy} onPress={() => void load('recommended')} /><RoomButton label="我的收藏夹" secondary disabled={busy} onPress={() => void load('folders')} /><RoomButton label="关注番剧" secondary disabled={busy} onPress={() => void load('following')} /></View><RoomInput value={collection} onChangeText={setCollection} autoCapitalize="none" placeholder="B站合集链接（带 sid）" /><RoomButton label="浏览合集" disabled={busy || !collection} secondary onPress={() => void load('collection')} />{groups.map(item => <RoomButton key={item.id} label={item.title} secondary disabled={busy} onPress={() => void load(groupKind, 1, item.id)} />)}{items.map(item => <View key={`${item.bvid}:${item.cid || 0}`} style={ui.card}><Text style={ui.text}>{item.title.replace(/<[^>]*>/g, '')}</Text><RoomButton label="选择视频 / 分 P" secondary disabled={busy} onPress={() => choose({ ...item, title: item.title.replace(/<[^>]*>/g, '') })} /></View>)}{items.length ? <View style={ui.row}><RoomButton label="上一页" secondary disabled={busy || page <= 1} onPress={() => void load(kind, page - 1, id)} /><Text style={ui.muted}>第 {page} 页</Text><RoomButton label="下一页" secondary disabled={busy || ['recommended', 'episodes'].includes(kind)} onPress={() => void load(kind, page + 1, id)} /></View> : null}{error ? <Text style={ui.error}>{error}</Text> : null}</View>;
}
