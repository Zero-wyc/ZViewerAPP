import { MediaImage as Image } from './MediaImage';
import { useAppearance } from '@/state/appearance';
import Feather from '@expo/vector-icons/Feather';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSession } from '@/state/session';
import { resolveLocalBili } from '@/lib/biliNative';
import { messageFor } from '@/lib/server';
import { BiliCatalog } from './BiliCatalog';
import { BiliAccount } from './BiliAccount';
import { RoomButton, RoomInput, ui as baseUi } from './RoomUi';
import { ncmSong as song, openDaily, openNcmPlaylist, type Song, type NcmSong, type MusicCollection } from '@/lib/musicCollection';
import { MusicHomeHero } from './MusicHomeHero';
export type { Song } from '@/lib/musicCollection';
export type MusicPage = 'home' | 'fm' | 'cloud' | 'mymusic' | 'bilibili' | 'search' | 'settings';
export const musicPages: { key: MusicPage; label: string }[] = [{ key: 'home', label: '首页' }, { key: 'fm', label: '私人漫游' }, { key: 'cloud', label: '云盘' }, { key: 'mymusic', label: '我的音乐' }, { key: 'bilibili', label: '哔哩哔哩' }];
type Playlist = { id: number; name: string; picUrl?: string; coverImgUrl?: string; trackCount?: number };
export function MusicLibrary({ page, showSongs, add, play, login, accountRevision, accountChanged }: { accountChanged: () => void; accountRevision: number; login: () => void; page: MusicPage; showSongs: (songs: Song[], collection?: MusicCollection) => void; add: (song: Song) => Promise<void>; play: (song: Song) => Promise<void> }) {
  const theme = useAppearance();
  const ui = theme.styles(baseUi);

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
  if (page === 'bilibili') return <View style={ui.content}><BiliAccount /><BiliCatalog choose={item => void task(async () => { const media = await resolveLocalBili(`https://www.bilibili.com/video/${item.bvid}${item.cid ? `?cid=${item.cid}` : ''}`); const part = media.pages?.find(value => value.page === media.currentPage) || media.pages?.[0]; if (!part?.cid) throw new Error('没有可用的 B站音频分 P'); await play({ songId: 0, name: item.title, artist: item.author || 'B站', album: '', cover: '', durationMs: (media.duration || 0) * 1000, vip: false, biliBvid: item.bvid, biliCid: part.cid }); })} />{message ? <Text style={ui.error}>{message}</Text> : null}</View>;
  if (page === 'mymusic' && !loggedIn) return <View style={{ minHeight: 340, gap: 20 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Text style={{ color: theme.color('#111417', 'color'), backgroundColor: theme.color('#edf1ef', 'backgroundColor'), fontSize: 11, fontWeight: '700', paddingHorizontal: 8, minWidth: 140 }}>MY MUSIC</Text><View style={{ flex: 1, height: 1, backgroundColor: theme.color('#4a5355', 'backgroundColor') }} /></View><Text style={{ ...ui.title, fontSize: 28 }}>我的音乐</Text><View style={{ flex: 1, minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 16 }}><View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: theme.color('#202628', 'backgroundColor'), justifyContent: 'center', alignItems: 'center' }}><Feather name="user" size={30} color="#7d898c" /></View><Text style={{ ...ui.text, fontSize: 18 }}>请先登录网易云音乐</Text><Text style={ui.muted}>登录后查看我的歌单</Text><Pressable accessibilityRole="button" accessibilityLabel="扫码登录" onPress={login} style={{ paddingHorizontal: 20, minHeight: 44, backgroundColor: theme.color('#edf1ef', 'backgroundColor'), justifyContent: 'center' }}><Text style={{ color: theme.color('#111417', 'color'), fontSize: 16 }}>扫码登录</Text></Pressable>{message ? <Text style={ui.muted}>{message}</Text> : null}</View></View>;
  return <View style={ui.content}>
    {page === 'home' ? <><MusicHomeHero banners={banners} disabled={busy} daily={() => void daily()} /><Text style={ui.title}>最新音乐</Text></> : <Text style={{ ...ui.title, fontSize: 26 }}>{page === 'mymusic' ? '我的音乐' : page === 'fm' ? '私人漫游' : '音乐云盘'}</Text>}
    {page === 'mymusic' ? <><Image source={{ uri: avatar }} style={{ width: 64, height: 64, borderRadius: 32 }} /><Text style={ui.muted}>{account}</Text><View style={ui.row}><RoomButton label="每日推荐歌曲" secondary disabled={busy} onPress={() => void daily()} /><RoomButton label="退出网易云账号" secondary onPress={() => void task(async () => { await request('/api/music/logout', { method: 'POST', body: '{}' }); accountChanged(); setLoggedIn(false); setAccount('未登录网易云'); setPlaylists([]); setSongs([]); })} /></View><Text style={ui.title}>我的歌单</Text></> : null}
    {songs.map(item => <View key={item.songId} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderColor: theme.color('#293033', 'borderColor'), paddingVertical: 10 }}>{item.cover ? <Image source={{ uri: item.cover }} style={{ width: 46, height: 46, borderRadius: 8 }} /> : null}<View style={{ flex: 1 }}><Text style={ui.text} numberOfLines={1}>{item.name}</Text><Text style={ui.muted} numberOfLines={1}>{item.artist}</Text></View><RoomButton label="播放" disabled={busy} secondary onPress={() => void task(() => play(item))} /><RoomButton label="＋" disabled={busy} secondary onPress={() => void task(() => add(item))} /></View>)}
    {page === 'home' ? <Text style={ui.title}>推荐歌单</Text> : null}<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>{playlists.map(item => <Pressable key={item.id} accessibilityRole="button" disabled={busy} onPress={() => void openPlaylist(item.id)} style={{ width: 142, gap: 8 }}>{item.picUrl || item.coverImgUrl ? <Image source={{ uri: item.picUrl || item.coverImgUrl }} style={{ width: 142, height: 142, borderRadius: 14 }} /> : <View style={{ width: 142, height: 142, borderRadius: 14, backgroundColor: theme.color('#253a30', 'backgroundColor'), justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: theme.color('#65d59b', 'color'), fontSize: 40 }}>♫</Text></View>}<Text style={ui.text} numberOfLines={2}>{item.name}</Text>{item.trackCount !== undefined ? <Text style={ui.muted}>{item.trackCount} 首</Text> : null}</Pressable>)}</View>
    {page === 'mymusic' ? <View style={ui.row}><RoomInput value={name} onChangeText={setName} placeholder="新建网易云歌单名称" style={{ flex: 1 }} /><RoomButton label="创建歌单" disabled={busy || !name.trim()} secondary onPress={() => void task(async () => { await ncm(`/playlist/create?${new URLSearchParams({ name: name.trim(), type: 'NORMAL' })}`); setName(''); setMessage('歌单已创建，重新进入我的音乐即可刷新'); })} /></View> : null}
    {!songs.length && !playlists.length && page !== 'home' ? <Text style={ui.muted}>登录账号后查看这里的音乐</Text> : null}{message ? <Text style={ui.muted}>{message}</Text> : null}
  </View>;
}
