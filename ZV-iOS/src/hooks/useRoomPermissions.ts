import { useEffect, useState } from 'react';
import { useSession } from '@/state/session';
import { canRoomAction, type PermissionMatrix } from '@/lib/roomPermissions';
export function useRoomPermissions(roomId: string, host: boolean) {
  const { session, socket, request, connected } = useSession();
  const scope = `${session?.serverUrl}:${session?.user.id}:${roomId}`;
  const [matrix, setMatrix] = useState<{ scope: string; value: PermissionMatrix | null } | null>(null);
  const [moderators, setModerators] = useState<{ scope: string; ids: number[] } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void request<{ settings: { roomPermissionMatrix?: PermissionMatrix } }>('/api/auth/public-settings', { signal: controller.signal }).then(data => { if (!controller.signal.aborted) setMatrix({ scope, value: data.settings.roomPermissionMatrix || null }); }).catch(() => {});
    const changed = (value: { roomId: string; moderators: number[] }) => { if (value.roomId === roomId && Array.isArray(value.moderators)) setModerators({ scope, ids: value.moderators }); };
    socket?.on('moderators-changed', changed);
    return () => { controller.abort(); socket?.off('moderators-changed', changed); };
  }, [request, scope, roomId, socket, connected]);
  const currentMatrix = matrix?.scope === scope ? matrix.value : null;
  const moderator = moderators?.scope === scope && moderators.ids.includes(session?.user.id ?? -1);
  // Until settings arrive, only unconditional roles are exposed.
  return { canSwitch: host || session?.user.role === 'root' || matrix?.scope === scope && canRoomAction(currentMatrix, 'manageMovie', session?.user.role, host, !!moderator) };
}
