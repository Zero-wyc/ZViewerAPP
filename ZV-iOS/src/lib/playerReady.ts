import type { VlcPlayer } from './vlcPlayer';

export function waitForPlayerReady(player: VlcPlayer, signal: AbortSignal, timeoutMs = 45000) {
  if (signal.aborted) return Promise.reject(new Error('播放设置应用已取消'));
  if (player.readyForSettings) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>, extended = false, finished = false;
    const finish = (error?: Error) => { if (finished) return; finished = true; clearTimeout(timer); subscriptions.forEach(value => value.remove()); signal.removeEventListener('abort', abort); if (error) reject(error); else resolve(); };
    const abort = () => finish(new Error('播放设置应用已取消'));
    const check = () => { if (player.readyForSettings) finish(); };
    const subscriptions = [player.addListener('statusChange', event => {
      if (event.status === 'error') finish(new Error(event.error?.message || '媒体应用失败'));
      else check();
    }), player.addListener('sourceLoad', check), player.addListener('seekSettled', check)];
    const timeout = () => {
      // Loading may consume most of the preparation budget before native can
      // start its bounded seek. Do not time out underneath that operation.
      const remaining = player.seekConfirmationDeadline - Date.now();
      if (!extended && remaining > 0) { extended = true; timer = setTimeout(timeout, remaining); return; }
      finish(new Error('媒体准备超时，请重试应用'));
    };
    timer = setTimeout(timeout, timeoutMs);
    signal.addEventListener('abort', abort, { once: true });
  });
}
