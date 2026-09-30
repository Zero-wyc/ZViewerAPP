import { io, type Socket } from 'socket.io-client';
import type { Session } from '@/lib/server';

export function openSocket(session: Session): Socket {
  return io(session.serverUrl, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    withCredentials: true,
    auth: { token: session.accessToken },
  });
}

export function emitAck<T>(socket: Socket, event: string, payload: object, timeoutMs = 12000): Promise<T & { success: boolean; message?: string }> {
  return new Promise((resolve, reject) => {
    if (!socket.connected) {
      reject(new Error('正在连接服务器，请稍后重试'));
      return;
    }
    socket.timeout(timeoutMs).emit(event, payload, (timeout: Error | null, result?: T & { success: boolean; message?: string }) => {
      if (timeout || !result) reject(new Error('请求超时，请重试'));
      else if (!result.success) reject(new Error(result.message || '操作失败'));
      else resolve(result);
    });
  });
}
