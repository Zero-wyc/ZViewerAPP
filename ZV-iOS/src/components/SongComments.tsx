import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useSession } from '@/state/session';
import { useAppearance } from '@/state/appearance';
import { RoomButton, RoomInput, ui as baseUi } from './RoomUi';
import { MediaImage } from './MediaImage';
import { AppDialog } from './AppDialog';
type Comment = { commentId: number; content: string; user?: { nickname?: string; avatarUrl?: string }; timeStr?: string };
type BiliComment = { rpid: number; content: string; name: string; avatar: string; time: number };
export function SongComments({ songId, bvid, close, onCount }: { songId: number | null; bvid?: string | null; close: () => void; onCount?: (value: { key: string; count: number }) => void }) {
  const theme = useAppearance(); const ui = theme.styles(baseUi); const { requestText, request } = useSession();
  const target = bvid ? `bili:${bvid}` : songId ? `ncm:${songId}` : '';
  const [items, setItems] = useState<Comment[]>([]); const [parent, setParent] = useState<number | null>(null); const [draft, setDraft] = useState('');
  const [message, setMessage] = useState(''); const [version, setVersion] = useState(0); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0); const [next, setNext] = useState<number | null>(null); const [total, setTotal] = useState<number | null>(null);
  const countHandler = useRef(onCount); const send = useRef<AbortController | null>(null);
  useEffect(() => { countHandler.current = onCount; }, [onCount]);
  useEffect(() => { const lifecycle = send; void Promise.resolve().then(() => { setParent(null); setDraft(''); setPage(0); setNext(null); setItems([]); }); return () => lifecycle.current?.abort(); }, [target]);
  useEffect(() => {
    if (!target) return; const cancel = new AbortController();
    void Promise.resolve().then(async () => {
      if (cancel.signal.aborted) return; setLoading(true); setItems([]); setMessage('');
      try {
        let comments: Comment[]; let count: number | undefined; let cursor: number | null;
        if (bvid) {
          const path = parent ? `/api/stream/bilibili/comment-replies?bvid=${bvid}&rpid=${parent}&pn=${page + 1}&ps=20` : `/api/stream/bilibili/comments?bvid=${bvid}&mode=2&next=${page}`;
          const value = await request<{ replies: BiliComment[]; total?: number; next?: number | null; loginLimited?: boolean }>(path, { signal: cancel.signal });
          comments = value.replies.map(item => ({ commentId: item.rpid, content: item.content, user: { nickname: item.name, avatarUrl: item.avatar }, timeStr: item.time ? new Date(item.time * 1000).toLocaleDateString() : '' })); count = value.total; cursor = parent ? null : value.next ?? null;
          if (!cancel.signal.aborted && value.loginLimited) setMessage('当前服务端 B站账号可见的评论有限；更多评论可到原视频查看。');
        } else {
          const path = parent ? `/comment/floor?parentCommentId=${parent}&id=${songId}&type=0&limit=30` : `/comment/music?id=${songId}&limit=30&offset=${page * 30}`;
          const value = JSON.parse(await requestText(`/api/music/ncm${path}`, { signal: cancel.signal })); if (value.code !== 200) throw new Error();
          comments = value.data?.comments || value.comments || []; count = value.total; cursor = !parent && value.more ? page + 1 : null;
        }
        if (cancel.signal.aborted) return; setItems(comments); setTotal(Number.isFinite(count) ? count! : null); setNext(cursor);
        if (!parent && Number.isFinite(count)) countHandler.current?.({ key: target, count: count! });
      } catch { if (!cancel.signal.aborted) setMessage('评论获取失败，可刷新重试'); }
      finally { if (!cancel.signal.aborted) setLoading(false); }
    });
    return () => cancel.abort();
  }, [target, songId, bvid, parent, page, requestText, request, version]);
  return <AppDialog visible={!!target} title={parent ? '楼层回复' : '歌曲评论'} close={close} footer={bvid ? <Text style={ui.muted}>B站评论来自当前原视频；此处只读。</Text> : <View style={{ gap: 8, paddingTop: 12 }}><RoomInput value={draft} onChangeText={setDraft} placeholder={parent ? '回复当前楼层' : '发表歌曲评论'} multiline /><RoomButton label={busy ? '发送中…' : '发送评论'} disabled={!draft.trim() || busy || !songId} onPress={() => {
    if (send.current) return; const cancel = new AbortController(); send.current = cancel; setBusy(true);
    const params = new URLSearchParams({ t: parent ? '2' : '1', type: '0', id: String(songId), content: draft.trim(), ...(parent ? { commentId: String(parent) } : {}) });
    void requestText(`/api/music/ncm/comment?${params}`, { signal: cancel.signal }).then(raw => { if (cancel.signal.aborted) return; if (JSON.parse(raw).code !== 200) throw new Error(); setDraft(''); setVersion(old => old + 1); }).catch(() => { if (!cancel.signal.aborted) setMessage('发表评论失败，请确认网易云登录状态与账号权限'); }).finally(() => { if (send.current === cancel) send.current = null; if (!cancel.signal.aborted) setBusy(false); });
  }} /></View>}>
    <View style={ui.row}>{parent ? <RoomButton label="返回评论" secondary onPress={() => { setParent(null); setPage(0); }} /> : null}<RoomButton label="刷新" secondary disabled={loading} onPress={() => setVersion(old => old + 1)} />{total !== null ? <Text style={ui.muted}>共 {total} 条</Text> : null}</View>
    {loading ? <View style={ui.row}><ActivityIndicator color={theme.color('#65d59b')} /><Text accessibilityLiveRegion="polite" style={ui.muted}>正在获取歌曲评论…</Text></View> : null}
    {!loading && !items.length && !message ? <Text style={ui.muted}>暂时没有评论</Text> : null}
    {items.map(item => <View key={item.commentId} style={ui.card}><View style={ui.row}><MediaImage source={{ uri: item.user?.avatarUrl || '' }} style={{ width: 44, height: 44, borderRadius: 22 }} /><Text style={ui.text}>{item.user?.nickname || '用户'}</Text></View><Text style={ui.text}>{item.content}</Text><Text style={ui.muted}>{item.timeStr}</Text>{!parent ? <RoomButton label="查看楼层回复" secondary onPress={() => { setParent(item.commentId); setPage(0); }} /> : null}</View>)}
    {!parent && next !== null ? <RoomButton label="下一页评论" secondary disabled={loading} onPress={() => setPage(next)} /> : null}
    {message ? <Text accessibilityLiveRegion="polite" style={ui.muted}>{message}</Text> : null}
  </AppDialog>;
}
