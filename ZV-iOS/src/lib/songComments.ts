export type SongComment = {
  commentId: number;
  content: string;
  user?: { nickname?: string; avatarUrl?: string };
  timeStr?: string;
};
export type CommentPosition = { page: number; cursor: string; time: number };
export const firstCommentPage: CommentPosition = { page: 0, cursor: '0', time: -1 };

export function ncmCommentsPath(songId: number, parent: number | null, position: CommentPosition) {
  const params = new URLSearchParams({ id: String(songId), type: '0', timestamp: String(Date.now()) });
  if (parent !== null) {
    params.set('parentCommentId', String(parent));
    params.set('limit', '30');
    params.set('time', String(position.time));
    return `/api/music/ncm/comment/floor?${params}`;
  }
  params.set('sortType', '3');
  params.set('pageSize', '30');
  params.set('pageNo', String(position.page + 1));
  params.set('cursor', position.cursor);
  return `/api/music/ncm/comment/new?${params}`;
}

export function readNcmComments(raw: string, parent: number | null, position: CommentPosition) {
  const value = JSON.parse(raw);
  const body = value?.data ?? value;
  if (value?.code !== 200 || !Array.isArray(body?.comments)) {
    throw new Error(value?.code === 301 || value?.code === 401
      ? '请先登录网易云账号后重试'
      : '评论获取失败，请稍后刷新重试');
  }
  const comments = body.comments as SongComment[];
  const count = Number(body.totalCount ?? body.total);
  const cursor = String(body.cursor ?? '');
  const time = Number(body.time);
  const advances = parent !== null ? Number.isFinite(time) && time >= 0 && time !== position.time : !!cursor && cursor !== position.cursor;
  const next: CommentPosition | null = body.hasMore && comments.length && advances
    ? { page: position.page + 1, cursor, time: parent !== null ? time : -1 }
    : null;
  return { comments, count: Number.isFinite(count) && count >= 0 ? count : undefined, next };
}
