// Current servers use 401 for authentication and 403 for admission/permissions.
// A valid session must survive a forbidden operation.
export function authenticationFailure(status: number, _text: string): boolean {
  return status === 401;
}
// Third-party account failures must never retire the site's authenticated lease.
export function shouldRefreshAuth(path: string) { return !path.startsWith('/api/music/'); }
