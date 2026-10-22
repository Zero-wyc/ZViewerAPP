type SessionDiagnosticFields = {
  userId?: number;
  role?: string;
  roomId?: string;
  socketId?: string;
};

type SessionDiagnosticEvent =
  | 'provider-mount' | 'provider-unmount'
  | 'restore-start' | 'restore-debug' | 'restore-storage' | 'restore-applied'
  | 'debug-launch-parsed' | 'debug-route-room'
  | 'session-update' | 'auth-user-updated'
  | 'socket-create' | 'socket-connect' | 'socket-disconnect' | 'socket-connect-error'
  | 'socket-isolation-failed'
  | 'request-join-start' | 'request-join-success' | 'request-join-already-in-room' | 'request-join-rejected' | 'request-join-timeout'
  | 'register-host-start' | 'register-host-success' | 'register-host-already-in-room' | 'register-host-rejected' | 'register-host-timeout';

// Keep Debug admission traces to non-secret identifiers. Do not pass session,
// payload, ACK, server URL, error message, or a native launch configuration here.
export function sessionDiagnostic(event: SessionDiagnosticEvent, fields: SessionDiagnosticFields = {}) {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  const identifier = (value: string | undefined) => value && /^[\w-]{1,128}$/.test(value) ? value : undefined;
  console.info('[ZViewerSession]', JSON.stringify({
    event,
    userId: Number.isSafeInteger(fields.userId) ? fields.userId : undefined,
    role: identifier(fields.role),
    roomId: identifier(fields.roomId),
    socketId: identifier(fields.socketId),
  }));
}
