export function screenShareExpiry(token: string, now = Date.now()) {
  try {
    const body = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(globalThis.atob(body));
    const expires = Number(payload.exp);
    if (Number.isFinite(expires) && expires > now / 1000 + 30) return Math.min(expires, now / 1000 + 3600);
  } catch { /* Invalid authorizations never enter the shared keychain. */ }
  throw new Error('登录授权即将到期，请重新登录后开始共享');
}

export function isActiveScreenShare(phase: string) {
  return ['requesting-permission', 'awaiting-host', 'starting', 'sharing', 'paused', 'stopping'].includes(phase);
}
