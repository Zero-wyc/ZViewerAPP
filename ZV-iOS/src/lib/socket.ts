import { io, type Socket } from 'socket.io-client';
import type { Session } from '@/lib/server';
import { socketEndpoint } from './socketEndpoint';
import { sessionDiagnostic } from './sessionDiagnostics';
import { connectionUrl } from './connectionTransport';

const identities = new WeakMap<Socket, { userId: number; role: string }>();

export function openSocket(session: Session): Socket {
  const endpoint = socketEndpoint(session.serverUrl);
  const certificateChannel = connectionUrl(session.serverUrl) !== session.serverUrl;
  const connection = io(endpoint.origin, {
    path: endpoint.path,
    transports: ['websocket', 'polling'],
    reconnection: true,
    withCredentials: false,
    // RN's default loopback Origin is rejected by the native channel. This
    // header applies only to a verified, currently bound certificate channel.
    ...(certificateChannel ? { extraHeaders: { Origin: 'https://localhost' } } : {}),
    auth: { token: session.accessToken },
  });
  const identity = { userId: session.user.id, role: session.user.role };
  identities.set(connection, identity);
  sessionDiagnostic('socket-create', identity);
  let socketId: string | undefined;
  connection.on('connect', () => { socketId = connection.id; sessionDiagnostic('socket-connect', { ...identity, socketId }); });
  connection.on('disconnect', () => sessionDiagnostic('socket-disconnect', { ...identity, socketId }));
  connection.on('connect_error', () => sessionDiagnostic('socket-connect-error', { ...identity, socketId }));
  return connection;
}

export function emitAck<T>(socket: Socket, event: string, payload: object, timeoutMs = 12000): Promise<T & { success: boolean; message?: string }> {
  const admission = event === 'request-join' || event === 'register-host' ? event : null;
  const diagnostic = { ...identities.get(socket), socketId: socket.id, roomId: (payload as { roomId?: string }).roomId };
  if (admission) sessionDiagnostic(`${admission}-start`, diagnostic);
  return new Promise((resolve, reject) => {
    if (!socket.connected) {
      reject(new Error('正在连接服务器，请稍后重试'));
      return;
    }
    socket.timeout(timeoutMs).emit(event, payload, (timeout: Error | null, result?: T & { success: boolean; message?: string; code?: string }) => {
      if (admission) sessionDiagnostic(`${admission}-${timeout || !result ? 'timeout' : result.success ? 'success' : result.code === 'ALREADY_IN_ROOM' ? 'already-in-room' : 'rejected'}`, diagnostic);
      if (timeout || !result) reject(new Error('请求超时，请重试'));
      else if (!result.success) reject(new Error(result.message || '操作失败'));
      else resolve(result);
    });
  });
}
