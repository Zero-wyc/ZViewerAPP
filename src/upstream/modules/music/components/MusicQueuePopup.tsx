import { useEffect, useRef, useState } from 'react'
import { GripVertical, Trash2, Crosshair, Sparkles } from 'lucide-react'
import type { Socket } from 'socket.io-client'
import { message } from '@/components/ui/message'
import { useMusicStore, musicItemKey } from '../store'
import { useMusicPlayer } from '../hooks/useMusicPlayer'
import { MusicSheet } from './MusicSheet'
import type { MusicQueueItem } from '../types'

export interface MusicQueuePopupProps { socket: Socket | null; roomId?: string; isHost: boolean; canManage: boolean; placement?: 'top' | 'side' | 'sheet' }
export function MusicQueuePopup({ socket, roomId, canManage, placement = 'top' }: MusicQueuePopupProps) {
  const queue = useMusicStore(s => s.queue)
  const currentKey = useMusicStore(s => s.currentKey)
  const closeQueuePopup = useMusicStore(s => s.closeQueuePopup)
  const { playSong, canControl, requestControl, addBiliRecommendations } = useMusicPlayer()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [swiped, setSwiped] = useState<number | null>(null)
  const [dragId, setDragId] = useState<number | null>(null)
  const touch = useRef<{ id: number; x: number; y: number } | null>(null)
  const list = useRef<HTMLDivElement>(null)
  const close = () => closeQueuePopup(placement === 'top' ? 'widget' : 'player')
  const locate = () => list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  useEffect(() => { locate() }, [])
  const emit = (event: string, payload: object) => {
    if (!canManage) { message.info('只有房主或房管可以管理队列'); return }
    if (!socket?.connected || !roomId) { message.error('未连接房间'); return }
    socket.timeout(8000).emit(event, { roomId, ...payload }, (error: Error | null, response: { success?: boolean; message?: string }) => {
      if (error || !response?.success) message.error(response?.message || '操作未完成，请重试')
    })
  }
  const play = (item: MusicQueueItem) => {
    if (musicItemKey(item) === currentKey) return
    if (canControl) playSong(item)
    else requestControl('playItem', undefined, item)
  }
  const reorder = (id: number, targetId: number) => {
    const latest = useMusicStore.getState().queue
    const from = latest.findIndex(item => item.id === id), to = latest.findIndex(item => item.id === targetId)
    if (from < 0 || to < 0 || from === to) return
    const ids = latest.map(item => item.id)
    ids.splice(to, 0, ids.splice(from, 1)[0])
    emit('music:queue-reorder', { ids })
  }
  return <MusicSheet title={`播放队列 · ${queue.length} 首`} onClose={close} className="music-queue-sheet">
    <div className="music-queue-tools">
      <button onClick={locate}><Crosshair size={18} />定位当前</button>
      {currentKey?.startsWith('bili:') && <button disabled={busy} onClick={() => { setBusy(true); void addBiliRecommendations(canManage).finally(() => setBusy(false)) }}><Sparkles size={18} />推荐</button>}
      {canManage && <button disabled={!queue.length} onClick={() => setConfirm(true)}><Trash2 size={18} />清空</button>}
    </div>
    {confirm && <div className="music-queue-confirm" role="alertdialog" aria-label="确认清空队列"><p>清空全部 {queue.length} 首歌曲？此操作会影响房间内所有人。</p><button onClick={() => setConfirm(false)}>取消</button><button onClick={() => { emit('music:queue-clear', {}); setConfirm(false) }}>确认清空</button></div>}
    <div ref={list} className="music-queue-list">
      {!queue.length && <p className="music-sheet-empty">队列为空，去搜索添加歌曲</p>}
      {queue.map(item => <div key={item.id} data-queue-id={item.id} data-active={musicItemKey(item) === currentKey}
        className="music-queue-row" data-dragging={dragId === item.id}>
        {canManage && <button className="music-queue-grab" aria-label={`拖动排序 ${item.name}`} title="拖动排序，或使用上下方向键"
          onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); setDragId(item.id) }}
          onPointerMove={event => { if (dragId !== item.id) return; const bounds = list.current?.getBoundingClientRect(); if (bounds && list.current) { if (event.clientY > bounds.bottom - 40) list.current.scrollTop += 12; if (event.clientY < bounds.top + 40) list.current.scrollTop -= 12 } }}
          onPointerCancel={() => setDragId(null)} onPointerUp={event => { if (dragId !== item.id) return; const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-queue-id]'); if (target) reorder(item.id, Number(target.getAttribute('data-queue-id'))); setDragId(null) }}
          onKeyDown={event => { if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return; event.preventDefault(); const index = queue.findIndex(q => q.id === item.id) + (event.key === 'ArrowUp' ? -1 : 1); if (queue[index]) reorder(item.id, queue[index].id) }}><GripVertical size={18} /></button>}
        <button className="music-queue-track" onClick={() => { if (swiped === item.id) { setSwiped(null); return } play(item) }}
          onTouchStart={event => { const t = event.touches[0]; touch.current = { id: item.id, x: t.clientX, y: t.clientY } }}
          onTouchCancel={() => { touch.current = null }} onTouchEnd={event => { const t = event.changedTouches[0], start = touch.current; touch.current = null; if (canManage && start?.id === item.id && start.x - t.clientX > 50 && Math.abs(t.clientY - start.y) < 35) { event.preventDefault(); setSwiped(item.id) } }}>
          <strong>{musicItemKey(item) === currentKey ? '♫ ' : ''}{item.name}</strong><span>{item.artist || '未知歌手'}{item.recommended ? ' · 推荐' : ''}</span>
        </button>
        {canManage && <button className={swiped === item.id ? 'music-delete-revealed' : ''} onClick={() => emit('music:queue-remove', { id: item.id })} aria-label={`从队列删除 ${item.name}`}><Trash2 size={18} />{swiped === item.id && '删除'}</button>}
      </div>)}
    </div>
  </MusicSheet>
}
