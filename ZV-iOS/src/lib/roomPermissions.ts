export type PermissionMatrix = Record<string, { admin?: boolean; moderator?: boolean; user?: boolean }>;
export function canRoomAction(matrix: PermissionMatrix | null, action: string, role: string | undefined, host: boolean, moderator: boolean) {
  if (host || role === 'root') return true;
  if (moderator) return matrix?.[action]?.moderator !== false;
  if (role === 'admin') return matrix?.[action]?.admin !== false;
  return role === 'user' && matrix?.[action]?.user === true;
}
