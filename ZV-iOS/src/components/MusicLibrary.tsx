import Feather from '@expo/vector-icons/Feather';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useSession } from '@/state/session';
import { resolveLocalBili } from '@/lib/biliNative';
import { messageFor } from '@/lib/server';
import { BiliCatalog } from './BiliCatalog';
import { BiliAccount } from './BiliAccount';
import { RoomButton, RoomInput, ui } from './RoomUi';
export type MusicPage = 'home' | 'fm' | 'cloud' | 'mymusic' | 'bilibili' | 'search' | 'settings';
export const musicPages: { key: MusicPage; label: string }[] = [{ key: 'home', label: '首页' }, { key: 'fm', label: '私人漫游' }, { key: 'cloud', label: '云盘' }, { key: 'mymusic', label: '我的音乐' }, { key: 'bilibili', label: '哔哩哔哩' }];
export type Song = { songId: number; name: string; artist: string; album: string; cover: string; durationMs: number; vip: boolean; biliBvid?: string; biliCid?: number };
type NcmSong = { id: number; name: string; ar?: { name: string }[]; artists?: { name: string }[]; al?: { name: string; picUrl: string }; album?: { name: string; picUrl: string }; dt?: number; duration?: number; fee?: number };
type Playlist = { id: number; name: string; picUrl?: string; coverImgUrl?: string; trackCount?: number };
const song = (item: NcmSong): Song => ({ songId: item.id, name: item.name, artist: (item.ar || item.artists || []).map(value => value.name).join(' / '), album: (item.al || item.album)?.name || '', cover: (item.al || item.album)?.picUrl || '', durationMs: item.dt || item.duration || 0, vip: item.fee === 1 });
export function MusicLibrary({ page, showSongs, add, play, login, accountRevision }: { accountRevision: number; login: () => void; page: MusicPage; showSongs: (songs: Song[]) => void; add: (song: Song) => Promise<void>; play: (song: Song) => Promise<void> }) {
  const { request, requestText } = useSession(); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [name, setName] = useState(''); const [playlists, setPlaylists] = useState<Playlist[]>([]); const [songs, setSongs] = useState<Song[]>([]); const [banner, setBanner] = useState(''); const [account, setAccount] = useState('未登录网易云'); const [loggedIn, setLoggedIn] = useState(false);
  const ncm = useCallback(async <T,>(path: string, signal?: AbortSignal): Promise<T> => { const result = JSON.parse(await requestText(`/api/music/ncm${path}`, { signal })); if (result.code !== 200) throw new Error(result.message || '网易云请求失败'); return result; }, [requestText]);
  const task = async (work: () => Promise<void>) => { setBusy(true); setMessage(''); try { await work(); } catch (failure) { setMessage(messageFor(failure)); } finally { setBusy(false); } };
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    const load = async () => {
      const collected: Playlist[] = []; const tracks: Song[] = []; let image = '';
      if (page === 'home') {
        const values = await Promise.allSettled([ncm<{ result: Playlist[] }>('/personalized?limit=10', controller.signal), ncm<{ result: { song: NcmSong }[] }>('/personalized/newsong?limit=6', controller.signal), ncm<{ banners: { pic: string }[] }>('/banner?type=2', controller.signal)]);
        if (values[0].status === 'fulfilled') collected.push(...values[0].value.result);
        if (values[1].status === 'fulfilled') tracks.push(...values[1].value.result.map(value => song(value.song)));
        if (values[2].status === 'fulfilled') image = values[2].value.banners?.[0]?.pic || '';
      } else if (page === 'mymusic') {
        // v4.2.0 returns this DTO directly, without the room API's success envelope.
        const status = JSON.parse(await requestText('/api/music/login/status', { signal: controller.signal })) as { loggedIn: boolean; nickname?: string; vipStatus?: number };
        if (typeof status.loggedIn !== 'boolean') throw new Error('网易云登录状态响应无效');
        if (active) { setLoggedIn(status.loggedIn); setAccount(status.loggedIn ? `${status.nickname || '已登录'}${status.vipStatus === 1 ? ' · VIP' : ''}` : '未登录网易云'); }
        if (status.loggedIn) { const user = await ncm<{ profile?: { userId: number } }>('/user/account', controller.signal); if (user.profile?.userId) { const result = await ncm<{ playlist: Playlist[] }>(`/user/playlist?uid=${user.profile.userId}&limit=100`, controller.signal); collected.push(...result.playlist); } }
      } else if (page === 'fm') { const value = await ncm<{ data: NcmSong[] }>('/personal_fm', controller.signal); tracks.push(...value.data.map(song)); }
      else if (page === 'cloud') { const value = await ncm<{ data: { simpleSong?: NcmSong }[] }>('/user/cloud?limit=500&offset=0', controller.signal); tracks.push(...value.data.flatMap(item => item.simpleSong ? [song(item.simpleSong)] : [])); }
      if (active) { setPlaylists(collected); setSongs(tracks); setBanner(image); setMessage(''); }
    };
    void load().catch(failure => { if (active) setMessage(messageFor(failure)); });
    return () => { active = false; controller.abort(); };
  }, [page, ncm, requestText, accountRevision]);
  const openPlaylist = (id: number) => task(async () => { const result = await ncm<{ songs: NcmSong[] }>(`/playlist/track/all?id=${id}&limit=500`); showSongs(result.songs.map(song)); });
  const daily = () => task(async () => { const result = await ncm<{ data: { dailySongs: NcmSong[] } }>('/recommend/songs'); showSongs(result.data.dailySongs.map(song)); });
  if (page === 'bilibili') return <View style={ui.content}><BiliAccount /><BiliCatalog choose={item => void task(async () => { const media = await resolveLocalBili(`https://www.bilibili.com/video/${item.bvid}${item.cid ? `?cid=${item.cid}` : ''}`); const part = media.pages?.find(value => value.page === media.currentPage) || media.pages?.[0]; if (!part?.cid) throw new Error('没有可用的 B站音频分 P'); await play({ songId: 0, name: item.title, artist: item.author || 'B站', album: '', cover: '', durationMs: (media.duration || 0) * 1000, vip: false, biliBvid: item.bvid, biliCid: part.cid }); })} />{message ? <Text style={ui.error}>{message}</Text> : null}</View>;
  if (page === 'mymusic' && !loggedIn) return <View style={{ minHeight: 340, gap: 20 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Text style={{ color: '#111417', backgroundColor: '#edf1ef', fontSize: 11, fontWeight: '700', paddingHorizontal: 8, minWidth: 140 }}>MY MUSIC</Text><View style={{ flex: 1, height: 1, backgroundColor: '#4a5355' }} /></View><Text style={{ ...ui.title, fontSize: 28 }}>我的音乐</Text><View style={{ flex: 1, minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 16 }}><View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#202628', justifyContent: 'center', alignItems: 'center' }}><Feather name="user" size={30} color="#7d898c" /></View><Text style={{ ...ui.text, fontSize: 18 }}>请先登录网易云音乐</Text><Text style={ui.muted}>登录后查看我的歌单</Text><Pressable accessibilityRole="button" accessibilityLabel="扫码登录" onPress={login} style={{ paddingHorizontal: 20, minHeight: 44, backgroundColor: '#edf1ef', justifyContent: 'center' }}><Text style={{ color: '#111417', fontSize: 16 }}>扫码登录</Text></Pressable>{message ? <Text style={ui.muted}>{message}</Text> : null}</View></View>;
  return <View style={ui.content}>
    {page === 'home' ? <><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}><View style={{ flex: 2, minWidth: 170, minHeight: 150, backgroundColor: '#202729', borderRadius: 16, overflow: 'hidden' }}>{banner ? <Image source={{ uri: banner }} style={{ width: '100%', height: 170 }} /> : <Text style={{ color: '#fff', padding: 24, fontSize: 26 }}>网易云音乐</Text>}</View><Pressable accessibilityRole="button" accessibilityLabel="每日推荐歌曲" onPress={() => void daily()} style={{ flex: 1, minWidth: 150, backgroundColor: '#24312d', borderRadius: 16, padding: 20, justifyContent: 'space-between' }}><Text style={{ color: '#edf1ef', fontSize: 26, fontWeight: '700' }}>每 日{'\n'}推 荐</Text><Text style={ui.muted}>▶  发现今天的音乐</Text></Pressable></View><Text style={ui.title}>最新音乐</Text></> : <Text style={{ ...ui.title, fontSize: 26 }}>{page === 'mymusic' ? '我的音乐' : page === 'fm' ? '私人漫游' : '音乐云盘'}</Text>}
    {page === 'mymusic' ? <><Text style={ui.muted}>{account}</Text><View style={ui.row}><RoomButton label="每日推荐歌曲" secondary disabled={busy} onPress={() => void daily()} /><RoomButton label="退出网易云账号" secondary onPress={() => void task(async () => { await request('/api/music/logout', { method: 'POST', body: '{}' }); setLoggedIn(false); setAccount('未登录网易云'); setPlaylists([]); setSongs([]); })} /></View><Text style={ui.title}>我的歌单</Text></> : null}
    {songs.map(item => <View key={item.songId} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderColor: '#293033', paddingVertical: 10 }}>{item.cover ? <Image source={{ uri: item.cover }} style={{ width: 46, height: 46, borderRadius: 8 }} /> : null}<View style={{ flex: 1 }}><Text style={ui.text} numberOfLines={1}>{item.name}</Text><Text style={ui.muted} numberOfLines={1}>{item.artist}</Text></View><RoomButton label="播放" disabled={busy} secondary onPress={() => void task(() => play(item))} /><RoomButton label="＋" disabled={busy} secondary onPress={() => void task(() => add(item))} /></View>)}
    {page === 'home' ? <Text style={ui.title}>推荐歌单</Text> : null}<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>{playlists.map(item => <Pressable key={item.id} accessibilityRole="button" disabled={busy} onPress={() => void openPlaylist(item.id)} style={{ width: 142, gap: 8 }}>{item.picUrl || item.coverImgUrl ? <Image source={{ uri: item.picUrl || item.coverImgUrl }} style={{ width: 142, height: 142, borderRadius: 14 }} /> : <View style={{ width: 142, height: 142, borderRadius: 14, backgroundColor: '#253a30', justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: '#65d59b', fontSize: 40 }}>♫</Text></View>}<Text style={ui.text} numberOfLines={2}>{item.name}</Text>{item.trackCount !== undefined ? <Text style={ui.muted}>{item.trackCount} 首</Text> : null}</Pressable>)}</View>
    {page === 'mymusic' ? <View style={ui.row}><RoomInput value={name} onChangeText={setName} placeholder="新建网易云歌单名称" style={{ flex: 1 }} /><RoomButton label="创建歌单" disabled={busy || !name.trim()} secondary onPress={() => void task(async () => { await ncm(`/playlist/create?${new URLSearchParams({ name: name.trim(), type: 'NORMAL' })}`); setName(''); setMessage('歌单已创建，重新进入我的音乐即可刷新'); })} /></View> : null}
    {!songs.length && !playlists.length && page !== 'home' ? <Text style={ui.muted}>登录账号后查看这里的音乐</Text> : null}{message ? <Text style={ui.muted}>{message}</Text> : null}
  </View>;
}
