export const ACCESS_REFRESH_LEAD_MS = 30_000;
export const ACCESS_REFRESH_RETRY_MS = 5_000;

// This only schedules renewal of the server-issued token. Authentication and
// identity still come from the NAS; decoding a JWT does not verify it.
export function accessTokenExpiresAt(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1] || parts[1].length > 16384) return null;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  let bits = 0, value = 0, text = '';
  for (const character of payload) {
    const digit = alphabet.indexOf(character); if (digit < 0) return null;
    value = (value << 6) | digit; bits += 6;
    if (bits >= 8) { bits -= 8; text += String.fromCharCode((value >> bits) & 255); value &= (1 << bits) - 1; }
  }
  try {
    const exp = JSON.parse(text).exp;
    return typeof exp === 'number' && Number.isFinite(exp) && exp > 0 && exp <= Number.MAX_SAFE_INTEGER / 1000 ? exp * 1000 : null;
  } catch { return null; }
}

export function accessRefreshDelay(token: string, now = Date.now()): number | null {
  const expires = accessTokenExpiresAt(token);
  return expires === null ? null : Math.min(2_147_000_000, Math.max(0, expires - now - ACCESS_REFRESH_LEAD_MS));
}

export type HlsRelayFailure = { id: string; message: string; httpStatus?: number };
export class RelayAuthRecovery {
  private attemptedScope = '';
  // Scope is the logical room/media/account, without the access token or local
  // relay ID. A renewed token creating a new listener must not form a loop.
  begin(scope: string, event: HlsRelayFailure): boolean {
    const unauthorized = event.httpStatus === 401 || event.httpStatus === undefined && /\bHTTP\s+401\b/.test(event.message);
    if (!scope || !unauthorized || this.attemptedScope === scope) return false;
    this.attemptedScope = scope; return true;
  }
  reset() { this.attemptedScope = ''; }
}
