export const roomModes = [
  { id: 'watch-together', name: '一起看' },
  { id: 'screen-share', name: '投屏' },
  { id: 'listen-together', name: '一起听' },
] as const;
export type RoomMode = typeof roomModes[number]['id'];
export function roomModeName(mode?: string): string {
  return roomModes.find(value => value.id === mode)?.name || '一起看';
}
