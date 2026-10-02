// v4.2.1 uses 403 both for expired JWTs and for valid users lacking permission.
// Only the former should refresh or clear login state.
export function authenticationFailure(status: number, text: string): boolean {
  if (status === 401) return true;
  if (status !== 403) return false;
  try {
    const message = JSON.parse(text).message;
    return typeof message === 'string' && /认证令牌无效或已过期|令牌已失效|token.*(?:invalid|expired)|(?:invalid|expired).*token|unauthorized/i.test(message);
  } catch { return false; }
}
