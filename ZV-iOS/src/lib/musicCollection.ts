export type Song = { songId: number; name: string; artist: string; album: string; cover: string; durationMs: number; vip: boolean; biliBvid?: string; biliCid?: number };
export type NcmSong = { id: number; name: string; ar?: { name: string }[]; artists?: { name: string }[]; al?: { name: string; picUrl?: string }; album?: { name: string; picUrl?: string }; dt?: number; duration?: number; fee?: number };
export type MusicCollection = { title: string; playlistId?: number; total?: number; daily?: { date: string; dates: string[]; historyNote?: string } };
export type NcmRequest = <T>(path: string, signal?: AbortSignal) => Promise<T>;
export const PLAYLIST_PAGE_SIZE = 100;
export const ncmSong = (item: NcmSong): Song => ({ songId: item.id, name: item.name, artist: (item.ar || item.artists || []).map(value => value.name).join(' / '), album: (item.al || item.album)?.name || '', cover: (item.al || item.album)?.picUrl || '', durationMs: item.dt || item.duration || 0, vip: item.fee === 1 });
export function localDate(now = new Date()) { return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; }
export async function dailySongs(ncm: NcmRequest, date: string, signal?: AbortSignal) {
  const data = await ncm<{ data?: { songs?: NcmSong[]; dailySongs?: NcmSong[] } }>(date === localDate() ? '/recommend/songs' : `/history/recommend/songs/detail?date=${encodeURIComponent(date)}`, signal);
  const songs = data.data?.dailySongs || data.data?.songs;
  if (!Array.isArray(songs)) throw new Error('推荐歌曲响应无效，请重新加载');
  return songs.map(ncmSong);
}
export async function openDaily(ncm: NcmRequest) {
  const date = localDate();
  const [songs, history] = await Promise.all([dailySongs(ncm, date), ncm<{ data?: { dates?: string[]; dateList?: string[] } }>('/history/recommend/songs').catch(() => null)]);
  const dates = [date, ...new Set((history?.data?.dates || history?.data?.dateList || []).filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item) && item < date))].sort().reverse();
  return { songs, collection: { title: '每日推荐歌曲', total: songs.length, daily: { date, dates, historyNote: history ? undefined : '历史推荐暂不可用，请检查网易云账号权限；仍可查看今天的推荐' } } satisfies MusicCollection };
}
export async function playlistPage(ncm: NcmRequest, id: number, offset = 0, signal?: AbortSignal) {
  const result = await ncm<{ songs: NcmSong[] }>(`/playlist/track/all?id=${id}&limit=${PLAYLIST_PAGE_SIZE}&offset=${offset}`, signal);
  if (!Array.isArray(result.songs)) throw new Error('歌单歌曲响应无效');
  return result.songs.map(ncmSong);
}
export async function openNcmPlaylist(ncm: NcmRequest, id: number, title = `网易云歌单 ${id}`) {
  const [songs, detail] = await Promise.all([playlistPage(ncm, id), ncm<{ playlist?: { name?: string; trackCount?: number } }>(`/playlist/detail?id=${id}`).catch(() => null)]);
  const count = detail?.playlist?.trackCount;
  return { songs, collection: { playlistId: id, title: detail?.playlist?.name || title, total: Number.isSafeInteger(count) && count! >= 0 ? count : songs.length < PLAYLIST_PAGE_SIZE ? songs.length : undefined } satisfies MusicCollection };
}
export async function completeCollection(ncm: NcmRequest, collection: MusicCollection, initial: Song[], signal: AbortSignal, progress: (count: number) => void): Promise<Song[]> {
  const songs = [...initial];
  if (!collection.playlistId) return songs;
  if (collection.total !== undefined && initial.length < collection.total && initial.length % PLAYLIST_PAGE_SIZE !== 0) throw new Error('部分歌单歌曲暂不可获取；原播放列表尚未替换');
  let offset = initial.length;
  const pages = new Set<string>();
  if (initial.length) pages.add(initial.slice(-PLAYLIST_PAGE_SIZE).map(song => song.songId).join(','));
  while (collection.total === undefined ? offset === 0 || offset % PLAYLIST_PAGE_SIZE === 0 : songs.length < collection.total) {
    signal.throwIfAborted();
    const page = await playlistPage(ncm, collection.playlistId, offset, signal);
    signal.throwIfAborted();
    if (!page.length) { if (collection.total !== undefined && songs.length < collection.total) throw new Error('歌单未完整加载，请刷新后重试；原播放列表尚未替换'); break; }
    const signature = page.map(song => song.songId).join(',');
    if (pages.has(signature)) throw new Error('歌单分页返回重复内容，请刷新后重试');
    pages.add(signature); songs.push(...page); offset += page.length; progress(songs.length);
    if (page.length < PLAYLIST_PAGE_SIZE) { if (collection.total !== undefined && songs.length < collection.total) throw new Error('部分歌单歌曲暂不可获取；原播放列表尚未替换'); break; }
  }
  return songs;
}
export function validateCollection(songs: Song[]) {
  if (!songs.length) throw new Error('歌单没有可播放的歌曲');
  if (songs.some(song => !Number.isSafeInteger(song.songId) || song.songId < 1 || !song.name || !Number.isFinite(song.durationMs) || song.durationMs < 0)) throw new Error('歌单包含无效歌曲，播放列表尚未修改');
}
// v4.2.1 has individual ACKs, no atomic queue-replace endpoint. Serialize writes
// to preserve order; never clear before the entire collection has been loaded.
export async function applyCollection(songs: Song[], replace: boolean, port: { check: () => void; clear: () => Promise<unknown>; add: (song: Song) => Promise<unknown>; playFirst: (song: Song) => Promise<unknown>; progress: (done: number, total: number) => void }) {
  validateCollection(songs); port.check();
  let done = 0;
  try {
    if (replace) await port.clear();
    for (const song of songs) { port.check(); await port.add(song); done++; port.progress(done, songs.length); }
    port.check(); if (replace) await port.playFirst(songs[0]);
  } catch (failure) {
    throw new Error(`已加入 ${done}/${songs.length} 首，操作未完成：${failure instanceof Error ? failure.message : '请检查连接后重试'}`);
  }
  return done;
}
