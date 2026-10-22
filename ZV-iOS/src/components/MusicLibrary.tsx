import { MediaImage as Image } from './MediaImage';
import { useAppearance } from '@/state/appearance';
import Feather from '@expo/vector-icons/Feather';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSession } from '@/state/session';
import { messageFor } from '@/lib/server';
import { MusicBiliBrowser } from './MusicBiliBrowser';
import { RoomInput, ui as baseUi } from './RoomUi';
import { MusicButton as RoomButton, MusicIcon, MusicListItem, MusicSection, useMusicColors } from './MusicUi';
import { ncmSong as song, openDaily, openNcmPlaylist, type Song, type NcmSong, type MusicCollection } from '@/lib/musicCollection';
import { MusicHomeHero } from './MusicHomeHero';
export type { Song } from '@/lib/musicCollection';
export type MusicPage = 'home' | 'fm' | 'cloud' | 'mymusic' | 'bilibili' | 'search' | 'settings';
export const musicPages: { key: MusicPage; label: string }[] = [{ key: 'home', label: '首页' }, { key: 'fm', label: '私人漫游' }, { key: 'cloud', label: '云盘' }, { key: 'mymusic', label: '我的音乐' }, { key: 'bilibili', label: '哔哩哔哩' }];
type Playlist = { id: number; name: string; picUrl?: string; coverImgUrl?: string; trackCount?: number };
export function MusicLibrary({ page, showSongs, add, play, login, accountRevision, accountChanged, biliSearchRequest }: { biliSearchRequest?: { id: number; keyword?: string }; accountChanged: () => void; accountRevision: number; login: () => void; page: MusicPage; showSongs: (songs: Song[], collection?: MusicCollection) => void; add: (song: Song) => Promise<void>; play: (song: Song) => Promise<void> }) {
  const theme = useAppearance();
  const ui = theme.styles(baseUi); const colors = useMusicColors();
  const [libraryWidth, setLibraryWidth] = useState(320); const [creating, setCreating] = useState(false);
  const columns = Math.max(2, Math.min(5, Math.floor((libraryWidth + 16) / 156))); const posterWidth = Math.floor((libraryWidth - (columns - 1) * 16) / columns);

  const { request, requestText } = useSession(); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [name, setName] = useState(''); const [playlists, setPlaylists] = useState<Playlist[]>([]); const [songs, setSongs] = useState<Song[]>([]); const [banners, setBanners] = useState<string[]>([]); const [account, setAccount] = useState('未登录网易云'); const [loggedIn, setLoggedIn] = useState(false); const [avatar, setAvatar] = useState('');
  const ncm = useCallback(async <T,>(path: string, signal?: AbortSignal): Promise<T> => { const result = JSON.parse(await requestText(`/api/music/ncm${path}`, { signal })); if (result.code !== 200) throw new Error(result.message || '网易云请求失败'); return result; }, [requestText]);
  const task = async (work: () => Promise<void>) => { setBusy(true); setMessage(''); try { await work(); } catch (failure) { setMessage(messageFor(failure)); } finally { setBusy(false); } };
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    const load = async () => {
      const collected: Playlist[] = []; const tracks: Song[] = []; let images: string[] = [];
      if (page === 'home') {
        const values = await Promise.allSettled([ncm<{ result: Playlist[] }>('/personalized?limit=10', controller.signal), ncm<{ result: { song: NcmSong }[] }>('/personalized/newsong?limit=6', controller.signal), ncm<{ banners: { pic: string }[] }>('/banner?type=2', controller.signal)]);
        if (values[0].status === 'fulfilled') collected.push(...values[0].value.result);
        if (values[1].status === 'fulfilled') tracks.push(...values[1].value.result.map(value => song(value.song)));
        if (values[2].status === 'fulfilled') images = values[2].value.banners?.map(item => item.pic).filter(Boolean) || [];
      } else if (page === 'mymusic') {
        // v4.2.0 returns this DTO directly, without the room API's success envelope.
        const status = JSON.parse(await requestText('/api/music/login/status', { signal: controller.signal })) as { loggedIn: boolean; nickname?: string; vipStatus?: number; avatarUrl?: string };
        if (typeof status.loggedIn !== 'boolean') throw new Error('网易云登录状态响应无效');
        if (active) { setAvatar(status.avatarUrl || ''); setLoggedIn(status.loggedIn); setAccount(status.loggedIn ? `${status.nickname || '已登录'}${status.vipStatus === 1 ? ' · VIP' : ''}` : '未登录网易云'); }
        if (status.loggedIn) { const user = await ncm<{ profile?: { userId: number } }>('/user/account', controller.signal); if (user.profile?.userId) { const result = await ncm<{ playlist: Playlist[] }>(`/user/playlist?uid=${user.profile.userId}&limit=100`, controller.signal); collected.push(...result.playlist); } }
      } else if (page === 'cloud') { const value = await ncm<{ data: { simpleSong?: NcmSong }[] }>('/user/cloud?limit=500&offset=0', controller.signal); tracks.push(...value.data.flatMap(item => item.simpleSong ? [song(item.simpleSong)] : [])); }
      if (active) { setPlaylists(collected); setSongs(tracks); setBanners(images); setMessage(''); }
    };
    void load().catch(failure => { if (active) setMessage(messageFor(failure)); });
    return () => { active = false; controller.abort(); };
  }, [page, ncm, requestText, accountRevision]);
  const openPlaylist = (id: number) => task(async () => { const result = await openNcmPlaylist(ncm, id, playlists.find(item => item.id === id)?.name); showSongs(result.songs, result.collection); });
  const daily = () => task(async () => { const result = await openDaily(ncm); showSongs(result.songs, result.collection); });
  if (page === 'bilibili') return <MusicBiliBrowser searchRequest={biliSearchRequest} add={add} play={play} />;
  if (page === 'mymusic' && !loggedIn) return <View style={{ minHeight: 340, gap: 20 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Text style={{ color: theme.color('#111417', 'color'), backgroundColor: theme.color('#edf1ef', 'backgroundColor'), fontSize: 11, fontWeight: '700', paddingHorizontal: 8, minWidth: 140 }}>MY MUSIC</Text><View style={{ flex: 1, height: 1, backgroundColor: theme.color('#4a5355', 'backgroundColor') }} /></View><Text style={{ ...ui.title, fontSize: 28 }}>我的音乐</Text><View style={{ flex: 1, minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 16 }}><View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: theme.color('#202628', 'backgroundColor'), justifyContent: 'center', alignItems: 'center' }}><Feather name="user" size={30} color="#7d898c" /></View><Text style={{ ...ui.text, fontSize: 18 }}>请先登录网易云音乐</Text><Text style={ui.muted}>登录后查看我的歌单</Text><Pressable accessibilityRole="button" accessibilityLabel="扫码登录" onPress={login} style={{ paddingHorizontal: 20, minHeight: 44, backgroundColor: theme.color('#edf1ef', 'backgroundColor'), justifyContent: 'center' }}><Text style={{ color: theme.color('#111417', 'color'), fontSize: 16 }}>扫码登录</Text></Pressable>{message ? <Text style={ui.muted}>{message}</Text> : null}</View></View>;
  return <View style={[ui.content, { gap: 22 }]} onLayout={event => setLibraryWidth(event.nativeEvent.layout.width)}>
    {page === 'home' ? <><MusicHomeHero banners={banners} disabled={busy} daily={() => void daily()} /><Text style={ui.title}>最新音乐</Text></> : <Text style={{ ...ui.title, fontSize: 26 }}>{page === 'mymusic' ? '我的音乐' : page === 'fm' ? '私人漫游' : '音乐云盘'}</Text>}
    {page === 'mymusic' ? <><MusicSection label="MY MUSIC" /><View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 4 }}><Image source={{ uri: avatar }} style={{ width: 52, height: 52, borderRadius: 26 }} /><View style={{ flex: 1, minWidth: 0, gap: 5 }}><Text numberOfLines={1} style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>{account}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>网易云音乐</Text></View><MusicIcon label="每日推荐歌曲" icon="calendar" disabled={busy} onPress={() => void daily()} /><MusicIcon label="退出网易云账号" icon="log-out" disabled={busy} onPress={() => void task(async () => { await request('/api/music/logout', { method: 'POST', body: '{}' }); accountChanged(); setLoggedIn(false); setAccount('未登录网易云'); setPlaylists([]); setSongs([]); })} /></View><View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={{ color: colors.text, fontSize: 18, fontWeight: '600', flex: 1 }}>我的歌单</Text><MusicIcon label="新建歌单" icon="plus" onPress={() => setCreating(value => !value)} /></View></> : null}
    <View style={{ gap: 0 }}>{songs.map((item, index) => <MusicListItem key={item.songId} number={index + 1} title={item.name} subtitle={item.artist} cover={item.cover} onPress={() => { if (!busy) void task(() => play(item)); }}><MusicIcon label={`添加到队列 ${item.name}`} icon="plus" disabled={busy} onPress={() => void task(() => add(item))} /></MusicListItem>)}</View>
    {page === 'home' ? <Text style={ui.title}>推荐歌单</Text> : null}<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>{playlists.map(item => <Pressable key={item.id} accessibilityRole="button" disabled={busy} onPress={() => void openPlaylist(item.id)} style={{ width: posterWidth, gap: 8 }}>{item.picUrl || item.coverImgUrl ? <Image source={{ uri: item.picUrl || item.coverImgUrl }} style={{ width: posterWidth, height: posterWidth, borderRadius: 12 }} /> : <View style={{ width: posterWidth, height: posterWidth, borderRadius: 12, backgroundColor: theme.color('#253a30', 'backgroundColor'), justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: theme.color('#65d59b', 'color'), fontSize: 40 }}>♫</Text></View>}<Text style={ui.text} numberOfLines={2}>{item.name}</Text>{item.trackCount !== undefined ? <Text style={ui.muted}>{item.trackCount} 首</Text> : null}</Pressable>)}</View>
    {page === 'mymusic' && creating ? <View style={ui.row}><RoomInput value={name} onChangeText={setName} placeholder="新建网易云歌单名称" style={{ flex: 1 }} /><RoomButton label="创建歌单" disabled={busy || !name.trim()} secondary onPress={() => void task(async () => { await ncm(`/playlist/create?${new URLSearchParams({ name: name.trim(), type: 'NORMAL' })}`); setName(''); setMessage('歌单已创建，重新进入我的音乐即可刷新'); })} /></View> : null}
    {!songs.length && !playlists.length && page !== 'home' ? <Text style={ui.muted}>登录账号后查看这里的音乐</Text> : null}{message ? <Text style={ui.muted}>{message}</Text> : null}
  </View>;
}
