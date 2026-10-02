/* eslint-disable react-hooks/immutability -- this hook owns the imperative native VLC control port. */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { emitAck } from '@/lib/socket';
import type { VlcPlayer } from '@/lib/vlcPlayer';
export type WatchCommand = 'play' | 'pause' | 'seek' | 'rate';
type Application = { action: 'play' | 'pause' | 'seek'; viewerSocketId: string; viewerUsername?: string; time?: number };
export function useWatchControl(socket: Socket | null, roomId: string, host: boolean, player: VlcPlayer, publish: (action: WatchCommand, value?: number) => void) {
  const [requests, setRequests] = useState<Application[]>([]);
  const [notice, setNotice] = useState('');
  const pending = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const control = useCallback((action: WatchCommand, value?: number) => {
    if (!socket?.connected) { setNotice('房间尚未恢复连接'); return; }
    if (action === 'seek') { if (!Number.isFinite(value) || player.duration <= 0) return; value = Math.min(player.duration, Math.max(0, value!)); }
    if (!host) {
      if (action === 'rate' || pending.current.has(action)) return;
      pending.current.set(action, setTimeout(() => { pending.current.delete(action); setNotice('申请超时，房主未回应'); }, 15000));
      void emitAck(socket, `${action}-request`, { roomId, ...(action === 'seek' ? { time: value } : {}) }).then(() => setNotice('已向房主发送控制申请')).catch(() => { clearTimeout(pending.current.get(action)); pending.current.delete(action); setNotice('控制申请失败'); });
      return;
    }
    if (action === 'play') player.play();
    if (action === 'pause') player.pause();
    if (action === 'seek') player.currentTime = value!;
    if (action === 'rate' && Number.isFinite(value) && value! > 0) player.playbackRate = value!;
    publish(action, value);
  }, [socket, roomId, host, player, publish]);
  useEffect(() => {
    if (!socket) return;
    const subscriptions = (['play', 'pause', 'seek'] as const).flatMap(action => {
      const requested = (data: Omit<Application, 'action'>) => { if (host && data.viewerSocketId) setRequests(old => [...old.filter(item => item.action !== action || item.viewerSocketId !== data.viewerSocketId).slice(-19), { ...data, action }]); };
      const response = (data: { accept: boolean }) => { clearTimeout(pending.current.get(action)); pending.current.delete(action); setNotice(data.accept ? '房主已同意申请' : '房主拒绝了申请'); };
      socket.on(`${action}-request`, requested); socket.on(`${action}-response`, response);
      return [() => { socket.off(`${action}-request`, requested); socket.off(`${action}-response`, response); }];
    });
    const timers = pending.current;
    return () => { subscriptions.forEach(remove => remove()); timers.forEach(clearTimeout); timers.clear(); setRequests([]); };
  }, [socket, roomId, host]);
  const decide = async (application: Application, accept: boolean) => {
    if (!host || !socket) return;
    if (accept) control(application.action, application.time);
    try { await emitAck(socket, `${application.action}-response`, { roomId, viewerSocketId: application.viewerSocketId, accept, ...(application.action === 'seek' ? { time: application.time } : {}) }); setRequests(old => old.filter(item => item !== application)); }
    catch { setNotice('审批回复失败，请重试'); }
  };
  return { control, requests, decide, notice };
}
