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
