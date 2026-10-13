import { nativeVideoSource, type PlaybackSource } from './media.ts';
import { biliSelection } from './biliSelection.ts';

// VLC keeps an absolute, token-free identity for server media. Bili keeps the
// canonical video URL instead of the device's temporary loopback proxy URL.
export function musicSourceMatches(identity: string, source: PlaybackSource, server: string) {
  if (!identity) return false;
  try {
    const expected = source.sourceType === 'bilibili' ? biliSelection(source.sourceUrl).url : nativeVideoSource(source, server, '').identity;
    return identity === expected;
  } catch { return false; }
}

// A receipt describes one completed track load, not every heartbeat/control.
export class MusicSyncReceipt {
  private current = '';
  private sent = false;
  observe(identity: string) {
    if (identity !== this.current) { this.current = identity; this.sent = false; }
  }
  take(identity: string, ready: boolean) {
    if (!identity || identity !== this.current || !ready || this.sent) return false;
    this.sent = true;
    return true;
  }
}
