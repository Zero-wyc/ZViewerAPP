export type RoomViewer = { socketId: string; username?: string; userId?: number; role?: string };
export type HostTransfer = { newHostSocketId: string; oldHostSocketId?: string };

// NAS transfers change Session.role transactionally, then emit these socket
// IDs without viewer-joined/left. Apply that authoritative membership delta;
// unknown account fields must remain unknown until a real viewer event arrives.
export function viewersAfterHostTransfer(viewers: readonly RoomViewer[], transfer: HostTransfer, knownPreviousHost?: RoomViewer | null): RoomViewer[] {
  const next = transfer.newHostSocketId;
  const previous = transfer.oldHostSocketId;
  if (typeof next !== 'string' || !next || next === previous) return [...viewers];
  const retained = viewers.filter(viewer => viewer.socketId !== next);
  if (typeof previous !== 'string' || !previous) return retained;
  const existing = retained.find(viewer => viewer.socketId === previous);
  const known = knownPreviousHost?.socketId === previous ? knownPreviousHost : undefined;
  const former: RoomViewer = { ...known, ...existing, socketId: previous };
  if (!former.username) former.username = '原房主';
  return [...retained.filter(viewer => viewer.socketId !== previous), former];
}
