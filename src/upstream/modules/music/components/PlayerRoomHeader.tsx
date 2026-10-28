import { useAuthStore } from '@/store/authStore'
import { useRef, useState } from 'react'
import { ChevronDown, MoreHorizontal, MonitorPlay, Users } from 'lucide-react'
import { useRoomStore } from '@/store/roomStore'
import { useMusicStore } from '../store'
import { useMusicPlayer } from '../hooks/useMusicPlayer'
import { MusicSheet } from './MusicSheet'
export function PlayerRoomHeader({ isHost, moreOpen, onOpenMore, showImmersive, immersiveAvailable, onEnterImmersive }: {
  isHost: boolean; moreOpen: boolean; onOpenMore: () => void
  showImmersive: boolean; immersiveAvailable: boolean; onEnterImmersive: () => void
}) {
  const [open, setOpen] = useState(false)
  const online = useRoomStore(s => s.viewers)
  const user = useAuthStore(s => s.user)
  const owner = useRoomStore(s => s.roomOwnerUserId)
  const { canControl, hostOffline, syncNotice } = useMusicPlayer()
  const acks = useMusicStore(s => s.syncAcks)
  const viewers = [...online]
  if (user && !viewers.some(v => String(v.userId) === String(user.id))) viewers.push({ socketId: 'self', userId: Number(user.id), username: user.username })
  if (!isHost && !hostOffline && !viewers.some(v => v.userId === owner || v.socketId === 'host')) viewers.unshift({ socketId: 'host', userId: owner ?? undefined, username: '房主' })
  viewers.sort((a, b) => Number(b.userId === owner || b.socketId === 'host') - Number(a.userId === owner || a.socketId === 'host'))
  const close = useMusicStore(s => s.closePlayerOverlay)
  const start = useRef<number | null>(null)
  return <header className="music-room-heading">
    <div className="music-player-handle" onPointerDown={event => { start.current = event.clientY; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerCancel={() => { start.current = null }} onPointerUp={event => { if (start.current != null && event.clientY - start.current > 55) close(); start.current = null }}><span /></div>
    <button aria-label="收起播放器" onClick={close}><ChevronDown size={24} /></button>
    <button className="music-listeners" onClick={() => setOpen(true)} aria-label="查看一起听成员">
      <span className="music-listener-avatars">{viewers.slice(0, 3).map(v => <span key={v.socketId}>{(v.username || '听')[0]}</span>)}{!viewers.length && <Users size={20} />}</span>
      <span><strong>一起听 · {viewers.length} 人</strong><small>{syncNotice || (hostOffline ? '房主暂时离线' : canControl ? '正在主持播放' : '由房主控制')}</small></span>
    </button>
    {showImmersive && <button aria-label="纯净视频" title={immersiveAvailable ? '纯净视频' : '暂无可用背景视频'} disabled={!immersiveAvailable} onClick={onEnterImmersive}><MonitorPlay size={23} /></button>}
    <button aria-label="播放器更多操作" aria-haspopup="dialog" aria-expanded={moreOpen} onClick={onOpenMore}><MoreHorizontal size={24} /></button>
    {open && <MusicSheet title="一起听成员" onClose={() => setOpen(false)}><div className="music-listener-list">
      {viewers.map(v => <div key={v.socketId}><span className="music-member-avatar">{(v.username || '听')[0]}</span><strong>{v.username || '听众'}</strong><span>{(v.userId === owner || v.socketId === 'host') ? '房主' : '听众'}</span></div>)}
      {!viewers.some(v => v.userId === owner || v.socketId === 'host') && <p>{hostOffline ? '房主已离线' : '房主信息尚未同步'}</p>}
      <p role="status">{syncNotice || '房间播放状态同步中'}</p>
      {acks.map(ack => <p key={ack.id}>{ack.username} 已同步</p>)}
    </div></MusicSheet>}
  </header>
}
