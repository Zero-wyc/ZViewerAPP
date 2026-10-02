// A monotonically increasing lease also distinguishes null → logout → null.
// Late keychain/network results must not revive a session after logout/login.
export class SessionLease<T> {
  value: T | null = null;
  private generation = 0;
  capture() { return this.generation; }
  accepts(generation: number) { return this.generation === generation; }
  replace(value: T | null) { this.generation++; this.value = value; }
}
