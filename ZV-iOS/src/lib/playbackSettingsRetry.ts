import type { PlaybackPolicy } from './media.ts';

export type PlaybackSettingsRetry = 'save-unconfirmed' | 'saved';
export function playbackSettingsRetryMode(message: string, applying: boolean): PlaybackSettingsRetry {
  // This prefix is the room transaction's explicit successful-PUT boundary.
  // Unknown failures stay unconfirmed; an empty retry must never promote them
  // to "saved" merely because it successfully read another device's values.
  return applying || message.startsWith('设置已保存，确认或应用失败：') ? 'saved' : 'save-unconfirmed';
}
export async function retryCurrentPlaybackSettings<T>(retry: PlaybackSettingsRetry, confirm: (patch: PlaybackPolicy) => Promise<T>) {
  await confirm({});
  return retry;
}
export function playbackSettingsRetryError(message: string) {
  return `读取或应用服务器当前设置失败：${message.replace(/^(设置已保存，确认或应用失败：|保存失败：)/, '')}`;
}
